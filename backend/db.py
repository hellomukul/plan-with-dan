"""Student data: accounts, profiles, plans, bids, chat, token usage, audit.

SQLite (data/app.db) by default, so a fresh clone needs no database server.
Set DATABASE_URL to a Postgres URL (e.g. Neon) for durable online storage.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Iterator, Optional

from sqlalchemy import UniqueConstraint, event, inspect, text
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
    password_hash: str  # "" for accounts that only sign in with Google or Microsoft
    cal_token: str = Field(index=True)
    created_at: datetime = Field(default_factory=utcnow)
    # True once Google or Microsoft has vouched for this email (password sign-up never verifies it).
    email_verified: bool = False
    # Last signed-in request (written at most every few minutes): powers "active now" on the owner dashboard.
    last_seen_at: Optional[datetime] = None


class OAuthIdentity(SQLModel, table=True):
    """A Google or Microsoft account linked to a Dan account. No provider tokens are stored."""

    __table_args__ = (UniqueConstraint("provider", "subject", name="uq_oauth_provider_subject"),)
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(index=True, foreign_key="user.id")
    provider: str = Field(index=True)  # google | microsoft
    subject: str  # the provider's stable account id (the ID token's `sub`)
    email: str = ""  # the email the provider reported when it was linked
    email_verified: bool = False
    created_at: datetime = Field(default_factory=utcnow)
    last_login_at: datetime = Field(default_factory=utcnow)


class OAuthState(SQLModel, table=True):
    """One in-flight Google/Microsoft sign-in: lives 10 minutes, used once.

    Keyed by a hash of the `state` sent to the provider, and tied to the browser that started it by a
    hash of a random HttpOnly cookie, so a stolen or forged callback URL can't sign anyone in.
    """

    state_hash: str = Field(primary_key=True)
    browser_hash: str
    provider: str
    code_verifier: str  # PKCE
    nonce: str
    intent: str = "signup"  # signup | login | calendar | link
    user_id: Optional[int] = None  # set when a signed-in student is linking a provider
    created_at: datetime = Field(default_factory=utcnow, index=True)


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
    # JSON {"MGT 402": "P", ...}: grades the student chose to log, for the Pass/Fail budget. Never shared or sent to AI.
    grades: str = "{}"
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
    # "" = the section itself (a published term). "202703"/"202801" = an expected course next year: course_id is this
    # year's section of the same course and quarter, used as the template (see catalog.project).
    target_term: str = ""


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


class DeskState(SQLModel, table=True):
    """What the student did with a Dan's Desk decision card."""

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(index=True, foreign_key="user.id")
    card_id: str = Field(index=True)
    status: str  # snoozed | dismissed | done
    until: Optional[datetime] = None
    created_at: datetime = Field(default_factory=utcnow)


class DeskBrief(SQLModel, table=True):
    """Cached daily brief: one LLM call per student per day per set of cards."""

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(index=True, foreign_key="user.id")
    day: str = Field(index=True)
    cards_hash: str
    text: str
    run_id: str = ""
    created_at: datetime = Field(default_factory=utcnow)


class FitDismissal(SQLModel, table=True):
    """'Not for me' on a best-fit card, with an optional reason."""

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(index=True, foreign_key="user.id")
    course_key: str = Field(index=True)
    reason: str = ""
    created_at: datetime = Field(default_factory=utcnow)


class ActionLog(SQLModel, table=True):
    """Every plan change, so the student can see it and undo it."""

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(index=True, foreign_key="user.id")
    action: str  # add | remove | switch | status
    summary: str
    payload: str = "{}"  # JSON needed to undo
    by: str = "student"  # student | dan
    undone: bool = False
    created_at: datetime = Field(default_factory=utcnow, index=True)


class ChatMemory(SQLModel, table=True):
    """What Dan remembers: a running summary of the current chat, plus lasting facts the student shared.

    The summary covers messages up to `summarized_upto`; newer messages are sent word for word.
    `facts` survive "New chat" (they're about the student, not one conversation) and the student
    can see and delete them.
    """

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(index=True, foreign_key="user.id")
    mode: str = "dan"
    summary: str = ""
    facts: str = "[]"  # JSON list of short strings
    summarized_upto: int = 0  # ChatMessage.id
    updated_at: datetime = Field(default_factory=utcnow)


class ShortlistItem(SQLModel, table=True):
    """A course the student starred to compare. Keyed by offering, not section: section choice comes later."""

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(index=True, foreign_key="user.id")
    course_key: str = Field(index=True)  # catalog offering key
    note: str = ""  # the student's private note ("heard it's heavy")
    rank: int = 0  # the student's order of preference (lower = more wanted)
    created_at: datetime = Field(default_factory=utcnow)


