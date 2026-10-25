"""Deterministic planning tools. The agents call these; they never guess.

Clashes use real session dates, not session codes: two sections collide only
if their date ranges overlap AND they share a weekday AND their times overlap.
That gets half-term courses right (spring-1 vs spring-2 never clash; spring
full-term clashes with both halves; fall never clashes with spring).
"""

from __future__ import annotations

import statistics
from datetime import date
from dataclasses import dataclass
from typing import Iterable

from catalog import DAY_ORDER, Catalog, Offering, Section, clock
import programs
from rules import DEGREE, GSA_DAYS, GSR_OPTIONS, gsr_courses

PASSING_MINUTES = 15
MIN_REPORTS = 5  # hide bid statistics until this many different students have reported (fake accounts are cheap)
EXACT_REPORTS = 10  # below this, medians are rounded and the exact lowest win / highest loss stay hidden
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


def best_section(offering: Offering, chosen: list[Section], prefs: dict | None = None,
                 program: str = "MBA") -> Section | None:
    """The first open section of `offering` for `program` that clashes with nothing chosen.

    Never falls back to another program's section (an MBA student can't take an
    EMBA-only section), and never offers a section that has already ended.
    """
    mine = [s for s in offering.sections_for(program)] if program else list(offering.sections)
    ranked = sorted(mine, key=lambda s: (not respects_prefs(s, prefs or {}), s.closed, s.section))
    for sec in ranked:
        if not any(clash(sec, other) for other in chosen if other.offering_key != offering.key):
            return sec
    return None


def clean_prefs(prefs: dict | None) -> dict:
    """Tolerate malformed preferences instead of crashing (types are also validated at the API)."""
    prefs = prefs if isinstance(prefs, dict) else {}
    out: dict = {}
    nb = prefs.get("no_before")
    if isinstance(nb, (int, float)) and not isinstance(nb, bool) and 0 < nb < 24 * 60:
        out["no_before"] = int(nb)
    if prefs.get("fridays_free") is True:
        out["fridays_free"] = True
    avoid = prefs.get("avoid_days")
    if isinstance(avoid, list):
        out["avoid_days"] = [d for d in avoid if isinstance(d, str) and d in DAY_ORDER]
    return out


def prefs_text(prefs: dict | None) -> str:
    """Preferences in words for the model ("no classes before 10:00 AM"), never raw minutes."""
    p = clean_prefs(prefs)
    bits = []
    if p.get("no_before"):
        bits.append(f"no classes starting before {clock(p['no_before'])}")
    if p.get("fridays_free"):
        bits.append("keep Fridays free")
    if p.get("avoid_days"):
        bits.append("avoid " + ", ".join(p["avoid_days"]))
    return "; ".join(bits) or "no schedule preferences"


def respects_prefs(sec: Section, prefs: dict) -> bool:
    m = sec.meeting
    if not m:
        return True  # TBA times are never excluded, only flagged
    p = clean_prefs(prefs)
    if p.get("no_before") and m.start < p["no_before"]:
        return False
    if p.get("fridays_free") and "F" in m.days:
        return False
    return not (set(p.get("avoid_days", [])) & set(m.days))


# ---------------------------------------------------------------- week review

def _window_review(sections: list[Section], label: str) -> tuple[list[dict], list[str]]:
    notes: list[dict] = []
    by_day: dict[str, list[Section]] = {d: [] for d in DAY_ORDER}
    for s in sections:
        if s.meeting:
            for d in s.meeting.days:
                by_day[d].append(s)
    prefix = f"{label}: " if label else ""
    for d, rows in by_day.items():
        rows.sort(key=lambda s: s.meeting.start)  # type: ignore[union-attr]
        for s in rows:
            if s.meeting.start < EARLY:  # type: ignore[union-attr]
                notes.append({"kind": "warn", "text": f"{prefix}{d}: {s.number} starts at {clock(s.meeting.start)}."})  # type: ignore[union-attr]
            if s.meeting.end > LATE:  # type: ignore[union-attr]
                notes.append({"kind": "info", "text": f"{prefix}{d}: {s.number} runs until {clock(s.meeting.end)}."})  # type: ignore[union-attr]
        for x, y in zip(rows, rows[1:]):
            gap = y.meeting.start - x.meeting.end  # type: ignore[union-attr]
            if 0 <= gap <= PASSING_MINUTES:
                notes.append({"kind": "info", "text": f"{prefix}{d}: {x.number} → {y.number} back-to-back ({gap} min)."})
            elif gap >= LONG_GAP:
                notes.append({"kind": "info", "text": f"{prefix}{d}: {gap // 60}h gap between {x.number} and {y.number}."})
    heavy = max(by_day.items(), key=lambda kv: len(kv[1]), default=(None, []))
    if heavy[0] and len(heavy[1]) >= 3:
        notes.append({"kind": "warn", "text": f"{prefix}{heavy[0]} has {len(heavy[1])} classes."})
    return notes, [d for d, rows in by_day.items() if rows]


