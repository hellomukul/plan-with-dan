"""Student data: accounts, profiles, plans, bids, chat, token usage, audit.

SQLite (data/app.db) by default, so a fresh clone needs no database server.
Set DATABASE_URL to a Postgres URL (e.g. Neon) for durable online storage.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Iterator, Optional

from sqlalchemy import event
from sqlmodel import Field, Session, SQLModel, create_engine

from config import DATA_DIR, DATABASE_URL


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def aware(dt: datetime) -> datetime:
    """SQLite hands datetimes back without a timezone; they were stored as UTC."""
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(index=True, unique=True)
    name: str = ""
    password_hash: str
    cal_token: str = Field(index=True)
    created_at: datetime = Field(default_factory=utcnow)


class AuthSession(SQLModel, table=True):
    token_hash: str = Field(primary_key=True)
    user_id: int = Field(index=True, foreign_key="user.id")
    expires_at: datetime
    created_at: datetime = Field(default_factory=utcnow)


class Profile(SQLModel, table=True):
    user_id: int = Field(primary_key=True, foreign_key="user.id")
    program: str = "MBA"
    year: str = ""  # "1" | "2"
    cohort: str = ""  # Gold, Silver, Blue, Green, Red
    class_year: str = ""  # e.g. "2027"
    background: str = ""  # pre-MBA industry / function
    interests: str = "[]"  # JSON list of topic tags
    goal_short: str = ""  # internship / next 12 months
    goal_long: str = ""  # 5-10 years
    completed: str = "[]"  # JSON list of course numbers already taken
    prefs: str = "{}"  # JSON: no_before, fridays_free, max_units, workload
    gsa_days_used: int = 0
    onboarded: bool = False
    updated_at: datetime = Field(default_factory=utcnow)

    def as_dict(self) -> dict[str, Any]:
        return {
            "program": self.program,
            "year": self.year,
            "cohort": self.cohort,
            "class_year": self.class_year,
            "background": self.background,
            "interests": json.loads(self.interests or "[]"),
            "goal_short": self.goal_short,
            "goal_long": self.goal_long,
            "completed": json.loads(self.completed or "[]"),
            "prefs": json.loads(self.prefs or "{}"),
            "gsa_days_used": self.gsa_days_used,
            "onboarded": self.onboarded,
        }


class PlanItem(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(index=True, foreign_key="user.id")
    course_id: str  # catalog "Course ID": one section in one term
    status: str = "planned"  # planned | bidding | enrolled | completed
    bid_points: Optional[int] = None
    added_by: str = "student"  # student | dan (accepted recommendation)
    added_at: datetime = Field(default_factory=utcnow)


class GlobalChoice(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(index=True, foreign_key="user.id")
    option_key: str  # ie | gnw | snoc | gse_india | gse_spring | exchange
    target_term: str = ""
    status: str = "considering"  # considering | applied | done
    note: str = ""
    created_at: datetime = Field(default_factory=utcnow)


class BidReport(SQLModel, table=True):
    """One reported bid outcome. Students add their own; samples are labelled."""

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: Optional[int] = Field(default=None, index=True)
    course_number: str = Field(index=True)
    course_title: str = ""
    term_code: str = ""
    points_bid: int
    got_seat: bool
    clearing_points: Optional[int] = None
    source: str = "student"  # student | sample | public
    source_url: str = ""
    created_at: datetime = Field(default_factory=utcnow)


class ChatMessage(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(index=True, foreign_key="user.id")
    mode: str = "dan"  # dan | news
    role: str  # user | assistant
    content: str
    meta: str = "{}"  # JSON: tools used, cost, blocked flags
    created_at: datetime = Field(default_factory=utcnow)


class UsageLog(SQLModel, table=True):
    """One row per model call, so the tokenomics section uses real numbers."""

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: Optional[int] = Field(default=None, index=True)
    run_id: str = Field(index=True)
    feature: str  # chat | news | recommend
    agent: str
    model: str
    requests: int = 0
    input_tokens: int = 0
    cached_tokens: int = 0
    output_tokens: int = 0
    web_searches: int = 0
    cost_usd: float = 0.0
    created_at: datetime = Field(default_factory=utcnow, index=True)


class AuditEvent(SQLModel, table=True):
    """Safety and agent events: blocked prompts, dropped hallucinations, budget stops."""

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: Optional[int] = Field(default=None, index=True)
    run_id: str = ""
    kind: str = Field(index=True)
    detail: str = "{}"
    created_at: datetime = Field(default_factory=utcnow)


class RecommendationRun(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(index=True, foreign_key="user.id")
    run_id: str
    term_code: str
    request: str = "{}"
    result: str = "{}"
    created_at: datetime = Field(default_factory=utcnow)


def _make_engine():
    url = DATABASE_URL
    if url.startswith("postgres://"):
        url = "postgresql+psycopg://" + url[len("postgres://") :]
    elif url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url[len("postgresql://") :]
    if url.startswith("sqlite"):
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        eng = create_engine(url, connect_args={"check_same_thread": False})

        @event.listens_for(eng, "connect")
        def _pragmas(conn, _record):  # pragma: no cover - sqlite tuning
            cur = conn.cursor()
            cur.execute("PRAGMA journal_mode=WAL")
            cur.execute("PRAGMA foreign_keys=ON")
            cur.close()

        return eng
    return create_engine(url, pool_pre_ping=True)


engine = _make_engine()


def init_db() -> None:
    SQLModel.metadata.create_all(engine)


def get_db() -> Iterator[Session]:
    with Session(engine) as session:
        yield session


def log_audit(db: Session, kind: str, user_id: int | None = None, run_id: str = "", **detail: Any) -> None:
    db.add(AuditEvent(user_id=user_id, run_id=run_id, kind=kind, detail=json.dumps(detail, default=str)[:4000]))
    db.commit()
