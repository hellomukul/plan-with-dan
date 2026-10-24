"""Plan with Dan: API + the built web app, served from one origin.

Run locally (from the repo root):
    uvicorn backend.main:app --port 8000
then open http://localhost:8000
"""

from __future__ import annotations

import json
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
from crew.recommender import recommend  # noqa: E402
from db import (  # noqa: E402
    AuditEvent, BidReport, ChatMessage, GlobalChoice, PlanItem, Profile, RecommendationRun,
    UsageLog, User, get_db, init_db, utcnow,
)
from ics import build_calendar, google_template_link, meeting_dates  # noqa: E402
from planning import (  # noqa: E402
    PlanRow, bid_stats, conflicts, gsa_check, requirement_progress, suggest_bids, units_by_term, week_review,
)
from rules import (  # noqa: E402
    CALENDAR, CORE_COURSES, DEGREE, GLOBAL_WEEKS, GSA_DAYS, GSR_OPTIONS, LDR, SOURCES, gsr_courses,
)
from safety import spent_today  # noqa: E402
from seed import seed_sample_bids  # noqa: E402

@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    get_catalog()
    seed_sample_bids()
    yield


app = FastAPI(title="Plan with Dan", version="1.0.0", lifespan=lifespan)
app.state.limiter = limiter


@app.exception_handler(RateLimitExceeded)
async def _rate_limited(_request: Request, _exc: RateLimitExceeded):
    return JSONResponse({"detail": "Too many attempts. Wait a minute and try again."}, status_code=429)


@app.middleware("http")
async def guard_requests(request: Request, call_next):
    """CSRF defence for cookie auth: unsafe API calls must come from our own origin."""
    if request.method not in ("GET", "HEAD", "OPTIONS") and request.url.path.startswith("/api/"):
        origin = request.headers.get("origin")
        host = request.headers.get("x-forwarded-host") or request.headers.get("host", "")
        if origin and origin.split("://", 1)[-1] != host:
            return JSONResponse({"detail": "Cross-site request blocked."}, status_code=403)
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "same-origin")
    response.headers.setdefault("X-Frame-Options", "DENY")
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

class ProfileIn(BaseModel):
    program: str = "MBA"
    year: str = ""
    cohort: str = ""
    class_year: str = ""
    background: str = Field("", max_length=300)
    interests: list[str] = Field(default_factory=list, max_length=12)
    goal_short: str = Field("", max_length=400)
    goal_long: str = Field("", max_length=400)
    completed: list[str] = Field(default_factory=list, max_length=60)
    prefs: dict = Field(default_factory=dict)
    gsa_days_used: int = Field(0, ge=0, le=10)
    onboarded: bool = True


@app.get("/api/profile")
def get_profile(user: User = Depends(current_user), db: Session = Depends(get_db)):
    p = db.get(Profile, user.id) or Profile(user_id=user.id)
    return {"profile": p.as_dict(), "user": auth.public_user(user)}


