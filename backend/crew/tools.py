"""Tools the specialists can call. All deterministic; all read real data.

Each tool reports itself to the run's event stream (so the UI can show
"Course Scout → search_catalog('healthcare')") and returns compact text.
Course descriptions are fenced as untrusted data.
"""

from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic_ai import RunContext

from catalog import SESSION_NAMES, TERM_NAMES, term_name, card_text
from crew.context import DEFAULT_TERM, StudentContext
from planning import (
    alternates,
    best_section,
    bid_stats,
    conflicts,
    core_load,
    effective_gsa_used,
    gsa_check,
    prefs_text,
    requirement_progress,
    suggest_bids,
    week_review,
)
import knowledge
import programs
from rules import AUCTION, CALENDAR, GSA_DAYS, GSR_OPTIONS, LDR, auction_applies, calendar_for, gsr_courses
from safety import fence

Term = Literal["202603", "202701", "any"]


def _log(ctx: RunContext[StudentContext], tool: str, **args) -> bool:
    ok = ctx.deps.bump(tool)
    ctx.deps.run.emit("tool", tool=tool, args=args, allowed=ok)
    return ok


LOOP_MSG = "This tool was already used several times this turn. Answer with what you have."


def _program(ctx: StudentContext) -> str:
    return ctx.profile.get("program") or "MBA"


def _resolve(ctx: StudentContext, key_or_number: str, term: str | None = None):
    """Offerings for a key, course number or exact title, limited to ones this student can still take.

    Only offerings with a section open to the student's program that hasn't ended count,
    and the planning term comes first, so "MGT 879" never resolves to a past EMBA section.
    """
    cat = ctx.catalog
    program = _program(ctx)
    raw = " ".join(key_or_number.split())
    off = cat.offering(raw)
    offs = [off] if off else cat.offering_for_number(raw.upper().split("|")[0])
    if not offs:  # the model sometimes passes a title instead of a number
        want = raw.lower()
        offs = [o for o in cat.offerings.values() if o.lead.title.lower() == want] or \
               [o for o in cat.offerings.values() if len(want) > 6 and want in o.lead.title.lower()]
    offs = [o for o in offs if o.sections_for(program, ctx.today) and (not term or o.lead.term == term)]
    return sorted(offs, key=lambda o: (o.lead.term != DEFAULT_TERM, o.lead.term))


def student_card(d: StudentContext) -> str:
    """A compact, always-included picture of the student, so every answer is personal."""
    p = d.profile or {}
    prog = programs.get(p.get("program"))
    if prog.get("terms") == 2 or prog["base"] in ("MMS", "MAM"):
        who = f"program={prog['label']} (a one-year program, 2026-27; there is no year or cohort to ask about)"
    elif prog["base"] == "PhD":
        who = f"program={prog['label']}"
    else:
        who = (f"program={prog['label']} year={p.get('year') or '?'}"
               + (f" cohort={p.get('cohort') or '?'}" if prog["base"] == "MBA" else ""))
    lines = [
        who,
        f"background={p.get('background') or 'not given'}",
        f"interests={', '.join(p.get('interests', [])) or 'not given'}",
        f"short-term goal={p.get('goal_short') or 'not given'}; long-term goal={p.get('goal_long') or 'not given'}",
        f"schedule preferences={prefs_text(p.get('prefs'))}",
        f"completed={', '.join(p.get('completed', [])) or 'none listed'}",
    ]
    by_term: dict[str, list[str]] = {}
    for r in d.plan:
        by_term.setdefault(r.section.term, []).append(f"{r.section.number} {r.section.title} ({r.status})")
    for term, items in sorted(by_term.items()):
        units = sum(r.section.units for r in d.plan if r.section.term == term)
        core = core_load(p, term, d.catalog)["units"]
        total = f"{units + core:g} units incl. {core:g} core" if core else f"{units:g} units"
        lines.append(f"plan {term_name(term)} [{total}]: " + "; ".join(items))
    if not d.plan:
        lines.append("plan: empty")
    if d.global_choices:
        lines.append("global studies picks: " + ", ".join(f"{c['option_key']} ({c['status']})" for c in d.global_choices))
    return fence("\n".join(lines), "student_profile")


