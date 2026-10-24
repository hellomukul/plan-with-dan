"""'Your best fits': an honest, deterministic ranking for the home page.

Design rules (from docs/design_brief.md):
- Gate first: courses that clash with the plan, were already taken, or are
  already planned never appear as best fits.
- Fit is a label (Strong fit / Good fit / Worth a look), never a percentage.
- At most two reason chips, built from structured data, so they can't invent facts.
- "Why?" shows the description sentence that best matches the goals, plus one
  counter-reason.
- Demand (how hard a course is to get) is shown separately from fit.
- "Not for me" removes a course and demotes courses that share its topics.

No model call: this runs on every home page load for free. The AI Curator
("Find my courses") is the deeper, slower pass.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from catalog import Catalog, Offering, Section, _tokens, clock
from planning import PlanRow, best_section, bid_stats, respects_prefs

TIERS = [(0.62, "Strong fit"), (0.40, "Good fit"), (0.0, "Worth a look")]
GOAL_FILLER = set(
    "summer internship intern job jobs role roles career careers lead leading leader company companies work want "
    "become someday get into first next year years run running build building my own big new long short term goal".split()
)


COMPOUNDS = [
    "private equity", "venture capital", "real estate", "product management", "supply chain", "machine learning",
    "artificial intelligence", "social impact", "impact investing", "investment banking", "health care",
    "public policy", "data science", "consumer goods", "asset management", "hedge fund", "growth equity",
]


def _goal_terms(text: str) -> list[tuple[str, list[str]]]:
    """(display term, stems that must all appear) for the meaningful parts of the goals."""
    low = (text or "").lower()
    terms: list[tuple[str, list[str]]] = []
    for phrase in COMPOUNDS:
        if phrase in low:
            terms.append((phrase, [t for w in phrase.split() for t in _tokens(w)]))
            low = low.replace(phrase, " ")
    for stem, word in _goal_words(low).items():
        terms.append((word, [stem]))
    return terms


def _goal_words(text: str) -> dict[str, str]:
    """stem -> original word, for the meaningful words in the student's goals."""
    out: dict[str, str] = {}
    for word in re.findall(r"[A-Za-z][A-Za-z&-]+", text or ""):
        w = word.lower()
        if w in GOAL_FILLER or len(w) < 3:
            continue
        stems = _tokens(w)
        if stems:
            out.setdefault(stems[0], w)
    return out


def _is_trip(off: Offering) -> bool:
    t = off.lead.title.upper()
    return t.startswith("IE:") or t.startswith("GNW") or "GLOBAL SOCIAL ENTREPRENEURSHIP" in t
SENT = re.compile(r"(?<=[.!?])\s+")


@dataclass
class FitContext:
    catalog: Catalog
    profile: dict
    plan: list[PlanRow]
    dismissed: list[str]  # offering keys
    bid_reports: dict[str, list[dict]]  # course number -> reports
    ldr_met: bool
    gsr_met: bool


def _short_goal(text: str, limit: int = 34) -> str:
    first = re.split(r"[;,.]", text or "")[0].strip()
    return first if len(first) <= limit else first[: limit - 1].rstrip() + "…"


def _evidence(description: str, query_tokens: set[str]) -> str:
    best, score = "", 0
    for sent in SENT.split(description or ""):
        s = sent.strip()
        if not (30 <= len(s) <= 260):
            continue
        overlap = len(query_tokens & set(_tokens(s)))
        if overlap > score:
            best, score = s, overlap
    return best


def _counter(sec: Section) -> str:
    m = sec.meeting
    if not m:
        return "Meeting time not published yet"
    if m.start >= 17 * 60:
        return f"Evening class (ends {clock(m.end)})"
    if m.start < 9 * 60:
        return f"Early start ({clock(m.start)})"
    if sec.limit and sec.limit <= 30:
        return f"Small class ({sec.limit} seats), so likely competitive"
    if sec.enrollment.lower() == "permission":
        return "Needs instructor permission"
    if sec.units >= 4:
        return "Full-term, 4-unit workload"
    return ""


def _demand(off: Offering, reports: list[dict]) -> dict:
    stats = bid_stats(reports)
    seats = off.lead.limit
    level = "Unknown"
    if seats:
        level = "High" if seats <= 30 else "Medium" if seats <= 50 else "Low"
    if stats.get("median_winning_bid") is not None and not stats.get("sample_only"):
        level = "High" if stats["median_winning_bid"] >= 100 else "Medium" if stats["median_winning_bid"] >= 40 else "Low"
    return {"level": level, "seats": seats, "reports": stats.get("reports", 0),
            "sample": bool(stats.get("sample_only")) if stats.get("reports") else False}


