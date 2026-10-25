/* Privacy and your data: what's stored, where it goes, Google / Microsoft sign-in, and controls to link or
   unlink a sign-in, export everything, or delete the account. */
import { useEffect, useRef, useState } from 'react'
import { Download, KeyRound, Lock, Server, Share2, Trash2 } from 'lucide-react'
import { api, type OAuthProvider } from '../api'
import { GoogleMark, MicrosoftMark, ProviderButton, oauthErrorText, takeOAuthReturn, useProviders } from '../components/AuthDialog'
import '../components/auth.css'
import { useApp } from '../state'
import { useConfirm } from '../components/ui'

const STORED: [string, string][] = [
  ['Account', 'Email, first name, and a scrambled one-way version of your password (a “hash”), never the password itself. If you joined with Google or Microsoft and never set a password, there is no password at all.'],
  ['Google / Microsoft sign-in', 'If you use it: which provider, the account ID it gives Plan with Dan for you, and the email it reported. No access or refresh tokens: we read your name and email once and throw the tokens away.'],
  ['Sign-in sessions', 'Only a scrambled fingerprint of your sign-in cookie, deleted when you sign out or after 30 days without a visit.'],
  ['Profile and goals', 'Program, year, cohort, background, interests, goals, courses taken, schedule preferences, Global Studies days used.'],
  ['Plan', 'Courses you add, their status and bid points, plus a log of changes so you can undo them.'],
  ['Chats with Dan', 'Your questions and Dan’s answers, until you clear them. Blocked messages are not stored.'],
  ['Bid reports', 'Outcomes you choose to report. Classmates only ever see anonymous totals.'],
  ['Usage and safety logs', 'Token counts and cost per AI run, and which safety checks fired (no message text).'],
  ['Calendar link', 'A random secret in your subscription URL. Reset it any time from the Calendar page.'],
]

const NAME: Record<OAuthProvider, string> = { google: 'Google', microsoft: 'Microsoft' }
const LINK_ERRORS: Record<string, string> = {
  link_taken: 'That account is already linked to a different Plan with Dan account. Sign in with it there, or unlink it there first.',
}

