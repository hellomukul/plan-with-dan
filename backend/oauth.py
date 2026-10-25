"""Continue with Google / Microsoft: OpenID Connect, authorization-code flow with PKCE.

How one sign-in works:
1. GET /api/auth/oauth/{provider}/start  makes a random `state`, PKCE verifier and nonce, keeps them for
   10 minutes in the OAuthState table, and ties them to this browser with a random HttpOnly cookie. Then it
   redirects to Google or Microsoft, asking only for `openid email profile` (no calendar, contacts or mail).
2. The provider sends the browser back to .../callback?code&state. We look the state up (used once), check
   the cookie matches, swap the code for an ID token straight from the provider's token endpoint (with the
   PKCE verifier and our client secret), and check the token's issuer, audience, expiry and nonce. Because
   the token comes directly from the provider over TLS, OpenID Connect Core 3.1.3.7 lets us skip the JWKS
   signature check. The access token is thrown away: no provider tokens are ever stored.
3. We find or create the Dan account (rules below), start a normal session cookie and send the browser to
   the app with a short status in the URL (never personal data).

Account rules:
- A provider account already linked (same provider + `sub`) signs in to its Dan account.
- Otherwise, a matching email signs in to the existing account only when the provider vouches for the email:
  Google `email_verified: true`; Microsoft only with the `xms_edov` claim true (docs/oauth_setup.md shows how
  to turn it on). Without that, the student is told to log in the way they did before and link from
  Privacy and data. The first verified sign-in to an account whose email was never verified signs out every
  other session and drops links made with unverified emails, in case someone else registered that email.
- No account yet: one is created (the buttons say so before anyone clicks; we never sign up silently).
- Signed-in students can link or unlink providers from Privacy and data. Unlinking the last way to sign in
  is refused.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import os
import re
import secrets
import time
from dataclasses import dataclass, field
from datetime import timedelta
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from sqlmodel import Session, select

import config
from auth import _start_session, current_user, limiter, normalise_email, optional_user
from db import AuthSession, OAuthIdentity, OAuthState, Profile, User, aware, get_db, log_audit, utcnow
from safety import screen_input

log = logging.getLogger("uvicorn.error")
router = APIRouter(prefix="/api/auth", tags=["auth"])

STATE_COOKIE = "pwd_oauth"
STATE_TTL = timedelta(minutes=10)
SCOPES = "openid email profile"
INTENTS = {"signup", "login", "calendar", "link"}
TRUST_PROXY = os.getenv("TRUST_PROXY", "").lower() in ("1", "true", "yes")
MS_ISSUER = re.compile(r"^https://login\.microsoftonline\.com/([0-9a-f-]{36})/v2\.0$")


@dataclass(frozen=True)
class Provider:
    key: str
    label: str
    authorize_url: str
    token_url: str
    client_id: str
    client_secret: str
    extra: dict = field(default_factory=dict)

    @property
    def configured(self) -> bool:
        return bool(self.client_id and self.client_secret)


PROVIDERS: dict[str, Provider] = {
    "google": Provider(
        "google", "Google",
        "https://accounts.google.com/o/oauth2/v2/auth",
        "https://oauth2.googleapis.com/token",
        config.GOOGLE_CLIENT_ID, config.GOOGLE_CLIENT_SECRET,
        {"access_type": "online", "prompt": "select_account"},
    ),
    # Tenant "common": personal Outlook/Hotmail accounts and work/school ones (Yale is Microsoft 365) both work.
    "microsoft": Provider(
        "microsoft", "Microsoft",
        "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
        "https://login.microsoftonline.com/common/oauth2/v2.0/token",
        config.MICROSOFT_CLIENT_ID, config.MICROSOFT_CLIENT_SECRET,
        {"response_mode": "query", "prompt": "select_account"},
    ),
}

for _p in PROVIDERS.values():  # once per process, at startup
    if not _p.configured:
        log.info("%s sign-in is off (set %s_CLIENT_ID and %s_CLIENT_SECRET to turn it on); its button is hidden.",
                 _p.label, _p.key.upper(), _p.key.upper())


class OAuthError(Exception):
    """Something about the provider's answer was wrong. The message is for logs only and never holds tokens."""