def yale_facts(ctx: RunContext[StudentContext], question: str) -> str:
    """Official Yale SOM rules, dates, processes and offices (with source links), for the student's program.

    Use for anything that isn't a specific course: degree requirements, deadlines, the auction,
    add/drop, cross-registration, Global Studies, program rules. If this returns NO_MATCH, tell the
    student you don't know and give them the official links it lists.

    Args:
        question: the student's question in plain words.
    """
    if not _log(ctx, "yale_facts", question=question):
        return LOOP_MSG
    program = ctx.deps.profile.get("program")  # None for visitors: search every program
    hits = knowledge.search(question, program)
    if not hits:
        links = "\n".join(f"- {name}: {url}" for name, url in knowledge.links_for(program))
        return ("NO_MATCH: Plan with Dan has no official information on this. Say you don't know, and send the student "
                f"to the right official page:\n{links}")
    return fence("\n\n".join(f"[{e['title']}] {e['text']}\nSource: {e['url']} (checked {knowledge.CHECKED})" for e in hits),
                 "yale_official_facts")


# ------------------------------------------------------------------ catalog

def search_catalog(ctx: RunContext[StudentContext], query: str, term: Term = "202701", limit: int = 8) -> str:
    """Search real SOM courses by topic, skill, career goal or professor.

    Args:
        query: plain words, e.g. "healthcare strategy pricing" or "venture capital".
        term: 202701 = Spring 2027 (default), 202603 = Fall 2026, any = both.
        limit: how many courses to return (max 12).
    """
    if not _log(ctx, "search_catalog", query=query, term=term):
        return LOOP_MSG
    program = ctx.deps.profile.get("program") or "MBA"
    pool = ctx.deps.catalog.eligible(None if term == "any" else term, program=program)
    hits = [(o, s) for o, s in ctx.deps.catalog.search(query, pool, limit=min(limit, 12)) if s > 0]
    if not hits:
        return "No catalog courses matched. Try broader words."
    return fence("\n".join(card_text(o, 260) for o, _ in hits), "som_catalog")


def ldr_courses(ctx: RunContext[StudentContext], term: Term = "any") -> str:
    """Every elective flagged for the Leadership Distribution Requirement (LDR), open to this student's program.

    Use this for any question about LDR or leadership electives, and list every course it returns.

    Args:
        term: 202603 = Fall 2026, 202701 = Spring 2027, any = both (default).
    """
    if not _log(ctx, "ldr_courses", term=term):
        return LOOP_MSG
    program = _program(ctx.deps)
    pool = [o for o in ctx.deps.catalog.eligible(None if term == "any" else term, program=program, today=ctx.deps.today)
            if o.lead.counts_for_ldr]
    if not pool:
        return f"No LDR-flagged courses open to {program} students{'' if term == 'any' else ' in ' + term_name(term)}."
    pool.sort(key=lambda o: (o.lead.term, o.lead.session, o.lead.number))
    lines = [f"{len(pool)} LDR-flagged courses ({LDR['how_flagged']} {LDR['petition']})"]
    lines += [card_text(o, 160) for o in pool]
    text = "\n".join(lines)
    return fence(text, "som_catalog", limit=len(text) + 100)  # the whole list, never cut short


def other_yale_courses(ctx: RunContext[StudentContext], query: str) -> str:
    """Courses at OTHER Yale schools (Graduate School, Jackson, Environment, Public Health) that SOM students can take
    with the instructor's permission. Use when the student asks for courses outside SOM.

    Args:
        query: plain words, e.g. "English literature" or "climate policy".
    """
    if not _log(ctx, "other_yale_courses", query=query):
        return LOOP_MSG
    import other_courses
    hits = other_courses.search(query, limit=8)
    if not hits:
        return "No matching courses at other Yale schools in the 2026-27 Bulletin."
    rules = other_courses.load().get("rules", "")
    lines = [f"RULES: {rules}"] + [
        f"{c['number']} {c['title']} | {c['school']} · {c['dept']} | {', '.join(c['term_names'])} | {c['instructor'] or 'instructor TBA'} | "
        f"{c['description'][:220]}" for c in hits]
    return fence("\n".join(lines), "yale_bulletin")


def course_details(ctx: RunContext[StudentContext], key_or_number: str) -> str:
    """Full details for one course: every section, time, room, seats, faculty, prerequisites.

    Args:
        key_or_number: an offering key from search results, or a course number like "MGT 846".
    """
    if not _log(ctx, "course_details", key=key_or_number):
        return LOOP_MSG
    offs = _resolve(ctx.deps, key_or_number)
    if not offs:
        return f"{key_or_number} isn't a current or upcoming {_program(ctx.deps)} course in the SOM catalog."
    lines = []
    for o in offs:
        s = o.lead
        lines.append(card_text(o, 900))
        for sec in o.sections_for(_program(ctx.deps), ctx.deps.today):
            lines.append(
                f"  section {sec.section} (id {sec.id}): {sec.time_label}, room {sec.room or 'TBA'}, "
                f"{SESSION_NAMES.get(sec.session, sec.session)}, faculty {', '.join(sec.faculty) or 'TBA'}"
            )
        if s.bio:
            lines.append(f"  faculty bio: {s.bio[:300]}")
    return fence("\n".join(lines), "som_catalog")