def week_review(sections: list[Section]) -> dict:
    """A plain-language critique of one term's timetable.

    Session-1 and session-2 courses never share a week, so each half-term is
    reviewed on its own (full-term courses count in both halves).
    """
    tba = [s for s in sections if not s.meeting]
    halves = any(s.session.endswith(("-1", "-2")) for s in sections)
    notes: list[dict] = []
    busy: set[str] = set()
    if halves:
        for suffix, label in (("-1", "Session 1"), ("-2", "Session 2")):
            half = [s for s in sections if s.session.endswith(suffix)]
            if half and all(s.ended() for s in half):
                continue  # that half-term is over (e.g. Fall-1 in late October): nothing left to critique
            window = [s for s in sections if s.session.endswith(suffix) or not s.session.endswith(("-1", "-2"))]
            n, b = _window_review(window, label)
            notes += n
            busy |= set(b)
    else:
        notes, b = _window_review(sections, "")
        busy = set(b)
    days = [d for d in DAY_ORDER if d in busy]
    if "F" not in busy and busy:
        notes.append({"kind": "good", "text": "Fridays are free, which helps with recruiting trips."})
    if tba:
        notes.append({"kind": "warn", "text": "No published time yet: " + ", ".join(sorted({s.number for s in tba})) + "."})
    return {"days_on_campus": days, "notes": notes}


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


def mba_rules_apply(profile: dict) -> bool:
    """Full-time MBA rules (cohort core, LDR, GSR, GSA): MBA and joint-degree MBA students."""
    return programs.is_mba(profile.get("program"))


def core_load(profile: dict, term: str, catalog: Catalog) -> dict:
    """First-year MBA core for one term: units always, sections when the cohort mapping is known.

    The core is assigned by cohort and never bid on, so it isn't in the plan, but it
    still counts toward the term's units and takes up time in the week.
    """
    if not mba_rules_apply(profile) or (profile.get("year") or "") != "1":
        return {"units": 0.0, "sections": [], "courses": [], "times_known": True}
    numbers: dict[str, float] = {}
    for o in catalog.offerings.values():
        s = o.lead
        if s.term == term and s.is_core and s.visible:
            numbers.setdefault(s.number, s.units)
    sections = [s for s in catalog.cohort_core(term, profile.get("cohort") or "") if s.number in numbers]
    return {
        "units": round(sum(numbers.values()), 1),
        "courses": sorted(numbers),
        "sections": sections,
        "times_known": len(sections) >= len(numbers) > 0,
    }


def min_units(profile: dict, term: str) -> float | None:
    """The per-term unit minimum for this student, or None when no minimum applies.

    MBA: 16 units in each of the first three terms (year 1 fall/spring, year 2 fall).
    MAM: 20 units each term. MMS (except PEM): 18 units each term. EMBA, PEM, PhD: none stated.
    """
    prog = programs.get(profile.get("program"))
    if prog["base"] == "MBA":
        year = profile.get("year") or ""
        return float(prog["min_units"]) if year == "1" or (year == "2" and term == "202603") else None
    return float(prog["min_units"]) if prog.get("min_units") else None


def min_units_apply(profile: dict, term: str) -> bool:
    return min_units(profile, term) is not None


def max_units(profile: dict) -> float | None:
    """More than this many units in a term needs approval (all residential programs and the EMBA: 24)."""
    cap = programs.get(profile.get("program")).get("max_units")
    return float(cap) if cap else None


