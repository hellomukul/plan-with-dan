"""Plan with Dan: API + the built web app, served from one origin.

Run locally (from the repo root):
    uvicorn backend.main:app --port 8000
then open http://localhost:8000
"""

from __future__ import annotations

import json
import logging
import os
import re
import threading
from urllib.parse import quote
import secrets
import sys
from contextlib import asynccontextmanager, contextmanager
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Literal, Optional

sys.path.insert(0, str(Path(__file__).resolve().parent))  # allow `uvicorn backend.main:app` from the repo root

from fastapi import Depends, FastAPI, HTTPException, Path, Request, Response  # noqa: E402
from typing import Annotated  # noqa: E402
from starlette.middleware.gzip import GZipMiddleware  # noqa: E402
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402
from pydantic import BaseModel, Field, model_validator  # noqa: E402
from slowapi.errors import RateLimitExceeded  # noqa: E402
from sqlmodel import Session, func, select  # noqa: E402

import auth  # noqa: E402
from auth import client_ip, current_user, limiter  # noqa: E402
import som_feed  # noqa: E402
from catalog import (  # noqa: E402
    CATALOG_PATH, LIVE_PATH, NEXT_YEAR, PLAN_TERMS, TERM_NAMES, TOPIC_RULES, Section, clock, data_path, get_catalog, project,
    quarter_label, term_name,
)
import config  # noqa: E402
from config import (  # noqa: E402
    DAILY_BUDGET_USD, MODEL_NAME, PUBLIC_MESSAGES_PER_DAY, ROOT, RUN_BUDGET_USD, ai_available,
)
from crew import memory as chat_memory  # noqa: E402
from crew.chat import run_turn, stream_turn  # noqa: E402
from crew.desk import apply_states, brief as desk_brief, scan as desk_scan, set_state as set_desk_state  # noqa: E402
from crew.recommender import recommend  # noqa: E402
from crew.package import PACKAGE_TERM, build_package  # noqa: E402
from fit import FitContext, best_fits  # noqa: E402
from db import (  # noqa: E402
    USER_TABLES, ActionLog, AuditEvent, BidReport, ChatMemory, ChatMessage, DeskBrief, DeskState, FitDismissal, GlobalChoice,
    PersonalEvent, ShortlistItem,
    PlanItem, Profile, RecommendationRun, UsageLog, User, get_db, init_db, log_audit, storage_info, utcnow,
)
from ics import build_calendar, google_template_link, meeting_dates  # noqa: E402
from programs import CODES as PROGRAM_CODES, PROGRAMS  # noqa: E402
from shortlist import MAX_SHORTLIST, compare as compare_shortlist  # noqa: E402
from planning import (
    min_units, max_units, add_drop_closed, planning_terms,  # noqa: E402
    PlanRow, bid_stats, conflicts, core_load, effective_gsa_used, gsa_check, requirement_progress, suggest_bids,
    units_by_term, week_review,
)
from rules import (  # noqa: E402
    AUCTION, AUCTION_DATES, CALENDAR, CALENDAR_ENDS, CORE_COURSES, DEGREE, GLOBAL_WEEKS, GRADING, GSA_DAYS, GSR_OPTIONS, LDR, PASS_FAIL_CAP_UNITS,
    SOURCES, auction_applies, calendar_end, calendar_for, gsr_courses,
)
from safety import screen_input, spent_today  # noqa: E402
from seed import seed_sample_bids  # noqa: E402

def _reload_catalog() -> None:
    """New live-feed data landed: rebuild the catalog so the next request sees it."""
    get_catalog.cache_clear()
    get_catalog()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    if storage_info()["ephemeral"]:
        logging.getLogger("uvicorn.error").warning(
            "DATABASE_URL is not set on a hosted platform: accounts are stored on a disk that is wiped on every "
            "deploy or restart. Set DATABASE_URL to a Postgres URL (e.g. Neon) before inviting anyone.")
    get_catalog()
    som_feed.start_refresher(LIVE_PATH, CATALOG_PATH, _reload_catalog)
    seed_sample_bids()
    auth.purge_expired_sessions()
    yield


DbId = Annotated[int, Path(ge=1, le=2**31 - 1)]  # ids beyond a DB integer are a clean 422, not a 500

# On Render the interactive API docs are off (they'd list every endpoint publicly); locally they stay at /docs.
_docs = {} if not config.ON_HOSTED_PLATFORM else {"docs_url": None, "redoc_url": None, "openapi_url": None}
app = FastAPI(title="Plan with Dan", version="1.0.0", lifespan=lifespan, **_docs)
app.state.limiter = limiter
app.add_middleware(GZipMiddleware, minimum_size=1024)  # the catalog is ~860 KB of JSON; gzip makes it ~10x smaller
MAX_BODY_BYTES = 1_000_000  # every legitimate request body is tiny; this stops memory-exhaustion uploads


class _RedactCalendarTokens(logging.Filter):
    """Calendar feed URLs (/cal/<token>.ics) are private: keep the token out of access logs."""
    _rx = re.compile(r"/cal/[^\s\"?]+")

    def filter(self, record: logging.LogRecord) -> bool:
        if record.args and isinstance(record.args, tuple):
            record.args = tuple(self._rx.sub("/cal/[redacted].ics", a) if isinstance(a, str) else a for a in record.args)
        elif isinstance(record.msg, str):
            record.msg = self._rx.sub("/cal/[redacted].ics", record.msg)
        return True


logging.getLogger("uvicorn.access").addFilter(_RedactCalendarTokens())


@app.exception_handler(RateLimitExceeded)
async def _rate_limited(_request: Request, _exc: RateLimitExceeded):
    return JSONResponse({"detail": "Too many attempts. Wait a minute and try again."}, status_code=429)


# The Vite dev server (npm run dev) proxies /api from another port; production is same-origin.
# *.localhost names always resolve to this machine (RFC 6761); they give parallel dev/QA browser sessions their own cookies.
DEV_ORIGINS = re.compile(r"^http://(127\.0\.0\.1|([a-z0-9-]+\.)?localhost):51\d\d$")  # Vite dev ports; only honoured when the app itself runs on localhost
TRUST_PROXY = os.getenv("TRUST_PROXY", "").lower() in ("1", "true", "yes")  # set on Render, which adds X-Forwarded-Host
CSP = ("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
       "font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; "
       "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'")


