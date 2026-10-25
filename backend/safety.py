"""Safety layer: what runs before, around and after every model call.

1. screen_input   - blocks obvious prompt-injection / data-exfiltration attempts
                    before any tokens are spent, and caps message length.
2. fence          - wraps untrusted text (web results, course descriptions,
                    student notes) so the model treats it as data.
3. check_output   - redacts anything that looks like a secret, and flags
                    course numbers the model mentions that aren't in the catalog.
4. SpendGuard     - per-turn and per-student-per-day dollar caps, from real
                    token counts in the usage log.
5. validate_picks - recommender guard: drops courses that don't exist or whose
                    "evidence" quote isn't really in the course description.
"""

from __future__ import annotations

import os
import re
import unicodedata
from dataclasses import dataclass, field
from datetime import timedelta

from sqlmodel import Session, func, select

from config import DAILY_BUDGET_USD, MAX_MESSAGE_CHARS, PUBLIC_DAILY_BUDGET_USD, RUN_BUDGET_USD
from db import UsageLog, utcnow

# ---------------------------------------------------------------- 1. input screen

INJECTION_PATTERNS = [
    (r"\b(ignore|disregard|forget|override)\b.{0,40}\b(previous|prior|above|earlier|all|your|system)\b.{0,30}\b(instruction|prompt|rule|guideline)s?",
     "asks the assistant to ignore its instructions"),
    (r"\b(reveal|show|print|repeat|leak|dump|output)\b.{0,40}\b(system|hidden|developer|initial)\s*(prompt|message|instruction)s?",
     "asks for the hidden system prompt"),
    (r"\b(api[\s_-]?key|portkey|openai[\s_-]?key|secret[\s_-]?key|\.env\b|environment variable|password hash|access token)",
     "asks for keys or secrets"),
    (r"\b(other|another|all)\s+(students?|users?)['’]?s?\b.{0,40}\b(plan|data|email|password|schedule|profile|bids?)",
     "asks for other students' data"),
    (r"\b(you are now|act as|pretend to be|roleplay as)\b.{0,40}\b(dan mode|developer mode|jailbr(oken|eak)|unfiltered|no restrictions)",
     "tries to jailbreak the assistant"),
    (r"<\s*/?\s*(system|untrusted|instructions?)\s*>", "contains fake control tags"),
    (r"\b(drop\s+table|delete\s+from|union\s+select|;\s*--)", "looks like a database injection"),
    (r"\b(what|tell|give|show|share|print)\b.{0,30}\b(your|the)\s+(system|hidden|developer|initial|original)\s+(prompt|instructions?|rules)",
     "asks for the hidden system prompt"),
    (r"\b(disregard|ignore|forget|override)\b.{0,25}\b(the above|everything above|all (of )?the above|what (i|you) (said|were told))",
     "asks the assistant to ignore its instructions"),
    (r"\b(forget|ignore|disregard)\b.{0,15}\b(everything|all)\b.{0,30}\b(told|said|instructed|know)\b",
     "asks the assistant to ignore its instructions"),
    (r"\b(you are now|from now on you are|act as|pretend (to be|you are))\s+(dan|dude|aim|an? unfiltered|an? uncensored|jailbr)",
     "tries to jailbreak the assistant"),
    (r"\bsystem\s+override\b|\bdeveloper\s+mode\b|\bgod\s*mode\b", "tries to jailbreak the assistant"),
    (r"\b(list|show|give|dump|export|print)\b.{0,25}\b(every|all|other)\b.{0,15}\b(users?|students?|accounts?)\b.{0,25}\b(emails?|passwords?|data|plans?|names?)",
     "asks for other students' data"),
    (r"<\|\s*(im_start|im_end|system|endoftext|assistant)\s*\|>|\[/?inst\]|<<\s*/?sys\s*>>|(^|\n)\s*#{0,3}\s*(system|developer)\s*(prompt)?\s*:",
     "contains fake control tags"),
]
_COMPILED = [(re.compile(p, re.I | re.S), why) for p, why in INJECTION_PATTERNS]