# ------------------------------------------------------------------ student

def my_profile_and_plan(ctx: RunContext[StudentContext]) -> str:
    """The student's saved profile (year, cohort, interests, goals, preferences) and current plan."""
    _log(ctx, "my_profile_and_plan")
    d = ctx.deps
    p = d.profile or {}
    plan_lines = [
        f"- {r.section.number} {r.section.title} §{r.section.section} [{term_name(r.section.term)}, "
        f"{r.section.session}, {r.section.time_label}, {r.section.units:g}u] status={r.status}"
        for r in d.plan
    ] or ["- (empty plan)"]
    profile = (
        f"program={p.get('program','MBA')} year={p.get('year') or '?'} cohort={p.get('cohort') or '?'} "
        f"background={p.get('background') or '?'}\ninterests={', '.join(p.get('interests', [])) or '?'}\n"
        f"short-term goal={p.get('goal_short') or '?'}\nlong-term goal={p.get('goal_long') or '?'}\n"
        f"completed={', '.join(p.get('completed', [])) or 'none listed'}\n"
        f"schedule preferences={prefs_text(p.get('prefs'))}\n"
        f"GSA days used={effective_gsa_used(p, d.global_choices)} of {GSA_DAYS}"
    )
    core = core_load(p, DEFAULT_TERM, d.catalog)
    if core["units"]:
        plan_lines.append(f"- Cohort core in {term_name(DEFAULT_TERM)} (assigned, not in the plan): "
                          f"{', '.join(core['courses'])} = {core['units']:g} units")
    return fence(profile, "student_profile") + "\nPLAN:\n" + "\n".join(plan_lines)


def check_fit(ctx: RunContext[StudentContext], key_or_number: str) -> str:
    """Does a course fit the student's current plan? Returns a clash-free section or the clashes.

    Args:
        key_or_number: offering key or course number.
    """
    if not _log(ctx, "check_fit", key=key_or_number):
        return LOOP_MSG
    d = ctx.deps
    offs = _resolve(d, key_or_number)
    if not offs:
        return f"{key_or_number} is not in the catalog."
    out = []
    for o in offs[:2]:
        chosen = d.sections(o.lead.term) + core_load(d.profile, o.lead.term, d.catalog)["sections"]
        sec = best_section(o, chosen, d.profile.get("prefs"), _program(d))
        if sec:
            out.append(f"{o.lead.number} fits: section {sec.section} (id {sec.id}) {sec.time_label}.")
        else:
            clashes = conflicts(chosen + o.sections_for(_program(d), d.today)[:1])
            mine = [c for c in clashes if c["a_id"] in {x.id for x in o.sections} or c["b_id"] in {x.id for x in o.sections}]
            out.append(f"{o.lead.number} does NOT fit: " + "; ".join(f"{c['a']} vs {c['b']} on {c['day']} {c['window']}" for c in mine))
    return "\n".join(out)


def find_alternates(ctx: RunContext[StudentContext], key_or_number: str) -> str:
    """Backup courses if the student doesn't win a seat: same term, similar topics, no clashes.

    Args:
        key_or_number: offering key or course number.
    """
    if not _log(ctx, "find_alternates", key=key_or_number):
        return LOOP_MSG
    offs = _resolve(ctx.deps, key_or_number)
    if not offs:
        return f"{key_or_number} is not in the catalog."
    o = offs[0]
    d = ctx.deps
    skip = {" ".join(c.split()).upper() for c in d.profile.get("completed", [])} | {r.section.number for r in d.plan}
    alts = alternates(o, d.sections(o.lead.term) + core_load(d.profile, o.lead.term, d.catalog)["sections"], d.catalog,
                      n=3, prefs=d.profile.get("prefs"), program=_program(d), exclude_numbers=skip)
    if not alts:
        return "No clash-free backups with similar topics."
    return "\n".join(f"- [{a['key']}] {a['number']} {a['title']} · {a['time']} · shared: {', '.join(a['shared_topics']) or 'similar title'}" for a in alts)


