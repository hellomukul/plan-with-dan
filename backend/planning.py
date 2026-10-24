"""Deterministic planning tools. The agents call these; they never guess.

Clashes use real session dates, not session codes: two sections collide only
if their date ranges overlap AND they share a weekday AND their times overlap.
That gets half-term courses right (spring-1 vs spring-2 never clash; spring
full-term clashes with both halves; fall never clashes with spring).
"""

from __future__ import annotations

import statistics
from dataclasses import dataclass
from typing import Iterable

from catalog import DAY_ORDER, Catalog, Offering, Section, clock
from rules import DEGREE, GSA_DAYS, GSR_OPTIONS, gsr_courses

PASSING_MINUTES = 15
EARLY = 9 * 60
LATE = 18 * 60
LONG_GAP = 180


# ---------------------------------------------------------------- clashes

def _dates_overlap(a: Section, b: Section) -> bool:
    if a.term != b.term:
        return False
    if a.starts and a.ends and b.starts and b.ends:
        return a.starts <= b.ends and b.starts <= a.ends
    return True  # unknown dates in the same term: assume they overlap


def clash(a: Section, b: Section) -> dict | None:
    """Return where two sections collide, or None."""
    if a.id == b.id or not a.meeting or not b.meeting or not _dates_overlap(a, b):
        return None
    shared = [d for d in a.meeting.days if d in b.meeting.days]
    if not shared:
        return None
    lo, hi = max(a.meeting.start, b.meeting.start), min(a.meeting.end, b.meeting.end)
    if lo >= hi:
        return None
    return {
        "a": f"{a.number} §{a.section}",
        "b": f"{b.number} §{b.section}",
        "a_id": a.id,
        "b_id": b.id,
        "day": shared[0],
        "window": f"{clock(lo)}–{clock(hi)}",
        "term": a.term,
    }


def conflicts(sections: list[Section]) -> list[dict]:
    out = []
    for i, a in enumerate(sections):
        for b in sections[i + 1 :]:
            hit = clash(a, b)
            if hit:
                out.append(hit)
    return out


def best_section(offering: Offering, chosen: list[Section], prefs: dict | None = None) -> Section | None:
    """The first section of `offering` that clashes with nothing chosen and respects prefs."""
    ranked = sorted(offering.sections, key=lambda s: (not respects_prefs(s, prefs or {}), s.section))
    for sec in ranked:
        if not any(clash(sec, other) for other in chosen if other.offering_key != offering.key):
            return sec
    return None


def respects_prefs(sec: Section, prefs: dict) -> bool:
    m = sec.meeting
    if not m:
        return True  # TBA times are never excluded, only flagged
    no_before = prefs.get("no_before")  # minutes after midnight
    if isinstance(no_before, (int, float)) and m.start < no_before:
        return False
    if prefs.get("fridays_free") and "F" in m.days:
        return False
    avoid = set(prefs.get("avoid_days") or [])
    return not (avoid & set(m.days))


# ---------------------------------------------------------------- week review

def week_review(sections: list[Section]) -> dict:
    """A plain-language critique of one term's timetable."""
    notes: list[dict] = []
    by_day: dict[str, list[Section]] = {d: [] for d in DAY_ORDER}
    tba = [s for s in sections if not s.meeting]
    for s in sections:
        if s.meeting:
            for d in s.meeting.days:
                by_day[d].append(s)

    for d, rows in by_day.items():
        rows.sort(key=lambda s: s.meeting.start)  # type: ignore[union-attr]
        for s in rows:
            if s.meeting.start < EARLY:  # type: ignore[union-attr]
                notes.append({"kind": "warn", "text": f"{d}: {s.number} starts at {clock(s.meeting.start)}."})  # type: ignore[union-attr]
            if s.meeting.end > LATE:  # type: ignore[union-attr]
                notes.append({"kind": "info", "text": f"{d}: {s.number} runs until {clock(s.meeting.end)}."})  # type: ignore[union-attr]
        for x, y in zip(rows, rows[1:]):
            gap = y.meeting.start - x.meeting.end  # type: ignore[union-attr]
            if 0 <= gap <= PASSING_MINUTES:
                notes.append({"kind": "info", "text": f"{d}: {x.number} → {y.number} back-to-back ({gap} min)."})
            elif gap >= LONG_GAP:
                notes.append({"kind": "info", "text": f"{d}: {gap // 60}h gap between {x.number} and {y.number}."})

    busy = [d for d, rows in by_day.items() if rows]
    if "F" not in busy and busy:
        notes.append({"kind": "good", "text": "Fridays are free — handy for recruiting trips."})
    if tba:
        notes.append({"kind": "warn", "text": "No published time yet: " + ", ".join(sorted({s.number for s in tba})) + "."})
    heavy = max(by_day.items(), key=lambda kv: len(kv[1]), default=(None, []))
    if heavy[0] and len(heavy[1]) >= 3:
        notes.append({"kind": "warn", "text": f"{heavy[0]} has {len(heavy[1])} classes."})
    return {"days_on_campus": busy, "notes": notes}