def program_checks(profile: dict, rows: list[PlanRow], catalog: Catalog) -> list[dict]:
    """Requirement checklist for programs other than the full-time MBA, from programs.py."""
    prog = programs.get(profile.get("program"))
    if prog["base"] == "MBA":
        return []
    done_status = ("completed", "enrolled")
    completed = {" ".join(c.split()).upper() for c in profile.get("completed", [])}
    checks: list[dict] = []
    required_numbers = set()
    for req in prog.get("required", []):
        required_numbers.add(req["number"])
        label = f"{req['number']} {req['title']} ({'Fall' if req['term'] == '202603' else 'Spring'}, {req['units']:g} units)"
        mine = [r for r in rows if r.section.number == req["number"] and r.section.term == req["term"]]
        if any(r.status in done_status for r in mine) or (req["number"] in completed and req["term"] == "202603"):
            checks.append({"label": label, "status": "done", "detail": "Required course"})
        elif mine:
            checks.append({"label": label, "status": "planned", "detail": "Required course, in your plan"})
        elif not catalog.offering_for_number(req["number"], req["term"]):
            checks.append({"label": label, "status": "info",
                           "detail": "Required, but not in SOM's public course feed. Confirm with your program office."})
        elif req["term"] == "202603" and date.today() >= date(2026, 9, 2):
            checks.append({"label": label, "status": "info",
                           "detail": "Required fall course, already under way. Add it to your plan as enrolled or completed."})
        else:
            checks.append({"label": label, "status": "missing", "detail": "Required course: add it so clash checks include it"})
    if prog.get("list_tag"):
        tag, need = prog["list_tag"], prog["list_units"]
        got = sum(r.section.units for r in rows if tag in r.section.tracks and r.section.number not in required_numbers)
        checks.append({"label": f"{prog['list_label']}: {got:g} of {need} units", "status": "done" if got >= need else
                       ("planned" if got else "missing"), "detail": f"Courses tagged for {prog['label']} in the catalog"})
    if prog.get("total_units"):
        units = sum(r.section.units for r in rows)
        checks.append({"label": f"Total: {units:g} of {prog['total_units']} units in your plan", "status":
                       "done" if units >= prog["total_units"] else "planned" if units else "missing",
                       "detail": "Includes courses you've completed or planned in the app"})
    checks.append({"label": "Global", "status": "info", "detail": prog["global"]})
    for item in prog.get("unconfirmed", []):
        checks.append({"label": "Not confirmed in official sources", "status": "unconfirmed", "detail": item})
    return checks


def effective_gsa_used(profile: dict, global_choices: list[dict]) -> int:
    """GSA days used: the profile number, or more if options marked done imply it."""
    days = {o["key"]: o.get("gsa_days") or 0 for o in GSR_OPTIONS}
    implied = sum(days.get(c.get("option_key"), 0) for c in global_choices if c.get("status") == "done")
    return min(GSA_DAYS, max(int(profile.get("gsa_days_used", 0) or 0), implied))


def requirement_progress(profile: dict, rows: list[PlanRow], catalog: Catalog, global_choices: list[dict]) -> dict:
    year = profile.get("year") or ""
    program = profile.get("program") or "MBA"
    completed_numbers = {" ".join(c.split()).upper() for c in profile.get("completed", [])}
    done_status = ("completed", "enrolled")

    prog = programs.get(program)
    mba = mba_rules_apply(profile)
    core_units_done = DEGREE["core_units"] if mba and year in ("1", "2") else 0.0  # assigned by cohort in year 1

    elective_rows = [r for r in rows if not r.section.core_for(program)]
    elective_units = sum(r.section.units for r in elective_rows)
    term_units = units_by_term(rows)
    for term in ("202603", "202701"):
        core = core_load(profile, term, catalog)
        if core["units"]:
            term_units[term] = term_units.get(term, 0.0) + core["units"]

    def ldr_course(number: str) -> bool:
        return any(s.counts_for_ldr for o in catalog.offering_for_number(number) for s in o.sections)

    ldr_met = any(r.section.counts_for_ldr and r.status in done_status for r in rows) or any(ldr_course(n) for n in completed_numbers)
    ldr_planned = any(r.section.counts_for_ldr for r in rows)
    gsr_keys = gsr_courses(catalog)
    gsr_offering_keys = {k for keys in gsr_keys.values() for k in keys}
    gsr_rows = [r for r in rows if r.section.offering_key in gsr_offering_keys or r.section.counts_for_gsr]
    gsr_from_plan = [r.section.number + " " + r.section.title for r in gsr_rows]
    gsr_met = any(g.get("status") == "done" for g in global_choices) or any(r.status in done_status for r in gsr_rows)

    term_checks = []
    for term, units in sorted(term_units.items()):
        status = "ok"
        minimum, cap = min_units(profile, term), max_units(profile)
        if minimum is not None and units < minimum:
            status = "low"
        elif cap is not None and units > cap:
            status = "needs_approval"
        core_units = core_load(profile, term, catalog)["units"]
        term_checks.append({"term": term, "units": units, "core_units": core_units, "status": status,
                            "min_applies": minimum is not None, "min_units": minimum, "max_units": cap})

    notes = [
        "Each of your first three terms needs at least 16 graded units; a heavy term doesn't make up for a light one.",
        "More than 24 units in a term needs approval.",
    ]
    if year == "1" and mba_rules_apply(profile):
        notes.insert(0, "Your cohort's core courses are counted automatically in each term's units.")
    if not mba:
        notes = [prog["summary"]]
    elif program == "MBA-JOINT":
        notes.insert(0, prog["summary"])
    return {
        "modelled": program not in ("MMS-PEM",),
        "mba_rules": mba,
        "program_label": prog["label"],
        "checks": program_checks(profile, rows, catalog),
        "sources": prog["sources"],
        "program": program,
        "total_target": prog.get("total_units") or DEGREE["total_units"],
        "core": {"target": DEGREE["core_units"], "counted": core_units_done},
        "electives": {"target": DEGREE["elective_units"], "planned": elective_units},
        "planned_total": core_units_done + elective_units,
        "terms": term_checks,
        "ldr": {"met": ldr_met, "planned": ldr_planned and not ldr_met},
        "gsr": {"met": gsr_met, "planned": bool(gsr_from_plan) and not gsr_met, "in_plan": gsr_from_plan,
                "choices": global_choices},
        "gsa_used": effective_gsa_used(profile, global_choices),
        "notes": notes,
    }


