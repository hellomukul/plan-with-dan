/* Sign up / log in, as one dialog (bottom sheet on phones):
   - a full-width two-half toggle with a sliding pill ("I'm new" / "I'm back"),
   - Continue with Google / Microsoft (hidden when the server has no keys for that provider),
   - email + password underneath, as before.
   It also opens as the one-step "Link your calendar" sheet: linking needs an account, so the sheet says plainly
   that it creates the student's free Dan account (we never sign anyone up silently). The visitor's try-out week
   stays in localStorage through the Google/Microsoft redirect and is saved after onboarding, as with email.

   Opening it from anywhere: window.dispatchEvent(new CustomEvent('pwd:signup', { detail })), where detail is a
   reason string ("Create a free account to shortlist…") or { intent: 'calendar' } / { mode: 'login' }.
   Landing listens through listenForSignup(). */
import { useEffect, useState, type FormEvent } from 'react'
import { CalendarSync, Lock, X } from 'lucide-react'
import { api, oauthStartUrl, type OAuthProvider } from '../api'
import { Overlay } from './ui'
import HandsomeDan from '../mascots/HandsomeDan'
import { importTryout } from '../lib/tryout'
import { isRoute, takeQueuedLogin, useApp } from '../state'
import './auth.css'

export type AuthMode = 'signup' | 'login'
export interface AuthOptions { intent?: 'calendar'; reason?: string; error?: string; notice?: string }

export const TAGLINE = 'Sort your semester. Hire a chief of staff, free.'

/* ---------------------------------------------------------------- after a Google / Microsoft round trip */

// The server sends the browser back with a short status in the query string (never names or emails), e.g.
// /?oauth=ok&new=1&via=google#/calendar or /?auth_error=state&intent=signup#/. Read it once, then tidy the URL.
interface OAuthReturn { ok?: string; isNew: boolean; via?: string; error?: string; intent?: string; code?: string }
function readOAuthReturn(): OAuthReturn | null {
  if (typeof window === 'undefined') return null
  const q = new URLSearchParams(window.location.search)
  if (!q.has('oauth') && !q.has('auth_error')) return null
  window.history.replaceState(null, '', window.location.pathname + window.location.hash)
  return { ok: q.get('oauth') ?? undefined, isNew: q.get('new') === '1', via: q.get('via') ?? undefined,
    error: q.get('auth_error') ?? undefined, intent: q.get('intent') ?? undefined, code: q.get('code') ?? undefined }
}
let pending = readOAuthReturn()
/** Hand the round-trip result to whoever shows it (once). */
export function takeOAuthReturn(match: (r: OAuthReturn) => boolean): OAuthReturn | null {
  if (!pending || !match(pending)) return null
  const r = pending
  pending = null
  return r
}
// A returning student who signed in with Google/Microsoft: save the try-out week now (new students save it
// after onboarding, when their program is known, exactly as with email sign-up).
if (pending?.ok === 'ok' && !pending.isNew) {
  importTryout().then((n) => { if (n) sessionStorage.setItem('pwd-saved-week', String(n)) }).catch(() => undefined)
}

/* ---------------------------------------------------------------- "take me to my calendar afterwards" */

// Set when a student starts sign-up from "Link your calendar". New students go through onboarding first, which
// then sends them to the Calendar page (where the subscribe buttons are) instead of Home.
const NEXT_KEY = 'pwd-next'
export function rememberCalendarIntent() { localStorage.setItem(NEXT_KEY, JSON.stringify({ to: 'calendar', at: Date.now() })) }
/** True (once) if the student just came through the link-your-calendar flow. Called by the Calendar page. */
export function consumeCalendarIntent(): boolean {
  const fresh = calendarIntentFresh()
  localStorage.removeItem(NEXT_KEY)
  return fresh
}
export function calendarIntentFresh(): boolean {
  try {
    const v = JSON.parse(localStorage.getItem(NEXT_KEY) || 'null')
    return v?.to === 'calendar' && Date.now() - v.at < 30 * 60 * 1000
  } catch { return false }
}

