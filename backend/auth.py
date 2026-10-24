"""Email + password accounts with server-side sessions.

- Passwords: Argon2id via pwdlib (the hashing FastAPI's own docs recommend).
- Sessions: a random token in an HttpOnly, SameSite=Lax cookie. Only the
  token's SHA-256 is stored, so a leaked database cannot be replayed.
- Login and signup are rate limited per IP, and give the same answer whether
  or not an email exists (no account enumeration). Unknown emails still run a
  hash check so response times match.
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import timedelta

from email_validator import EmailNotValidError, validate_email
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pwdlib import PasswordHash
from pydantic import BaseModel
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlmodel import Session, select

from config import SECURE_COOKIES, SESSION_DAYS
from db import AuthSession, Profile, User, aware, get_db, log_audit, utcnow

COOKIE = "pwd_session"
MIN_PASSWORD = 12
MAX_PASSWORD = 128
# A short blocklist of the most common long-enough passwords.
COMMON = {
    "password1234", "123456789012", "qwertyuiopas", "iloveyou1234", "yalesom12345",
    "passwordpassword", "letmein12345", "welcome12345", "bulldog12345", "handsomedan1",
    "000000000000", "111111111111", "abc123456789", "password123!", "yaleuniversity",
}

hasher = PasswordHash.recommended()
DUMMY_HASH = hasher.hash("timing-equaliser-not-a-real-password")
limiter = Limiter(key_func=get_remote_address)
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
    secure = request.url.scheme == "https" if SECURE_COOKIES == "auto" else SECURE_COOKIES == "true"
    response.set_cookie(
        COOKIE, token, httponly=True, samesite="lax", secure=secure, max_age=SESSION_DAYS * 86400, path="/"
    )


def public_user(user: User) -> dict:
    return {"id": user.id, "email": user.email, "name": user.name}


def current_user(request: Request, db: Session = Depends(get_db)) -> User:
    token = request.cookies.get(COOKIE)
    if not token:
        raise HTTPException(401, "Please sign in.")
    session = db.get(AuthSession, _hash_token(token))
    if not session or aware(session.expires_at) < utcnow():
        raise HTTPException(401, "Your session expired. Please sign in again.")
    user = db.get(User, session.user_id)
    if not user:
        raise HTTPException(401, "Please sign in.")
    return user


def optional_user(request: Request, db: Session = Depends(get_db)) -> User | None:
    try:
        return current_user(request, db)
    except HTTPException:
        return None


@router.post("/signup")
@limiter.limit("5/minute")
def signup(request: Request, response: Response, body: SignupIn, db: Session = Depends(get_db)):
    email = normalise_email(body.email)
    problem = password_problem(body.password, email)
    if problem:
        raise HTTPException(422, problem)
    if db.exec(select(User).where(User.email == email)).first():
        # Same shape as a bad login: do not confirm that the account exists.
        log_audit(db, "signup_existing_email")
        raise HTTPException(409, "Could not create that account. If you already have one, sign in instead.")
    user = User(
        email=email,
        name=body.name.strip()[:80],
        password_hash=hasher.hash(body.password),
        cal_token=secrets.token_urlsafe(24),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    db.add(Profile(user_id=user.id))
    db.commit()
    _start_session(db, user, request, response)
    return {"user": public_user(user)}


@router.post("/login")
@limiter.limit("5/minute")
def login(request: Request, response: Response, body: LoginIn, db: Session = Depends(get_db)):
    email = body.email.strip().lower()
    user = db.exec(select(User).where(User.email == email)).first()
    ok = hasher.verify(body.password, user.password_hash if user else DUMMY_HASH)
    if not (user and ok):
        log_audit(db, "login_failed", email_domain=email.split("@")[-1][:60])
        raise HTTPException(401, "Invalid email or password.")
    _start_session(db, user, request, response)
    return {"user": public_user(user)}


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


@router.get("/me")
def me(user: User | None = Depends(optional_user)):
    return {"user": public_user(user) if user else None}
