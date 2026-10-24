"""Plan with Dan: API + the built web app, served from one origin.

Run locally (from the repo root):
    uvicorn backend.main:app --port 8000
then open http://localhost:8000
"""

from __future__ import annotations

import json
import os
import secrets
import sys
from contextlib import asynccontextmanager
from datetime import date
from pathlib import Path
from typing import Literal, Optional

sys.path.insert(0, str(Path(__file__).resolve().parent))  # allow `uvicorn backend.main:app` from the repo root

from fastapi import Depends, FastAPI, HTTPException, Request, Response  # noqa: E402
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402
from pydantic import BaseModel, Field  # noqa: E402
from slowapi.errors import RateLimitExceeded  # noqa: E402
from sqlmodel import Session, func, select  # noqa: E402

import auth  # noqa: E402
from auth import current_user, limiter  # noqa: E402
from catalog import TERM_NAMES, TOPIC_RULES, get_catalog  # noqa: E402
from config import DAILY_BUDGET_USD, MODEL_NAME, ROOT, RUN_BUDGET_USD, ai_available  # noqa: E402
from crew.chat import run_turn, stream_turn  # noqa: E402
from crew.desk import apply_states, brief as desk_brief, scan as desk_scan, set_state as set_desk_state  # noqa: E402
from crew.recommender import recommend  # noqa: E402
from fit import FitContext, best_fits  # noqa: E402
from db import (  # noqa: E402
    USER_TABLES, ActionLog, AuditEvent, BidReport, ChatMessage, DeskBrief, DeskState, FitDismissal, GlobalChoice,
    PlanItem, Profile, RecommendationRun, UsageLog, User, get_db, init_db, log_audit, utcnow,
)
from ics import build_calendar, google_template_link, meeting_dates  # noqa: E402
from planning import (  # noqa: E402
    PlanRow, bid_stats, conflicts, core_load, effective_gsa_used, gsa_check, requirement_progress, suggest_bids,
    units_by_term, week_review,
)
from rules import (  # noqa: E402
    CALENDAR, CALENDAR_ENDS, CORE_COURSES, DEGREE, GLOBAL_WEEKS, GSA_DAYS, GSR_OPTIONS, LDR, SOURCES, gsr_courses,
)
from safety import screen_input, spent_today  # noqa: E402
from seed import seed_sample_bids  # noqa: E402

@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    get_catalog()
    seed_sample_bids()
    auth.purge_expired_sessions()
    yield


app = FastAPI(title="Plan with Dan", version="1.0.0", lifespan=lifespan)
app.state.limiter = limiter


@app.exception_handler(RateLimitExceeded)
async def _rate_limited(_request: Request, _exc: RateLimitExceeded):
    return JSONResponse({"detail": "Too many attempts. Wait a minute and try again."}, status_code=429)


# The Vite dev server (npm run dev) proxies /api from another port; production is same-origin.
DEV_ORIGINS = {"http://127.0.0.1:5173", "http://localhost:5173"}  # only honoured when the app itself runs on localhost
TRUST_PROXY = os.getenv("TRUST_PROXY", "").lower() in ("1", "true", "yes")  # set on Render, which adds X-Forwarded-Host
CSP = ("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
       "font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; "
       "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'")


@app.middleware("http")
async def guard_requests(request: Request, call_next):
    """CSRF defence for cookie auth: unsafe API calls must come from our own origin."""
    if request.method not in ("GET", "HEAD", "OPTIONS") and request.url.path.startswith("/api/"):
        origin = request.headers.get("origin")
        host = (request.headers.get("x-forwarded-host") if TRUST_PROXY else None) or request.headers.get("host", "")
        local = host.split(":")[0] in ("localhost", "127.0.0.1")
        if origin and origin.split("://", 1)[-1] != host and not (local and origin in DEV_ORIGINS):
            return JSONResponse({"detail": "Cross-site request blocked."}, status_code=403)
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "same-origin")
    response.headers.setdefault("X-Frame-Options", "DENY")
    if not request.url.path.startswith(("/docs", "/redoc", "/openapi.json")):
        response.headers.setdefault("Content-Security-Policy", CSP)
    return response


app.include_router(auth.router)


# ------------------------------------------------------------------ health + catalog

@app.get("/api/health")
def health():
    cat = get_catalog()
    return {
        "ok": True,
        "model": MODEL_NAME,
        "ai_connected": ai_available(),
        "sections": len(cat.sections),
        "offerings": len(cat.offerings),
        "terms": TERM_NAMES,
        "budgets": {"per_turn_usd": RUN_BUDGET_USD, "per_day_usd": DAILY_BUDGET_USD},
    }