def suggest_add(ctx: RunContext[StudentContext], key_or_number: str, reason: str) -> str:
    """Offer the student a one-click 'add to plan' button. Nothing is saved until they click it.

    Args:
        key_or_number: offering key or course number.
        reason: one short sentence the student will see on the button card.
    """
    if not _log(ctx, "suggest_add", key=key_or_number):
        return LOOP_MSG
    d = ctx.deps
    offs = _resolve(d, key_or_number)
    if not offs:
        return f"{key_or_number} isn't a current or upcoming course open to this student; not suggested."
    o = offs[0]
    completed = {" ".join(c.split()).upper() for c in d.profile.get("completed", [])}
    if o.lead.number.upper() in completed:
        return f"The student already completed {o.lead.number}; not suggested."
    if any(r.section.offering_key == o.key for r in d.plan):
        return f"{o.lead.number} is already in the student's plan; not suggested."
    chosen = d.sections(o.lead.term) + core_load(d.profile, o.lead.term, d.catalog)["sections"]
    sec = best_section(o, chosen, d.profile.get("prefs"), _program(d))
    if not sec:
        return (f"{o.lead.number} clashes with the student's plan (or their schedule preferences) in every section; "
                "not suggested. Offer find_alternates instead.")
    if any(p["course_id"] == sec.id for p in d.proposals):
        return "Already suggested."
    d.proposals.append({
        "course_id": sec.id, "number": o.lead.number, "title": o.lead.title,
        "term_name": term_name(o.lead.term), "time": sec.time_label, "reason": reason[:200],
    })
    return f"Suggested {o.lead.number} (section {sec.section}). The student decides."


# ------------------------------------------------------------------ planning

def plan_review(ctx: RunContext[StudentContext], term: Literal["202603", "202701"] = "202701") -> str:
    """Check one term of the plan: clashes, units, and a critique of the weekly schedule."""
    _log(ctx, "plan_review", term=term)
    d = ctx.deps
    secs = [s for s in d.sections(term)]
    core = core_load(d.profile, term, d.catalog)
    if not secs and not core["units"]:
        return f"No courses planned for {term_name(term)}."
    clash_list = conflicts(secs + core["sections"])
    review = week_review(secs + core["sections"])
    units = sum(s.units for s in secs) + core["units"]
    lines = [f"{term_name(term)}: {len(secs)} electives + cohort core ({core['units']:g} units), {units:g} units in total."
             if core["units"] else f"{term_name(term)}: {len(secs)} courses, {units:g} units."]
    lines += [f"CLASH: {c['a']} vs {c['b']} on {c['day']} {c['window']}" for c in clash_list] or ["No clashes."]
    lines += [f"{n['kind']}: {n['text']}" for n in review["notes"]]
    return "\n".join(lines)


def requirements_status(ctx: RunContext[StudentContext]) -> str:
    """Progress toward the student's degree requirements (any SOM program): units, per-term limits, required courses."""
    _log(ctx, "requirements_status")
    d = ctx.deps
    r = requirement_progress(d.profile, d.plan, d.catalog, d.global_choices)
    terms = "; ".join(f"{t['term']}: {t['units']:g}u incl. {t['core_units']:g} core ({t['status']})"
                      for t in r["terms"]) or "no terms planned"
    if not r["mba_rules"]:
        checks = "\n".join(f"- [{c['status']}] {c['label']}: {c['detail']}" for c in r["checks"])
        return (f"Program: {r['program_label']}. {' '.join(r['notes'])}\nPer term: {terms}.\n"
                f"Checklist:\n{checks}\nSources: {', '.join(r['sources'])}")
    return (
        f"Target {r['total_target']} units. Core counted {r['core']['counted']:g}/{r['core']['target']:g}. "
        f"Electives planned {r['electives']['planned']:g}/{r['electives']['target']:g}.\n"
        f"Per term: {terms}.\nLDR met: {r['ldr']['met']} (planned but not done: {r['ldr']['planned']}) "
        f"({LDR['how_flagged']})\n"
        f"GSR met: {r['gsr']['met']} (planned but not done: {r['gsr']['planned']}); GSR courses in plan: {', '.join(r['gsr']['in_plan']) or 'none'}; "
        f"choices: {r['gsr']['choices'] or 'none'}\nRules: " + " ".join(r["notes"])
    )


