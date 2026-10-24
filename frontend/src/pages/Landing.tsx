import { useState, type FormEvent } from 'react'
import { api } from '../api'
import HandsomeDan from '../mascots/HandsomeDan'
import Labubu from '../mascots/Labubu'
import { useApp } from '../state'

const FEATURES = [
  { emoji: '✨', title: 'Find my courses', text: 'Answer 5 quick questions. Dan’s crew picks real SOM courses for your goals and shows the line in each description that proves it.' },
  { emoji: '🗓️', title: 'Clash-proof timetable', text: 'Half-terms, full-terms, sections: clashes are checked against real dates, not guesses, with backups that fit the same slot.' },
  { emoji: '🌍', title: 'Global Studies, sorted', text: 'IE vs GNW vs SNOC vs exchange, mapped against your 10 funded GSA days and the real deadlines.' },
  { emoji: '🎯', title: 'Bid coach', text: 'Split your points by priority and seat demand. Students crowdsource real bid outcomes for next year.' },
  { emoji: '📆', title: 'Calendar sync', text: 'One private link puts your classes and SOM deadlines into Google, Outlook or Apple Calendar.' },
  { emoji: '🐶', title: 'Ask Dan + AI news', text: 'Chat about courses, requirements and careers, or catch up on AI news with sources and the SOM course that teaches it.' },
]

function AuthCard() {
  const { setUser, toast } = useApp()
  const [mode, setMode] = useState<'signup' | 'login'>('signup')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const r = mode === 'signup' ? await api.signup(email, password, name) : await api.login(email, password)
      setUser(r.user)
      window.location.hash = '/home'
      toast(mode === 'signup' ? 'Welcome to the pack! 🐾' : 'Welcome back! 🐶', 'good')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="card glow pad-lg stack" onSubmit={submit} id="auth">
      <div className="tabs" role="tablist">
        <button type="button" className={mode === 'signup' ? 'on' : ''} onClick={() => setMode('signup')}>Create account</button>
        <button type="button" className={mode === 'login' ? 'on' : ''} onClick={() => setMode('login')}>Log in</button>
      </div>
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
          onChange={(e) => setPassword(e.target.value)} placeholder={mode === 'signup' ? 'At least 12 characters, a phrase works great' : ''}
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />
      </label>
      {error && <div className="error-text" role="alert">{error}</div>}
      <button className="btn primary lg" disabled={busy}>{busy ? 'One sec…' : mode === 'signup' ? 'Start planning ✨' : 'Log in'}</button>
      <p className="faint small" style={{ margin: 0 }}>
        🔒 Passwords are hashed with Argon2 and never stored in plain text. Your plan is private to you. Don’t reuse your Yale NetID password.
      </p>
    </form>
  )
}

export default function Landing() {
  return (
    <div className="main" style={{ margin: '0 auto' }}>
      <header className="row between" style={{ marginBottom: 12 }}>
        <div className="brand" style={{ padding: 0 }}>
          <HandsomeDan size={40} furColor="#ff8cc6" />
          <div className="brand-name">Plan with <span className="grad-text">Dan</span></div>
        </div>
        <a className="btn sm" href="#auth">Log in</a>
      </header>

      <section className="hero">
        <div className="stack" style={{ gap: 18 }}>
          <span className="sticker" style={{ alignSelf: 'flex-start' }}>Spring 2027 bidding szn 🎯</span>
          <h1>Your SOM semester, <span className="grad-text">sorted.</span></h1>
          <p className="muted" style={{ fontSize: 18, maxWidth: 560 }}>
            Plan with Dan is an AI crew for Yale SOM students. It picks courses that match <i>your</i> goals, builds a
            clash-free timetable, plans your Global Studies, coaches your bids and syncs it all to your calendar.
          </p>
          <div className="row">
            <a className="btn primary lg" href="#auth">Get started, it’s free</a>
            <a className="btn lg ghost" href="#how">How it works ↓</a>
          </div>
          <div className="row small muted" style={{ gap: 18 }}>
            <span>✅ 453 real SOM sections</span><span>✅ Fall 2026 + Spring 2027</span><span>✅ No made-up courses</span>
          </div>
        </div>
        <div className="mascot-stage">
          <div className="float"><HandsomeDan size={200} furColor="#f4b183" /></div>
          <div className="float slow" style={{ position: 'absolute', left: '4%', bottom: 10 }}><Labubu size={120} fur="#ff8cc6" holding="book" /></div>
          <div className="float" style={{ position: 'absolute', right: '2%', bottom: 30 }}><Labubu size={110} fur="#b98cff" mood="wink" holding="flag" /></div>
          <div className="float slow" style={{ position: 'absolute', right: '28%', top: 0 }}><Labubu size={80} fur="#c6ff5e" mood="wow" holding="heart" /></div>
        </div>
      </section>

      <section className="grid two mt-lg" style={{ alignItems: 'start' }}>
        <div className="stack">
          <h2 id="how">What Dan’s crew does</h2>
          <div className="grid two">
            {FEATURES.map((f) => (
              <div key={f.title} className="card flat">
                <div style={{ fontSize: 26 }}>{f.emoji}</div>
                <h4 style={{ marginTop: 6 }}>{f.title}</h4>
                <p className="muted small" style={{ margin: 0 }}>{f.text}</p>
              </div>
            ))}
          </div>
        </div>
        <AuthCard />
      </section>

      <section className="card mt-lg">
        <h3>How a recommendation is made</h3>
        <div className="pipeline">
          <span className="pipe-node code">📋 Your 5 answers</span><span className="pipe-arrow">→</span>
          <span className="pipe-node code">🔎 Retriever (code)</span><span className="pipe-arrow">→</span>
          <span className="pipe-node ai">🧠 Curator agent</span><span className="pipe-arrow">→</span>
          <span className="pipe-node code">🛡️ Validator (code)</span><span className="pipe-arrow">→</span>
          <span className="pipe-node code">🗓️ Scheduler (code)</span><span className="pipe-arrow">→</span>
          <span className="pipe-node ai">🧐 Critic agent</span>
        </div>
        <p className="muted small mt" style={{ marginBottom: 0 }}>
          The AI only chooses from real catalog courses. Code checks every pick, every quote and every clash before you see it.
        </p>
      </section>

      <footer className="faint small mt-lg" style={{ textAlign: 'center' }}>
        Built by a Yale SOM student for MGT 409 (AI Foundations for Managers). Not an official Yale tool. Course data from SOM’s public course directory, Oct 2026.
      </footer>
    </div>
  )
}
