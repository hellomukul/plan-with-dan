"""Email + password accounts with server-side sessions (Google / Microsoft sign-in lives in oauth.py).

- Passwords: Argon2id via pwdlib (the hashing FastAPI's own docs recommend).
- Sessions: a random token in an HttpOnly, SameSite=Lax cookie. Only the
  token's SHA-256 is stored, so a leaked database cannot be replayed.
- Login gives the same answer whether or not an email exists, and unknown
  emails still run a hash check so response times match.
- Signup can't fully hide whether an email is registered without email
  verification (a new account gets signed in; an existing one doesn't). We
  keep the timing equal (both paths hash) and rate limit it, and say so.
"""

from __future__ import annotations

import hashlib
import secrets
import time
import threading
from datetime import timedelta
from zoneinfo import ZoneInfo

from email_validator import EmailNotValidError, validate_email
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pwdlib import PasswordHash
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlmodel import Session, select

import config
from config import SECURE_COOKIES, SESSION_DAYS
from db import ActivityDay, AuthSession, Profile, User, aware, get_db, log_audit, utcnow
from safety import screen_input

COOKIE = "pwd_session"
MIN_PASSWORD = 12
MAX_PASSWORD = 128
# A short blocklist of the most common long-enough passwords.
COMMON = {
    "password1234", "123456789012", "qwertyuiopas", "iloveyou1234", "yalesom12345",
    "passwordpassword", "letmein12345", "welcome12345", "bulldog12345", "handsomedan1",
    "000000000000", "111111111111", "abc123456789", "password123!", "yaleuniversity",
}

# Same failed-login message for every account (no enumeration); the hint only shows when a provider is on.
ANY_PROVIDER = bool((config.GOOGLE_CLIENT_ID and config.GOOGLE_CLIENT_SECRET)
                    or (config.MICROSOFT_CLIENT_ID and config.MICROSOFT_CLIENT_SECRET))
hasher = PasswordHash.recommended()
DUMMY_HASH = hasher.hash("timing-equaliser-not-a-real-password")
def client_ip(request) -> str:
    """The visitor's real IP for rate limits. On Render (behind Cloudflare) Cloudflare sets CF-Connecting-IP and clients
    can't forge it; Render only appends to X-Forwarded-For, so its left end is whatever the client sent and is never
    trusted. Fall back to the right-most hop (added by the proxy), then the socket address."""
    cf = request.headers.get("cf-connecting-ip", "").strip() if config.ON_HOSTED_PLATFORM else ""
    if cf:  # only on Render, where Cloudflare sets it; locally anyone could send it
        return cf
    xff = request.headers.get("x-forwarded-for", "")
    if xff.strip():
        return xff.split(",")[-1].strip()
    return get_remote_address(request)


limiter = Limiter(key_func=client_ip)
router = APIRouter(prefix="/api/auth", tags=["auth"])


class SignupIn(BaseModel):
    email: str
    password: str
    name: str = ""


class LoginIn(BaseModel):
    email: str
    password: str


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def normalise_email(raw: str) -> str:
    try:
        return validate_email(raw.strip(), check_deliverability=False).normalized.lower()
    except EmailNotValidError as exc:
        raise HTTPException(422, "Please enter a valid email address.") from exc


def password_problem(password: str, email: str = "") -> str | None:
    if len(password) < MIN_PASSWORD:
        return f"Use at least {MIN_PASSWORD} characters. A short phrase is easiest to remember."
    if len(password) > MAX_PASSWORD:
        return f"Use at most {MAX_PASSWORD} characters."
    lowered = password.lower()
    if lowered in COMMON or len(set(lowered)) < 4:
        return "That password is too common. Try a phrase only you would use."
    if email and lowered == email.split("@")[0].lower():
        return "Don't use your email name as your password."
    return None


def _start_session(db: Session, user: User, request: Request, response: Response) -> None:
    token = secrets.token_urlsafe(32)
    db.add(AuthSession(token_hash=_hash_token(token), user_id=user.id, expires_at=utcnow() + timedelta(days=SESSION_DAYS)))
    db.commit()
    _set_cookie(request, response, token)


def _set_cookie(request: Request, response: Response, token: str) -> None:
    secure = request.url.scheme == "https" if SECURE_COOKIES == "auto" else SECURE_COOKIES == "true"
    response.set_cookie(
        COOKIE, token, httponly=True, samesite="lax", secure=secure, max_age=SESSION_DAYS * 86400, path="/"
    )


def public_user(user: User) -> dict:
    from sqlalchemy.orm import object_session
    from db import OAuthIdentity
    db = object_session(user)
    providers = sorted({i.provider for i in db.exec(select(OAuthIdentity).where(OAuthIdentity.user_id == user.id))}) if db else []
    return {"id": user.id, "email": user.email, "name": user.name, "providers": providers,
            "has_password": bool(user.password_hash), "owner": user.email.lower() in config.owner_emails()}


def current_user(request: Request, response: Response, db: Session = Depends(get_db)) -> User:
    token = request.cookies.get(COOKIE)
    if not token:
        raise HTTPException(401, "Please sign in.")
    session = db.get(AuthSession, _hash_token(token))
    if not session or aware(session.expires_at) < utcnow():
        raise HTTPException(401, "Your session expired. Please sign in again.")
    user = db.get(User, session.user_id)
    if not user:
        raise HTTPException(401, "Please sign in.")
    # Sliding expiry: a student who uses the app at least once a fortnight stays signed in.
    if aware(session.expires_at) - utcnow() < timedelta(days=SESSION_DAYS / 2):
        session.expires_at = utcnow() + timedelta(days=SESSION_DAYS)
        db.add(session)
        db.commit()
        _set_cookie(request, response, token)
    _note_activity(db, user)
    return user