def global_options(ctx: RunContext[StudentContext]) -> str:
    """Every way to meet the Global Studies Requirement, its GSA-day cost and matching Spring 2027 courses."""
    _log(ctx, "global_options")
    d = ctx.deps
    used = effective_gsa_used(d.profile, d.global_choices)
    matches = gsr_courses(d.catalog, DEFAULT_TERM)
    lines = [f"GSA budget: {GSA_DAYS - used} of {GSA_DAYS} funded days left."]
    for opt in GSR_OPTIONS:
        check = gsa_check(opt["key"], used)
        courses = [d.catalog.offering(k).lead for k in matches.get(opt["key"], [])]
        names = ", ".join(f"{c.number} {c.title}" for c in courses) or "not a catalog course"
        lines.append(
            f"- {opt['name']} ({opt['units'] or '–'} units, ~{opt['gsa_days']} GSA days). {opt['timing']} "
            f"Enrol: {opt['enrol']} Cost: {opt['cost']} Budget check: {check['reason']} Spring 2027: {names}"
        )
    return "\n".join(lines)


def upcoming_dates(ctx: RunContext[StudentContext], count: int = 8) -> str:
    """The next academic-calendar dates and deadlines from today."""
    _log(ctx, "upcoming_dates")
    today = ctx.deps.today.isoformat()
    prof = ctx.deps.profile
    rows = [(d, label, kind) for d, label, kind in calendar_for(prof.get("program"), prof.get("year"))
            if d >= today][: max(1, min(count, 15))]
    return "\n".join(f"{d} ({(date.fromisoformat(d) - ctx.deps.today).days} days): {label} [{kind}]" for d, label, kind in rows)


# ------------------------------------------------------------------ bids

def bid_history(ctx: RunContext[StudentContext], course_number: str) -> str:
    """Bid outcomes students have reported for a course, plus its seat limit.

    Args:
        course_number: e.g. "MGT 846".
    """
    if not _log(ctx, "bid_history", course=course_number):
        return LOOP_MSG
    num = course_number.strip().upper()
    stats = bid_stats(ctx.deps.bid_reports(num))
    offs = ctx.deps.catalog.offering_for_number(num, DEFAULT_TERM)
    seats = offs[0].lead.limit if offs else None
    if stats.get("too_few"):
        return (f"{num}: fewer than 5 students have reported, so stats are hidden to protect privacy. "
                f"Seats: {seats or 'unknown'}. SOM does not publish clearing prices.")
    if not stats.get("reports"):
        return f"{num}: no bid reports yet. Seats: {seats or 'unknown'}. SOM does not publish clearing prices."
    label = "SAMPLE data (illustrative, not real)" if stats["sample_only"] else "student-reported"
    return f"{num} ({label}): {stats}. Seats: {seats or 'unknown'}."


def suggest_bid_split(ctx: RunContext[StudentContext], budget: int, must_haves: list[str] | None = None) -> str:
    """Split a points budget across the bid courses in the student's Spring plan (a heuristic).

    Args:
        budget: the student's points budget for this round.
        must_haves: course numbers the student cares most about.
    """
    _log(ctx, "suggest_bid_split", budget=budget)
    d = ctx.deps
    must = {m.strip().upper() for m in (must_haves or [])}
    items, seen = [], set()
    for r in d.plan:
        s = r.section
        if s.term != DEFAULT_TERM or s.enrollment.lower() != "bid" or s.offering_key in seen or r.status == "completed":
            continue
        seen.add(s.offering_key)
        stats = bid_stats(d.bid_reports(s.number))
        items.append({"number": s.number, "title": s.title, "priority": 1 if s.number in must else 2,
                      "seats": s.limit, "median_winning_bid": stats.get("median_winning_bid"),
                      "sample_only": stats.get("sample_only", False)})
    if not items:
        return "No bid courses in the Spring 2027 plan yet."
    split = suggest_bids(items, int(budget))
    return "\n".join(f"- {x['number']} {x['title']}: {x['suggested_points']} pts" for x in split) + \
        "\n(Heuristic: weights priority, seat count and any reported winning bids. Not a guarantee.)"


CATALOG_TOOLS = [search_catalog, ldr_courses, other_yale_courses, course_details, check_fit, find_alternates, suggest_add, my_profile_and_plan, yale_facts]
PLANNER_TOOLS = [my_profile_and_plan, plan_review, requirements_status, global_options, upcoming_dates, ldr_courses,
                 check_fit, find_alternates, course_details, search_catalog, suggest_add, yale_facts]
BID_TOOLS = [my_profile_and_plan, bid_history, suggest_bid_split, course_details, yale_facts]
CAREER_TOOLS = [my_profile_and_plan, search_catalog, other_yale_courses, course_details, suggest_add, check_fit, yale_facts]
GUIDE_TOOLS = [yale_facts, upcoming_dates, requirements_status, my_profile_and_plan, search_catalog, ldr_courses]
NEWS_TOOLS = [search_catalog]