def best_fits(ctx: FitContext, term: str = "202701", top: int = 3) -> dict:
    p = ctx.profile or {}
    program = p.get("program") or "MBA"
    prefs = p.get("prefs") or {}
    completed = {c.strip().upper() for c in p.get("completed", [])}
    planned_keys = {r.section.offering_key for r in ctx.plan}
    chosen = [r.section for r in ctx.plan if r.section.term == term]
    term_units = sum(s.units for s in chosen)
    interests = set(p.get("interests", []))
    dismissed = set(ctx.dismissed)
    dismissed_topics: dict[str, int] = {}
    for key in dismissed:
        off = ctx.catalog.offering(key)
        for t in (off.lead.topics if off else []):
            dismissed_topics[t] = dismissed_topics.get(t, 0) + 1

    goal_text = " ".join([p.get("goal_short", ""), p.get("goal_long", ""), p.get("background", "")])
    # Short-term goal (internship / recruiting) counts double; drop terms already covered by a compound.
    goal_terms: list[tuple[str, list[str], int]] = []
    for text, weight in ((p.get("goal_short", ""), 2), (p.get("goal_long", ""), 1)):
        for label, stems in _goal_terms(text):
            if any(set(stems) <= set(s2) for _, s2, _ in goal_terms):
                continue
            goal_terms.append((label, stems, weight))
    query = " ".join([goal_text, " ".join(interests) * 2])
    qtokens = set(_tokens(query))

    pool = [o for o in ctx.catalog.eligible(term, program=program)
            if o.key not in planned_keys and o.key not in dismissed and o.lead.number.upper() not in completed
            and o.lead.units > 0]
    ranked = ctx.catalog.search(query, pool, limit=len(pool)) if query.strip() else [(o, 0.0) for o in pool]
    max_bm25 = max((s for _, s in ranked), default=0.0) or 1.0

    fits, swaps = [], []
    pref_misses = 0
    for off, bm in ranked:
        sec = best_section(off, chosen, prefs, program)
        if sec is None:
            swaps.append(off)
            continue
        if prefs and not respects_prefs(sec, prefs):
            pref_misses += 1  # e.g. only an 8:30 or Friday section exists: not a "best fit" for this student
            continue
        lead = off.lead
        course_tokens = set(_tokens(f"{lead.title} {lead.description} {' '.join(lead.topics)}"))
        hits = [(label, w) for label, stems, w in goal_terms if stems and all(st in course_tokens for st in stems)]
        hits.sort(key=lambda h: -h[1])
        matched = [t for t, _ in hits][:3]
        goal = 0.55 * (bm / max_bm25) + 0.45 * min(1.0, sum(w for _, w in hits) / 4)
        topic_hits = sorted(interests & set(lead.topics))
        req_bonus = 0.0
        if not ctx.ldr_met and lead.counts_for_ldr:
            req_bonus += 0.08
        if not ctx.gsr_met and lead.counts_for_gsr:
            req_bonus += 0.06
        if term_units < 16:
            req_bonus += 0.04
        sched = 0.08 if respects_prefs(sec, prefs) and sec.meeting else 0.0
        penalty = 0.12 * sum(dismissed_topics.get(t, 0) for t in lead.topics)
        no_desc = 0.1 if not lead.description else 0.0
        title_tokens = set(_tokens(lead.title))
        in_title = sum(w for _, stems, w in goal_terms if stems and all(st in title_tokens for st in stems))
        score = 0.55 * goal + 0.08 * min(in_title, 3) + 0.06 * len(topic_hits) + req_bonus + sched - penalty - no_desc
        score = max(0.0, min(1.0, score))

        chips: list[str] = []
        if matched:
            chips.append("Matches: " + ", ".join(matched[:2]))
        elif topic_hits:
            chips.append(f"Interest: {topic_hits[0]}")
        if not ctx.ldr_met and lead.counts_for_ldr:
            chips.append("Counts: Leadership")
        elif not ctx.gsr_met and lead.counts_for_gsr:
            chips.append("Counts: Global Studies")
        elif term_units < 16:
            chips.append(f"+{lead.units:g} toward 16 units")
        elif sec.meeting and prefs.get("fridays_free") and "F" not in sec.meeting.days:
            chips.append("Keeps Fridays free")
        chips = chips[:2]

        tier = next(label for cut, label in TIERS if score >= cut)
        fits.append({
            "trip": _is_trip(off),
            "key": off.key, "section_id": sec.id, "number": lead.number, "title": lead.title,
            "session": sec.session, "time": sec.time_label, "units": lead.units, "room": sec.room,
            "faculty": lead.faculty, "topics": lead.topics, "ldr": lead.counts_for_ldr, "gsr": lead.counts_for_gsr,
            "enrollment": lead.enrollment, "tier": tier, "score": round(score, 3), "chips": chips,
            "why": {
                "evidence": _evidence(lead.description, qtokens),
                "counter": _counter(sec),
                "factors": {"goal": round(goal, 2), "interests": len(topic_hits),
                            "requirements": round(req_bonus, 2), "schedule": round(sched, 2)},
            },
            "demand": _demand(off, ctx.bid_reports.get(lead.number, [])),
        })

    fits.sort(key=lambda f: (-f["score"], f["number"]))
    trips = [f for f in fits if f["trip"]]
    regular = [f for f in fits if not f["trip"]]
    goal_row = regular[top:top + 6]
    ldr_row = [f for f in regular if f["ldr"]][:6] if not ctx.ldr_met else []
    gsr_row = (trips + [f for f in regular if f["gsr"]])[:6] if not ctx.gsr_met else []
    return {
        "term": term,
        "top": regular[:top],
        "rows": [r for r in [
            {"id": "goal", "title": "More for your goal" if p.get("goal_short") else "More to explore", "items": goal_row},
            {"id": "ldr", "title": "Counts for the Leadership requirement", "items": ldr_row},
            {"id": "gsr", "title": "Global Studies options (study trips and courses)", "items": gsr_row},
        ] if r["items"]],
        "swap_count": len(swaps),
        "pref_misses": pref_misses,
        "eligible": len(pool),
        "how": "Ranked in code from your goals and interests (text match), requirement gaps, and schedule fit. "
               "Clashing, planned or already-taken courses, and sections outside your schedule preferences, are hidden. Demand comes from seat limits and "
               "student-reported bids and is never part of fit.",
    }
