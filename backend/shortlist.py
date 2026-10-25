"""Shortlist and compare: the side-by-side view a student uses to choose between electives.

Every row of the comparison is computed in code from real data, never by the model:
when it meets and whether it fits the student's week (plan + assigned core), units, how you get in,
seats and reported demand, which requirements it counts toward, and how it lines up with the
student's own goals (the same goal matching best fits uses).
"""

from __future__ import annotations

from catalog import SESSION_NAMES, TERM_NAMES, Catalog
from fit import _goal_terms, _matches
import programs
from planning import PlanRow, best_section, bid_stats, clean_prefs, conflicts, core_load

MAX_SHORTLIST = 12


def _demand(seats: int | None, reports: list[dict]) -> dict:
    stats = bid_stats(reports) if reports else {"reports": 0}
    real = stats.get("reports", 0) and not stats.get("sample_only") and not stats.get("too_few")
    median = stats.get("median_winning_bid") if real else None
    if median is not None:
        level = "High" if median >= 60 else "Medium" if median >= 25 else "Low"
    elif seats:
        level = "Likely competitive" if seats <= 30 else "Usually open" if seats >= 70 else "Unknown"
    else:
        level = "Unknown"
    return {"level": level, "seats": seats, "median_winning_bid": median, "reports": stats.get("reports", 0)}


def compare(profile: dict, plan: list[PlanRow], catalog: Catalog, items: list[dict],
            bid_reports: dict[str, list[dict]]) -> list[dict]:
    """One column per shortlisted course. `items` are {key, note, rank} rows from the database."""
    program = profile.get("program") or "MBA"
    prog = programs.get(program)
    prefs = clean_prefs(profile.get("prefs"))
    completed = {" ".join(c.split()).upper() for c in profile.get("completed", [])}
    planned_keys = {r.section.offering_key for r in plan}
    goal_text = " ".join([profile.get("goal_short") or "", profile.get("goal_long") or "", " ".join(profile.get("interests", []))])
    goal_terms = _goal_terms(goal_text)
    interests = set(profile.get("interests", []))
    required = {r["number"] for r in prog.get("required", [])}
    is_mba = prog["base"] == "MBA"

    cols = []
    for item in items:
        off = catalog.offering(item["key"])
        if not off:
            cols.append({**item, "missing": True, "title": "No longer in SOM's course list"})
            continue
        lead = off.lead
        open_secs = off.sections_for(program)
        chosen = [r.section for r in plan if r.section.term == lead.term and r.section.offering_key != off.key]
        chosen += core_load(profile, lead.term, catalog)["sections"]
        fit_sec = best_section(off, chosen, prefs, program) if open_secs else None
        if not open_secs:
            fit = {"status": "not_open", "text": f"Not open to {prog['label']} students, or already over"}
        elif fit_sec:
            fit = {"status": "fits", "text": f"Fits your week: §{fit_sec.section} {fit_sec.time_label}", "section_id": fit_sec.id}
        else:
            hits = conflicts(chosen + [open_secs[0]])
            others = sorted({h["a"] if h["b_id"] in {s.id for s in open_secs} else h["b"] for h in hits
                             if h["a_id"] in {s.id for s in open_secs} or h["b_id"] in {s.id for s in open_secs}})
            fit = {"status": "clash", "text": "Clashes with " + (", ".join(others[:3]) or "your week or your time preferences"),
                   "section_id": open_secs[0].id}

        counts = []
        if lead.number in required:
            counts.append(f"Required for {prog['label']}")
        if is_mba and lead.counts_for_ldr:
            counts.append("Leadership requirement (LDR)")
        if is_mba and lead.counts_for_gsr:
            counts.append("Global Studies requirement")
        track = prog.get("list_tag")
        if track and track in lead.tracks:
            counts.append(prog.get("list_label", "Track list"))

        text = f"{lead.title} {lead.description}".lower()
        matched = [label for label, pats in goal_terms if _matches(pats, text)]
        topic_hits = sorted(interests & set(lead.topics))
        goal = {"matched": matched[:3], "topics": topic_hits[:3],
                "level": "Strong" if len(matched) >= 2 or (matched and topic_hits) else "Some" if matched or topic_hits else "None found"}

        cols.append({
            **item,
            "missing": False,
            "number": lead.number, "title": lead.title,
            "taught_with": lead.taught_with, "partner_calendar": lead.partner_calendar,
            "term": lead.term, "term_name": TERM_NAMES.get(lead.term, lead.term), "session": SESSION_NAMES.get(lead.session, lead.session),
            "units": lead.units, "faculty": lead.faculty,
            "enrollment": lead.enrollment, "sections": [{"id": s.id, "section": s.section, "time": s.time_label, "room": s.room} for s in open_secs],
            "fit": fit,
            "counts": counts,
            "goal": goal,
            "demand": _demand(lead.limit, bid_reports.get(lead.number, [])),
            "description": lead.description[:360],
            "syllabus": lead.syllabus,
            "in_plan": off.key in planned_keys,
            "completed": lead.number.upper() in completed,
        })
    return cols