@app.middleware("http")
async def guard_requests(request: Request, call_next):
    """CSRF defence for cookie auth: unsafe API calls must come from our own origin. Also caps request bodies."""
    try:
        too_big = int(request.headers.get("content-length") or 0) > MAX_BODY_BYTES
    except ValueError:
        too_big = True
    if too_big or (request.headers.get("transfer-encoding", "").lower() == "chunked" and request.url.path.startswith("/api/")):
        return JSONResponse({"detail": "Request too large."}, status_code=413)
    if request.method not in ("GET", "HEAD", "OPTIONS") and request.url.path.startswith("/api/"):
        origin = request.headers.get("origin")
        host = (request.headers.get("x-forwarded-host") if TRUST_PROXY else None) or request.headers.get("host", "")
        local = host.split(":")[0] in ("localhost", "127.0.0.1")
        if origin and origin.split("://", 1)[-1] != host and not (local and DEV_ORIGINS.match(origin)):
            return JSONResponse({"detail": "Cross-site request blocked."}, status_code=403)
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "same-origin")
    response.headers.setdefault("X-Frame-Options", "DENY")
    if not request.url.path.startswith(("/docs", "/redoc", "/openapi.json")):
        response.headers.setdefault("Content-Security-Policy", CSP)
    if config.ON_HOSTED_PLATFORM:
        response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    # Caching: built files have a content hash in their name, so browsers (and Cloudflare in front of Render) can keep
    # them for a year; the HTML shell must always be re-checked so a new deploy shows up; the course catalog only
    # changes when SOM's feed is refreshed, so a few minutes is safe and saves the free server most of its work.
    path = request.url.path
    if path.startswith("/assets/") and response.status_code == 200:
        response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    elif path in ("/api/catalog", "/api/programs") and response.status_code == 200:
        response.headers.setdefault("Cache-Control", "public, max-age=300")
    elif not path.startswith(("/api/", "/cal/")):
        response.headers.setdefault("Cache-Control", "no-cache")
    return response


app.include_router(auth.router)
import oauth  # noqa: E402  (Continue with Google / Microsoft)
app.include_router(oauth.router)
import owner  # noqa: E402  (owner-only dashboard: sign-ups, active students, spend)
app.include_router(owner.router)


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
        "storage": storage_info(),
    }


@app.get("/api/catalog")
def catalog_all():
    cat = get_catalog()
    return {
        "terms": TERM_NAMES,
        "plan_terms": PLAN_TERMS,  # adds 2027-28: planned from this year's offerings (expected, times TBA)
        "next_year": NEXT_YEAR,
        "topics": list(TOPIC_RULES),
        "sections": [s.to_api() for s in cat.sections if s.visible],
    }


@app.get("/api/programs")
def programs_public():
    """Public: every SOM program's key rules (from the 2026-27 Bulletin) and the next academic dates."""
    today = date.today().isoformat()
    progs = []
    for code, p in PROGRAMS.items():
        if code == "MMS":
            continue
        progs.append({
            "code": code, "label": p["label"], "base": p["base"], "summary": p["summary"],
            "total_units": p.get("total_units"), "min_units": p.get("min_units"), "max_units": p.get("max_units"),
            "required": p.get("required", []), "global": p["global"], "calendar": p["calendar"],
            "sources": p["sources"], "unconfirmed": p.get("unconfirmed", []),
        })
    remaining = [{"date": d, "end": CALENDAR_ENDS.get(d, d), "title": label, "kind": kind}
                 for d, label, kind in CALENDAR if CALENDAR_ENDS.get(d, d) >= today]
    every = [{"date": d, "end": CALENDAR_ENDS.get(d, d), "title": label, "kind": kind} for d, label, kind in CALENDAR]
    auction = {**AUCTION, "dates": [{"date": d, "end": calendar_end(d), "title": label, "kind": kind}
                                    for d, label, kind in AUCTION_DATES]}
    return {"programs": progs, "mba": _mba_requirements(), "auction": auction, "upcoming": remaining[:6], "dates": remaining,
            "calendar": every,
            "today": today,
            "data_as_of": _data_as_of(),
            "calendar_note": "Dates are the shared MBA, MAM and MMS calendar. The MBA for Executives and MMS-PEM run on their own calendars."}


def _mba_requirements() -> dict:
    """MBA-only rules for the home page's Requirements tab: Leadership Distribution, Global Studies (with the
    catalog courses that count for each option this year) and grading. All from the 2026-27 Bulletin."""
    cat = get_catalog()

    def course(off) -> dict:
        s = off.lead
        return {"key": off.key, "number": s.number, "title": s.title, "term": TERM_NAMES.get(s.term, s.term),
                "units": s.units}

    matches = gsr_courses(cat)
    gsr = [{"key": o["key"], "name": o["name"], "units": o["units"], "gsa_days": o["gsa_days"], "timing": o["timing"],
            "enrol": o["enrol"], "cost": o["cost"], "is_course": bool(o["match"]),
            "courses": sorted((course(cat.offerings[k]) for k in matches.get(o["key"], []) if k in cat.offerings),
                              key=lambda c: (c["term"] != "Fall 2026", c["number"]))}
           for o in GSR_OPTIONS]
    ldr = sorted((course(off) for off in cat.offerings.values()
                  if off.sections_for(None) and any(sec.counts_for_ldr for sec in off.sections)),
                 key=lambda c: (c["term"] != "Fall 2026", c["number"]))
    return {
        "ldr": {k: LDR[k] for k in ("summary", "focus", "how_flagged", "petition", "examples", "source", "focus_source")}
        | {"courses": ldr},
        "gsr": gsr, "gsa_days": GSA_DAYS, "gsr_source": SOURCES["gsr"], "gsr_funding_source": SOURCES["gsr_funding"],
        "grading": GRADING, "pass_fail_cap": PASS_FAIL_CAP_UNITS, "grading_source": SOURCES["requirements"],
    }


def _data_as_of() -> str:
    """When the course data was last refreshed from SOM's public feed."""
    stamp = ROOT / "data" / "last_updated.json"
    feed = data_path()
    dates = []
    try:
        dates.append(json.loads(stamp.read_text()).get("refreshed", ""))
    except (OSError, ValueError):
        pass
    if feed.exists():
        dates.append(datetime.fromtimestamp(feed.stat().st_mtime).date().isoformat())
    return max([d for d in dates if d] or [""])


class IcsPreviewIn(BaseModel):
    course_ids: list[str] = Field(max_length=40)  # both terms of core plus electives


@app.post("/api/ics/preview")
@limiter.limit("10/minute")
def ics_preview(request: Request, body: IcsPreviewIn):
    """Public: download the week built on the home page as a calendar file (nothing is stored)."""
    cat = get_catalog()
    secs = [cat.by_id[i] for i in body.course_ids if i in cat.by_id]
    data = build_calendar(secs, owner="visitor", include_deadlines=True)
    return Response(data, media_type="text/calendar; charset=utf-8",
                    headers={"Content-Disposition": 'attachment; filename="my-som-week.ics"'})


@app.post("/api/calendar/preview")
@limiter.limit("30/minute")
def calendar_preview(request: Request, body: IcsPreviewIn):
    """Public: every class meeting of the week built on the home page, for the Dates tab's month calendar.
    Same meetings as the calendar file; nothing is stored."""
    cat = get_catalog()
    classes = []
    for sid in body.course_ids:
        s = cat.by_id.get(sid)
        if not s or not s.meeting:
            continue
        for d in meeting_dates(s):
            classes.append({"date": d.isoformat(), "start_min": s.meeting.start, "end_min": s.meeting.end,
                            "title": f"{s.number} {s.title}", "room": s.room, "course_id": s.id})
    return {"classes": classes}