@dataclass
class Screen:
    allowed: bool
    reasons: list[str] = field(default_factory=list)
    text: str = ""
    benign: bool = False  # refused for a harmless reason (empty, too long), not an attack


_LEET = str.maketrans({"0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s"})


def _normalised(text: str) -> str:
    """What the patterns check: fullwidth/stylised letters folded (NFKC), zero-width characters removed, and a
    leetspeak-folded copy appended, so "1gn0re", "ｉｇｎｏｒｅ" and "ig\u200bnore" match like "ignore"."""
    folded = unicodedata.normalize("NFKC", text)
    folded = re.sub(r"[\u200b-\u200f\u2060\ufeff]", "", folded)
    return folded + "\n" + folded.lower().translate(_LEET)


def screen_input(text: str) -> Screen:
    clean = (text or "").replace("\x00", "").strip()
    if not clean:
        return Screen(False, ["empty message"], "", benign=True)
    if len(clean) > MAX_MESSAGE_CHARS:
        return Screen(False, [f"message is longer than {MAX_MESSAGE_CHARS} characters"], clean[:MAX_MESSAGE_CHARS],
                      benign=True)
    check = _normalised(clean)
    reasons = list(dict.fromkeys(why for rx, why in _COMPILED if rx.search(check)))
    return Screen(not reasons, reasons, clean)


REFUSAL = (
    "I can't help with that one. It looks like an attempt to change my rules or get at private "
    "data ({why}). I only help with your own SOM planning, courses and AI news. Try asking me "
    "something like “find me a spring elective on healthcare strategy”."
)

# ---------------------------------------------------------------- 2. fencing

_FENCE_STRIP = re.compile(r"</?\s*untrusted[^>]*>", re.I)


def fence(text: str, source: str, limit: int = 4000) -> str:
    """Wrap untrusted text so the model reads it as data, never as instructions."""
    body = _FENCE_STRIP.sub("", str(text or ""))[:limit]
    return f'<untrusted source="{source}">\n{body}\n</untrusted>'


# ---------------------------------------------------------------- 3. output check

SECRET_PATTERNS = [
    re.compile(r"\bsk-[A-Za-z0-9_\-]{16,}"),
    re.compile(r"\b(pk|pt|portkey)[-_][A-Za-z0-9_\-]{16,}", re.I),
    re.compile(r"\$argon2id\$[^\s]+"),
]
COURSE_NO = re.compile(r"\b(MGT|MGMT)\s?(\d{3,4})\b")


def check_output(text: str, known_numbers: set[str]) -> tuple[str, list[str]]:
    """Return (safe_text, issues)."""
    issues: list[str] = []
    out = text or ""
    for key_name in ("PORTKEY_API_KEY", "OPENAI_API_KEY"):
        val = os.getenv(key_name, "")
        if len(val) > 8 and val in out:
            out = out.replace(val, "[redacted]")
            issues.append("redacted an API key")
    for rx in SECRET_PATTERNS:
        if rx.search(out):
            out = rx.sub("[redacted]", out)
            issues.append("redacted a secret-looking string")
    unknown = sorted({f"{m.group(1)} {m.group(2)}" for m in COURSE_NO.finditer(out)} - known_numbers)
    if unknown:
        issues.append("mentions course numbers not in the SOM catalog: " + ", ".join(unknown))
        out += (
            "\n\n> Heads-up: I couldn't find " + ", ".join(unknown)
            + " in the current SOM catalog, so double-check before bidding."
        )
    return out, issues


# ---------------------------------------------------------------- 4. spend guard

class BudgetExceeded(Exception):
    pass


def public_spent_today(db: Session) -> float:
    since = utcnow() - timedelta(days=1)
    total = db.exec(select(func.coalesce(func.sum(UsageLog.cost_usd), 0.0)).where(
        UsageLog.user_id.is_(None), UsageLog.feature == "public", UsageLog.created_at >= since)).one()
    return float(total or 0.0)


def spent_today(db: Session, user_id: int) -> float:
    since = utcnow() - timedelta(days=1)
    total = db.exec(
        select(func.coalesce(func.sum(UsageLog.cost_usd), 0.0)).where(
            UsageLog.user_id == user_id, UsageLog.created_at >= since
        )
    ).one()
    return float(total or 0.0)


