"""Owner dashboard: sign-ups, onboarding, active students, feature use and AI spend, live from the database.

Only accounts listed in OWNER_EMAILS can read it; everyone else gets a 404, so the page doesn't advertise itself.
Counts, plus each account's email for the owner. No names, chat text or plan contents leave this module.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, func, select

import config
from auth import current_user
from db import (
    ActionLog, ActivityDay, AuthSession, BidReport, ChatMessage, GlobalChoice, OAuthIdentity, PersonalEvent, PlanItem,
    Profile, RecommendationRun, ShortlistItem, UsageLog, User, aware, get_db, utcnow,
)
from programs import PROGRAMS

router = APIRouter(prefix="/api/owner", tags=["owner"])
NEW_YORK = ZoneInfo("America/New_York")
WINDOW_DAYS = 30
ACTIVE_NOW = timedelta(minutes=15)
RECENT_ROWS = 25

# Anything a signed-in student does leaves a timestamp in one of these: used to count active days from before
# ActivityDay existed, and to find each student's last activity. (table, user column, time column, extra filter)
EVENT_SOURCES = (
    (AuthSession, AuthSession.user_id, AuthSession.created_at, None),
    (OAuthIdentity, OAuthIdentity.user_id, OAuthIdentity.last_login_at, None),
    (ChatMessage, ChatMessage.user_id, ChatMessage.created_at, ChatMessage.role == "user"),
    (ActionLog, ActionLog.user_id, ActionLog.created_at, None),
    (UsageLog, UsageLog.user_id, UsageLog.created_at, UsageLog.user_id.is_not(None)),
    (RecommendationRun, RecommendationRun.user_id, RecommendationRun.created_at, None),
    (ShortlistItem, ShortlistItem.user_id, ShortlistItem.created_at, None),
    (PersonalEvent, PersonalEvent.user_id, PersonalEvent.created_at, None),
    (GlobalChoice, GlobalChoice.user_id, GlobalChoice.created_at, None),
    (Profile, Profile.user_id, Profile.updated_at, None),
)
YEAR_LABELS = {"1": "First year", "2": "Second year", "admit": "Admit (starting 2027)", "": "Not set"}


def require_owner(user: User = Depends(current_user)) -> User:
    if user.email.lower() not in config.owner_emails():
        raise HTTPException(404, "Not Found")
    return user


def _ny_day(ts: datetime) -> date:
    return aware(ts).astimezone(NEW_YORK).date()


def _where(stmt, extra):
    return stmt.where(extra) if extra is not None else stmt


@router.get("/stats")
def stats(_owner: User = Depends(require_owner), db: Session = Depends(get_db)):
    now = utcnow()
    today = now.astimezone(NEW_YORK).date()
    days = [today - timedelta(days=i) for i in range(WINDOW_DAYS - 1, -1, -1)]
    first_day = days[0]
    cutoff = datetime.combine(first_day, datetime.min.time(), NEW_YORK)
    owners = config.owner_emails()

    users = db.exec(select(User)).all()
    profiles = {p.user_id: p for p in db.exec(select(Profile)).all()}
    providers: dict[int, list[str]] = defaultdict(list)
    for o in db.exec(select(OAuthIdentity).order_by(OAuthIdentity.created_at)).all():
        providers[o.user_id].append(o.provider)

    # Active days per student (last 30 days) and last activity per student (all time).
    active_days: dict[int, set[date]] = defaultdict(set)
    last_active: dict[int, datetime] = {}

    def seen(uid: int | None, ts: datetime | None) -> None:
        if uid is None or ts is None:
            return
        ts = aware(ts)
        if uid not in last_active or ts > last_active[uid]:
            last_active[uid] = ts
        if ts >= cutoff:
            active_days[uid].add(_ny_day(ts))

    for u in users:
        seen(u.id, u.created_at)
        seen(u.id, u.last_seen_at)
    for _model, ucol, tcol, extra in EVENT_SOURCES:
        for uid, ts in db.exec(_where(select(ucol, func.max(tcol)).group_by(ucol), extra)).all():
            seen(uid, ts)
        for uid, ts in db.exec(_where(select(ucol, tcol).where(tcol >= cutoff), extra)).all():
            seen(uid, ts)
    for a in db.exec(select(ActivityDay).where(ActivityDay.day >= first_day.isoformat())).all():
        active_days[a.user_id].add(date.fromisoformat(a.day))

    def active_within(n: int) -> int:
        since = today - timedelta(days=n - 1)
        return sum(1 for u in users if any(d >= since for d in active_days.get(u.id, ())))

    # Sign-up method: email if they set a password, otherwise the first provider they used.
    def method(u: User) -> str:
        if u.password_hash or not providers.get(u.id):
            return "email"
        return providers[u.id][0]

    methods = {"email": 0, "google": 0, "microsoft": 0}
    for u in users:
        methods[method(u)] = methods.get(method(u), 0) + 1

    onboarded = {uid for uid, p in profiles.items() if p.onboarded}
    planners = set(db.exec(select(PlanItem.user_id).distinct()).all())
    ai_users = set(db.exec(select(UsageLog.user_id).where(UsageLog.user_id.is_not(None)).distinct()).all()) \
        | set(db.exec(select(ChatMessage.user_id).where(ChatMessage.role == "user").distinct()).all())
    returning = {uid for uid, ds in active_days.items() if len(ds) >= 2}
    user_ids = {u.id for u in users}

    programs: dict[str, int] = defaultdict(int)
    years: dict[str, int] = defaultdict(int)
    for uid in onboarded & user_ids:
        p = profiles[uid]
        programs[p.program] += 1
        years[p.year if p.year in YEAR_LABELS else ""] += 1

    def feature(key: str, label: str, model, extra=None) -> dict:
        count = db.exec(_where(select(func.count()).select_from(model), extra)).one()
        who = db.exec(_where(select(func.count(func.distinct(model.user_id))), extra)).one() if model is not BidReport else None
        return {"key": key, "label": label, "count": int(count or 0), "users": None if who is None else int(who or 0)}

    features = [
        feature("plan_now", "Courses planned for 2026–27", PlanItem, PlanItem.target_term == ""),
        feature("plan_next", "Courses planned for 2027–28", PlanItem, PlanItem.target_term != ""),
        feature("shortlist", "Courses starred to compare", ShortlistItem),
        feature("elihu", "Elihu course searches", RecommendationRun),
        feature("dan", "Questions to Dan", ChatMessage, (ChatMessage.role == "user") & (ChatMessage.mode == "dan")),
        feature("news", "AI news questions", ChatMessage, (ChatMessage.role == "user") & (ChatMessage.mode == "news")),
        feature("global", "Global Studies choices", GlobalChoice),
        feature("bookings", "Appointments on calendars", PersonalEvent),
        feature("bids", "Bid outcomes reported", BidReport, BidReport.source == "student"),
    ]

    # AI spend (signed-in students, plus visitors on the landing page chat).
    def spend_since(since: datetime | None) -> tuple[float, int]:
        stmt = select(func.sum(UsageLog.cost_usd), func.count(func.distinct(UsageLog.run_id)))
        if since is not None:
            stmt = stmt.where(UsageLog.created_at >= since)
        cost, runs = db.exec(stmt).one()
        return round(float(cost or 0), 6), int(runs or 0)

    start_today = datetime.combine(today, datetime.min.time(), NEW_YORK)
    spend = {}
    for key, since in (("today", start_today), ("d7", start_today - timedelta(days=6)), ("d30", cutoff), ("all", None)):
        cost, runs = spend_since(since)
        spend[key] = {"usd": cost, "runs": runs}

    # Daily series for the chart.
    signups_by_day: dict[date, int] = defaultdict(int)
    for u in users:
        if aware(u.created_at) >= cutoff:
            signups_by_day[_ny_day(u.created_at)] += 1
    active_by_day: dict[date, int] = defaultdict(int)
    for ds in active_days.values():
        for d in ds:
            active_by_day[d] += 1
    questions_by_day: dict[date, int] = defaultdict(int)
    for ts in db.exec(select(ChatMessage.created_at).where(ChatMessage.role == "user", ChatMessage.created_at >= cutoff)).all():
        questions_by_day[_ny_day(ts)] += 1
    cost_by_day: dict[date, float] = defaultdict(float)
    for ts, cost in db.exec(select(UsageLog.created_at, UsageLog.cost_usd).where(UsageLog.created_at >= cutoff)).all():
        cost_by_day[_ny_day(ts)] += cost or 0
    daily = [{"date": d.isoformat(), "signups": signups_by_day[d], "active": active_by_day[d],
              "questions": questions_by_day[d], "cost_usd": round(cost_by_day[d], 6)} for d in days]

    # Anonymous per-student rows, newest first.
    plan_counts = dict(db.exec(select(PlanItem.user_id, func.count()).group_by(PlanItem.user_id)).all())
    question_counts = dict(db.exec(select(ChatMessage.user_id, func.count()).where(ChatMessage.role == "user")
                                   .group_by(ChatMessage.user_id)).all())
    recent = []
    for u in sorted(users, key=lambda x: aware(x.created_at), reverse=True)[:RECENT_ROWS]:
        p = profiles.get(u.id)
        recent.append({
            "label": f"Student {u.id}",
            "email": u.email,
            "you": u.email.lower() in owners,
            "joined": aware(u.created_at).isoformat(),
            "method": method(u),
            "program": PROGRAMS.get(p.program, {}).get("label", p.program) if p else "",
            "year": YEAR_LABELS.get(p.year, p.year) if p else "",
            "onboarded": bool(p and p.onboarded),
            "last_active": last_active[u.id].isoformat() if u.id in last_active else None,
            "active_days": len(active_days.get(u.id, ())),
            "plan_items": int(plan_counts.get(u.id, 0)),
            "questions": int(question_counts.get(u.id, 0)),
        })

    total = len(users)
    return {
        "generated_at": now.isoformat(),
        "timezone": "America/New_York",
        "window_days": WINDOW_DAYS,
        "totals": {
            "users": total,
            "onboarded": len(onboarded & user_ids),
            "new_today": signups_by_day[today],
            "new_7d": sum(signups_by_day[d] for d in days[-7:]),
            "active_now": sum(1 for u in users if u.last_seen_at and now - aware(u.last_seen_at) <= ACTIVE_NOW),
            "active_today": active_within(1),
            "active_7d": active_within(7),
            "active_30d": active_within(WINDOW_DAYS),
        },
        "funnel": [
            {"key": "signed_up", "label": "Signed up", "count": total},
            {"key": "onboarded", "label": "Finished setup", "count": len(onboarded & user_ids)},
            {"key": "planned", "label": "Planned a course", "count": len(planners & user_ids)},
            {"key": "used_ai", "label": "Used Dan or Elihu", "count": len(ai_users & user_ids)},
            {"key": "returned", "label": "Came back another day", "count": len(returning & user_ids)},
        ],
        "methods": methods,
        "programs": sorted(({"key": k, "label": PROGRAMS.get(k, {}).get("label", k), "count": v} for k, v in programs.items()),
                           key=lambda r: -r["count"]),
        "years": [{"key": k, "label": YEAR_LABELS[k], "count": years[k]} for k in YEAR_LABELS if years.get(k)],
        "features": features,
        "spend": {**spend, "daily_cap_per_student_usd": config.DAILY_BUDGET_USD},
        "daily": daily,
        "recent": recent,
    }