def gsa_check(option_key: str, gsa_days_used: int) -> dict:
    opt = next((o for o in GSR_OPTIONS if o["key"] == option_key), None)
    if not opt:
        return {"ok": False, "reason": f"Unknown option '{option_key}'."}
    left = max(0, GSA_DAYS - gsa_days_used)
    if opt.get("requires_full_gsa") and gsa_days_used > 0:
        return {"ok": False, "days_left": left, "reason": "An IE needs all 10 GSA days unused, and you've used some."}
    if opt.get("apply_by") and opt["apply_by"] < date.today().isoformat():
        return {"ok": False, "days_left": left, "reason": f"The application window closed on {opt['apply_by']}."}
    need = opt["gsa_days"] or 0
    if need > left:
        return {"ok": True, "days_left": left, "reason": f"Allowed, but it uses about {need} days and you have {left} left; the rest is out of pocket."}
    return {"ok": True, "days_left": left - need,
            "reason": f"Uses about {need} of your {left} days left; {left - need} left after. Cash costs (like airfare) are separate."}


# ---------------------------------------------------------------- alternates

def alternates(target: Offering, chosen: list[Section], catalog: Catalog, n: int = 3, prefs: dict | None = None,
               program: str = "MBA", exclude_numbers: set[str] | None = None) -> list[dict]:
    """Backups for `target`: same term, overlapping topics, they fit the plan, not taken or planned."""
    skip = {x.upper() for x in (exclude_numbers or set())}
    pool = [o for o in catalog.eligible(target.lead.term, program=program)
            if o.key != target.key and o.lead.number.upper() not in skip]
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
        sec = best_section(off, [s for s in chosen if s.offering_key != target.key], prefs, program)
        if not sec or (prefs and not respects_prefs(sec, prefs)):
            continue
        out.append({
            "key": off.key,
            "section_id": sec.id,
            "number": off.lead.number,
            "title": off.lead.title,
            "time": sec.time_label,
            "shared_topics": sorted(overlap),
            "seats": sec.limit,
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
    reporters = len({r.get("user_id") or f"anon-{i}" for i, r in enumerate(reports)})
    if not all(r.get("source") == "sample" for r in reports) and reporters < MIN_REPORTS:
        # Too few real reports: exact numbers would reveal individual classmates' bids.
        return {"reports": len(reports), "sample_only": False, "sample_reports_ignored": sample_count,
                "too_few": True, "won": None, "lost": None, "lowest_winning_bid": None,
                "median_winning_bid": None, "highest_losing_bid": None, "median_reported_clearing": None,
                "terms": sorted({r["term_code"] for r in reports if r.get("term_code")})}
    won = sorted(r["points_bid"] for r in reports if r["got_seat"])
    lost = sorted(r["points_bid"] for r in reports if not r["got_seat"])
    clearing = [r["clearing_points"] for r in reports if r.get("clearing_points") is not None]
    exact = all(r.get("source") == "sample" for r in reports) or reporters >= EXACT_REPORTS

    def med(xs: list) -> float | None:
        if not xs:
            return None
        m = statistics.median(xs)
        return m if exact else round(m / 10) * 10  # rounded until enough classmates report, so no one bid is exposed

    return {
        "reports": len(reports),
        "sample_only": all(r.get("source") == "sample" for r in reports),
        "sample_reports_ignored": sample_count if real else 0,
        "won": len(won),
        "lost": len(lost),
        "lowest_winning_bid": (won[0] if won else None) if exact else None,
        "median_winning_bid": med(won),
        "highest_losing_bid": (lost[-1] if lost else None) if exact else None,
        "median_reported_clearing": med(clearing),
        "rounded": not exact,
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
        med = None if it.get("sample_only") else it.get("median_winning_bid")  # SAMPLE data never moves real points
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