export default function Privacy() {
  const { user, setUser, toast, endSession } = useApp()
  const providers = useProviders()
  const [confirming, setConfirming] = useState(false)
  const [password, setPassword] = useState('')
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const confirmField = useRef<HTMLInputElement>(null)
  const deleteBtn = useRef<HTMLButtonElement>(null)
  const wasConfirming = useRef(false)
  // Opening the delete box focuses its field; Cancel (or Escape) hands focus back to "Delete my account".
  useEffect(() => {
    if (confirming) confirmField.current?.focus()
    else if (wasConfirming.current) deleteBtn.current?.focus()
    wasConfirming.current = confirming
  }, [confirming])
  const cancelDelete = () => { setConfirming(false); setPassword(''); setTyped('') }
  const [ask, confirmUi] = useConfirm()
  const linked = user?.providers ?? []
  const hasPassword = user?.has_password !== false

  // Back from linking Google/Microsoft: say how it went.
  useEffect(() => {
    const r = takeOAuthReturn((x) => x.ok === 'linked' || x.ok === 'error')
    if (!r) return
    if (r.ok === 'linked') {
      toast(`${NAME[r.code as OAuthProvider] ?? 'That account'} is linked. You can sign in with it now.`, 'good')
      api.me().then((m) => setUser(m.user)).catch(() => undefined)
    } else toast(LINK_ERRORS[r.code ?? ''] ?? oauthErrorText(r.code), 'bad')
  }, [toast, setUser])

  const remove = async () => {
    setBusy(true)
    try {
      await api.deleteAccount(password, typed)
      endSession('deleted')  // also forgets this browser's per-user leftovers (Elihu hand-off, chat transcript)
      toast('Your account and data were deleted', 'good')
    } catch (e) {
      toast((e as Error).message, 'bad')
    } finally {
      setBusy(false)
    }
  }

  const unlink = async (p: OAuthProvider) => {
    if (!(await ask({ title: `Unlink ${NAME[p]}?`, body: 'You won’t be able to sign in with it until you link it again.', confirmLabel: 'Unlink', danger: true }))) return
    try {
      await api.unlinkProvider(p)
      setUser((await api.me()).user)
      toast(`${NAME[p]} unlinked`, 'good')
    } catch (e) {
      toast((e as Error).message, 'bad')
    }
  }

  const canDelete = hasPassword ? Boolean(password) : typed.trim().toUpperCase() === 'DELETE'
  const linkable = (providers ?? []).filter((p) => !linked.includes(p))

  return (
    <div className="pv" style={{ maxWidth: 820 }}>
      <div className="page-head">
        <div>
          <h1>Privacy and your data</h1>
          <p>What Plan with Dan keeps, where it goes, and how to take it with you or delete it.</p>
        </div>
      </div>

      <div className="card">
        <div className="card-title"><Lock className="icon" /> What's stored about you</div>
        <table className="table">
          <tbody>
            {STORED.map(([k, v]) => <tr key={k}><td style={{ width: 170, fontWeight: 500 }}>{k}</td><td className="muted">{v}</td></tr>)}
          </tbody>
        </table>
      </div>

      <div className="grid two mt">
        <div className="card">
          <div className="card-title"><Server className="icon" /> Where it lives</div>
          <p className="muted small">In the app's own database: a local SQLite file when you run it on a laptop, or a Postgres database (e.g. Neon, encrypted at rest by the provider) when it's hosted. It is never in the public code repository.</p>
          <p className="muted small" style={{ marginBottom: 0 }}>Security: passwords are stored only in scrambled form, Google and Microsoft sign-in uses their standard secure flow (we keep none of their tokens), your sign-in cookie can’t be read by scripts on the page, repeated wrong passwords are slowed down, requests from other websites are blocked, and every request is checked against your account.</p>
        </div>
        <div className="card">
          <div className="card-title"><Share2 className="icon" /> What leaves the app</div>
          <p className="muted small">When you use AI features, your question plus a short summary of your profile and plan are sent through the Portkey gateway to OpenAI's <span className="mono">gpt-6-luna</span> model. The gateway may keep request logs for the course account. OpenAI says API data isn't used for training by default.</p>
          <p className="muted small" style={{ marginBottom: 0 }}>News questions also run a web search. Other students' data is never sent, and the AI can't change your plan without your click. If you sign in with Google or Microsoft, they learn that you signed in to Plan with Dan; we send them nothing about your plan.</p>
        </div>
      </div>

      <div className="card mt">
        <div className="card-title"><KeyRound className="icon" /> Signing in with Google or Microsoft</div>
        <div className="grid two">
          <div>
            <p className="muted small"><b className="pv-k">What they share with us:</b> your name, your email address, and an account ID that Google or Microsoft makes for Plan with Dan. Microsoft also tells us whether your school or company has verified the email.</p>
            <p className="muted small"><b className="pv-k">What we never ask for:</b> your calendar, contacts, mail, files or anything else. We request only the basic “sign in” permissions (openid, email, profile), so reading your busy times is not possible.</p>
          </div>
          <div>
            <p className="muted small"><b className="pv-k">No provider tokens kept:</b> after Google or Microsoft confirms it’s you, we read your name and email and throw their tokens away. Your Dan session is our own cookie.</p>
            <p className="muted small" style={{ marginBottom: 0 }}><b className="pv-k">Unlink or leave:</b> unlink a linked sign-in below, or delete your account. You can also remove Plan with Dan at{' '}
              <a href="https://myaccount.google.com/connections" target="_blank" rel="noreferrer">Google</a>,{' '}
              <a href="https://account.live.com/consent/Manage" target="_blank" rel="noreferrer">Microsoft (personal)</a> or{' '}
              <a href="https://myapps.microsoft.com" target="_blank" rel="noreferrer">Microsoft (Yale / work)</a>.</p>
          </div>
        </div>

        {user && (
          <div className="mt">
            {linked.length === 0 && (
              <p className="muted small pv-none">No Google or Microsoft sign-in is linked to this account. You sign in with your email and password.</p>
            )}
            {linked.length > 0 && (
              <ul className="linked-list" aria-label="Linked sign-ins">
                {linked.map((p) => (
                  <li key={p}>
                    {p === 'google' ? <GoogleMark /> : <MicrosoftMark />}
                    <span>{NAME[p]} is linked</span>
                    <button type="button" className="btn sm ghost" onClick={() => unlink(p)}>Unlink</button>
                  </li>
                ))}
              </ul>
            )}
            {linkable.length > 0 && (
              <div className="linked-add">
                <span className="faint small">Add a quicker way to sign in to this account:</span>
                {linkable.map((p) => <ProviderButton key={p} provider={p} intent="link">{`Link ${NAME[p]}`}</ProviderButton>)}
              </div>
            )}
          </div>
        )}
      </div>

      {user && (
        <div className="grid two mt">
          <div className="card">
            <div className="card-title"><Download className="icon" /> Export your data</div>
            <p className="muted small" style={{ minHeight: '4.5em' }}>Download everything linked to your account as one file you can open in any text editor (JSON).</p>
            <a className="btn" href="/api/account/export">Download my data</a>
            <p className="muted small" style={{ margin: '14px 0 8px' }}>Lost a laptop or used a shared computer? Sign out on every device, including this one.</p>
            <button type="button" className="btn" onClick={async () => {
              if (!(await ask({ title: 'Sign out on every device?', body: 'You will need to log in again here too.', confirmLabel: 'Sign out everywhere' }))) return
              try { await api.logoutAll(); endSession('logout'); toast('Signed out everywhere', 'good') }
              catch (e) { toast((e as Error).message || 'Could not sign out everywhere.', 'bad') }
            }}>Sign out everywhere</button>
          </div>
          <div className="card" style={{ borderColor: 'rgba(255,92,92,0.35)' }}>
            <div className="card-title"><Trash2 className="icon" /> Delete your account</div>
            <p className="muted small" style={{ minHeight: '4.5em' }}>Permanently deletes your profile, plan, chats, decisions, linked sign-ins and sessions. Bid reports and token counts stay as anonymous totals.</p>
            {!confirming ? (
              <button ref={deleteBtn} className="btn danger" onClick={() => setConfirming(true)}>Delete my account</button>
            ) : (
              <div className="stack tight" onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); cancelDelete() } }}>
                {hasPassword ? (
                  <label className="field">Type your password to confirm
                    <input ref={confirmField} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
                  </label>
                ) : (
                  <label className="field">You sign in with {linked.map((p) => NAME[p]).join(' or ') || 'a provider'}, so type DELETE to confirm
                    <input ref={confirmField} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder="DELETE" />
                  </label>
                )}
                <div className="row">
                  <button className="btn danger" disabled={!canDelete || busy} onClick={remove}>{busy ? 'Deleting…' : 'Delete permanently'}</button>
                  <button className="btn ghost" onClick={cancelDelete}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {confirmUi}
      <p className="faint small mt">Not an official Yale tool. Questions about your data? Email <a href="mailto:mukul.gupta@yale.edu">mukul.gupta@yale.edu</a>.</p>
    </div>
  )
}