@app.get("/api/catalog")
def catalog_all():
    cat = get_catalog()
    return {
        "terms": TERM_NAMES,
        "topics": list(TOPIC_RULES),
        "sections": [s.to_api() for s in cat.sections if s.visible],
    }


# ------------------------------------------------------------------ profile

class PrefsIn(BaseModel):
    no_before: Optional[int] = Field(None, ge=0, le=24 * 60)
    fridays_free: bool = False
    avoid_days: list[Literal["M", "T", "W", "Th", "F"]] = Field(default_factory=list, max_length=5)


class ProfileIn(BaseModel):
    program: Literal["MBA", "EMBA", "MAM", "MMS"] = "MBA"
    year: str = ""
    cohort: str = ""
    class_year: str = ""
    background: str = Field("", max_length=300)
    interests: list[str] = Field(default_factory=list, max_length=12)
    goal_short: str = Field("", max_length=400)
    goal_long: str = Field("", max_length=400)
    completed: list[str] = Field(default_factory=list, max_length=60)
    prefs: PrefsIn = Field(default_factory=PrefsIn)
    gsa_days_used: int = Field(0, ge=0, le=10)
    onboarded: bool = True


@app.get("/api/profile")
def get_profile(user: User = Depends(current_user), db: Session = Depends(get_db)):
    p = db.get(Profile, user.id) or Profile(user_id=user.id)
    return {"profile": p.as_dict(), "user": auth.public_user(user)}