@app.get("/api/starter-week")
def starter_week(program: str = "MBA", year: str = "", cohort: str = "", term: str = "202701"):
    """Public: the courses SOM already decides for this student (core or required), where official data exists.

    Used by the home page week builder, so a visitor sees their real week before adding electives.
    """
    if program not in PROGRAMS or term not in TERM_NAMES or year not in ("", "1", "2", "admit"):
        raise HTTPException(422, "Unknown program, year or term.")
    cat = get_catalog()
    prog = PROGRAMS.get(program, PROGRAMS["MBA"])
    today = date.today()
    ids: list[str] = []
    notes: list[str] = []
    done: dict = {}  # core this cohort has already finished this term (Fall-1), keyed by course number

    def live(sec) -> bool:
        return sec.visible and not sec.ended(today)

    if prog["base"] == "MBA" and year == "admit":
        # Admitted, not yet enrolled: show a real first-year week as an example (cohorts are assigned at orientation).
        example = cohort or "Gold"
        ids += [x.id for x in cat.cohort_core("202603", example)]
        notes.append(f"Example: the Fall 2026 first-year core for the {example} cohort. Your cohort and sections "
                     "are assigned at orientation; electives come later.")
        return {"program": program, "term": "202603", "ids": list(dict.fromkeys(ids)), "notes": notes, "example": True}
    if prog["base"] == "MBA":
        if year == "1":
            mine = cat.cohort_core(term, cohort)
            ids += [x.id for x in mine if not x.ended(today)]
            done.update({x.number: x for x in mine if x.ended(today)})
            season = "fall" if term == "202603" else "spring"
            if not cohort:
                notes.append(f"Pick your cohort to see your {season} core sections.")
            elif done:
                notes.append(f"{season.title()}-1 core is done and delivered ({', '.join(sorted(done))}); its "
                             f"{sum(x.units for x in done.values()):g} units count toward this term. "
                             f"Your {season.title()}-2 core is on the grid.")
            elif mine:
                notes.append(f"{season.title()} core for the {cohort} cohort, from SOM's course feed.")
            else:
                units = core_load({"program": program, "year": "1"}, term, cat)["units"]
                notes.append(f"Your {units:g} units of {season} core count automatically, but SOM hasn't published "
                             "their times by cohort, so they aren't on the grid. Add electives below.")
        elif year == "2":
            notes.append("Second year is all electives: search and add below.")
        else:
            notes.append("Pick your year to see what SOM schedules for you.")
    elif prog["base"] == "EMBA":
        if year == "1":
            ids += [s.id for s in cat.sections if s.term == term and s.core_for("EMBA") and live(s)]
            notes.append("Your EMBA core for this term. SOM's public feed doesn't list EMBA meeting times "
                         "(classes run on alternating Friday/Saturday weekends), so they show as a list, not on the grid.")
        else:
            notes.append("Search EMBA electives below. EMBA classes meet on alternating Friday/Saturday weekends.")
    elif prog.get("required"):
        for req in prog["required"]:
            if req["term"] != term:
                continue
            for o in cat.offering_for_number(req["number"], term):
                secs = [x for x in o.sections_for(program, today)]
                if secs:
                    ids.append(secs[0].id)
        missing = [r["number"] for r in prog["required"] if r["term"] == term
                   and not cat.offering_for_number(r["number"], term)]
        if not any(r["term"] == term for r in prog["required"]):
            notes.append(f"No required {prog['label']} courses this term: add electives below.")
        else:
            notes.append(f"Required {prog['label']} courses for this term."
                         + (f" Not in SOM's public feed: {', '.join(missing)}." if missing else ""))
    else:
        notes.append("Nothing is pre-scheduled for your program here. Search and add courses below.")
    ids = list(dict.fromkeys(ids))
    # Core that counts but can't be placed: the cohort isn't picked, or SOM hasn't mapped it yet.
    untimed = 0
    if prog["base"] == "MBA" and year == "1" and not ids and not done:
        untimed = core_load({"program": program, "year": year}, term, cat)["units"]
    return {"program": program, "term": term, "ids": ids, "notes": notes, "untimed_units": untimed,
            "done_units": sum(x.units for x in done.values()),
            "done": [{"number": x.number, "title": x.title, "units": x.units} for x in done.values()]}


# ------------------------------------------------------------------ profile

class PrefsIn(BaseModel):
    no_before: Optional[int] = Field(None, ge=0, le=24 * 60)
    fridays_free: bool = False
    avoid_days: list[Literal["M", "T", "W", "Th", "F"]] = Field(default_factory=list, max_length=5)


class ProfileIn(BaseModel):
    program: str = Field("MBA", max_length=12)
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
    saved = db.get(Profile, user.id)
    p = saved or Profile(user_id=user.id)
    # updated_at: when the student last saved their profile (goals included); the Course explorer uses it to
    # suggest a quick review when goals are stale. Kept outside "profile" so a PUT round-trip never sends it back.
    return {"profile": p.as_dict(), "user": auth.public_user(user),
            "updated_at": saved.updated_at.isoformat() if saved and saved.updated_at else None}