@dataclass
class SpendGuard:
    user_id: int | None
    run_budget: float = RUN_BUDGET_USD
    daily_budget: float = DAILY_BUDGET_USD
    spent_before: float = 0.0
    spent_run: float = 0.0

    @classmethod
    def for_user(cls, db: Session, user_id: int | None) -> "SpendGuard":
        before = spent_today(db, user_id) if user_id else 0.0
        return cls(user_id=user_id, spent_before=before)

    public: bool = False

    @classmethod
    def for_public(cls, db: Session) -> "SpendGuard":
        """All visitors share one daily pool (PUBLIC_DAILY_BUDGET_USD)."""
        return cls(user_id=None, daily_budget=PUBLIC_DAILY_BUDGET_USD, spent_before=public_spent_today(db), public=True)

    def check(self, stage: str = "") -> None:
        if self.public and self.spent_before + self.spent_run >= self.daily_budget:
            raise BudgetExceeded("Dan has answered all the visitor questions he can for today. Create a free account "
                                 "to keep chatting: signed-in students get their own daily budget.")
        if self.spent_before + self.spent_run >= self.daily_budget:
            raise BudgetExceeded(
                f"Daily AI budget reached (${self.daily_budget:.2f} per student per day). "
                "Your plan, calendar and course search still work — Dan's back tomorrow."
            )
        if self.spent_run >= self.run_budget:
            raise BudgetExceeded(
                f"This question hit its spending cap (${self.run_budget:.2f}) at {stage or 'a step'}; "
                "answering with what I have."
            )

    def add(self, cost: float) -> None:
        self.spent_run += cost


# ---------------------------------------------------------------- 5. recommender guard

def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).strip()


def validate_picks(picks: list[dict], allowed_keys: set[str], descriptions: dict[str, str]) -> tuple[list[dict], list[dict]]:
    kept, dropped = [], []
    seen = set()
    for p in picks:
        key = p.get("key", "")
        if key not in allowed_keys:
            dropped.append({**p, "dropped_because": "not one of the real catalog courses it was given"})
            continue
        if key in seen:
            dropped.append({**p, "dropped_because": "duplicate pick"})
            continue
        quote = _norm(p.get("evidence", ""))
        desc = _norm(descriptions.get(key, ""))
        if quote and len(quote) >= 12 and quote not in desc:
            p = {**p, "evidence": "", "evidence_note": "quote removed: not found in the course description"}
        seen.add(key)
        kept.append(p)
    return kept, dropped


# ---------------------------------------------------------------- 6. support signal

# Words that suggest a student is struggling. A hit never blocks or changes the answer: the reply just also carries
# the "Need someone right now?" line and the embedded-counselor link. Only a yes/no is ever logged, never the text.
_SUPPORT = re.compile(
    r"\b(overwhelm(ed|ing)?|can[’']?t\s+cope|cannot\s+cope|not\s+coping|panic(king|ked)?|panic\s+attacks?|hopeless|"
    r"self[\s-]?harm|hurt(ing)?\s+myself|suicid(e|al)|kill\s+myself|end\s+(it\s+all|my\s+life)|want\s+to\s+die|"
    r"don[’']?t\s+want\s+to\s+(be\s+here|live)|can[’']?t\s+go\s+on|breaking\s+down|mental\s+breakdown|burn(ed|t)\s+out|"
    r"falling\s+apart|so\s+(depressed|anxious|alone))\b",
    re.I,
)


def support_signal(text: str) -> bool:
    """True when a message suggests distress, so the chat can add a gentle support card."""
    return bool(_SUPPORT.search(text or ""))


SUPPORT_CARD = {
    "text": "Need someone right now? Yale Mental Health & Counseling’s on-call clinician answers at any hour:",
    "phone": "203-432-0290",
    "tel": "tel:2034320290",
    "crisis": "In the US you can also call or text 988.",
    "counselor_label": "Book SOM’s embedded counselor",
    "counselor_url": "https://groups.som.yale.edu/aasl/yale-mental-health-and-wellness/",
}
