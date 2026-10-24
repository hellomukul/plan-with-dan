"""Dan's memory: the whole current conversation, within a fixed prompt budget.

    recent turns ─────────────▶ sent word for word (the last KEEP_RECENT messages)
    older turns ──▶ Memory Keeper agent ──▶ running summary + lasting facts (ChatMemory row)

- A "conversation" is everything since the student last pressed New chat.
- When more than FOLD_AT messages are waiting outside the summary, the oldest ones are
  folded into the summary by one small model call (about $0.0002), after the reply is sent.
- Lasting facts (goals, constraints, preferences the student stated) survive New chat,
  are shown on the Ask Dan page, and can be deleted there. They come from student text,
  so they're screened and always fenced as untrusted data.
"""

from __future__ import annotations

import json

from pydantic import BaseModel, Field
from sqlmodel import Session, select

from db import ChatMemory, ChatMessage, engine, utcnow
from safety import fence, screen_input

KEEP_RECENT = 12  # messages sent verbatim
FOLD_AT = 18  # fold once this many messages sit outside the summary
MSG_CHARS = 2000
MAX_FACTS = 12


class MemoryUpdate(BaseModel):
    summary: str = Field(description="The whole conversation so far in at most 120 words: what the student asked, "
                                     "what Dan recommended (course numbers and titles), and decisions made.")
    facts: list[str] = Field(default_factory=list, description="Lasting facts about the student, each under 15 words.")


def get_memory(db: Session, user_id: int, mode: str) -> ChatMemory:
    mem = db.exec(select(ChatMemory).where(ChatMemory.user_id == user_id, ChatMemory.mode == mode)).first()
    return mem or ChatMemory(user_id=user_id, mode=mode)


def facts_of(mem: ChatMemory) -> list[str]:
    try:
        return [f for f in json.loads(mem.facts or "[]") if isinstance(f, str)]
    except ValueError:
        return []


def _usable(m: ChatMessage) -> bool:
    return '"blocked": true' not in (m.meta or "")


def _pending(db: Session, user_id: int, mode: str, after: int) -> list[ChatMessage]:
    rows = db.exec(select(ChatMessage).where(ChatMessage.user_id == user_id, ChatMessage.mode == mode,
                                             ChatMessage.id > after).order_by(ChatMessage.id)).all()
    return [m for m in rows if _usable(m)]


def context_block(db: Session, user_id: int | None, mode: str, exclude_id: int | None = None) -> str:
    """Everything Dan remembers, ready to drop into a prompt (all fenced as untrusted)."""
    if not user_id:
        return ""
    mem = get_memory(db, user_id, mode)
    facts = facts_of(get_memory(db, user_id, "dan")) if mode != "dan" else facts_of(mem)
    recent = [m for m in _pending(db, user_id, mode, mem.summarized_upto) if m.id != exclude_id][-KEEP_RECENT:]
    parts = []
    if facts:
        parts.append("WHAT THE STUDENT HAS TOLD DAN BEFORE:\n" + fence("\n".join(f"- {f}" for f in facts), "remembered_facts"))
    if mem.summary:
        parts.append("EARLIER IN THIS CONVERSATION (summary):\n" + fence(mem.summary, "conversation_summary"))
    if recent:
        lines = [f"{m.role}: {m.content[:MSG_CHARS]}" for m in recent]
        parts.append("RECENT MESSAGES (oldest first):\n" + fence("\n".join(lines), "recent_chat", limit=KEEP_RECENT * MSG_CHARS))
    return "\n".join(parts)


def needs_fold(db: Session, user_id: int | None, mode: str) -> bool:
    if not user_id:
        return False
    mem = get_memory(db, user_id, mode)
    return len(_pending(db, user_id, mode, mem.summarized_upto)) > FOLD_AT


async def fold(user_id: int, mode: str) -> None:
    """Fold older messages into the summary. Runs after the reply, in its own DB session."""
    from crew.agents import memory_keeper
    from crew.runtime import Run
    from safety import SpendGuard

    with Session(engine) as db:
        mem = get_memory(db, user_id, mode)
        pending = _pending(db, user_id, mode, mem.summarized_upto)
        if len(pending) <= FOLD_AT:
            return
        old = pending[:-KEEP_RECENT]
        transcript = "\n".join(f"{m.role}: {m.content[:1200]}" for m in old)
        prompt = (
            f"CURRENT SUMMARY:\n{fence(mem.summary or '(none yet)', 'conversation_summary')}\n"
            f"CURRENT FACTS:\n{fence(json.dumps(facts_of(mem)), 'remembered_facts')}\n"
            f"MESSAGES TO FOLD IN:\n{fence(transcript, 'chat_to_summarize', limit=len(transcript) + 50)}"
        )
        run = Run(db=db, user_id=user_id, feature="memory", guard=SpendGuard.for_user(db, user_id))
        try:
            out = (await run.call(memory_keeper, prompt, name="Memory Keeper", requests=2)).output
        except Exception as exc:  # memory is a nice-to-have; recent messages still work
            run.audit("agent_error", agent="Memory Keeper", detail=str(exc)[:200])
            return
        facts = [" ".join(f.split())[:120] for f in out.facts if f.strip() and screen_input(f).allowed][:MAX_FACTS]
        mem.summary = out.summary.strip()[:1500]
        mem.facts = json.dumps(facts)
        mem.summarized_upto = old[-1].id
        mem.updated_at = utcnow()
        db.add(mem)
        db.commit()


def new_conversation(db: Session, user_id: int, mode: str) -> None:
    """New chat: the summary resets, lasting facts stay."""
    mem = get_memory(db, user_id, mode)
    if mem.id:
        mem.summary, mem.summarized_upto, mem.updated_at = "", 0, utcnow()
        db.add(mem)
        db.commit()


def forget(db: Session, user_id: int, fact: str | None = None) -> list[str]:
    """Delete one remembered fact, or all of them (and every summary) when fact is None."""
    rows = db.exec(select(ChatMemory).where(ChatMemory.user_id == user_id)).all()
    if fact is None:
        for r in rows:
            db.delete(r)
        db.commit()
        return []
    mem = next((r for r in rows if r.mode == "dan"), None)
    if not mem:
        return []
    kept = [f for f in facts_of(mem) if f != fact]
    mem.facts = json.dumps(kept)
    db.add(mem)
    db.commit()
    return kept
