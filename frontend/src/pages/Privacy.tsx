/* Privacy and your data: what's stored, where it goes, and controls to export or delete it. */
import { useState } from 'react'
import { Download, Lock, Server, Share2, Trash2 } from 'lucide-react'
import { api } from '../api'
import { useApp } from '../state'

const STORED: [string, string][] = [
  ['Account', 'Email, first name, and an Argon2id hash of your password (never the password itself).'],
  ['Sign-in sessions', 'Only a SHA-256 hash of your session token, deleted when you sign out or after 14 days.'],
  ['Profile and goals', 'Program, year, cohort, background, interests, goals, courses taken, schedule preferences, Global Studies days used.'],
  ['Plan', 'Courses you add, their status and bid points, plus a log of changes so you can undo them.'],
  ['Chats with Dan', 'Your questions and Dan’s answers, until you clear them. Blocked messages are not stored.'],
  ['Bid reports', 'Outcomes you choose to report. Classmates only ever see anonymous totals.'],
  ['Usage and safety logs', 'Token counts and cost per AI run, and which safety checks fired (no message text).'],
  ['Calendar link', 'A random secret in your subscription URL. Reset it any time from the Calendar page.'],
]

export default function Privacy() {
  const { user, setUser, toast, go } = useApp()
  const [confirming, setConfirming] = useState(false)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  const remove = async () => {
    setBusy(true)
    try {
      await api.deleteAccount(password)
      setUser(null)
      go('home')
      toast('Your account and data were deleted', 'good')
    } catch (e) {
      toast((e as Error).message, 'bad')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ maxWidth: 820 }}>
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
          <p className="muted small" style={{ marginBottom: 0 }}>Security: hashed passwords, HttpOnly session cookies, rate-limited sign-in, cross-site request blocking, a strict Content-Security-Policy, and every request is checked against your account.</p>
        </div>
        <div className="card">
          <div className="card-title"><Share2 className="icon" /> What leaves the app</div>
          <p className="muted small">When you use AI features, your question plus a short summary of your profile and plan are sent through the Portkey gateway to OpenAI's <span className="mono">gpt-6-luna</span> model. The gateway may keep request logs for the course account. OpenAI says API data isn't used for training by default.</p>
          <p className="muted small" style={{ marginBottom: 0 }}>News questions also run a web search. Other students' data is never sent, and the AI can't change your plan without your click.</p>
        </div>
      </div>

      {user && (
        <div className="grid two mt">
          <div className="card">
            <div className="card-title"><Download className="icon" /> Export your data</div>
            <p className="muted small">Download everything linked to your account as one JSON file.</p>
            <a className="btn" href="/api/account/export">Download my data</a>
          </div>
          <div className="card" style={{ borderColor: 'rgba(255,92,92,0.35)' }}>
            <div className="card-title"><Trash2 className="icon" /> Delete your account</div>
            <p className="muted small">Permanently deletes your profile, plan, chats, decisions and sessions. Bid reports and token counts stay as anonymous totals.</p>
            {!confirming ? (
              <button className="btn danger" onClick={() => setConfirming(true)}>Delete my account</button>
            ) : (
              <div className="stack tight">
                <label className="field">Type your password to confirm
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
                </label>
                <div className="row">
                  <button className="btn danger" disabled={!password || busy} onClick={remove}>{busy ? 'Deleting…' : 'Delete permanently'}</button>
                  <button className="btn ghost" onClick={() => { setConfirming(false); setPassword('') }}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      <p className="faint small mt">Not an official Yale tool. Questions about this page: see the project README.</p>
    </div>
  )
}