# ---------------------------------------------------------------- requirements

@dataclass
class PlanRow:
    section: Section
    status: str  # planned | bidding | enrolled | completed


def units_by_term(rows: Iterable[PlanRow]) -> dict[str, float]:
    out: dict[str, float] = {}
    for r in rows:
        out[r.section.term] = out.get(r.section.term, 0.0) + r.section.units
    return out


def requirement_progress(profile: dict, rows: list[PlanRow], catalog: Catalog, global_choices: list[dict]) -> dict:
    year = profile.get("year") or ""
    completed_numbers = {c.strip().upper() for c in profile.get("completed", [])}
    core_units_done = DEGREE["core_units"] if year == "2" else 0.0
    planned_core = sum(r.section.units for r in rows if r.section.is_core)
    if year == "1":
        core_units_done = min(DEGREE["core_units"], planned_core)

    elective_rows = [r for r in rows if not r.section.is_core]
    elective_units = sum(r.section.units for r in elective_rows)
    term_units = units_by_term(rows)

    ldr_met = any(r.section.counts_for_ldr for r in rows) or any(
        any(s.counts_for_ldr for o in catalog.offering_for_number(n) for s in o.sections) for n in completed_numbers
    )
    gsr_keys = gsr_courses(catalog)
    gsr_offering_keys = {k for keys in gsr_keys.values() for k in keys}
    gsr_from_plan = [r.section.number + " " + r.section.title for r in rows if r.section.offering_key in gsr_offering_keys]
    gsr_done = [g for g in global_choices if g.get("status") == "done"]

    term_checks = []
    for term, units in sorted(term_units.items()):
        status = "ok"
        if units < DEGREE["min_units_first_three_terms"]:
            status = "low"
        elif units > DEGREE["approval_above_units"]:
            status = "needs_approval"
        term_checks.append({"term": term, "units": units, "status": status})

    return {
        "total_target": DEGREE["total_units"],
        "core": {"target": DEGREE["core_units"], "counted": core_units_done},
        "electives": {"target": DEGREE["elective_units"], "planned": elective_units},
        "planned_total": core_units_done + elective_units,
        "terms": term_checks,
        "ldr": {"met": ldr_met},
        "gsr": {"met": bool(gsr_done), "in_plan": gsr_from_plan, "choices": global_choices},
        "notes": [
            "Each of your first three terms needs at least 16 graded units; a heavy term doesn't make up for a light one.",
            "More than 24 units in a term needs approval.",
        ],
    }


def gsa_check(option_key: str, gsa_days_used: int) -> dict:
    opt = next((o for o in GSR_OPTIONS if o["key"] == option_key), None)
    if not opt:
        return {"ok": False, "reason": f"Unknown option '{option_key}'."}
    left = max(0, GSA_DAYS - gsa_days_used)
    if opt.get("requires_full_gsa") and gsa_days_used > 0:
        return {"ok": False, "days_left": left, "reason": "An IE needs all 10 GSA days unused, and you've used some."}
    need = opt["gsa_days"] or 0
    if need > left:
        return {"ok": True, "days_left": left, "reason": f"Allowed, but it uses ~{need} days and you have {left}; the rest is out of pocket."}
    return {"ok": True, "days_left": left - need, "reason": f"Fits your budget: ~{need} days, leaving {left - need}."}