@app.put("/api/profile")
def put_profile(body: ProfileIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    p = db.get(Profile, user.id) or Profile(user_id=user.id)
    p.program, p.year, p.cohort, p.class_year = body.program[:20], body.year[:2], body.cohort[:10], body.class_year[:6]
    p.background, p.goal_short, p.goal_long = body.background, body.goal_short, body.goal_long
    p.interests = json.dumps([i[:40] for i in body.interests])
    p.completed = json.dumps([c.strip().upper()[:12] for c in body.completed])
    allowed = {"no_before", "fridays_free", "avoid_days", "max_units", "workload"}
    p.prefs = json.dumps({k: v for k, v in body.prefs.items() if k in allowed})
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
    bid_points: Optional[int] = Field(None, ge=0, le=100000)
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
    out_items = []
    for i in items:
        sec = cat.by_id.get(i.course_id)
        if not sec:
            continue
        out_items.append({
            "id": i.id, "status": i.status, "bid_points": i.bid_points, "added_by": i.added_by,
            "section": sec.to_api(),
            "other_sections": [s.to_api() for s in cat.offerings[sec.offering_key].sections if s.id != sec.id],
            "google_link": google_template_link(sec),
        })
    by_term: dict[str, dict] = {}
    for term in sorted({r.section.term for r in rows}):
        secs = [r.section for r in rows if r.section.term == term]
        by_term[term] = {
            "name": TERM_NAMES.get(term, term),
            "units": sum(s.units for s in secs),
            "conflicts": conflicts(secs),
            "review": week_review(secs),
        }
    profile = (db.get(Profile, user.id) or Profile(user_id=user.id)).as_dict()
    return {
        "items": out_items,
        "terms": by_term,
        "progress": requirement_progress(profile, rows, cat, _globals(db, user.id)),
    }


@app.post("/api/plan")
def add_plan(body: PlanIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    cat = get_catalog()
    sec = cat.by_id.get(body.course_id)
    if not sec:
        raise HTTPException(404, "That course isn't in the catalog.")
    existing = db.exec(select(PlanItem).where(PlanItem.user_id == user.id)).all()
    for item in existing:
        other = cat.by_id.get(item.course_id)
        if other and other.offering_key == sec.offering_key:
            item.course_id = sec.id  # same course, different section: switch
            db.add(item)
            db.commit()
            return {"ok": True, "id": item.id, "switched": True}
    if len(existing) >= 60:
        raise HTTPException(400, "Your plan is full (60 courses).")
    item = PlanItem(user_id=user.id, course_id=sec.id, status=body.status, added_by=body.added_by)
    db.add(item)
    db.commit()
    db.refresh(item)
    _, rows = _plan_rows(db, user.id)
    clashes = [c for c in conflicts([r.section for r in rows if r.section.term == sec.term]) if sec.id in (c["a_id"], c["b_id"])]
    return {"ok": True, "id": item.id, "clashes": clashes}


@app.patch("/api/plan/{item_id}")
def patch_plan(item_id: int, body: PlanPatch, user: User = Depends(current_user), db: Session = Depends(get_db)):
    item = db.get(PlanItem, item_id)
    if not item or item.user_id != user.id:
        raise HTTPException(404, "Not in your plan.")
    if body.status:
        item.status = body.status
    if body.bid_points is not None:
        item.bid_points = body.bid_points
    if body.course_id:
        cat = get_catalog()
        new, old = cat.by_id.get(body.course_id), cat.by_id.get(item.course_id)
        if not new or not old or new.offering_key != old.offering_key:
            raise HTTPException(400, "You can only switch to another section of the same course.")
        item.course_id = new.id
    db.add(item)
    db.commit()
    return {"ok": True}


@app.delete("/api/plan/{item_id}")
def delete_plan(item_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    item = db.get(PlanItem, item_id)
    if not item or item.user_id != user.id:
        raise HTTPException(404, "Not in your plan.")
    db.delete(item)
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
    used = profile.get("gsa_days_used", 0)
    matches = gsr_courses(cat)
    options = []
    for opt in GSR_OPTIONS:
        courses = []
        for key in matches.get(opt["key"], []):
            off = cat.offering(key)
            courses.append({"key": key, "number": off.lead.number, "title": off.lead.title,
                            "term_name": TERM_NAMES.get(off.lead.term), "section_ids": [s.id for s in off.sections],
                            "seats": off.lead.limit, "time": off.lead.time_label})
        options.append({**{k: v for k, v in opt.items() if k != "match"}, "courses": courses,
                        "budget_check": gsa_check(opt["key"], used)})
    ldr_courses = sorted({(o.lead.number, o.lead.title, TERM_NAMES.get(o.lead.term, "")) for o in cat.offerings.values()
                          if o.lead.counts_for_ldr and "MBA" in o.lead.programs})
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
                            "title": f"{s.number} {s.title}", "room": s.room, "course_id": s.id})
    deadlines = [{"date": d, "title": label, "kind": kind} for d, label, kind in CALENDAR]
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
    term_code: str = Field("", max_length=8)
    points_bid: int = Field(ge=0, le=100000)
    got_seat: bool
    clearing_points: Optional[int] = Field(None, ge=0, le=100000)


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
    number = body.course_number.strip().upper()
    offs = get_catalog().offering_for_number(number)
    if not offs:
        raise HTTPException(404, f"{number} isn't in the SOM catalog.")
    db.add(BidReport(user_id=user.id, course_number=number, course_title=offs[0].lead.title, term_code=body.term_code,
                     points_bid=body.points_bid, got_seat=body.got_seat, clearing_points=body.clearing_points,
                     source="student"))
    db.commit()
    return {"ok": True}


class SuggestIn(BaseModel):
    budget: int = Field(ge=1, le=100000)
    priorities: dict[str, int] = Field(default_factory=dict)  # course number -> 1..3


@app.post("/api/bids/suggest")
def bid_suggest(body: SuggestIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    _, rows = _plan_rows(db, user.id)
    seen, items = set(), []
    for r in rows:
        s = r.section
        if s.enrollment.lower() != "bid" or s.number in seen or r.status == "completed":
            continue
        seen.add(s.number)
        reports = [x.model_dump() for x in db.exec(select(BidReport).where(BidReport.course_number == s.number)).all()]
        stats = bid_stats(reports)
        items.append({"number": s.number, "title": s.title, "term_name": TERM_NAMES.get(s.term),
                      "priority": max(1, min(3, body.priorities.get(s.number, 2))), "seats": s.limit,
                      "median_winning_bid": stats.get("median_winning_bid"), "sample_only": stats.get("sample_only", False)})
    return {"split": suggest_bids(items, body.budget),
            "note": "Heuristic only: weights your priority, seat limits and any reported winning bids. SOM doesn't publish clearing prices."}


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
