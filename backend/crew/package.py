"""Course package: the student writes a goal in their own words; Elihu ranks courses for every quarter they have left.

  1. Screen     (code)   the goal goes through the same input screen as chat (blocked = $0, text not stored).
  2. Pool       (code)   every course open to the student's program, not core, not taken or already planned, with a
                         quarter they can still plan: this year's sections still open for add/drop, and 2027-28
                         "expected" courses projected from this year's offering in the same quarter.
  3. Shortlist  (code)   BM25 against the goal (weighted) plus profile interests: the top 36 only.
  4. Rank       (agent)  Elihu (packager) ranks 10-15 by usefulness for the goal, with a why and a quoted phrase.
  5. Fact-check (code)   drop keys not in the shortlist; strip quotes that aren't really in the description.
  6. Place      (code)   each course goes to the earliest quarter where it's offered, fits the week (this year) and
                         the term has room; every other quarter it's offered in comes back as an option to move it.

Only step 4 spends tokens. Nothing is added to the plan here: the student keeps or drops, then applies.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import date
from typing import Any

from pydantic_ai.exceptions import ModelHTTPError

from catalog import NEXT_YEAR, TERM_NAMES, Offering, Section, card_text, get_catalog, quarter_label, term_name
from config import ai_available
from crew.agents import packager
from crew.chat import _split_followups
from crew.context import load_context
from crew.runtime import Run
import other_courses
from db import RecommendationRun
from fit import _is_trip
from planning import (
    add_drop_closed, best_section, clean_prefs, conflicts, core_load, max_units, min_units, planning_terms,
)
from safety import REFUSAL, BudgetExceeded, SpendGuard, fence, screen_input, validate_picks

SHORTLIST = 36
SOFT_CAP = 20.0  # units per term (core included) the placer fills to before spilling into a later term
PACKAGE_TERM = "package"  # RecommendationRun.term_code for package runs


@dataclass
class Slot:
    """One way to take a course: a term, the section(s) behind it, and whether it's a 2027-28 expected course."""
    term: str
    offering: Offering
    expected: bool


def _source_section(o: Offering, program: str) -> Section | None:
    """This year's section an expected (2027-28) plan item is stored against: open to the program, any date."""
    return next((s for s in o.sections if s.visible and s.open_to(program) and not s.closed), None)


def _open_now(o: Offering) -> Offering:
    """The same offering with only sections a student can still add (not ended, add/drop not closed)."""
    return Offering(o.key, [s for s in o.sections if not add_drop_closed(s)])


def build_pool(ctx, terms: list[str], today: date | None = None) -> dict[str, list[Slot]]:
    """Course number → every remaining term it can be taken in."""
    cat, p = ctx.catalog, ctx.profile
    program = p.get("program") or "MBA"
    taken = {" ".join(c.split()).upper() for c in p.get("completed", [])}
    planned = {r.section.number.upper() for r in ctx.plan}
    pool: dict[str, list[Slot]] = {}
    for o in cat.offerings.values():
        s = o.lead
        if s.any_core or s.units <= 0 or _is_trip(o):
            continue  # core is assigned; Global Studies trips have their own budget rules (Global page)
        number = s.number.upper()
        if number in taken or number in planned:
            continue
        slots: list[Slot] = []
        if s.term in terms:
            live = _open_now(o)
            if any(x.open_to(program) and not x.closed for x in live.sections_for(program, today)):
                slots.append(Slot(s.term, live, False))
        nxt = NEXT_YEAR.get(s.term)
        if nxt in terms and _source_section(o, program):
            slots.append(Slot(nxt, o, True))
        if slots:
            pool.setdefault(number, []).extend(slots)
    for number, slots in pool.items():
        one_per_term: dict[str, Slot] = {}
        for slot in sorted(slots, key=lambda x: x.term):
            one_per_term.setdefault(slot.term, slot)
        pool[number] = list(one_per_term.values())
    return pool


def _query(goal: str, profile: dict) -> str:
    bits = [goal, goal, " ".join(profile.get("interests", [])), profile.get("goal_short", ""), profile.get("goal_long", "")]
    return " ".join(b for b in bits if b)