def _sha(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _provider(key: str) -> Provider:
    p = PROVIDERS.get(key)
    if not p or not p.configured:
        raise HTTPException(404, "That sign-in option isn't available.")
    return p


def _base_url(request: Request) -> str:
    if config.PUBLIC_BASE_URL:
        return config.PUBLIC_BASE_URL
    host = request.headers.get("x-forwarded-host") if TRUST_PROXY else None
    if host:
        scheme = (request.headers.get("x-forwarded-proto") or request.url.scheme).split(",")[0].strip()
        return f"{scheme}://{host.split(',')[0].strip()}"
    return str(request.base_url).rstrip("/")


def redirect_uri(request: Request, provider: str) -> str:
    return f"{_base_url(request)}/api/auth/oauth/{provider}/callback"


def _secure(request: Request) -> bool:
    mode = config.SECURE_COOKIES
    return request.url.scheme == "https" if mode == "auto" else mode == "true"


def _finish(intent: str, *, error: str = "", new: bool = False, provider: str = "") -> RedirectResponse:
    """Back to the app. Only a short status code goes in the URL, never names, emails or tokens."""
    if intent == "link":
        target = f"/?oauth={'linked' if not error else 'error'}&code={error or provider}#/privacy"
    elif error:
        target = f"/?auth_error={error}&intent={intent}#/"
    else:
        target = f"/?oauth=ok&new={int(new)}&via={provider}#/{'calendar' if intent == 'calendar' else 'home'}"
    resp = RedirectResponse(target, status_code=302)
    resp.delete_cookie(STATE_COOKIE, path="/api/auth/oauth")
    return resp


# ------------------------------------------------------------------ provider calls (mocked in tests)

def exchange_code(p: Provider, code: str, verifier: str, redirect: str) -> dict:
    """Swap the one-time code for tokens at the provider's token endpoint."""
    try:
        r = httpx.post(p.token_url, timeout=10.0, headers={"Accept": "application/json"}, data={
            "grant_type": "authorization_code", "code": code, "redirect_uri": redirect,
            "client_id": p.client_id, "client_secret": p.client_secret, "code_verifier": verifier,
        })
    except httpx.HTTPError as exc:
        raise OAuthError(f"token endpoint unreachable: {type(exc).__name__}") from exc
    if r.status_code != 200:
        raise OAuthError(f"token endpoint said {r.status_code}")  # body may echo secrets: never log it
    return r.json()


def id_token_claims(p: Provider, id_token: str, nonce: str) -> dict:
    """Read and check the ID token that came straight from the token endpoint."""
    try:
        payload = id_token.split(".")[1]
        claims = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
    except (IndexError, ValueError) as exc:
        raise OAuthError("ID token unreadable") from exc
    if not isinstance(claims, dict):
        raise OAuthError("ID token unreadable")
    aud = claims.get("aud")
    if p.client_id not in (aud if isinstance(aud, list) else [aud]):
        raise OAuthError("ID token audience mismatch")
    now = time.time()
    if not isinstance(claims.get("exp"), (int, float)) or claims["exp"] < now - 60:
        raise OAuthError("ID token expired")
    if not hmac.compare_digest(str(claims.get("nonce", "")), nonce):
        raise OAuthError("ID token nonce mismatch")
    iss = str(claims.get("iss", ""))
    if p.key == "google":
        if iss not in ("https://accounts.google.com", "accounts.google.com"):
            raise OAuthError("ID token issuer mismatch")
    else:
        m = MS_ISSUER.match(iss)
        if not m or m.group(1) != claims.get("tid"):
            raise OAuthError("ID token issuer mismatch")
    if not claims.get("sub"):
        raise OAuthError("ID token has no subject")
    return claims


def _truthy(v) -> bool:
    return v is True or str(v).lower() in ("true", "1")


def profile_from_claims(p: Provider, claims: dict) -> tuple[str, str, bool, str]:
    """(subject, email, email_verified, first_name) from the checked claims."""
    if p.key == "google":
        email, verified = claims.get("email") or "", _truthy(claims.get("email_verified"))
    else:
        # `email` is only vouched for when Microsoft adds xms_edov=true (domain owner verified the address).
        # preferred_username is whatever the tenant typed, so it is used only as an unverified fallback.
        email, verified = claims.get("email") or "", _truthy(claims.get("xms_edov"))
        if not email and "@" in str(claims.get("preferred_username", "")):
            email, verified = claims["preferred_username"], False
    try:
        email = normalise_email(email) if email else ""
    except HTTPException:
        email, verified = "", False
    first = (claims.get("given_name") or (claims.get("name") or "").split(" ")[0] or "").strip()
    first = " ".join(first.split())[:80]
    if first and not screen_input(first).allowed:
        first = ""
    return str(claims["sub"]), email, verified, first


# ------------------------------------------------------------------ routes

@router.get("/providers")
def providers():
    """Which sign-in buttons to show. Unconfigured providers stay hidden."""
    return {k: p.configured for k, p in PROVIDERS.items()}


@router.get("/oauth/{provider}/start")
@limiter.limit("20/minute")
def oauth_start(provider: str, request: Request, intent: str = "signup", db: Session = Depends(get_db)):
    p = _provider(provider)
    intent = intent if intent in INTENTS else "signup"
    user_id = None
    if intent == "link":
        user = optional_user(request, Response(), db)
        if not user:
            return _finish("signup", error="signin_needed")
        user_id = user.id
    state, browser = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
    verifier, nonce = secrets.token_urlsafe(64), secrets.token_urlsafe(24)
    for old in db.exec(select(OAuthState).where(OAuthState.created_at < utcnow() - STATE_TTL)).all():
        db.delete(old)
    db.add(OAuthState(state_hash=_sha(state), browser_hash=_sha(browser), provider=p.key, code_verifier=verifier,
                      nonce=nonce, intent=intent, user_id=user_id))
    db.commit()
    params = {
        "client_id": p.client_id, "response_type": "code", "redirect_uri": redirect_uri(request, p.key),
        "scope": SCOPES, "state": state, "nonce": nonce,
        "code_challenge": _b64url(hashlib.sha256(verifier.encode()).digest()), "code_challenge_method": "S256",
        **p.extra,
    }
    resp = RedirectResponse(f"{p.authorize_url}?{urlencode(params)}", status_code=302)
    resp.set_cookie(STATE_COOKIE, browser, max_age=int(STATE_TTL.total_seconds()), httponly=True, samesite="lax",
                    secure=_secure(request), path="/api/auth/oauth")
    return resp


@router.get("/oauth/{provider}/callback")
@limiter.limit("20/minute")
def oauth_callback(provider: str, request: Request, code: str = "", state: str = "", error: str = "",
                   db: Session = Depends(get_db)):
    p = _provider(provider)
    row = db.get(OAuthState, _sha(state)) if state else None
    if row:
        db.delete(row)  # one use only, whatever happens next
        db.commit()
    browser = request.cookies.get(STATE_COOKIE, "")
    if (not row or row.provider != p.key or not browser or not hmac.compare_digest(row.browser_hash, _sha(browser))
            or aware(row.created_at) < utcnow() - STATE_TTL):
        log_audit(db, "oauth_state_rejected", provider=p.key)
        return _finish(row.intent if row else "signup", error="state")
    intent = row.intent
    if intent == "link":  # linking must finish in the same signed-in session that started it
        now_user = optional_user(request, Response(), db)
        if not now_user or now_user.id != row.user_id:
            return _finish(intent, error="signin_needed")
    if error:
        return _finish(intent, error="cancelled" if error in ("access_denied", "consent_required") else "provider")
    if not code:
        return _finish(intent, error="provider")
    try:
        tokens = exchange_code(p, code, row.code_verifier, redirect_uri(request, p.key))
        claims = id_token_claims(p, str(tokens.get("id_token", "")), row.nonce)
    except OAuthError as exc:
        log.warning("%s sign-in failed: %s", p.label, exc)
        log_audit(db, "oauth_failed", provider=p.key, reason=str(exc)[:80])
        return _finish(intent, error="provider")
    del tokens  # never stored
    subject, email, verified, first = profile_from_claims(p, claims)

    user, created, problem = _resolve_account(db, p.key, subject, email, verified, first, row.user_id)
    if problem or not user:
        log_audit(db, f"oauth_{problem}", provider=p.key)
        return _finish(intent, error=problem or "provider")
    log_audit(db, "oauth_link" if intent == "link" else ("oauth_signup" if created else "oauth_login"),
              user_id=user.id, provider=p.key)
    resp = _finish(intent, new=created, provider=p.key)
    if intent != "link":
        _start_session(db, user, request, resp)
    return resp


def _resolve_account(db: Session, provider: str, subject: str, email: str, verified: bool, first: str,
                     link_user_id: int | None) -> tuple[User | None, bool, str]:
    """Apply the account rules. Returns (user, created, problem_code)."""
    ident = db.exec(select(OAuthIdentity).where(OAuthIdentity.provider == provider,
                                                OAuthIdentity.subject == subject)).first()
    if link_user_id is not None:  # a signed-in student linking from Privacy and data
        user = db.get(User, link_user_id)
        if not user:
            return None, False, "state"
        if ident and ident.user_id != user.id:
            return None, False, "link_taken"
        if not ident:
            db.add(OAuthIdentity(user_id=user.id, provider=provider, subject=subject, email=email,
                                 email_verified=verified))
        if verified and email == user.email:
            user.email_verified = True
            db.add(user)
        db.commit()
        return user, False, ""

    if ident:
        user = db.get(User, ident.user_id)
        if not user:
            return None, False, "provider"
        ident.last_login_at, ident.email = utcnow(), email or ident.email
        db.add(ident)
        db.commit()
        return user, False, ""

    if not email:
        return None, False, "email_missing"
    existing = db.exec(select(User).where(User.email == email)).first()
    if existing:
        if not verified:
            return None, False, "needs_link"
        if not existing.email_verified:
            # First time a provider proves this inbox. If someone else had registered the email, end their
            # sessions and drop any provider they linked with an unverified email.
            for s in db.exec(select(AuthSession).where(AuthSession.user_id == existing.id)).all():
                db.delete(s)
            for other in db.exec(select(OAuthIdentity).where(OAuthIdentity.user_id == existing.id,
                                                             OAuthIdentity.email_verified == False)).all():  # noqa: E712
                db.delete(other)
            existing.email_verified = True
            # Whoever set the password never proved they own this inbox, so it no longer signs in (the student can
            # keep using Google/Microsoft; a pre-registered attacker loses access).
            existing.password_hash = ""
            db.add(existing)
        db.add(OAuthIdentity(user_id=existing.id, provider=provider, subject=subject, email=email,
                             email_verified=True))
        db.commit()
        return existing, False, ""

    user = User(email=email, name=first, password_hash="", cal_token=secrets.token_urlsafe(24),
                email_verified=verified)
    db.add(user)
    db.commit()
    db.refresh(user)
    db.add(Profile(user_id=user.id))
    db.add(OAuthIdentity(user_id=user.id, provider=provider, subject=subject, email=email, email_verified=verified))
    db.commit()
    return user, True, ""


@router.post("/oauth/{provider}/unlink")
def oauth_unlink(provider: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    links = db.exec(select(OAuthIdentity).where(OAuthIdentity.user_id == user.id)).all()
    mine = [i for i in links if i.provider == provider]
    if not mine:
        raise HTTPException(404, "That sign-in isn't linked.")
    if not user.password_hash and len(links) == len(mine):
        raise HTTPException(400, "This is your only way to sign in. Link the other provider first, "
                                 "or delete your account below if you're leaving.")
    for i in mine:
        db.delete(i)
    db.commit()
    log_audit(db, "oauth_unlink", user_id=user.id, provider=provider)
    return {"ok": True}