@app.put("/api/profile")
def put_profile(body: ProfileIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    for label, text in (("background", body.background), ("short-term goal", body.goal_short), ("long-term goal", body.goal_long)):
        screen = screen_input(text) if text.strip() else None
        if screen is not None and not screen.allowed:
            log_audit(db, "profile_text_blocked", user_id=user.id, field=label, reasons=screen.reasons)
            raise HTTPException(422, f"Your {label} reads like an instruction to the AI. Describe it in plain words instead.")
    p = db.get(Profile, user.id) or Profile(user_id=user.id)
    p.program, p.year, p.cohort, p.class_year = body.program, body.year[:2], body.cohort[:10], body.class_year[:6]
    p.background, p.goal_short, p.goal_long = body.background, body.goal_short, body.goal_long
    p.interests = json.dumps([i[:40] for i in body.interests])
    p.completed = json.dumps([" ".join(c.split()).upper()[:12] for c in body.completed if c.strip()])
    p.prefs = json.dumps(body.prefs.model_dump(exclude_defaults=True))
    p.gsa_days_used, p.onboarded, p.updated_at = body.gsa_days_used, body.onboarded, utcnow()
    db.add(p)
    db.commit()
    return {"profile": p.as_dict()}


# ------------------------------------------------------------------ plan

class PlanIn(BaseModel):
    course_id: str
    status: Literal["planned", "bidding", "enrolled", "completed"] = "planned"
    added_by: Literal["student", "dan"] = "student"


class PlanPatch(BaseModel):
    status: Optional[Literal["planned", "bidding", "enrolled", "completed"]] = None
    bid_points: Optional[int] = Field(None, ge=0, le=5000)
    clear_bid: bool = False
    course_id: Optional[str] = None  # switch section


def _plan_rows(db: Session, user_id: int) -> tuple[list[PlanItem], list[PlanRow]]:
    cat = get_catalog()
    items = db.exec(select(PlanItem).where(PlanItem.user_id == user_id).order_by(PlanItem.id)).all()
    rows = [PlanRow(cat.by_id[i.course_id], i.status) for i in items if i.course_id in cat.by_id]
    return items, rows


def _globals(db: Session, user_id: int) -> list[dict]:
    return [g.model_dump(include={"id", "option_key", "target_term", "status", "note"})
            for g in db.exec(select(GlobalChoice).where(GlobalChoice.user_id == user_id)).all()]


@app.get("/api/plan")
def get_plan(user: User = Depends(current_user), db: Session = Depends(get_db)):
    cat = get_catalog()
    items, rows = _plan_rows(db, user.id)
    profile = (db.get(Profile, user.id) or Profile(user_id=user.id)).as_dict()
    program = profile.get("program") or "MBA"
    out_items = []
    for i in items:
        sec = cat.by_id.get(i.course_id)
        if not sec:
            continue
        out_items.append({
            "id": i.id, "status": i.status, "bid_points": i.bid_points, "added_by": i.added_by,
            "section": sec.to_api(),
            "other_sections": [s.to_api() for s in cat.offerings[sec.offering_key].sections_for(program)
                               if s.id != sec.id],
            "google_link": google_template_link(sec),
        })
    by_term: dict[str, dict] = {}
    terms = {r.section.term for r in rows} | ({"202701"} if profile.get("year") == "1" else set())
    for term in sorted(terms):
        secs = [r.section for r in rows if r.section.term == term]
        core = core_load(profile, term, cat)
        by_term[term] = {
            "name": TERM_NAMES.get(term, term),
            "units": sum(s.units for s in secs) + core["units"],
            "elective_units": sum(s.units for s in secs),
            "core_units": core["units"],
            "core_times_known": core["times_known"],
            "conflicts": conflicts(secs + core["sections"]),
            "review": week_review(secs + core["sections"]),
        }
    return {
        "items": out_items,
        "terms": by_term,
        "progress": requirement_progress(profile, rows, cat, _globals(db, user.id)),
    }


def _check_section_allowed(db: Session, user_id: int, sec, status: str = "planned") -> None:
    """Students can only plan sections open to their program that haven't already ended."""
    program = (db.get(Profile, user_id) or Profile(user_id=user_id)).program or "MBA"
    if not sec.open_to(program):
        raise HTTPException(400, f"Section {sec.section} of {sec.number} is only open to {', '.join(sec.programs)} students.")
    if sec.ended() and status != "completed":
        raise HTTPException(400, f"{sec.number} section {sec.section} has already ended. Mark it completed instead.")


def _log_action(db: Session, user_id: int, action: str, summary: str, payload: dict, by: str = "student") -> int:
    entry = ActionLog(user_id=user_id, action=action, summary=summary, payload=json.dumps(payload), by=by)
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry.id


@app.post("/api/plan")
def add_plan(body: PlanIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    cat = get_catalog()
    sec = cat.by_id.get(body.course_id)
    if not sec:
        raise HTTPException(404, "That course isn't in the catalog.")
    _check_section_allowed(db, user.id, sec, body.status)
    existing = db.exec(select(PlanItem).where(PlanItem.user_id == user.id)).all()
    for item in existing:
        other = cat.by_id.get(item.course_id)
        if other and other.offering_key == sec.offering_key:
            if other.id == sec.id:
                return {"ok": True, "id": item.id, "unchanged": True}
            old_id = item.course_id
            item.course_id = sec.id  # same course, different section: switch
            db.add(item)
            db.commit()
            action_id = _log_action(db, user.id, "switch", f"Switched {sec.number} to section {sec.section}",
                                    {"item_id": item.id, "from": old_id, "to": sec.id}, body.added_by)
            return {"ok": True, "id": item.id, "switched": True, "action_id": action_id}
    if len(existing) >= 60:
        raise HTTPException(400, "Your plan is full (60 courses).")
    item = PlanItem(user_id=user.id, course_id=sec.id, status=body.status, added_by=body.added_by)
    db.add(item)
    db.commit()
    db.refresh(item)
    action_id = _log_action(db, user.id, "add", f"Added {sec.number} {sec.title}", {"item_id": item.id}, body.added_by)
    _, rows = _plan_rows(db, user.id)
    clashes = [c for c in conflicts([r.section for r in rows if r.section.term == sec.term]) if sec.id in (c["a_id"], c["b_id"])]
    return {"ok": True, "id": item.id, "clashes": clashes, "action_id": action_id}


@app.patch("/api/plan/{item_id}")
def patch_plan(item_id: int, body: PlanPatch, user: User = Depends(current_user), db: Session = Depends(get_db)):
    item = db.get(PlanItem, item_id)
    if not item or item.user_id != user.id:
        raise HTTPException(404, "Not in your plan.")
    cat = get_catalog()
    if body.status is None and body.bid_points is None and not body.course_id and not body.clear_bid:
        raise HTTPException(400, "Nothing to change.")
    before = {"status": item.status, "bid_points": item.bid_points, "course_id": item.course_id}
    if body.status:
        item.status = body.status
    if body.bid_points is not None:
        item.bid_points = body.bid_points
    if body.clear_bid:
        item.bid_points = None
    if body.course_id:
        new, old = cat.by_id.get(body.course_id), cat.by_id.get(item.course_id)
        if not new or not old or new.offering_key != old.offering_key:
            raise HTTPException(400, "You can only switch to another section of the same course.")
        _check_section_allowed(db, user.id, new, item.status)
        item.course_id = new.id
    db.add(item)
    db.commit()
    sec = cat.by_id.get(item.course_id)
    label = sec.number if sec else "course"
    what = "section" if body.course_id else "status" if body.status else "bid points"
    action_id = _log_action(db, user.id, "update", f"Changed {label} {what}", {"item_id": item.id, "before": before})
    return {"ok": True, "action_id": action_id}


@app.delete("/api/plan/{item_id}")
def delete_plan(item_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    item = db.get(PlanItem, item_id)
    if not item or item.user_id != user.id:
        raise HTTPException(404, "Not in your plan.")
    sec = get_catalog().by_id.get(item.course_id)
    payload = {"course_id": item.course_id, "status": item.status, "bid_points": item.bid_points, "added_by": item.added_by}
    db.delete(item)
    db.commit()
    action_id = _log_action(db, user.id, "remove", f"Removed {sec.number if sec else 'a course'}", payload)
    return {"ok": True, "action_id": action_id}


@app.get("/api/actions")
def list_actions(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.exec(select(ActionLog).where(ActionLog.user_id == user.id).order_by(ActionLog.id.desc()).limit(20)).all()
    return {"actions": [{"id": a.id, "action": a.action, "summary": a.summary, "by": a.by, "undone": a.undone,
                         "at": a.created_at.isoformat()} for a in rows]}


@app.post("/api/actions/{action_id}/undo")
def undo_action(action_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    a = db.get(ActionLog, action_id)
    if not a or a.user_id != user.id:
        raise HTTPException(404, "Nothing to undo.")
    if a.undone:
        return {"ok": True, "already": True}
    data = json.loads(a.payload or "{}")
    if a.action == "add":
        item = db.get(PlanItem, data.get("item_id"))
        if not item or item.user_id != user.id:
            return {"ok": False, "detail": "That course is no longer in your plan, so there's nothing to undo."}
        db.delete(item)
    elif a.action == "remove":
        cat = get_catalog()
        sec = cat.by_id.get(data.get("course_id", ""))
        current = db.exec(select(PlanItem).where(PlanItem.user_id == user.id)).all()
        if not sec:
            raise HTTPException(404, "That course is no longer in the catalog.")
        if any((cat.by_id.get(i.course_id) or sec).offering_key == sec.offering_key for i in current if i.course_id in cat.by_id):
            return {"ok": False, "detail": f"{sec.number} is already back in your plan."}
        if len(current) >= 60:
            raise HTTPException(400, "Your plan is full (60 courses).")
        db.add(PlanItem(user_id=user.id, course_id=sec.id, status=data.get("status", "planned"),
                        bid_points=data.get("bid_points"), added_by=data.get("added_by", "student")))
    elif a.action in ("switch", "update"):
        item = db.get(PlanItem, data.get("item_id"))
        if item and item.user_id == user.id:
            if a.action == "switch":
                item.course_id = data["from"]
            else:
                before = data.get("before", {})
                item.status = before.get("status", item.status)
                item.bid_points = before.get("bid_points")
                item.course_id = before.get("course_id", item.course_id)
            db.add(item)
    a.undone = True
    db.add(a)
    db.commit()
    return {"ok": True}


class ImportIn(BaseModel):
    course_ids: list[str] = Field(max_length=60)


@app.post("/api/plan/import")
def import_plan(body: ImportIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    added = 0
    for cid in body.course_ids:
        try:
            add_plan(PlanIn(course_id=cid), user, db)
            added += 1
        except HTTPException:
            continue
    return {"added": added}


# ------------------------------------------------------------------ requirements + global

@app.get("/api/requirements")
def requirements(user: User = Depends(current_user), db: Session = Depends(get_db)):
    cat = get_catalog()
    _, rows = _plan_rows(db, user.id)
    profile = (db.get(Profile, user.id) or Profile(user_id=user.id)).as_dict()
    used = effective_gsa_used(profile, _globals(db, user.id))
    matches = gsr_courses(cat)
    options = []
    for opt in GSR_OPTIONS:
        courses = []
        for key in matches.get(opt["key"], []):
            off = cat.offering(key)
            courses.append({"key": key, "number": off.lead.number, "title": off.lead.title,
                            "term_name": TERM_NAMES.get(off.lead.term),
                            "section_ids": [s.id for s in off.sections_for(profile.get("program") or "MBA")],
                            "seats": off.lead.limit, "time": off.lead.time_label})
        options.append({**{k: v for k, v in opt.items() if k != "match"}, "courses": courses,
                        "budget_check": gsa_check(opt["key"], used)})
    ldr_courses = sorted({(o.lead.number, o.lead.title, TERM_NAMES.get(o.lead.term, "")) for o in cat.offerings.values()
                          if o.lead.counts_for_ldr and o.sections_for(profile.get("program") or "MBA")})
    return {
        "degree": DEGREE,
        "core": [{"title": t, "units": u} for t, u in CORE_COURSES],
        "ldr": {**LDR, "courses": [{"number": n, "title": t, "term_name": tn} for n, t, tn in ldr_courses]},
        "gsr": {"options": options, "gsa_days": GSA_DAYS, "gsa_used": used, "weeks": GLOBAL_WEEKS},
        "progress": requirement_progress(profile, rows, cat, _globals(db, user.id)),
        "sources": SOURCES,
    }


class GlobalIn(BaseModel):
    option_key: Literal["ie", "gnw", "snoc", "gse_india", "gse_spring", "exchange"]
    target_term: str = Field("", max_length=20)
    status: Literal["considering", "applied", "done"] = "considering"
    note: str = Field("", max_length=300)


@app.get("/api/global")
def list_global(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return {"choices": _globals(db, user.id)}


@app.post("/api/global")
def add_global(body: GlobalIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    row = db.exec(select(GlobalChoice).where(GlobalChoice.user_id == user.id, GlobalChoice.option_key == body.option_key)).first()
    row = row or GlobalChoice(user_id=user.id, option_key=body.option_key)
    row.target_term, row.status, row.note = body.target_term, body.status, body.note
    db.add(row)
    db.commit()
    return {"ok": True}


@app.delete("/api/global/{option_key}")
def delete_global(option_key: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    row = db.exec(select(GlobalChoice).where(GlobalChoice.user_id == user.id, GlobalChoice.option_key == option_key)).first()
    if row:
        db.delete(row)
        db.commit()
    return {"ok": True}


# ------------------------------------------------------------------ calendar

@app.get("/api/calendar/events")
def calendar_events(user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Academic dates plus every individual class meeting, for the in-app calendar."""
    _, rows = _plan_rows(db, user.id)
    classes = []
    for r in rows:
        s = r.section
        if not s.meeting:
            continue
        for d in meeting_dates(s):
            classes.append({"date": d.isoformat(), "start_min": s.meeting.start, "end_min": s.meeting.end,
                            "status": r.status,
                            "title": f"{s.number} {s.title}", "room": s.room, "course_id": s.id})
    deadlines = [{"date": d, "end": CALENDAR_ENDS.get(d, d), "title": label, "kind": kind} for d, label, kind in CALENDAR]
    return {"classes": classes, "deadlines": deadlines, "today": date.today().isoformat()}


def _feed_urls(request: Request, user: User) -> dict:
    base = str(request.base_url).rstrip("/")
    https = f"{base}/cal/{user.cal_token}.ics"
    webcal = "webcal://" + https.split("://", 1)[1]
    return {
        "feed_url": https,
        "webcal_url": webcal,
        "google_subscribe": f"https://calendar.google.com/calendar/render?cid={webcal}",
        "outlook_subscribe": f"https://outlook.live.com/calendar/0/addfromweb?url={https}&name=Plan%20with%20Dan",
        "is_local": "localhost" in base or "127.0.0.1" in base,
    }


@app.get("/api/calendar/links")
def calendar_links(request: Request, user: User = Depends(current_user)):
    return _feed_urls(request, user)


@app.post("/api/calendar/rotate")
def rotate_calendar(request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    user.cal_token = secrets.token_urlsafe(24)
    db.add(user)
    db.commit()
    return _feed_urls(request, user)


@app.get("/cal/{token}.ics")
def calendar_feed(token: str, db: Session = Depends(get_db)):
    user = db.exec(select(User).where(User.cal_token == token)).first()
    if not user or len(token) < 20:
        raise HTTPException(404, "Unknown calendar.")
    _, rows = _plan_rows(db, user.id)
    body = build_calendar([r.section for r in rows], owner=f"u{user.id}")
    return Response(body, media_type="text/calendar; charset=utf-8", headers={"Cache-Control": "no-cache"})


@app.get("/api/plan.ics")
def plan_download(user: User = Depends(current_user), db: Session = Depends(get_db)):
    _, rows = _plan_rows(db, user.id)
    body = build_calendar([r.section for r in rows], owner=f"u{user.id}")
    return Response(body, media_type="text/calendar; charset=utf-8",
                    headers={"Content-Disposition": 'attachment; filename="plan-with-dan.ics"'})


# ------------------------------------------------------------------ bids

class BidIn(BaseModel):
    course_number: str = Field(max_length=12)
    term_code: Literal["202603", "202701"]
    points_bid: int = Field(ge=0, le=2000)
    got_seat: bool
    clearing_points: Optional[int] = Field(None, ge=0, le=2000)


@app.get("/api/bids")
def bids(course: str = "", user: User = Depends(current_user), db: Session = Depends(get_db)):
    q = select(BidReport)
    if course:
        q = q.where(BidReport.course_number == course.strip().upper())
    rows = [r.model_dump() for r in db.exec(q.order_by(BidReport.course_number)).all()]
    by_course: dict[str, list[dict]] = {}
    for r in rows:
        by_course.setdefault(r["course_number"], []).append(r)
    cat = get_catalog()
    summary = []
    for number, reports in sorted(by_course.items()):
        offs = cat.offering_for_number(number)
        summary.append({
            "course_number": number,
            "title": offs[0].lead.title if offs else reports[0].get("course_title", ""),
            "seats": offs[0].lead.limit if offs else None,
            **bid_stats(reports),
        })
    mine = [{k: r[k] for k in ("id", "course_number", "term_code", "points_bid", "got_seat", "clearing_points", "source")}
            for r in rows if r["user_id"] == user.id]
    return {"courses": summary, "mine": mine}


@app.post("/api/bids")
@limiter.limit("20/minute")
def report_bid(request: Request, body: BidIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    number = " ".join(body.course_number.split()).upper()
    offs = get_catalog().offering_for_number(number, body.term_code)
    if not offs:
        raise HTTPException(404, f"{number} isn't in the SOM catalog for that term.")
    # One report per student, course and term: a new report replaces the old one (no stuffing the stats).
    row = db.exec(select(BidReport).where(BidReport.user_id == user.id, BidReport.course_number == number,
                                          BidReport.term_code == body.term_code)).first()
    row = row or BidReport(user_id=user.id, course_number=number, term_code=body.term_code, points_bid=0,
                           got_seat=False, source="student")
    row.course_title, row.points_bid, row.got_seat = offs[0].lead.title, body.points_bid, body.got_seat
    row.clearing_points = body.clearing_points
    db.add(row)
    db.commit()
    return {"ok": True}


class SuggestIn(BaseModel):
    budget: int = Field(ge=1, le=100000)
    priorities: dict[str, int] = Field(default_factory=dict)  # course number -> 1..3


@app.post("/api/bids/suggest")
def bid_suggest(body: SuggestIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    _, rows = _plan_rows(db, user.id)
    seen, items, bid_secs = set(), [], []
    for r in rows:
        s = r.section
        if (s.enrollment.lower() != "bid" or s.offering_key in seen or r.status == "completed"
                or s.term != "202701" or s.ended()):
            continue
        seen.add(s.offering_key)
        bid_secs.append(s)
        reports = [x.model_dump() for x in db.exec(select(BidReport).where(BidReport.course_number == s.number)).all()]
        stats = bid_stats(reports)
        items.append({"number": s.number, "key": s.offering_key, "title": s.title, "term_name": TERM_NAMES.get(s.term),
                      "priority": max(1, min(3, body.priorities.get(s.offering_key, body.priorities.get(s.number, 2)))),
                      "seats": s.limit,
                      "median_winning_bid": stats.get("median_winning_bid"), "sample_only": stats.get("sample_only", False)})
    clash_warnings = [f"{c['a']} and {c['b']} clash ({c['day']} {c['window']}); you can only keep one, so don't spend on both."
                      for c in conflicts(bid_secs)]
    return {"split": suggest_bids(items, body.budget), "warnings": clash_warnings,
            "note": "Heuristic only: weights your priority, seat limits and real reported winning bids "
                    "(SAMPLE data is ignored). SOM doesn't publish clearing prices."}


# ------------------------------------------------------------------ AI: chat + recommend

class ChatIn(BaseModel):
    message: str = Field(max_length=4000)
    mode: Literal["dan", "news"] = "dan"


@app.post("/api/chat")
@limiter.limit("20/minute")
async def chat(request: Request, body: ChatIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return await run_turn(db, user.id, body.message, body.mode)


def _sse(gen):
    async def stream():
        async for event in gen:
            yield f"event: {event['type']}\ndata: {json.dumps(event['data'], default=str)}\n\n"
    return StreamingResponse(stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.post("/api/chat/stream")
@limiter.limit("20/minute")
async def chat_stream(request: Request, body: ChatIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return _sse(stream_turn(db, user.id, body.message, body.mode))


@app.get("/api/chat/history")
def chat_history(mode: Literal["dan", "news"] = "dan", user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.exec(select(ChatMessage).where(ChatMessage.user_id == user.id, ChatMessage.mode == mode)
                   .order_by(ChatMessage.id.desc()).limit(40)).all()
    return {"messages": [{"role": m.role, "content": m.content, "meta": json.loads(m.meta or "{}"),
                          "at": m.created_at.isoformat()} for m in reversed(rows)]}


@app.delete("/api/chat/history")
def clear_history(mode: Literal["dan", "news"] = "dan", user: User = Depends(current_user), db: Session = Depends(get_db)):
    for m in db.exec(select(ChatMessage).where(ChatMessage.user_id == user.id, ChatMessage.mode == mode)).all():
        db.delete(m)
    db.commit()
    return {"ok": True}


class RecommendIn(BaseModel):
    term: Literal["202603", "202701"] = "202701"


@app.post("/api/recommend")
@limiter.limit("6/minute")
async def recommend_courses(request: Request, body: RecommendIn, user: User = Depends(current_user),
                            db: Session = Depends(get_db)):
    return await recommend(db, user.id, body.term)


@app.get("/api/recommend/latest")
def latest_recommendation(user: User = Depends(current_user), db: Session = Depends(get_db)):
    row = db.exec(select(RecommendationRun).where(RecommendationRun.user_id == user.id)
                  .order_by(RecommendationRun.id.desc())).first()
    return {"result": json.loads(row.result) if row else None}


# ------------------------------------------------------------------ usage + safety log

@app.get("/api/usage")
def usage(user: User = Depends(current_user), db: Session = Depends(get_db)):
    logs = db.exec(select(UsageLog).where(UsageLog.user_id == user.id).order_by(UsageLog.id.desc()).limit(400)).all()
    runs: dict[str, dict] = {}
    for u in logs:
        r = runs.setdefault(u.run_id, {"run_id": u.run_id, "feature": u.feature, "at": u.created_at.isoformat(),
                                       "agents": [], "input_tokens": 0, "cached_tokens": 0, "output_tokens": 0,
                                       "web_searches": 0, "cost_usd": 0.0})
        r["agents"].append(u.agent)
        for k in ("input_tokens", "cached_tokens", "output_tokens", "web_searches"):
            r[k] += getattr(u, k)
        r["cost_usd"] = round(r["cost_usd"] + u.cost_usd, 6)
    totals = {k: sum(getattr(u, k) for u in logs) for k in ("input_tokens", "cached_tokens", "output_tokens", "web_searches")}
    totals["cost_usd"] = round(sum(u.cost_usd for u in logs), 6)
    return {
        "model": MODEL_NAME,
        "today_usd": round(spent_today(db, user.id), 6),
        "daily_budget_usd": DAILY_BUDGET_USD,
        "run_budget_usd": RUN_BUDGET_USD,
        "totals": totals,
        "runs": list(runs.values())[:40],
    }


@app.get("/api/usage/all")
def usage_all(db: Session = Depends(get_db), _user: User = Depends(current_user)):
    """Anonymous aggregate across all students, by feature (for the tokenomics page)."""
    rows = db.exec(select(UsageLog.feature, func.count(func.distinct(UsageLog.run_id)), func.sum(UsageLog.input_tokens),
                          func.sum(UsageLog.cached_tokens), func.sum(UsageLog.output_tokens),
                          func.sum(UsageLog.web_searches), func.sum(UsageLog.cost_usd))
                   .group_by(UsageLog.feature)).all()
    return {"by_feature": [{"feature": f, "runs": n, "input_tokens": i or 0, "cached_tokens": c or 0,
                            "output_tokens": o or 0, "web_searches": w or 0, "cost_usd": round(cost or 0, 6),
                            "avg_cost_per_run": round((cost or 0) / n, 6) if n else 0}
                           for f, n, i, c, o, w, cost in rows]}


@app.get("/api/safety/events")
def safety_events(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.exec(select(AuditEvent).where(AuditEvent.user_id == user.id).order_by(AuditEvent.id.desc()).limit(50)).all()
    return {"events": [{"kind": r.kind, "detail": json.loads(r.detail or "{}"), "at": r.created_at.isoformat(),
                        "run_id": r.run_id} for r in rows]}


# ------------------------------------------------------------------ Dan's Desk (chief of staff) + best fits

def _bid_points(db: Session, user_id: int) -> dict[str, int | None]:
    cat = get_catalog()
    out: dict[str, int | None] = {}
    for i in db.exec(select(PlanItem).where(PlanItem.user_id == user_id)).all():
        sec = cat.by_id.get(i.course_id)
        if sec:
            out[sec.number] = i.bid_points
    return out


@app.get("/api/desk")
async def desk(user: User = Depends(current_user), db: Session = Depends(get_db)):
    cat = get_catalog()
    _, rows = _plan_rows(db, user.id)
    profile = (db.get(Profile, user.id) or Profile(user_id=user.id)).as_dict()
    today = date.today()
    cards = desk_scan(profile, rows, cat, _globals(db, user.id), _bid_points(db, user.id), today)
    visible, hidden = apply_states(db, user.id, cards)
    top = visible[:3]
    b = await desk_brief(db, user.id, user.name, profile, top, today)
    return {
        "today": today.isoformat(),
        "brief": b,
        "top": [c.as_dict(today) for c in top],
        "later": [c.as_dict(today) for c in visible[3:]],
        "hidden": len(hidden),
    }


class DeskStateIn(BaseModel):
    status: Literal["done", "snoozed", "dismissed", "active"]


@app.post("/api/desk/{card_id}")
def desk_card(card_id: str, body: DeskStateIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    set_desk_state(db, user.id, card_id[:40], body.status)
    return {"ok": True}


@app.get("/api/bestfits")
def bestfits(term: Literal["202603", "202701"] = "202701", user: User = Depends(current_user),
             db: Session = Depends(get_db)):
    cat = get_catalog()
    _, rows = _plan_rows(db, user.id)
    profile = (db.get(Profile, user.id) or Profile(user_id=user.id)).as_dict()
    prog = requirement_progress(profile, rows, cat, _globals(db, user.id))
    reports: dict[str, list[dict]] = {}
    for r in db.exec(select(BidReport)).all():
        reports.setdefault(r.course_number, []).append(r.model_dump())
    dismissed = [d.course_key for d in db.exec(select(FitDismissal).where(FitDismissal.user_id == user.id)).all()]
    core = core_load(profile, term, cat)
    ctx = FitContext(catalog=cat, profile=profile, plan=rows, dismissed=dismissed, bid_reports=reports,
                     ldr_met=prog["ldr"]["met"] or prog["ldr"]["planned"] or not prog["modelled"],
                     gsr_met=prog["gsr"]["met"] or prog["gsr"]["planned"] or not prog["modelled"],
                     gsa_used=prog["gsa_used"], core_units=core["units"], core_sections=core["sections"])
    return best_fits(ctx, term)


class DismissIn(BaseModel):
    key: str = Field(max_length=200)
    reason: Literal["", "time", "interest", "taken", "competitive", "other"] = ""


@app.post("/api/bestfits/dismiss")
def dismiss_fit(body: DismissIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if not get_catalog().offering(body.key):
        raise HTTPException(404, "Unknown course.")
    db.add(FitDismissal(user_id=user.id, course_key=body.key, reason=body.reason))
    db.commit()
    return {"ok": True}


@app.delete("/api/bestfits/dismiss")
def undismiss_fit(key: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    for d in db.exec(select(FitDismissal).where(FitDismissal.user_id == user.id, FitDismissal.course_key == key)).all():
        db.delete(d)
    db.commit()
    return {"ok": True}


# ------------------------------------------------------------------ your data: export + delete

def _rows_for(db: Session, model, user_id: int) -> list[dict]:
    return [r.model_dump(mode="json", exclude={"password_hash", "token_hash"})
            for r in db.exec(select(model).where(model.user_id == user_id)).all()]


@app.get("/api/account/export")
def export_account(user: User = Depends(current_user), db: Session = Depends(get_db)):
    data = {"user": {"email": user.email, "name": user.name, "created_at": user.created_at.isoformat()}}
    for model in (Profile, PlanItem, GlobalChoice, ChatMessage, RecommendationRun, FitDismissal, ActionLog, AuditEvent,
                  DeskState, DeskBrief):
        data[model.__name__] = _rows_for(db, model, user.id)
    data["BidReport"] = _rows_for(db, BidReport, user.id)
    data["UsageLog"] = _rows_for(db, UsageLog, user.id)
    return Response(json.dumps(data, indent=2, default=str), media_type="application/json",
                    headers={"Content-Disposition": 'attachment; filename="plan-with-dan-my-data.json"'})


class DeleteIn(BaseModel):
    password: str = Field(max_length=200)


@app.post("/api/account/delete")
@limiter.limit("5/minute")
def delete_account(request: Request, response: Response, body: DeleteIn, user: User = Depends(current_user),
                   db: Session = Depends(get_db)):
    if not auth.hasher.verify(body.password, user.password_hash):
        raise HTTPException(401, "That password doesn't match.")
    for model in USER_TABLES:
        for row in db.exec(select(model).where(model.user_id == user.id)).all():
            db.delete(row)
    for r in db.exec(select(BidReport).where(BidReport.user_id == user.id)).all():
        r.user_id = None  # keep the anonymous bid outcome for classmates, unlink it from you
        db.add(r)
    for u in db.exec(select(UsageLog).where(UsageLog.user_id == user.id)).all():
        u.user_id = None  # keep anonymous token counts for cost reporting
        db.add(u)
    db.commit()  # children first, so foreign keys hold
    db.delete(user)
    db.commit()
    response.delete_cookie(auth.COOKIE, path="/")
    return {"ok": True}


# ------------------------------------------------------------------ the web app

DIST = ROOT / "frontend" / "dist"
if (DIST / "assets").exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")


@app.get("/{path:path}", include_in_schema=False)
def spa(path: str):
    if path.startswith("api/"):
        raise HTTPException(404, "Not found")
    target = (DIST / path).resolve()
    if path and target.is_file() and DIST.resolve() in target.parents:
        return FileResponse(target)
    index = DIST / "index.html"
    if index.exists():
        return FileResponse(index)
    return JSONResponse({"detail": "Frontend not built. Run `npm run build` in frontend/, or use the API at /docs."}, status_code=404)
