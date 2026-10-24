"""'Find my courses': the quiz-driven recommender pipeline.

  1. Retrieve  (code)   eligible courses for the term and program, minus courses
                        already taken or planned, ranked by BM25 against the quiz
                        plus a boost for chosen interest topics. Top ~28 only.
  2. Curate    (agent)  the Curator picks 4-7 from that shortlist, with reasons
                        and a quoted phrase from each description.
  3. Validate  (code)   drop any key not in the shortlist; strip quotes that
                        aren't really in the description.
  4. Assemble  (code)   by priority, choose a clash-free section that respects
                        the student's preferences; flag what can't fit.
  5. Backups   (code)   same-slot, similar-topic alternates for each pick.
  6. Critique  (agent)  the Critic reviews the final plan against the goals.

Only steps 2 and 6 spend tokens, and both see short, pre-filtered input.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any

from catalog import TERM_NAMES, card_text, get_catalog
from config import ai_available
from crew.agents import critic, curator
from crew.context import load_context
from crew.runtime import Run
from db import RecommendationRun
from planning import alternates, best_section, conflicts, respects_prefs, week_review
from rules import gsr_courses
from safety import BudgetExceeded, SpendGuard, fence, validate_picks

SHORTLIST = 28


def _query(profile: dict) -> str:
    bits = [
        " ".join(profile.get("interests", [])) * 2,
        profile.get("goal_short", ""),
        profile.get("goal_long", ""),
        profile.get("background", ""),
    ]
    return " ".join(b for b in bits if b)


def retrieve(ctx, term: str) -> tuple[list, dict]:
    cat = ctx.catalog
    p = ctx.profile
    program = p.get("program") or "MBA"
    completed = {c.strip().upper() for c in p.get("completed", [])}
    planned_keys = {r.section.offering_key for r in ctx.plan}
    prefs = p.get("prefs") or {}
    interests = set(p.get("interests", []))

    pool = [
        o for o in cat.eligible(term, program=program)
        if o.lead.number.upper() not in completed and o.key not in planned_keys
        and any(respects_prefs(s, prefs) for s in o.sections if program in s.programs)
        and o.lead.units > 0
    ]
    ranked = cat.search(_query(p), pool, limit=len(pool))
    scored = []
    for off, score in ranked:
        boost = 2.5 * len(interests & set(off.lead.topics))
        if not off.lead.description:
            boost -= 1.5
        scored.append((off, score + boost))
    scored.sort(key=lambda x: -x[1])
    shortlist = [o for o, s in scored[:SHORTLIST] if s > 0] or [o for o, _ in scored[:SHORTLIST]]

    full_chars = sum(len(card_text(o, 2000)) for o in cat.eligible(None, program=None))
    short_chars = sum(len(card_text(o, 300)) for o in shortlist)
    stats = {
        "eligible": len(pool),
        "shortlist": len(shortlist),
        "catalog_chars": full_chars,
        "shortlist_chars": short_chars,
        "approx_tokens_saved": max(0, (full_chars - short_chars) // 4),
    }
    return shortlist, stats


async def recommend(db, user_id: int, term: str = "202701", queue: asyncio.Queue | None = None) -> dict:
    run = Run(db=db, user_id=user_id, feature="recommend", guard=SpendGuard.for_user(db, user_id), queue=queue)
    ctx = load_context(run)
    p = ctx.profile
    out: dict[str, Any] = {"run_id": run.run_id, "term": term, "term_name": TERM_NAMES.get(term, term)}

    shortlist, stats = retrieve(ctx, term)
    run.emit("retrieve", agent="Retriever (code)", **stats)
    out["shortlist_size"] = len(shortlist)
    if not shortlist:
        out.update(summary="I couldn't find eligible courses with those settings — try loosening your schedule preferences.",
                   picks=[], dropped=[])
        return _finish(run, out)

    by_key = {o.key: o for o in shortlist}
    descriptions = {o.key: o.lead.description for o in shortlist}

    if not ai_available():
        picks = [{"key": o.key, "why": "Strong keyword match with your goals.", "goal": "interest",
                  "evidence": "", "priority": 2} for o in shortlist[:5]]
        summary = "AI is offline, so these are the top keyword matches."
    else:
        quiz = (
            f"year={p.get('year') or '?'} program={p.get('program','MBA')} cohort={p.get('cohort') or '?'}\n"
            f"background={p.get('background') or '?'}\ninterests={', '.join(p.get('interests', [])) or '?'}\n"
            f"short-term goal={p.get('goal_short') or '?'}\nlong-term goal={p.get('goal_long') or '?'}\n"
            f"preferences={p.get('prefs', {})}"
        )
        listing = "\n".join(f"{i + 1}. {card_text(o, 300)}" for i, o in enumerate(shortlist))
        prompt = (
            f"Term: {TERM_NAMES.get(term, term)}.\nSTUDENT QUIZ:\n{fence(quiz, 'student_quiz')}\n\n"
            f"SHORTLIST (pick only from these keys):\n{fence(listing, 'som_catalog', limit=len(listing) + 100)}"
        )
        try:
            curated = await run.call(curator, prompt, name="Curator", requests=3)
        except BudgetExceeded as exc:
            out.update(summary=str(exc), picks=[], dropped=[])
            return _finish(run, out)
        picks = [pk.model_dump() for pk in curated.output.picks]
        summary = curated.output.summary

    kept, dropped = validate_picks(picks, set(by_key), descriptions)
    run.emit("validate", agent="Validator (code)", kept=len(kept), dropped=[
        {"key": d.get("key"), "why": d["dropped_because"]} for d in dropped
    ], quotes_removed=sum(1 for k in kept if k.get("evidence_note")))
    if dropped:
        run.audit("recommendation_dropped", items=[d.get("key") for d in dropped])

    # 4. assemble a clash-free plan on top of what the student already has this term
    chosen = ctx.sections(term)
    prefs = p.get("prefs") or {}
    program = p.get("program") or "MBA"
    assembled = []
    for pk in sorted(kept, key=lambda x: x.get("priority", 2)):
        off = by_key[pk["key"]]
        sec = best_section(off, chosen, prefs, program)
        row = {
            **pk,
            "number": off.lead.number, "title": off.lead.title, "session": off.lead.session,
            "units": off.lead.units, "seats": off.lead.limit, "enrollment": off.lead.enrollment,
            "topics": off.lead.topics, "ldr": off.lead.counts_for_ldr, "gsr": off.lead.counts_for_gsr,
            "description": off.lead.description[:500], "faculty": off.lead.faculty,
        }
        if sec:
            chosen.append(sec)
            row.update(fits=True, section_id=sec.id, section=sec.section, time=sec.time_label)
        else:
            hits = conflicts(chosen + [off.sections[0]])
            row.update(fits=False, section_id=off.sections[0].id, section=off.sections[0].section,
                       time=off.sections[0].time_label,
                       clash_with=sorted({h["a"] for h in hits} | {h["b"] for h in hits} - {f"{off.lead.number} §{off.sections[0].section}"}))
        assembled.append(row)

    # 5. backups
    for row in assembled:
        target = by_key[row["key"]]
        others = [s for s in chosen if s.offering_key != row["key"]]
        row["alternates"] = alternates(target, others, ctx.catalog, n=2, prefs=prefs, program=program)
    run.emit("assemble", agent="Scheduler (code)", fitted=sum(r["fits"] for r in assembled),
             not_fitting=[r["number"] for r in assembled if not r["fits"]])

    term_secs = [s for s in chosen if s.term == term]
    review = week_review(term_secs)
    units_new = sum(r["units"] for r in assembled if r["fits"])
    gsr_keys = {k for ks in gsr_courses(ctx.catalog, term).values() for k in ks}
    out.update(
        summary=summary,
        picks=assembled,
        dropped=dropped,
        schedule={
            "units_added": units_new,
            "units_term_total": sum(s.units for s in term_secs),
            "notes": review["notes"],
            "days_on_campus": review["days_on_campus"],
            "has_ldr": any(r["ldr"] for r in assembled),
            "has_gsr": any(r["key"] in gsr_keys or r["gsr"] for r in assembled),
        },
    )

    # 6. critique (skipped gracefully if the budget is gone)
    if ai_available() and assembled:
        plan_text = "\n".join(
            f"- P{r['priority']} {r['number']} {r['title']} | {r['time']} | {r['units']:g}u | goal={r['goal']} | "
            f"seats={r['seats'] or '?'} | "
            + ("fits the timetable" if r["fits"] else f"CLASHES with {', '.join(r.get('clash_with', [])) or 'the plan'} (backups offered)")
            for r in assembled
        )
        notes = "\n".join(n["text"] for n in review["notes"]) or "none"
        prompt = (
            f"Goals: short-term={p.get('goal_short') or '?'}; long-term={p.get('goal_long') or '?'}; year={p.get('year') or '?'}\n"
            f"Plan:\n{fence(plan_text, 'assembled_plan')}\nSchedule notes:\n{notes}\n"
            f"LDR course included: {out['schedule']['has_ldr']}. GSR course included: {out['schedule']['has_gsr']}."
        )
        try:
            crit = await run.call(critic, prompt, name="Critic", requests=2)
            out["critique"] = crit.output.model_dump()
        except BudgetExceeded as exc:
            out["critique"] = {"verdict": "Skipped the review to stay within budget.", "watch_outs": [str(exc)]}
        except Exception as exc:  # the plan is still useful without a critique
            run.audit("agent_error", agent="Critic", detail=str(exc)[:200])

    final = _finish(run, out)
    db.add(RecommendationRun(user_id=user_id, run_id=run.run_id, term_code=term,
                             request=json.dumps(p, default=str), result=json.dumps(final, default=str)))
    db.commit()
    return final


def _finish(run: Run, out: dict) -> dict:
    return {**out, "trace": run.events, "usage": run.usage_summary()}
