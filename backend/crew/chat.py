"""One chat turn with Dan.

    screen_input ─▶ budget check ─▶ Dispatcher (1 cheap call, structured)
                                        │
                     ┌──────────────────┼───────────────────────┐
                Course Scout   Planner   Bid Coach   Career Coach   AI News Desk
                     └──────────────────┼───────────────────────┘
                                        ▼
                     check_output (secrets, unknown course numbers) ─▶ save + reply

Why a dispatcher rather than a boss that calls every specialist: exactly one
specialist runs per turn, and it carries only its own tools, so each turn pays
for one small routing call plus one focused agent instead of a manager reading
several reports.
"""

from __future__ import annotations

import asyncio
import json
from datetime import date
from typing import AsyncIterator

from pydantic_ai.exceptions import ModelHTTPError
from sqlmodel import Session, select

from catalog import get_catalog
from config import ai_available
from crew.agents import SPECIALIST_LABELS, dispatcher, specialists
from crew.context import load_context
from crew.runtime import Run
from db import ChatMessage
from safety import REFUSAL, BudgetExceeded, SpendGuard, check_output, fence, screen_input

HISTORY_TURNS = 6


def _history(db: Session, user_id: int | None, mode: str) -> str:
    if not user_id:
        return ""
    rows = db.exec(
        select(ChatMessage).where(ChatMessage.user_id == user_id, ChatMessage.mode == mode)
        .order_by(ChatMessage.id.desc()).limit(HISTORY_TURNS)
    ).all()
    # Blocked messages (and Dan's refusals of them) never go back into a prompt.
    lines = [f"{m.role}: {m.content[:400]}" for m in reversed(rows) if '"blocked": true' not in (m.meta or "")]
    return fence("\n".join(lines), "recent_chat") if lines else ""


def _save(db: Session, user_id: int | None, mode: str, role: str, content: str, meta: dict | None = None) -> None:
    if user_id:
        db.add(ChatMessage(user_id=user_id, mode=mode, role=role, content=content, meta=json.dumps(meta or {})))
        db.commit()


async def run_turn(db: Session, user_id: int | None, message: str, mode: str = "dan",
                   queue: asyncio.Queue | None = None) -> dict:
    """mode 'dan' routes freely; mode 'news' always goes to the AI News Desk."""
    run = Run(db=db, user_id=user_id, feature="news" if mode == "news" else "chat",
              guard=SpendGuard.for_user(db, user_id), queue=queue)
    known = {s.number.upper() for s in get_catalog().sections}
    result = {"answer": "", "agent": None, "proposals": [], "blocked": False, "safety": []}

    screen = screen_input(message)
    if not screen.allowed:
        run.audit("input_blocked", reasons=screen.reasons, preview=message[:120])
        result.update(answer=REFUSAL.format(why="; ".join(screen.reasons)), blocked=True, safety=screen.reasons)
        _save(db, user_id, mode, "user", message[:2000], {"blocked": True})
        _save(db, user_id, mode, "assistant", result["answer"], {"blocked": True})
        return _finish(run, result)

    if not ai_available():
        result["answer"] = ("Dan's AI brain isn't connected (no PORTKEY_API_KEY or OPENAI_API_KEY found). "
                            "Everything else — search, planner, calendar, bids — still works.")
        return _finish(run, result)

    _save(db, user_id, mode, "user", screen.text)
    ctx = load_context(run)
    history = _history(db, user_id, mode)
    today = date.today().isoformat()

    try:
        if mode == "news":
            chosen, task = "news_desk", screen.text
        else:
            route_prompt = f"Today is {today}.\n{history}\nStudent message:\n{fence(screen.text, 'student_message')}"
            routed = await run.call(dispatcher, route_prompt, name="Dispatcher", requests=2)
            route = routed.output
            run.emit("route", specialist=route.specialist, task=route.task)
            if route.specialist == "none":
                result.update(answer=route.direct_reply or "Woof! Ask me about courses, your plan, bids or AI news. 🐶",
                              agent="Dispatcher")
                return _wrap_up(run, result, known, user_id, mode)
            chosen, task = route.specialist, route.task

        agent = specialists[chosen]
        label = SPECIALIST_LABELS[chosen]
        prompt = (
            f"Today is {today}. Student: {ctx.profile.get('program', 'MBA')} year {ctx.profile.get('year') or '?'}.\n"
            f"{history}\nTask:\n{fence(task, 'student_request')}"
        )
        answer = await run.call(agent, prompt, name=label, deps=ctx, requests=3 if chosen == "news_desk" else None)
        result.update(answer=str(answer.output), agent=label, proposals=ctx.proposals)
        if chosen == "news_desk" and "http" not in result["answer"]:
            run.audit("news_without_sources")
            result["answer"] += "\n\n> ⚠️ I couldn't attach source links this time — treat this as unverified and check a news site."
        if run.guard.spent_run > run.guard.run_budget:
            run.audit("over_run_budget", spent=round(run.guard.spent_run, 4), budget=run.guard.run_budget)
    except BudgetExceeded as exc:
        run.audit("budget_stop", detail=str(exc))
        result.update(answer=f"⏸️ {exc}", safety=["budget"])
    except ModelHTTPError as exc:
        if "content management policy" in str(exc) or "content_filter" in str(exc):
            # Second line of defence: the provider's own safety filter refused the prompt.
            run.audit("provider_content_filter", detail=str(exc)[:200])
            result.update(answer="That request tripped the AI provider's safety filter, so I didn't run it. "
                                 "Try rephrasing it as a planning question. 🐶", safety=["provider_filter"])
        else:
            run.audit("agent_error", detail=f"ModelHTTPError: {str(exc)[:300]}")
            result.update(answer="Ruh-roh 🐶 — I hit a snag talking to the model. Try again in a moment.")
    except Exception as exc:  # keep the chat alive; the trace shows what happened
        run.audit("agent_error", detail=f"{type(exc).__name__}: {str(exc)[:300]}")
        result.update(answer="Ruh-roh 🐶 — I hit a snag talking to the model. Try again in a moment.")
    return _wrap_up(run, result, known, user_id, mode)


def _wrap_up(run: Run, result: dict, known: set[str], user_id: int | None, mode: str) -> dict:
    safe, issues = check_output(result["answer"], known)
    if issues:
        run.audit("output_checked", issues=issues)
        result["safety"] = result.get("safety", []) + issues
    result["answer"] = safe
    _save(run.db, user_id, mode, "assistant", safe,
          {"agent": result.get("agent"), "cost_usd": run.totals()["cost_usd"], "run_id": run.run_id})
    return _finish(run, result)


def _finish(run: Run, result: dict) -> dict:
    return {**result, "run_id": run.run_id, "trace": run.events, "usage": run.usage_summary()}


async def stream_turn(db: Session, user_id: int | None, message: str, mode: str = "dan") -> AsyncIterator[dict]:
    queue: asyncio.Queue = asyncio.Queue()

    async def work():
        try:
            final = await run_turn(db, user_id, message, mode, queue)
            queue.put_nowait({"type": "final", "data": final})
        except Exception as exc:  # pragma: no cover
            queue.put_nowait({"type": "error", "data": {"answer": f"Error: {str(exc)[:200]}"}})
        finally:
            queue.put_nowait(None)

    task = asyncio.create_task(work())
    try:
        while (event := await queue.get()) is not None:
            yield event
    finally:
        if not task.done():
            task.cancel()