async def build_package(db, user_id: int, goal: str) -> dict:
    run = Run(db=db, user_id=user_id, feature="package", guard=SpendGuard.for_user(db, user_id))
    ctx = load_context(run)
    p = ctx.profile
    program = p.get("program") or "MBA"
    out: dict[str, Any] = {"run_id": run.run_id, "goal": "", "items": [], "terms": [], "dropped": [], "blocked": False}

    # 1. screen the goal
    screen = screen_input(goal)
    if not screen.allowed:
        if not screen.benign:
            run.audit("input_blocked", reasons=screen.reasons, length=len(goal or ""), feature="package")
            out.update(blocked=True, summary=REFUSAL.format(why="; ".join(screen.reasons)), safety=screen.reasons)
        else:
            out.update(summary=f"I couldn't use that goal: {screen.reasons[0]}.", safety=screen.reasons)
        return _finish(run, out)
    goal = screen.text
    out["goal"] = goal

    # 2. pool: every remaining quarter this student can still plan
    terms = planning_terms(p)
    pool = build_pool(ctx, terms)
    live_terms = sorted({s.term for slots in pool.values() for s in slots})
    out["terms"] = [_term_info(ctx, t) for t in live_terms]
    if not pool:
        out["summary"] = "Every course I could suggest is already in your plan or has closed for this year."
        return _finish(run, out)

    # 3. shortlist: one card per course number, ranked by BM25 against the goal
    reps = {number: slots[0].offering for number, slots in pool.items()}
    by_key = {o.key: number for number, o in reps.items()}
    ranked = ctx.catalog.search(_query(goal, p), list(reps.values()), limit=len(reps))
    shortlist = [o for o, score in ranked if score > 0][:SHORTLIST] or [o for o, _ in ranked[:SHORTLIST]]
    all_chars = sum(len(card_text(o, 2000)) for o in reps.values())
    run.emit("retrieve", agent="Retriever (code)", eligible=len(pool), shortlist=len(shortlist),
             approx_tokens_saved=max(0, (all_chars - sum(len(card_text(o, 260)) for o in shortlist)) // 4),
             terms=[term_name(t) for t in live_terms])

    def card(o: Offering) -> str:
        when = ", ".join(f"{term_name(s.term)}{' (expected)' if s.expected else ''}" for s in pool[by_key[o.key]])
        return f"{card_text(o, 260)} | can be taken: {when}"

    descriptions = {o.key: o.lead.description for o in shortlist}

    # 4. rank (the only AI step)
    def keyword_fallback(note: str) -> tuple[list[dict], str]:
        return ([{"key": o.key, "why": "A strong keyword match with your goal.", "tier": "worth a look", "evidence": ""}
                 for o in shortlist[:10]], note)

    if not ai_available():
        picks, summary = keyword_fallback("AI is offline, so these are the closest keyword matches to your goal.")
    else:
        about = (f"program={p.get('program', 'MBA')} year={p.get('year') or '?'} background={p.get('background') or '?'}\n"
                 f"interests={', '.join(p.get('interests', [])) or '?'}")
        listing = "\n".join(f"{i + 1}. {card(o)}" for i, o in enumerate(shortlist))
        prompt = (
            f"STUDENT GOAL (typed by the student):\n{fence(goal, 'student_goal')}\n"
            f"About the student:\n{fence(about, 'student_profile')}\n"
            f"Quarters left to plan: {', '.join(term_name(t) for t in live_terms)}.\n\n"
            f"SHORTLIST (rank only these keys):\n{fence(listing, 'som_catalog', limit=len(listing) + 100)}"
        )
        try:
            ranked_out = await run.call(packager, prompt, name="Elihu", requests=3)
            picks = [x.model_dump() for x in ranked_out.output.items]
            summary = ranked_out.output.summary
        except BudgetExceeded as exc:
            out["summary"] = str(exc)
            return _finish(run, out)
        except Exception as exc:  # provider filter or outage: plain keyword matches, never a 500
            filtered = isinstance(exc, ModelHTTPError) and ("content management policy" in str(exc) or "content_filter" in str(exc))
            run.audit("provider_content_filter" if filtered else "agent_error", agent="Elihu",
                      detail=f"{type(exc).__name__}: {str(exc)[:200]}")
            picks, summary = keyword_fallback(
                "The AI provider's filter refused part of that goal, so these are plain keyword matches. Try rewording it."
                if filtered else "The AI step failed, so these are plain keyword matches. Try again in a moment.")

    # 5. fact-check
    kept, dropped = validate_picks(picks, set(descriptions), descriptions)
    run.emit("validate", agent="Validator (code)", kept=len(kept),
             dropped=[{"key": d.get("key"), "why": d["dropped_because"]} for d in dropped],
             quotes_removed=sum(1 for k in kept if k.get("evidence_note")))
    if dropped:
        run.audit("recommendation_dropped", items=[d.get("key") for d in dropped])

    # 6. place each course in a quarter, most useful first
    prefs = clean_prefs(p.get("prefs"))
    load = {t["code"]: t["base_units"] for t in out["terms"]}
    caps = {t["code"]: t["max_units"] or 24.0 for t in out["terms"]}
    week = {t: list(ctx.sections(t)) + core_load(p, t, ctx.catalog)["sections"] for t in live_terms}
    items = []
    for rank, pk in enumerate(kept, start=1):
        number = by_key[pk["key"]]
        slots = pool[number]
        lead = slots[0].offering.lead
        options = [_option(s, week, prefs, program) for s in slots]
        choice = (next((o for o in options if o["fits"] and load[o["term"]] + lead.units <= SOFT_CAP), None)
                  or next((o for o in options if o["fits"] and load[o["term"]] + lead.units <= caps[o["term"]]), None)
                  or options[0])
        load[choice["term"]] += lead.units
        if not choice["expected"] and choice["fits"]:
            week[choice["term"]].append(get_catalog().by_id[choice["course_id"]])
        items.append({
            "rank": rank, "key": pk["key"], "number": lead.number, "title": lead.title, "units": lead.units,
            "tier": pk.get("tier", "strong"), "why": pk.get("why", ""), "evidence": pk.get("evidence", ""),
            "evidence_note": pk.get("evidence_note", ""), "ldr": lead.counts_for_ldr, "gsr": lead.counts_for_gsr,
            "taught_with": lead.taught_with,
            "topics": lead.topics[:3], "faculty": sorted({f for s in slots for f in s.offering.lead.faculty})[:3],
            "placement": choice, "options": options,
        })
    run.emit("place", agent="Placer (code)", placed={term_name(t): round(load[t], 1) for t in live_terms},
             clashing=[i["number"] for i in items if not i["placement"]["fits"]])

    # Beyond SOM: the closest matches at other Yale schools, shown apart and never placed or counted (instructor
    # permission, their calendar and units). Code only, no tokens.
    remaining = {"fall" if t.endswith("03") else "spring" for t in live_terms}
    beyond = [c for c in other_courses.search(goal, limit=12) if set(c["season"]) & remaining][:4]
    out["beyond_som"] = [{k: c[k] for k in ("id", "number", "title", "instructor", "school", "dept", "terms", "term_names", "source")}
                         | {"description": c["description"][:300]} for c in beyond]
    summary, followups = _split_followups(summary or "")  # never show a raw "FOLLOWUPS: a | b" line
    out.update(summary=summary, followups=followups, items=items, dropped=dropped)
    final = _finish(run, out)
    db.add(RecommendationRun(user_id=user_id, run_id=run.run_id, term_code=PACKAGE_TERM,
                             request=json.dumps({"goal": goal}), result=json.dumps(final, default=str)))
    db.commit()
    return final


def _option(slot: Slot, week: dict[str, list[Section]], prefs: dict, program: str) -> dict:
    """One quarter a course can go in. This year: the clash-free section (or the clash). 2027-28: times TBA."""
    o, t = slot.offering, slot.term
    if slot.expected:
        src = _source_section(o, program)
        return {"term": t, "term_name": term_name(t), "session": src.session, "quarter": quarter_label(src.session, t),
                "expected": True, "course_id": src.id, "target_term": t, "section": "", "time": "Times TBA",
                "fits": True, "clash_with": []}
    sec = best_section(o, week[t], prefs, program)
    if sec:
        return {"term": t, "term_name": term_name(t), "session": sec.session, "quarter": quarter_label(sec.session, t),
                "expected": False, "course_id": sec.id, "target_term": None, "section": sec.section,
                "time": sec.time_label, "fits": True, "clash_with": []}
    first = next(x for x in o.sections_for(program) if not x.closed)
    me = f"{first.number} §{first.section}"
    hits = [h for h in conflicts(week[t] + [first]) if me in (h["a"], h["b"])]
    return {"term": t, "term_name": term_name(t), "session": first.session, "quarter": quarter_label(first.session, t),
            "expected": False, "course_id": first.id, "target_term": None, "section": first.section,
            "time": first.time_label, "fits": False,
            "clash_with": sorted(({h["a"] for h in hits} | {h["b"] for h in hits}) - {me})}


def _term_info(ctx, term: str) -> dict:
    p = ctx.profile
    core = core_load(p, term, ctx.catalog)
    planned = sum(s.units for s in ctx.sections(term))
    return {"code": term, "name": term_name(term), "expected": term not in TERM_NAMES,
            "base_units": round(planned + core["units"], 1), "core_units": core["units"],
            "min_units": min_units(p, term), "max_units": max_units(p)}


def _finish(run: Run, out: dict) -> dict:
    return {**out, "trace": run.events, "usage": run.usage_summary()}