# ---------------------------------------------------------------- alternates

def alternates(target: Offering, chosen: list[Section], catalog: Catalog, n: int = 3, prefs: dict | None = None) -> list[dict]:
    """Backups for `target`: same term, overlapping topics, and they fit the plan."""
    pool = [o for o in catalog.eligible(target.lead.term) if o.key != target.key]
    chosen_keys = {s.offering_key for s in chosen}
    my_topics = set(target.lead.topics)
    query = f"{target.lead.title} {' '.join(target.lead.topics)}"
    ranked = catalog.search(query, pool, limit=40)
    out = []
    for off, score in ranked:
        if off.key in chosen_keys:
            continue
        overlap = my_topics & set(off.lead.topics)
        if not overlap and score < 2:
            continue
        sec = best_section(off, [s for s in chosen if s.offering_key != target.key], prefs)
        if not sec or (prefs and not respects_prefs(sec, prefs)):
            continue
        out.append({
            "key": off.key,
            "section_id": sec.id,
            "number": off.lead.number,
            "title": off.lead.title,
            "time": sec.time_label,
            "shared_topics": sorted(overlap),
            "seats": off.lead.limit,
        })
        if len(out) >= n:
            break
    return out


# ---------------------------------------------------------------- bids

def bid_stats(reports: list[dict]) -> dict:
    """Summarise reported bid outcomes for one course. Never invents numbers."""
    if not reports:
        return {"reports": 0}
    real = [r for r in reports if r.get("source") != "sample"]
    sample_count = len(reports) - len(real)
    if real:  # once students report real outcomes, SAMPLE rows stop counting
        reports = real
    won = sorted(r["points_bid"] for r in reports if r["got_seat"])
    lost = sorted(r["points_bid"] for r in reports if not r["got_seat"])
    clearing = [r["clearing_points"] for r in reports if r.get("clearing_points") is not None]
    return {
        "reports": len(reports),
        "sample_only": all(r.get("source") == "sample" for r in reports),
        "sample_reports_ignored": sample_count if real else 0,
        "won": len(won),
        "lost": len(lost),
        "lowest_winning_bid": won[0] if won else None,
        "median_winning_bid": statistics.median(won) if won else None,
        "highest_losing_bid": lost[-1] if lost else None,
        "median_reported_clearing": statistics.median(clearing) if clearing else None,
        "terms": sorted({r["term_code"] for r in reports if r.get("term_code")}),
    }


def suggest_bids(items: list[dict], budget: int) -> list[dict]:
    """Split a points budget across courses by priority and demand.

    items: {key, number, title, priority (1 = must have .. 3 = nice), seats, median_winning_bid}
    A heuristic, labelled as such in the UI. Must-haves get the most points;
    courses with reported high clearing prices or few seats get more; courses
    with lots of seats and no reported competition get a token bid.
    """
    if budget <= 0 or not items:
        return []
    weights = []
    for it in items:
        w = {1: 3.0, 2: 1.6, 3: 0.7}.get(int(it.get("priority", 2)), 1.6)
        seats = it.get("seats")
        if isinstance(seats, int) and seats > 0:
            w *= 1.4 if seats <= 30 else 1.15 if seats <= 50 else 0.85
        med = it.get("median_winning_bid")
        if isinstance(med, (int, float)) and med > 0:
            w *= 1 + min(med / max(budget, 1), 1.0)
        weights.append(w)
    total = sum(weights)
    raw = [budget * w / total for w in weights]
    points = [int(x) for x in raw]
    leftover = budget - sum(points)
    for i in sorted(range(len(raw)), key=lambda i: raw[i] - points[i], reverse=True)[:leftover]:
        points[i] += 1
    return [
        {**it, "suggested_points": p, "share": round(p / budget, 3)}
        for it, p in zip(items, points)
    ]
