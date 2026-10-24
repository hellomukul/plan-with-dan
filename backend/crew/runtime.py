"""Run bookkeeping shared by every agent call.

A `Run` is one student request (a chat turn or a recommendation). It owns:
- an event list (streamed to the browser as it grows, and saved for the trace),
- per-agent token meters priced with pricing.cost_usd,
- the SpendGuard that stops a run before it overspends,
- `call()`, the one place an agent is executed. It checks the budget first,
  turns the remaining budget into a hard token cap, then records real usage.
"""

from __future__ import annotations

import asyncio
import time
import uuid
from dataclasses import dataclass, field
from typing import Any

from pydantic_ai import Agent
from pydantic_ai.exceptions import UsageLimitExceeded
from pydantic_ai.messages import ModelResponse, ToolCallPart
from pydantic_ai.usage import UsageLimits
from sqlmodel import Session

from config import MAX_MODEL_REQUESTS, MODEL_NAME, build_model
from db import UsageLog, log_audit
from pricing import cost_usd, prices_for
from safety import BudgetExceeded, SpendGuard


@dataclass
class Meter:
    agent: str
    requests: int = 0
    input_tokens: int = 0
    cached_tokens: int = 0
    output_tokens: int = 0
    web_searches: int = 0
    cost_usd: float = 0.0
    seconds: float = 0.0

    def as_dict(self) -> dict:
        return {k: (round(v, 6) if isinstance(v, float) else v) for k, v in self.__dict__.items()}


@dataclass
class Run:
    db: Session
    user_id: int | None
    feature: str  # chat | news | recommend
    guard: SpendGuard
    model_name: str = MODEL_NAME
    run_id: str = field(default_factory=lambda: uuid.uuid4().hex[:12])
    events: list[dict] = field(default_factory=list)
    meters: dict[str, Meter] = field(default_factory=dict)
    queue: asyncio.Queue | None = None
    started: float = field(default_factory=time.perf_counter)

    # ---------------------------------------------------------- events

    def emit(self, kind: str, **data: Any) -> None:
        event = {"kind": kind, "t_ms": round((time.perf_counter() - self.started) * 1000), **data}
        self.events.append(event)
        if self.queue is not None:
            self.queue.put_nowait({"type": "step", "data": event})

    def audit(self, kind: str, **detail: Any) -> None:
        log_audit(self.db, kind, user_id=self.user_id, run_id=self.run_id, **detail)
        self.emit("safety", check=kind, **detail)

    # ---------------------------------------------------------- usage

    def totals(self) -> dict:
        keys = ("requests", "input_tokens", "cached_tokens", "output_tokens", "web_searches")
        total = {k: sum(getattr(m, k) for m in self.meters.values()) for k in keys}
        total["cost_usd"] = round(sum(m.cost_usd for m in self.meters.values()), 6)
        return total

    def usage_summary(self) -> dict:
        return {
            "run_id": self.run_id,
            "model": self.model_name,
            "agents": [m.as_dict() for m in self.meters.values()],
            "total": self.totals(),
            "run_budget_usd": self.guard.run_budget,
            "spent_today_usd": round(self.guard.spent_before + self.guard.spent_run, 6),
            "daily_budget_usd": self.guard.daily_budget,
        }

    def _record(self, agent_name: str, usage: Any, seconds: float) -> Meter:
        details = getattr(usage, "details", None) or {}
        m = self.meters.setdefault(agent_name, Meter(agent=agent_name))
        req = int(getattr(usage, "requests", 0) or 0)
        inp = int(getattr(usage, "input_tokens", 0) or 0)
        cached = int(getattr(usage, "cache_read_tokens", 0) or 0)
        out = int(getattr(usage, "output_tokens", 0) or 0)
        web = int(details.get("web_search_requests", 0) or 0)
        cost = cost_usd(self.model_name, inp, out, cached, web)
        m.requests += req
        m.input_tokens += inp
        m.cached_tokens += cached
        m.output_tokens += out
        m.web_searches += web
        m.cost_usd += cost
        m.seconds += seconds
        self.guard.add(cost)
        self.db.add(UsageLog(
            user_id=self.user_id, run_id=self.run_id, feature=self.feature, agent=agent_name,
            model=self.model_name, requests=req, input_tokens=inp, cached_tokens=cached,
            output_tokens=out, web_searches=web, cost_usd=cost,
        ))
        self.db.commit()
        return m

    # ---------------------------------------------------------- the one way to run an agent

    async def call(self, agent: Agent, prompt: str, *, name: str, deps: Any = None, requests: int | None = None):
        """Run `agent` under the budget. Returns the result, or raises BudgetExceeded."""
        self.guard.check(name)
        remaining = max(0.0, min(
            self.guard.run_budget - self.guard.spent_run,
            self.guard.daily_budget - self.guard.spent_before - self.guard.spent_run,
        ))
        # Worst case every token is billed at the output rate: a hard ceiling.
        token_cap = max(2_000, int(remaining / (prices_for(self.model_name)["output"] / 1_000_000)))
        limits = UsageLimits(request_limit=requests or MAX_MODEL_REQUESTS, total_tokens_limit=token_cap)
        self.emit("agent_start", agent=name)
        started = time.perf_counter()
        try:
            result = await agent.run(prompt, deps=deps, model=build_model(self.model_name), usage_limits=limits)
        except UsageLimitExceeded as exc:
            self.audit("usage_limit_hit", agent=name, detail=str(exc)[:300], token_cap=token_cap)
            raise BudgetExceeded(
                f"{name} hit its safety limit ({exc}). I stopped it so it couldn't loop or overspend."
            ) from exc
        meter = self._record(name, result.usage, time.perf_counter() - started)
        calls = [
            p.tool_name
            for msg in result.new_messages()
            if isinstance(msg, ModelResponse)
            for p in msg.parts
            if isinstance(p, ToolCallPart)
        ]
        self.emit(
            "agent_done", agent=name, tool_calls=calls,
            usage={**meter.as_dict()}, run_total=self.totals(),
        )
        return result