@app.put("/api/profile")
def put_profile(body: ProfileIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if body.program not in PROGRAM_CODES:
        raise HTTPException(422, "Pick your program from the list.")
    for label, text in (("background", body.background), ("short-term goal", body.goal_short), ("long-term goal", body.goal_long)):
        screen = screen_input(text) if text.strip() else None
        if screen is not None and not screen.allowed:
            log_audit(db, "profile_text_blocked", user_id=user.id, field=label, reasons=screen.reasons)
            raise HTTPException(422, f"Your {label} reads like an instruction to the AI. Describe it in plain words instead.")
    p = db.get(Profile, user.id) or Profile(user_id=user.id)
    year = body.year if body.year in ("", "1", "2", "admit") else body.year[:2]  # "admit" was being cut to "ad"
    p.program, p.year, p.cohort, p.class_year = body.program, year, body.cohort[:10], body.class_year[:6]
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
    # plan this course for next year (an expected offering): course_id is this year's section in the same quarter
    target_term: Optional[Literal["202703", "202801"]] = None


class PlanPatch(BaseModel):
    status: Optional[Literal["planned", "bidding", "enrolled", "completed"]] = None
    bid_points: Optional[int] = Field(None, ge=0, le=5000)
    clear_bid: bool = False
    course_id: Optional[str] = None  # switch section


def _plan_rows(db: Session, user_id: int) -> tuple[list[PlanItem], list[PlanRow]]:
    cat = get_catalog()
    items = db.exec(select(PlanItem).where(PlanItem.user_id == user_id).order_by(PlanItem.id)).all()
    rows = [PlanRow(project(cat.by_id[i.course_id], i.target_term) if i.target_term else cat.by_id[i.course_id], i.status)
            for i in items if i.course_id in cat.by_id]
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
        shown = project(sec, i.target_term) if i.target_term else sec
        out_items.append({
            "id": i.id, "status": i.status, "bid_points": i.bid_points, "added_by": i.added_by,
            "target_term": i.target_term or None, "expected": bool(i.target_term),
            "section": shown.to_api(),
            "other_sections": [] if i.target_term else [s.to_api() for s in cat.offerings[sec.offering_key].sections_for(program)
                                                       if s.id != sec.id],
            "google_link": None if i.target_term else google_template_link(sec),
        })
    by_term: dict[str, dict] = {}
    plannable = planning_terms(profile)
    terms = {r.section.term for r in rows} | ({"202701"} if profile.get("year") == "1" else set()) | set(plannable)
    for term in sorted(terms):
        secs = [r.section for r in rows if r.section.term == term]
        core = core_load(profile, term, cat)
        everything = secs + core["sections"]
        season = "fall" if term.endswith("03") else "spring"
        quarters = []
        for half in ("1", "2"):
            key = f"{season}-{half}"
            in_q = [x for x in everything if x.session == key]
            quarters.append({"key": key, "label": quarter_label(key, term), "units": round(sum(x.units for x in in_q), 1),
                             "courses": [x.number for x in in_q]})
        full = [x for x in everything if x.session == season]
        by_term[term] = {
            "name": term_name(term),
            "units": sum(s.units for s in secs) + core["units"],
            "elective_units": sum(s.units for s in secs),
            "core_units": core["units"],
            "core_times_known": core["times_known"],
            "conflicts": conflicts(secs + core["sections"]),
            "review": week_review(secs + core["sections"]),
            # SOM terms have two quarters (sessions); full-term courses run through both
            "quarters": quarters,
            "full_term": {"units": round(sum(x.units for x in full), 1), "courses": [x.number for x in full]},
            "expected": term not in TERM_NAMES,  # 2027-28: courses are expected from this year's offerings
            "plannable": term in plannable,
        }
    return {
        "items": out_items,
        "terms": by_term,
        "planning_terms": [{"code": t, "name": term_name(t), "expected": t not in TERM_NAMES} for t in plannable],
        "progress": _with_empty_terms(requirement_progress(profile, rows, cat, _globals(db, user.id)), profile, plannable),
    }


def _check_section_allowed(db: Session, user_id: int, sec, status: str = "planned") -> None:
    """Students can only plan sections open to their program that haven't already ended."""
    program = (db.get(Profile, user_id) or Profile(user_id=user_id)).program or "MBA"
    if not sec.open_to(program):
        raise HTTPException(400, f"Section {sec.section} of {sec.number} is only open to {', '.join(sec.programs)} students.")
    if status == "completed" and sec.starts and sec.starts > date.today():
        raise HTTPException(400, f"{sec.number} hasn't started yet, so it can't be completed.")
    if sec.ended() and status != "completed":
        raise HTTPException(400, f"{sec.number} section {sec.section} has already ended. Mark it completed instead.")
    # Under way and past its ~1-week add/drop: you can't newly plan or bid on it, but if you're taking it, add it
    # as enrolled so it shows on your week and calendar.
    if status in ("planned", "bidding") and add_drop_closed(sec):
        raise HTTPException(400, f"{sec.number} is already in session and add/drop has closed. "
                                 "If you're taking it, add it as enrolled.")


def _log_action(db: Session, user_id: int, action: str, summary: str, payload: dict, by: str = "student") -> int:
    entry = ActionLog(user_id=user_id, action=action, summary=summary, payload=json.dumps(payload), by=by)
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry.id


_user_locks: dict[int, threading.Lock] = {}
_user_locks_guard = threading.Lock()


@contextmanager
def _one_at_a_time(user_id: int):
    """Serialise a student's add/save requests: a double-click arrives as two concurrent requests, and without
    this both pass the "already added?" check before either inserts (duplicate rows, double-counted units)."""
    with _user_locks_guard:
        lock = _user_locks.setdefault(user_id, threading.Lock())
    with lock:
        yield


@app.post("/api/plan")
def add_plan(body: PlanIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    with _one_at_a_time(user.id):
        return _add_plan(body, user, db)


def _add_plan(body: PlanIn, user: User, db: Session):
    cat = get_catalog()
    sec = cat.by_id.get(body.course_id)
    if not sec:
        raise HTTPException(404, "That course isn't in the catalog.")
    if body.target_term:
        return _add_expected(body, user, db, sec)
    _check_section_allowed(db, user.id, sec, body.status)
    existing = db.exec(select(PlanItem).where(PlanItem.user_id == user.id)).all()
    for item in existing:
        if item.target_term:
            continue  # next year's plan is separate from this year's sections
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
    action_id = _log_action(db, user.id, "add", f"Added {sec.number} {sec.title}", {"item_id": item.id, "course_id": sec.id},
                            body.added_by)
    _, rows = _plan_rows(db, user.id)
    clashes = [c for c in conflicts([r.section for r in rows if r.section.term == sec.term]) if sec.id in (c["a_id"], c["b_id"])]
    return {"ok": True, "id": item.id, "clashes": clashes, "action_id": action_id}


def _with_empty_terms(progress: dict, profile: dict, plannable: list[str]) -> dict:
    """Every plannable term gets a unit check, even one with nothing planned yet (e.g. an empty Spring 2028)."""
    have = {t["term"] for t in progress.get("terms", [])}
    for term in plannable:
        if term not in have:
            minimum, cap = min_units(profile, term), max_units(profile)
            progress.setdefault("terms", []).append({"term": term, "units": 0.0, "core_units": 0.0,
                                                     "status": "low" if minimum else "ok", "min_applies": minimum is not None,
                                                     "min_units": minimum, "max_units": cap})
    progress["terms"] = sorted(progress.get("terms", []), key=lambda t: t["term"])
    return progress


def _add_expected(body: PlanIn, user: User, db: Session, sec: Section) -> dict:
    """Plan a course for 2027-28 from this year's offering in the same quarter (an expected course, times TBA)."""
    cat = get_catalog()
    profile = (db.get(Profile, user.id) or Profile(user_id=user.id)).as_dict()
    target = body.target_term
    if target not in planning_terms(profile):
        raise HTTPException(400, "Your program ends in May 2027, so there's no 2027–28 term to plan.")
    if NEXT_YEAR.get(sec.term) != target:
        raise HTTPException(422, f"{sec.number} runs in {quarter_label(sec.session, sec.term)}, so plan it for "
                                 f"{term_name(NEXT_YEAR.get(sec.term, target))}.")
    if not sec.open_to(profile.get("program") or "MBA"):
        raise HTTPException(400, f"{sec.number} isn't open to {profile.get('program') or 'MBA'} students.")
    if sec.any_core:
        raise HTTPException(400, f"{sec.number} is core: SOM assigns it, so there's nothing to plan.")
    existing = db.exec(select(PlanItem).where(PlanItem.user_id == user.id)).all()
    for item in existing:
        other = cat.by_id.get(item.course_id)
        if other and other.number == sec.number:
            if item.target_term == target:
                return {"ok": True, "id": item.id, "unchanged": True}
            when = term_name(item.target_term or other.term)
            raise HTTPException(400, f"{sec.number} is already in your plan for {when}.")
    if len(existing) >= 60:
        raise HTTPException(400, "Your plan is full (60 courses).")
    item = PlanItem(user_id=user.id, course_id=sec.id, status="planned", added_by=body.added_by, target_term=target)
    db.add(item)
    db.commit()
    db.refresh(item)
    action_id = _log_action(db, user.id, "add", f"Planned {sec.number} {sec.title} for {term_name(target)} (expected)",
                            {"item_id": item.id, "course_id": sec.id, "target_term": target}, body.added_by)
    return {"ok": True, "id": item.id, "clashes": [], "action_id": action_id, "expected": True}


@app.patch("/api/plan/{item_id}")
def patch_plan(item_id: DbId, body: PlanPatch, user: User = Depends(current_user), db: Session = Depends(get_db)):
    item = db.get(PlanItem, item_id)
    if not item or item.user_id != user.id:
        raise HTTPException(404, "Not in your plan.")
    cat = get_catalog()
    if body.status is None and body.bid_points is None and not body.course_id and not body.clear_bid:
        raise HTTPException(400, "Nothing to change.")
    before = {"status": item.status, "bid_points": item.bid_points, "course_id": item.course_id}
    if item.target_term and ((body.status and body.status != "planned") or body.course_id):
        raise HTTPException(400, "Next year's courses stay planned until SOM publishes 2027–28 sections.")
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
def delete_plan(item_id: DbId, user: User = Depends(current_user), db: Session = Depends(get_db)):
    item = db.get(PlanItem, item_id)
    if not item or item.user_id != user.id:
        raise HTTPException(404, "Not in your plan.")
    sec = get_catalog().by_id.get(item.course_id)
    payload = {"course_id": item.course_id, "status": item.status, "bid_points": item.bid_points, "added_by": item.added_by,
               "target_term": item.target_term}
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
def undo_action(action_id: DbId, user: User = Depends(current_user), db: Session = Depends(get_db)):
    a = db.get(ActionLog, action_id)
    if not a or a.user_id != user.id:
        raise HTTPException(404, "Nothing to undo.")
    if a.undone:
        return {"ok": True, "already": True}
    data = json.loads(a.payload or "{}")
    if a.action == "add":
        item = db.get(PlanItem, data.get("item_id"))
        # ids can be reused after a delete (SQLite), so check it's still the course this action added
        if (not item or item.user_id != user.id
                or ("course_id" in data and item.course_id != data["course_id"])):
            return {"ok": False, "detail": "That course is no longer in your plan, so there's nothing to undo."}
        db.delete(item)
    elif a.action == "remove":
        cat = get_catalog()
        sec = cat.by_id.get(data.get("course_id", ""))
        current = db.exec(select(PlanItem).where(PlanItem.user_id == user.id)).all()
        if not sec:
            raise HTTPException(404, "That course is no longer in the catalog.")
        target = data.get("target_term", "")
        if any((cat.by_id.get(i.course_id) or sec).offering_key == sec.offering_key and (i.target_term or "") == target
               for i in current if i.course_id in cat.by_id):
            return {"ok": False, "detail": f"{sec.number} is already back in your plan."}
        if len(current) >= 60:
            raise HTTPException(400, "Your plan is full (60 courses).")
        db.add(PlanItem(user_id=user.id, course_id=sec.id, status=data.get("status", "planned"),
                        bid_points=data.get("bid_points"), added_by=data.get("added_by", "student"),
                        target_term=data.get("target_term", "")))
    elif a.action == "event_add":
        ev = db.get(PersonalEvent, data.get("event_id"))
        if not ev or ev.user_id != user.id or ("title" in data and (ev.title, ev.date) != (data["title"], data.get("date"))):
            return {"ok": False, "detail": "That appointment is already gone."}
        db.delete(ev)
    elif a.action == "event_remove":
        fields = {k: data[k] for k in ("title", "date", "start_min", "end_min", "location", "note") if k in data}
        db.add(PersonalEvent(user_id=user.id, **fields))
    elif a.action in ("switch", "update"):
        item = db.get(PlanItem, data.get("item_id"))
        if item and item.user_id == user.id and (a.action != "switch" or item.course_id == data.get("to")):
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
    with _one_at_a_time(user.id):
        return _add_global(body, user, db)


def _add_global(body: GlobalIn, user: User, db: Session):
    row = db.exec(select(GlobalChoice).where(GlobalChoice.user_id == user.id, GlobalChoice.option_key == body.option_key)).first()
    row = row or GlobalChoice(user_id=user.id, option_key=body.option_key)
    row.target_term, row.status, row.note = body.target_term, body.status, body.note
    db.add(row)
    db.commit()
    return {"ok": True}


@app.delete("/api/global/{option_key}")
def delete_global(option_key: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    for row in db.exec(select(GlobalChoice).where(GlobalChoice.user_id == user.id, GlobalChoice.option_key == option_key)).all():
        db.delete(row)  # all of them: older double-clicks may have left two
    db.commit()
    return {"ok": True}


# ------------------------------------------------------------------ shortlist and compare

def _shortlist_rows(db: Session, user_id: int) -> list[ShortlistItem]:
    return db.exec(select(ShortlistItem).where(ShortlistItem.user_id == user_id)
                   .order_by(ShortlistItem.rank, ShortlistItem.id)).all()


@app.get("/api/shortlist")
def get_shortlist(user: User = Depends(current_user), db: Session = Depends(get_db)):
    cat = get_catalog()
    _, rows = _plan_rows(db, user.id)
    profile = (db.get(Profile, user.id) or Profile(user_id=user.id)).as_dict()
    items = [{"id": r.id, "key": r.course_key, "note": r.note, "rank": r.rank} for r in _shortlist_rows(db, user.id)]
    numbers = {cat.offering(i["key"]).lead.number for i in items if cat.offering(i["key"])}
    reports: dict[str, list[dict]] = {}
    for rep in db.exec(select(BidReport).where(BidReport.course_number.in_(numbers))).all() if numbers else []:
        reports.setdefault(rep.course_number, []).append(rep.model_dump())
    return {"items": compare_shortlist(profile, rows, cat, items, reports), "max": MAX_SHORTLIST}


class ShortlistIn(BaseModel):
    key: str = Field(max_length=200)


@app.post("/api/shortlist")
def add_shortlist(body: ShortlistIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    with _one_at_a_time(user.id):
        return _add_shortlist(body, user, db)


def _add_shortlist(body: ShortlistIn, user: User, db: Session):
    cat = get_catalog()
    if not cat.offering(body.key):
        raise HTTPException(404, "That course isn't in SOM's course list.")
    rows = _shortlist_rows(db, user.id)
    if any(r.course_key == body.key for r in rows):
        return {"ok": True, "already": True, "count": len(rows)}
    if len(rows) >= MAX_SHORTLIST:
        raise HTTPException(400, f"Your shortlist is full ({MAX_SHORTLIST}). Remove one to add another.")
    db.add(ShortlistItem(user_id=user.id, course_key=body.key, rank=len(rows)))
    db.commit()
    return {"ok": True, "count": len(rows) + 1}


class ShortlistPatch(BaseModel):
    note: Optional[str] = Field(None, max_length=500)
    order: Optional[list[int]] = Field(None, max_length=MAX_SHORTLIST)  # shortlist item ids, most wanted first


@app.patch("/api/shortlist")
def reorder_shortlist(body: ShortlistPatch, user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = {r.id: r for r in _shortlist_rows(db, user.id)}
    for rank, item_id in enumerate(body.order or []):
        if item_id in rows:
            rows[item_id].rank = rank
            db.add(rows[item_id])
    db.commit()
    return {"ok": True}


@app.patch("/api/shortlist/{item_id}")
def note_shortlist(item_id: DbId, body: ShortlistPatch, user: User = Depends(current_user), db: Session = Depends(get_db)):
    row = db.get(ShortlistItem, item_id)
    if not row or row.user_id != user.id:
        raise HTTPException(404, "Not in your shortlist.")
    if body.note is not None:
        row.note = body.note.strip()
    db.add(row)
    db.commit()
    return {"ok": True}


@app.delete("/api/shortlist/{item_id}")
def remove_shortlist(item_id: DbId, user: User = Depends(current_user), db: Session = Depends(get_db)):
    row = db.get(ShortlistItem, item_id)
    if not row or row.user_id != user.id:
        raise HTTPException(404, "Not in your shortlist.")
    db.delete(row)
    db.commit()
    return {"ok": True}


# ------------------------------------------------------------------ personal events (booked appointments)

def _personal_events(db: Session, user_id: int) -> list[PersonalEvent]:
    return db.exec(select(PersonalEvent).where(PersonalEvent.user_id == user_id)
                   .order_by(PersonalEvent.date, PersonalEvent.start_min)).all()


def _event_dict(e: PersonalEvent) -> dict:
    return {"id": e.id, "title": e.title, "date": e.date, "start_min": e.start_min, "end_min": e.end_min,
            "location": e.location, "note": e.note}


def _event_clashes(db: Session, user_id: int, day: str, start: int, end: int) -> list[str]:
    """Classes (plan and cohort core) that meet on that day and overlap the appointment. Same overlap rule as clashes."""
    out = []
    for s, _ in _calendar_sections(db, user_id):
        if not s.meeting or max(s.meeting.start, start) >= min(s.meeting.end, end):
            continue
        if day in {d.isoformat() for d in meeting_dates(s)}:
            out.append(f"{s.number} {s.title} ({clock(s.meeting.start)}–{clock(s.meeting.end)})")
    return out


class PersonalEventIn(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    date: date

    @model_validator(mode="after")
    def _sane(self):
        if not self.title.strip():
            raise ValueError("Give the appointment a title.")
        if not (2025 <= self.date.year <= 2028):
            raise ValueError("Pick a date in this academic year.")
        return self

    start_min: int = Field(ge=0, le=24 * 60)
    end_min: int = Field(ge=0, le=24 * 60)
    location: str = Field("", max_length=200)
    note: str = Field("", max_length=300)


@app.get("/api/personal-events")
def list_personal_events(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return {"events": [_event_dict(e) for e in _personal_events(db, user.id)]}


@app.post("/api/personal-events")
def add_personal_event(body: PersonalEventIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    with _one_at_a_time(user.id):
        return _add_personal_event(body, user, db)


def _add_personal_event(body: PersonalEventIn, user: User, db: Session):
    if body.end_min <= body.start_min:
        raise HTTPException(422, "The end time needs to be after the start time.")
    title = " ".join(body.title.split())
    same = next((e for e in _personal_events(db, user.id) if e.title == title and e.date == body.date.isoformat()
                 and e.start_min == body.start_min and e.end_min == body.end_min), None)
    if same:  # a double submit: return the saved one instead of a duplicate
        return {"event": _event_dict(same), "clashes": _event_clashes(db, user.id, same.date, same.start_min, same.end_min),
                "action_id": None, "unchanged": True}
    if len(_personal_events(db, user.id)) >= 200:
        raise HTTPException(400, "You have 200 appointments saved. Delete some old ones first.")
    ev = PersonalEvent(user_id=user.id, title=" ".join(body.title.split()), date=body.date.isoformat(),
                       start_min=body.start_min, end_min=body.end_min, location=body.location.strip(), note=body.note.strip())
    db.add(ev)
    db.commit()
    db.refresh(ev)
    action_id = _log_action(db, user.id, "event_add", f"Added {ev.title} on {ev.date}",
                            {"event_id": ev.id, "title": ev.title, "date": ev.date})
    # A clash never blocks the save: the student may well be skipping a class for an interview.
    return {"event": _event_dict(ev), "clashes": _event_clashes(db, user.id, ev.date, ev.start_min, ev.end_min),
            "action_id": action_id}


@app.delete("/api/personal-events/{event_id}")
def remove_personal_event(event_id: DbId, user: User = Depends(current_user), db: Session = Depends(get_db)):
    ev = db.get(PersonalEvent, event_id)
    if not ev or ev.user_id != user.id:
        raise HTTPException(404, "Not on your calendar.")
    payload = _event_dict(ev)
    db.delete(ev)
    db.commit()
    action_id = _log_action(db, user.id, "event_remove", f"Removed {payload['title']} on {payload['date']}", payload)
    return {"ok": True, "action_id": action_id}


# ------------------------------------------------------------------ calendar

def _calendar_sections(db: Session, user_id: int) -> list[tuple[Section, str]]:
    """Everything that belongs on the student's calendar: their plan, plus the cohort core SOM assigns them
    (first-year MBAs with a cohort set), which is never in the plan because it isn't chosen or bid on."""
    _, rows = _plan_rows(db, user_id)
    out = [(r.section, r.status) for r in rows]
    profile = (db.get(Profile, user_id) or Profile(user_id=user_id)).model_dump()
    seen = {sec.id for sec, _ in out}
    for term in TERM_NAMES:
        for sec in core_load(profile, term, get_catalog())["sections"]:
            if sec.id not in seen:
                seen.add(sec.id)
                out.append((sec, "core"))
    return out


@app.get("/api/calendar/events")
def calendar_events(user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Academic dates plus every individual class meeting (plan and cohort core), for the in-app calendar."""
    classes = []
    for s, status in _calendar_sections(db, user.id):
        if not s.meeting:
            continue
        for d in meeting_dates(s):
            classes.append({"date": d.isoformat(), "start_min": s.meeting.start, "end_min": s.meeting.end,
                            "status": status,
                            "title": f"{s.number} {s.title}", "room": s.room, "course_id": s.id})
    shared = _mba_calendar(db, user.id)
    deadlines = [{"date": d, "end": calendar_end(d), "title": label, "kind": kind}
                 for d, label, kind in _dates_for(db, user.id)] if shared else []
    prog = PROGRAMS.get((db.get(Profile, user.id) or Profile(user_id=user.id)).program or "MBA", PROGRAMS["MBA"])
    note = None if shared else (f"{prog['label']} runs on its own calendar ({prog['calendar']}), so SOM's MBA/MAM/MMS "
                                f"dates aren't shown. See {prog['sources'][-1]}")
    personal = [_event_dict(e) for e in _personal_events(db, user.id)]
    return {"classes": classes, "deadlines": deadlines, "personal": personal, "today": date.today().isoformat(),
            "calendar_note": note}


def _dates_for(db: Session, user_id: int) -> list[tuple[str, str, str]]:
    """The shared academic calendar, plus the registrar's auction dates for first-year MBAs."""
    prof = db.get(Profile, user_id) or Profile(user_id=user_id)
    return calendar_for(prof.program, prof.year)


def _mba_calendar(db: Session, user_id: int) -> bool:
    """MBA, MAM and MMS (except PEM) share one academic calendar; EMBA and MMS-PEM have their own."""
    program = (db.get(Profile, user_id) or Profile(user_id=user_id)).program or "MBA"
    return PROGRAMS.get(program, PROGRAMS["MBA"])["calendar"].startswith("MBA calendar")


def _feed_urls(request: Request, user: User) -> dict:
    base = str(request.base_url).rstrip("/")
    https = f"{base}/cal/{user.cal_token}.ics"
    webcal = "webcal://" + https.split("://", 1)[1]
    return {
        "feed_url": https,
        "webcal_url": webcal,
        "google_subscribe": f"https://calendar.google.com/calendar/render?cid={quote(webcal, safe='')}",
        "outlook_subscribe": f"https://outlook.live.com/calendar/0/addfromweb?url={quote(https, safe='')}&name=Plan%20with%20Dan",
        # Yale accounts (and most work/school accounts) are Microsoft 365, which lives on outlook.office.com
        "outlook_yale_subscribe": f"https://outlook.office.com/calendar/0/addfromweb?url={quote(https, safe='')}&name=Plan%20with%20Dan",
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
    sections = [sec for sec, _ in _calendar_sections(db, user.id)]
    body = build_calendar(sections, owner=f"u{user.id}", include_deadlines=_mba_calendar(db, user.id),
                          personal=_personal_events(db, user.id), dates=_dates_for(db, user.id))
    return Response(body, media_type="text/calendar; charset=utf-8", headers={"Cache-Control": "no-cache"})


@app.get("/api/plan.ics")
def plan_download(user: User = Depends(current_user), db: Session = Depends(get_db)):
    sections = [sec for sec, _ in _calendar_sections(db, user.id)]
    body = build_calendar(sections, owner=f"u{user.id}", include_deadlines=_mba_calendar(db, user.id),
                          personal=_personal_events(db, user.id), dates=_dates_for(db, user.id))
    return Response(body, media_type="text/calendar; charset=utf-8",
                    headers={"Content-Disposition": 'attachment; filename="plan-with-dan.ics"'})


# ------------------------------------------------------------------ bids

class BidIn(BaseModel):
    course_number: str = Field(max_length=12)
    term_code: Literal["202603", "202701"]
    points_bid: int = Field(ge=0, le=2000)
    got_seat: bool
    clearing_points: Optional[int] = Field(None, ge=0, le=2000)

    @model_validator(mode="after")
    def _consistent(self):
        # a winning bid can't be below the clearing price, and a losing one can't be above it
        if self.clearing_points is not None:
            if self.got_seat and self.points_bid < self.clearing_points:
                raise ValueError("A winning bid can't be lower than the clearing price.")
            if not self.got_seat and self.points_bid > self.clearing_points:
                raise ValueError("A losing bid can't be higher than the clearing price.")
        return self


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


class VisitorTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=4000)


class VisitorContext(BaseModel):
    program: str = Field("", max_length=12)
    year: str = Field("", max_length=6)
    cohort: str = Field("", max_length=10)


class PublicChatIn(BaseModel):
    message: str = Field(max_length=2000)
    history: list[VisitorTurn] = Field(default_factory=list, max_length=12)
    context: VisitorContext = Field(default_factory=VisitorContext)


# Visitor caps: per device (a random cookie) and a looser per-IP cap, because classmates on campus Wi-Fi share an IP.
_visitor_counts: dict[str, tuple[str, int]] = {}
VISITOR_IP_CAP = PUBLIC_MESSAGES_PER_DAY * 4
# Repeated first questions (the starter chips) are answered from a short-lived cache: instant, free, uncapped.
_answer_cache: dict[str, tuple[float, dict]] = {}
ANSWER_CACHE_SECONDS = 6 * 3600


def _bump(key: str, cap: int) -> int | None:
    """Count one question for `key` today; None when it's over `cap`."""
    day = date.today().isoformat()
    seen_day, count = _visitor_counts.get(key, (day, 0))
    count = count if seen_day == day else 0
    if count >= cap:
        return None
    _visitor_counts[key] = (day, count + 1)
    return cap - count - 1


@app.post("/api/chat/public")
@limiter.limit("8/minute")
async def chat_public(request: Request, response: Response, body: PublicChatIn, db: Session = Depends(get_db)):
    """Dan for visitors who aren't signed in: no stored data, a few questions per day, a shared budget."""
    import time
    ctx = body.context
    program = ctx.program if ctx.program in PROGRAM_CODES else ""
    cache_key = ""
    if not body.history:  # a first question, e.g. a starter chip: shareable across visitors
        cache_key = f"{program}|{ctx.year}|{ctx.cohort}|{' '.join(body.message.lower().split())}"
        hit = _answer_cache.get(cache_key)
        if hit and time.time() - hit[0] < ANSWER_CACHE_SECONDS:
            return {**hit[1], "cached": True, "remaining_today": None}

    device = request.cookies.get("pwd_vid")
    if not device or len(device) > 64:
        device = secrets.token_urlsafe(16)
        response.set_cookie("pwd_vid", device, max_age=86400 * 30, httponly=True, samesite="lax",
                            secure=request.url.scheme == "https" or config.ON_HOSTED_PLATFORM)
    ip = client_ip(request)
    left = _bump(f"d:{device}", PUBLIC_MESSAGES_PER_DAY)
    if left is None or _bump(f"ip:{ip}", VISITOR_IP_CAP) is None:
        return {"answer": f"That's today's {PUBLIC_MESSAGES_PER_DAY} visitor questions. Dan resets at midnight, and the "
                          "week builder, dates and requirements on this page have no limit. A free account gets its "
                          "own daily budget.",
                "agent": None, "proposals": [], "blocked": False, "safety": ["visitor_limit"], "limited": True}
    who = [p for p in (PROGRAMS.get(program, {}).get("label") if program else "",
                       {"1": "first year", "2": "second year", "admit": "admitted, not yet enrolled"}.get(ctx.year, ""),
                       f"{ctx.cohort} cohort" if ctx.cohort else "") if p]
    message = body.message if not who else f"[I'm a {', '.join(who)} student.] {body.message}"
    result = await run_turn(db, None, message, "dan", visitor_history=[t.model_dump() for t in body.history])
    # Messages that triggered the support card are never cached, so their text isn't kept even in memory.
    if cache_key and result.get("agent") and not result.get("blocked") and not result.get("safety") and not result.get("support"):
        _answer_cache[cache_key] = (time.time(), {k: result.get(k) for k in ("answer", "agent", "proposals", "blocked", "safety", "followups")})
    return {**result, "remaining_today": left}


@app.post("/api/chat/stream")
@limiter.limit("20/minute")
async def chat_stream(request: Request, body: ChatIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return _sse(stream_turn(db, user.id, body.message, body.mode))


@app.get("/api/chat/history")
def chat_history(mode: Literal["dan", "news"] = "dan", user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.exec(select(ChatMessage).where(ChatMessage.user_id == user.id, ChatMessage.mode == mode)
                   .order_by(ChatMessage.id.desc()).limit(200)).all()
    return {"messages": [{"role": m.role, "content": m.content, "meta": json.loads(m.meta or "{}"),
                          "at": m.created_at.isoformat()} for m in reversed(rows)]}


@app.delete("/api/chat/history")
def clear_history(mode: Literal["dan", "news"] = "dan", user: User = Depends(current_user), db: Session = Depends(get_db)):
    for m in db.exec(select(ChatMessage).where(ChatMessage.user_id == user.id, ChatMessage.mode == mode)).all():
        db.delete(m)
    db.commit()
    chat_memory.new_conversation(db, user.id, mode)  # lasting facts stay; the conversation summary resets
    return {"ok": True}


@app.get("/api/chat/memory")
def get_chat_memory(user: User = Depends(current_user), db: Session = Depends(get_db)):
    mem = chat_memory.get_memory(db, user.id, "dan")
    return {"facts": chat_memory.facts_of(mem), "summary": mem.summary,
            "updated_at": mem.updated_at.isoformat() if mem.id else None}


class ForgetIn(BaseModel):
    fact: Optional[str] = Field(None, max_length=200)  # omit to forget everything


@app.post("/api/chat/memory/forget")
def forget_chat_memory(body: ForgetIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return {"facts": chat_memory.forget(db, user.id, body.fact)}


class RecommendIn(BaseModel):
    term: Literal["202603", "202701"] = "202701"


@app.post("/api/recommend")
@limiter.limit("6/minute")
async def recommend_courses(request: Request, body: RecommendIn, user: User = Depends(current_user),
                            db: Session = Depends(get_db)):
    return await recommend(db, user.id, body.term)


@app.get("/api/recommend/latest")
def latest_recommendation(user: User = Depends(current_user), db: Session = Depends(get_db)):
    row = db.exec(select(RecommendationRun).where(RecommendationRun.user_id == user.id,
                                                  RecommendationRun.term_code != PACKAGE_TERM)
                  .order_by(RecommendationRun.id.desc())).first()
    return {"result": json.loads(row.result) if row else None}


# ------------------------------------------------------------------ course package (goal → ranked, every quarter left)

class PackageIn(BaseModel):
    goal: str = Field(min_length=3, max_length=600)


@app.post("/api/package")
@limiter.limit("6/minute")
async def course_package(request: Request, body: PackageIn, user: User = Depends(current_user),
                         db: Session = Depends(get_db)):
    return await build_package(db, user.id, body.goal)


@app.get("/api/package/latest")
def latest_package(user: User = Depends(current_user), db: Session = Depends(get_db)):
    row = db.exec(select(RecommendationRun).where(RecommendationRun.user_id == user.id,
                                                  RecommendationRun.term_code == PACKAGE_TERM)
                  .order_by(RecommendationRun.id.desc())).first()
    return {"result": json.loads(row.result) if row else None}


class PackageItemIn(BaseModel):
    course_id: str = Field(max_length=40)
    target_term: Optional[Literal["202703", "202801"]] = None


class PackageApplyIn(BaseModel):
    items: list[PackageItemIn] = Field(min_length=1, max_length=20)


@app.post("/api/package/apply")
def apply_package(body: PackageApplyIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Add every course the student kept. Each goes through the same checks as a single add; one that can't be
    added (already planned, add/drop closed, ...) is reported back and skipped, never fatal."""
    cat = get_catalog()
    added, skipped, clashes = [], [], []
    with _one_at_a_time(user.id):
        for it in body.items:
            sec = cat.by_id.get(it.course_id)
            label = sec.number if sec else it.course_id
            try:
                r = _add_plan(PlanIn(course_id=it.course_id, added_by="dan", target_term=it.target_term), user, db)
            except HTTPException as exc:
                skipped.append({"number": label, "reason": str(exc.detail)})
                continue
            if r.get("unchanged"):
                skipped.append({"number": label, "reason": "already in your plan"})
                continue
            added.append({"number": label, "term": term_name(it.target_term or (sec.term if sec else "")),
                          "expected": bool(it.target_term), "action_id": r.get("action_id")})
            clashes += [c for c in r.get("clashes", []) if c not in clashes]
    return {"added": added, "skipped": skipped, "clashes": clashes}


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
                     ldr_met=prog["ldr"]["met"] or prog["ldr"]["planned"] or not prog["mba_rules"],
                     gsr_met=prog["gsr"]["met"] or prog["gsr"]["planned"] or not prog["mba_rules"],
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
    for model in (Profile, PlanItem, GlobalChoice, ChatMessage, ChatMemory, RecommendationRun, FitDismissal, ActionLog,
                  AuditEvent, DeskState, DeskBrief, ShortlistItem, PersonalEvent):
        data[model.__name__] = _rows_for(db, model, user.id)
    data["BidReport"] = _rows_for(db, BidReport, user.id)
    data["UsageLog"] = _rows_for(db, UsageLog, user.id)
    data["OAuthIdentity"] = _rows_for(db, oauth.OAuthIdentity, user.id)  # linked Google/Microsoft accounts (no tokens)
    return Response(json.dumps(data, indent=2, default=str), media_type="application/json",
                    headers={"Content-Disposition": 'attachment; filename="plan-with-dan-my-data.json"'})


class DeleteIn(BaseModel):
    password: str = Field("", max_length=200)
    confirm: str = Field("", max_length=20)  # accounts with no password (Google/Microsoft only) type DELETE


@app.post("/api/account/delete")
@limiter.limit("5/minute")
def delete_account(request: Request, response: Response, body: DeleteIn, user: User = Depends(current_user),
                   db: Session = Depends(get_db)):
    if user.password_hash:
        if not body.password or not auth.hasher.verify(body.password, user.password_hash):
            raise HTTPException(401, "That password doesn't match.")
    elif body.confirm.strip().upper() != "DELETE":
        raise HTTPException(401, "Type DELETE to confirm.")
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