/** Where to land after logging in: the page a signed-out deep link pointed at (e.g. #/plan), else the Desk. */
function landingHash(): string | null {
  const r = window.location.hash.replace(/^#\/?/, '').split('/')[0]
  return r && r !== 'home' && isRoute(r) ? null : '/home'  // null: stay on the page they asked for
}

/* ---------------------------------------------------------------- which providers are switched on */

let providersCache: Promise<Record<OAuthProvider, boolean>> | null = null
export function loadProviders() {
  providersCache ??= api.providers().catch(() => { providersCache = null; return { google: false, microsoft: false } })
  return providersCache
}
export function useProviders(): OAuthProvider[] | null {
  const [list, setList] = useState<OAuthProvider[] | null>(null)
  useEffect(() => {
    let alive = true
    loadProviders().then((p) => { if (alive) setList((['google', 'microsoft'] as const).filter((k) => p[k])) })
    return () => { alive = false }
  }, [])
  return list
}

/* ---------------------------------------------------------------- open-the-dialog events */

const ERRORS: Record<string, string> = {
  cancelled: 'No worries, nothing was shared. Pick a way in whenever you’re ready.',
  state: 'That sign-in timed out or was opened in another browser. Try again from here.',
  provider: 'Google or Microsoft didn’t confirm the sign-in. Try again, or use email below.',
  email_missing: 'That account didn’t share an email address, so we can’t make a Dan account from it. Use email below.',
  needs_link: 'You already have a Dan account with this email. Log in the way you joined, then link this sign-in from Privacy and data. We only connect accounts automatically when the provider confirms the email is yours.',
  signin_needed: 'Log in first, then link Google or Microsoft from Privacy and data.',
}
export const oauthErrorText = (code?: string) => (code ? ERRORS[code] ?? ERRORS.provider : '')

/** Landing calls this once: opens the dialog for 'pwd:signup' events and after a failed Google/Microsoft trip. */
export function listenForSignup(open: (mode: AuthMode, opts: AuthOptions) => void): () => void {
  const onSignup = (e: Event) => {
    const d = (e as CustomEvent).detail
    if (d && typeof d === 'object') open(d.mode === 'login' ? 'login' : 'signup', { intent: d.intent === 'calendar' ? 'calendar' : undefined })
    else open('signup', { reason: typeof d === 'string' ? d : undefined })
  }
  window.addEventListener('pwd:signup', onSignup)
  const notice = takeQueuedLogin()  // the session ended while they were using the app
  if (notice) open('login', { notice })
  const back = takeOAuthReturn((r) => Boolean(r.error) && r.intent !== 'link')
  // "You already have an account" errors open on Log in, since that's the next step.
  if (back) open(back.intent === 'login' || back.error === 'needs_link' ? 'login' : 'signup', { intent: back.intent === 'calendar' ? 'calendar' : undefined, error: back.error })
  return () => window.removeEventListener('pwd:signup', onSignup)
}

/* ---------------------------------------------------------------- brand buttons */

// Official marks, drawn inline (no image assets), on each brand's dark neutral button.
export function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true" focusable="false">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}
export function MicrosoftMark() {
  return (
    <svg viewBox="0 0 21 21" width="18" height="18" aria-hidden="true" focusable="false">
      <rect x="1" y="1" width="9" height="9" fill="#F25022" /><rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" /><rect x="11" y="11" width="9" height="9" fill="#FFB900" />
    </svg>
  )
}
const LABEL: Record<OAuthProvider, string> = { google: 'Google', microsoft: 'Microsoft' }

export function ProviderButton({ provider, intent, onGo, children }: {
  provider: OAuthProvider; intent: 'signup' | 'login' | 'calendar' | 'link'; onGo?: () => void; children?: string
}) {
  return (
    <a className={`oauth-btn ${provider}`} href={oauthStartUrl(provider, intent)} onClick={onGo}>
      {provider === 'google' ? <GoogleMark /> : <MicrosoftMark />}
      <span>{children ?? `Continue with ${LABEL[provider]}`}</span>
    </a>
  )
}

/* ---------------------------------------------------------------- the dialog */

const COPY = {
  signup: { title: 'Create your free account', sub: TAGLINE, submit: 'Start planning',
    oauthNote: 'New here? This creates your free Dan account in one tap.' },
  login: { title: 'Welcome back', sub: 'Dan kept your plan warm. Pick up right where you left off.', submit: 'Log in',
    oauthNote: 'No account yet? Continuing creates a free one. No surprises.' },
}

export default function AuthDialog({ initial, intent, reason, error: startError, notice, onClose }: AuthOptions & {
  initial: AuthMode; onClose: () => void
}) {
  const { setUser, toast } = useApp()
  const providers = useProviders()
  const [mode, setMode] = useState<AuthMode>(initial)
  const calendar = intent === 'calendar'
  // The calendar sheet leads with the provider buttons; email is one tap away (or shown straight away if no provider is on).
  const [emailOpen, setEmailOpen] = useState(!calendar || startError === 'needs_link')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(oauthErrorText(startError))
  const [note, setNote] = useState(notice ?? '')
  const showEmail = emailOpen || (providers !== null && providers.length === 0)
  const copy = COPY[mode]
  const goingOAuth = () => { if (calendar) rememberCalendarIntent() }
  // Closing the sheet drops "take me to my calendar afterwards", so a later, unrelated sign-up isn't redirected.
  const close = () => { localStorage.removeItem(NEXT_KEY); onClose() }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    setNote('')
    try {
      const r = mode === 'signup' ? await api.signup(email, password, name) : await api.login(email, password)
      if (!r.user) {
        setNote('message' in r && r.message ? r.message : 'Try logging in instead.')
        setMode('login')
        return
      }
      // New accounts save their try-out week after onboarding (when the program is known); returning ones now.
      if (mode === 'login') {
        const added = await importTryout().catch(() => 0)
        if (added) toast(`Saved ${added} course${added > 1 ? 's' : ''} from your try-out week to your plan`, 'good')
      }
      if (calendar) rememberCalendarIntent()
      const to = calendar ? '/calendar' : landingHash()
      setUser(r.user)
      if (to) window.location.hash = to
      toast(mode === 'signup' ? 'Welcome to Plan with Dan' : 'Welcome back', 'good')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const oauthIntent = calendar ? 'calendar' : mode
  const buttons = providers && providers.length > 0 && (
    <div className="auth-oauth">
      {providers.map((p) => <ProviderButton key={p} provider={p} intent={oauthIntent} onGo={goingOAuth} />)}
      <p className="auth-fine">{calendar ? 'Already have an account? These log you in instead.' : copy.oauthNote}</p>
    </div>
  )

  return (
    <Overlay center onClose={close}>
      <form className={`auth-dialog ${calendar ? 'is-calendar' : ''}`} onSubmit={submit}
        aria-label={calendar ? 'Link your calendar' : mode === 'signup' ? 'Create account' : 'Log in'}>
        <div className="auth-top">
          <span className="auth-brand">
            {calendar ? <CalendarSync className="icon" /> : <HandsomeDan size={22} furColor="#f4b183" bandanaColor="#00356b" />}
            {calendar ? 'Link your calendar' : 'Plan with Dan'}
          </span>
          <button type="button" className="btn icon ghost auth-close" aria-label="Close" onClick={close}><X className="icon" /></button>
        </div>

        {calendar ? (
          <div className="auth-head">
            <h2>Linking creates your free Dan account</h2>
            <p>So your classes stay in sync. Next stop: one click adds them to Apple, Google or Outlook Calendar.</p>
          </div>
        ) : (
          <>
            <div className="auth-toggle" role="tablist" aria-label="Sign up or log in" data-mode={mode}>
              <span className="auth-pill" aria-hidden="true" />
              <button type="button" role="tab" aria-selected={mode === 'signup'} onClick={() => { setMode('signup'); setNote('') }}>
                I’m new<span className="sr-only">: create an account</span>
              </button>
              <button type="button" role="tab" aria-selected={mode === 'login'} onClick={() => { setMode('login'); setNote('') }}>
                I’m back<span className="sr-only">: log in</span>
              </button>
            </div>
            <div className="auth-head">
              <h2>{mode === 'signup' && reason ? reason : copy.title}</h2>
              <p>{copy.sub}</p>
            </div>
          </>
        )}

        {calendar && providers && providers.length > 0 && <p className="auth-tagline">{TAGLINE}</p>}
        {buttons}
        {providers === null && <div className="auth-oauth-skeleton" aria-hidden="true" />}

        {error && <div className="error-text" role="alert">{error}</div>}
        {note && <div className="small auth-note" role="status">{note}</div>}

        {showEmail ? (
          <div className="auth-email">
            {buttons && <div className="auth-or"><span>or with email</span></div>}
            {calendar && (
              <div className="auth-mini-toggle small">
                {mode === 'signup'
                  ? <>Have an account? <button type="button" className="link-btn" onClick={() => setMode('login')}>Log in</button></>
                  : <>New here? <button type="button" className="link-btn" onClick={() => setMode('signup')}>Create your free account</button></>}
              </div>
            )}
            {mode === 'signup' && (
              <label className="field">First name
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Alex" autoComplete="given-name" />
              </label>
            )}
            <label className="field">Email
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@yale.edu" autoComplete="email" />
            </label>
            <label className="field">Password
              <input type="password" required minLength={mode === 'signup' ? 12 : 1} value={password}
                onChange={(e) => setPassword(e.target.value)} placeholder={mode === 'signup' ? 'At least 12 characters; a phrase works well' : ''}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />
            </label>
            <button className="btn primary lg auth-submit" disabled={busy}>
              {busy ? 'One sec…' : calendar && mode === 'signup' ? 'Create account and link' : copy.submit}
            </button>
            {mode === 'login' && (
              <p className="auth-fine">Forgot your password? Password reset isn’t ready yet.
                {providers?.length ? ' If you joined with Google or Microsoft, use that button above.' : ' You can make a new account with another email.'}</p>
            )}
          </div>
        ) : (
          <button type="button" className="btn auth-email-open" onClick={() => setEmailOpen(true)}>Use email instead</button>
        )}

        <p className="auth-fine auth-privacy">
          <Lock className="icon sm" />
          <span>{showEmail ? 'Your password is stored scrambled, never as typed. Don’t reuse your Yale NetID password. ' : ''}
            {providers?.length ? 'Google and Microsoft share only your name and email: no calendar, mail or contacts. ' : 'Your plan is private to you. '}
            <a href="#/privacy">How we handle data</a></span>
        </p>
      </form>
    </Overlay>
  )
}