NEW_YORK = ZoneInfo("America/New_York")
SEEN_EVERY = timedelta(minutes=5)


def _note_activity(db: Session, user: User) -> None:
    """Record that this student is using the app: last_seen_at (at most every 5 minutes) and one
    ActivityDay row per New York day. Counts only, for the owner dashboard; nothing about what they did."""
    now = utcnow()
    last = aware(user.last_seen_at) if user.last_seen_at else None
    if last and now - last < SEEN_EVERY:
        return
    today = now.astimezone(NEW_YORK).date().isoformat()
    new_day = last is None or last.astimezone(NEW_YORK).date().isoformat() != today
    user.last_seen_at = now
    db.add(user)
    if new_day and not db.exec(select(ActivityDay).where(ActivityDay.user_id == user.id, ActivityDay.day == today)).first():
        db.add(ActivityDay(user_id=user.id, day=today))
    try:
        db.commit()
    except IntegrityError:  # two tabs on the same first request of the day: the other one already logged it
        db.rollback()
        user.last_seen_at = now
        db.add(user)
        db.commit()


def optional_user(request: Request, response: Response, db: Session = Depends(get_db)) -> User | None:
    try:
        return current_user(request, response, db)
    except HTTPException:
        return None


@router.post("/signup")
@limiter.limit("40/minute")  # a whole class can share one campus Wi-Fi address; per-IP limits stay generous
def signup(request: Request, response: Response, body: SignupIn, db: Session = Depends(get_db)):
    email = normalise_email(body.email)
    problem = password_problem(body.password, email)
    if problem:
        raise HTTPException(422, problem)
    name = " ".join(body.name.split())[:80]
    if name and not screen_input(name).allowed:
        raise HTTPException(422, "Please use your real name.")
    password_hash = hasher.hash(body.password)  # hash on both paths so timing doesn't reveal existing emails
    if db.exec(select(User).where(User.email == email)).first():
        log_audit(db, "signup_existing_email")
        return {"user": None, "message": "Check your details. If you already have an account with this email, log in instead."}
    user = User(
        email=email,
        name=name,
        password_hash=password_hash,
        cal_token=secrets.token_urlsafe(24),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    db.add(Profile(user_id=user.id))
    db.commit()
    _start_session(db, user, request, response)
    return {"user": public_user(user)}


# Password-guessing throttle: 10 failed logins for one email from one IP within 15 minutes pauses that pair.
# Keyed on email + IP so nobody can lock a classmate out from elsewhere; a successful login resets it.
_FAILS: dict[str, list[float]] = {}
_FAIL_WINDOW, _FAIL_MAX = 15 * 60, 10
_fails_lock = threading.Lock()


def _too_many_failures(email: str) -> bool:
    now = time.time()
    with _fails_lock:
        recent = [t for t in _FAILS.get(email, []) if now - t < _FAIL_WINDOW]
        _FAILS[email] = recent
        return len(recent) >= _FAIL_MAX


def _record_failure(email: str) -> None:
    with _fails_lock:
        _FAILS.setdefault(email, []).append(time.time())
        if len(_FAILS) > 50_000:  # bound memory under a spray of random emails
            _FAILS.clear()


@router.post("/login")
@limiter.limit("40/minute")  # per IP (shared campus Wi-Fi); password guessing is throttled per account below
def login(request: Request, response: Response, body: LoginIn, db: Session = Depends(get_db)):
    try:
        email = normalise_email(body.email)
    except HTTPException:
        email = body.email.strip().lower()
    fail_key = f"{email}|{client_ip(request)}"
    if _too_many_failures(fail_key):
        # Same wording whether or not the account exists, so this can't be used to find accounts.
        raise HTTPException(429, "Too many attempts for this email. Wait 15 minutes and try again.")
    user = db.exec(select(User).where(User.email == email)).first()
    # Accounts made with Google/Microsoft have no password: check the dummy hash so timing matches, then fail.
    has_pw = bool(user and user.password_hash)
    ok = hasher.verify(body.password, user.password_hash if has_pw else DUMMY_HASH) and has_pw
    if not (user and ok):
        _record_failure(fail_key)
        log_audit(db, "login_failed", email_domain=email.split("@")[-1][:60])
        raise HTTPException(401, "Invalid email or password." + (" Joined with Google or Microsoft? Use that button instead."
                                                                 if ANY_PROVIDER else ""))
    with _fails_lock:
        _FAILS.pop(fail_key, None)  # a successful login clears that device's count
    _start_session(db, user, request, response)
    return {"user": public_user(user)}


def purge_expired_sessions() -> int:
    """Delete expired sessions (run at startup)."""
    from db import engine
    with Session(engine) as db:
        old = db.exec(select(AuthSession).where(AuthSession.expires_at < utcnow())).all()
        for s in old:
            db.delete(s)
        db.commit()
        return len(old)


@router.post("/logout")
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    token = request.cookies.get(COOKIE)
    if token:
        session = db.get(AuthSession, _hash_token(token))
        if session:
            db.delete(session)
            db.commit()
    response.delete_cookie(COOKIE, path="/")
    return {"ok": True}


@router.post("/logout-all")
def logout_all(response: Response, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Sign out on every device (e.g. a lost laptop): deletes all of this student's sessions, including this one."""
    for s in db.exec(select(AuthSession).where(AuthSession.user_id == user.id)).all():
        db.delete(s)
    db.commit()
    response.delete_cookie(COOKIE, path="/")
    return {"ok": True}


@router.get("/me")
def me(user: User | None = Depends(optional_user)):
    return {"user": public_user(user) if user else None}