class PersonalEvent(SQLModel, table=True):
    """Something the student booked outside class (a coach appointment, an interview room), on their calendar."""

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(index=True, foreign_key="user.id")
    title: str
    date: str  # ISO date, New York time
    start_min: int  # minutes after midnight
    end_min: int
    location: str = ""
    note: str = ""
    created_at: datetime = Field(default_factory=utcnow)


class OutsideCourse(SQLModel, table=True):
    """A course the student takes outside SOM (another Yale school), entered by hand: shown in their term, on the
    timetable and in clash checks; its units are shown apart from SOM's totals."""

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(index=True, foreign_key="user.id")
    school: str = ""  # e.g. "GSAS", "Yale College", "Law"
    number: str = ""  # e.g. "ENGL 3450"
    title: str
    units: float = 0.0
    term: str  # 202603 | 202701 | 202703 | 202801
    days: str = "[]"  # JSON list of M/T/W/Th/F
    start_min: Optional[int] = None
    end_min: Optional[int] = None
    created_at: datetime = Field(default_factory=utcnow)


class ActivityDay(SQLModel, table=True):
    """One row per student per New York day they used the app signed in: daily/weekly active counts for the owner."""

    __table_args__ = (UniqueConstraint("user_id", "day", name="uq_activity_user_day"),)
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(index=True, foreign_key="user.id")
    day: str = Field(index=True)  # ISO date, New York time


USER_TABLES = (AuthSession, OAuthIdentity, Profile, PlanItem, GlobalChoice, ChatMessage, ChatMemory, AuditEvent, RecommendationRun,
               DeskState, DeskBrief, FitDismissal, ActionLog, ShortlistItem, PersonalEvent, ActivityDay, OutsideCourse)


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
    # Managed Postgres (Neon, Render, Supabase): check connections before use, recycle idle
    # ones the server may have closed, and keep timestamps in UTC.
    return create_engine(url, pool_pre_ping=True, pool_recycle=300, pool_size=5, max_overflow=5,
                         connect_args={"options": "-c timezone=UTC"})


engine = _make_engine()


def init_db() -> None:
    SQLModel.metadata.create_all(engine)
    _add_missing_columns()
    _strip_prompt_previews()


def _add_missing_columns() -> None:
    """Tiny forward-only migration: add columns that newer code expects to existing tables.

    create_all() creates new tables but never alters old ones, so without this an app
    update that adds a field would break (or tempt someone to delete) a database full of
    students' plans. Columns are only ever added, never dropped or changed.
    """
    insp = inspect(engine)
    with engine.begin() as conn:
        for table in SQLModel.metadata.sorted_tables:
            if not insp.has_table(table.name):
                continue
            have = {c["name"] for c in insp.get_columns(table.name)}
            for col in table.columns:
                if col.name in have or col.primary_key:
                    continue
                ddl_type = col.type.compile(dialect=engine.dialect)
                default = col.default.arg if col.default is not None and not callable(col.default.arg) else None
                clause = ""
                if isinstance(default, bool):
                    clause = f" DEFAULT {'TRUE' if default else 'FALSE'}" if engine.dialect.name == "postgresql" else f" DEFAULT {int(default)}"
                elif isinstance(default, (int, float)):
                    clause = f" DEFAULT {default}"
                elif isinstance(default, str):
                    clause = " DEFAULT '" + default.replace("'", "''") + "'"
                conn.execute(text(f'ALTER TABLE "{table.name}" ADD COLUMN "{col.name}" {ddl_type}{clause}'))


def storage_info() -> dict:
    from config import STORAGE_IS_EPHEMERAL
    kind = engine.dialect.name
    return {"engine": "postgres" if kind == "postgresql" else kind, "ephemeral": STORAGE_IS_EPHEMERAL}


def _strip_prompt_previews() -> None:
    """Older versions kept the first 120 characters of blocked prompts. Remove them."""
    from sqlmodel import select as _select
    with Session(engine) as db:
        for ev in db.exec(_select(AuditEvent).where(AuditEvent.detail.contains('"preview"'))).all():
            data = json.loads(ev.detail or "{}")
            data.pop("preview", None)
            ev.detail = json.dumps(data)
            db.add(ev)
        for m in db.exec(_select(ChatMessage).where(ChatMessage.meta.contains('"blocked": true'),
                                                    ChatMessage.role == "user")).all():
            m.content = "(message blocked by the safety screen; text not stored)"
            db.add(m)
        db.commit()


def get_db() -> Iterator[Session]:
    with Session(engine) as session:
        yield session


def log_audit(db: Session, kind: str, user_id: int | None = None, run_id: str = "", **detail: Any) -> None:
    db.add(AuditEvent(user_id=user_id, run_id=run_id, kind=kind, detail=json.dumps(detail, default=str)[:4000]))
    db.commit()
