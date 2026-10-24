import { useState, type FormEvent } from 'react'
import {
  AlarmClock, ArrowRight, CalendarDays, Check, Compass, Globe, Lock, MessageCircle, ShieldCheck, Sparkles, Target,
} from 'lucide-react'
import { api } from '../api'
import HandsomeDan from '../mascots/HandsomeDan'
import { useApp } from '../state'

const FEATURES = [
  { icon: AlarmClock, title: "Dan's Desk", text: 'A two-line brief and the 3 decisions that matter this week, with real SOM deadlines.' },
  { icon: Sparkles, title: 'Best fits', text: 'Real courses ranked against your goals, with the reason and the line from the description that proves it.' },
  { icon: Compass, title: 'Clash-proof plan', text: 'Half-terms and sections checked against real dates, with backups that fit the same slot.' },
  { icon: Globe, title: 'Global Studies', text: 'IE, GNW, SNOC or exchange, mapped against your 10 funded days.' },
  { icon: Target, title: 'Bid coach', text: 'Split your points by priority and seat demand. Honest about missing data.' },
  { icon: CalendarDays, title: 'Calendar sync', text: 'One private link for Google, Outlook or Apple Calendar.' },
]

function AuthCard() {
  const { setUser, toast } = useApp()
  const [mode, setMode] = useState<'signup' | 'login'>('signup')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')

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
      setUser(r.user)
      window.location.hash = '/home'
      toast(mode === 'signup' ? 'Welcome to Plan with Dan' : 'Welcome back', 'good')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="card pad-lg stack" onSubmit={submit} id="auth" style={{ gap: 14 }}>
      <div className="tabs" role="tablist" style={{ alignSelf: 'flex-start' }}>
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
          onChange={(e) => setPassword(e.target.value)} placeholder={mode === 'signup' ? 'At least 12 characters; a phrase works well' : ''}
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />
      </label>
      {error && <div className="error-text" role="alert">{error}</div>}
      {note && <div className="small" style={{ color: 'var(--amber)' }} role="status">{note}</div>}
      <button className="btn primary lg" disabled={busy}>{busy ? 'One sec…' : mode === 'signup' ? 'Start planning' : 'Log in'}</button>
      <p className="faint small" style={{ margin: 0, display: 'flex', gap: 6 }}>
        <Lock className="icon sm" style={{ marginTop: 2 }} />
        <span>Passwords are hashed with Argon2 and your plan is private to you. Don’t reuse your Yale NetID password. <a href="#/privacy">How we handle data</a></span>
      </p>
    </form>
  )
}

function Preview() {
  return (
    <div className="card" style={{ padding: 18 }} aria-hidden>
      <div className="row between" style={{ marginBottom: 10 }}>
        <span style={{ fontWeight: 600 }}>Good afternoon, Alex</span>
        <span className="faint small mono">⌘K</span>
      </div>
      <div className="brief" style={{ fontSize: 14, marginBottom: 14 }}>
        Fall add/drop closes in 9 days. Your Spring plan is 3 units short of the minimum, and three clash-free fits are ready.
      </div>
      <div className="decisions">
        {[['Add 3 more units to Spring 2027', 'high', 'in 94 days'], ['Set your bid split for 4 courses', 'medium', 'No fixed date']].map(([t, s, d]) => (
          <div key={t} className="decision"><span className={`sev ${s}`} /><div className="body"><div className="title" style={{ fontSize: 13 }}>{t}</div></div><span className="due">{d}</span></div>
        ))}
      </div>
      <div className="fit" style={{ marginTop: 12 }}>
        <span className="tier strong"><span className="tier-dots"><i className="on" /><i className="on" /><i className="on" /></span>Strong fit</span>
        <span style={{ fontWeight: 600 }}>Introduction to Private Equity</span>
        <span className="row" style={{ gap: 6 }}><span className="reason">Matches: private equity</span><span className="reason">+2 toward 16 units</span></span>
      </div>
    </div>
  )
}

export default function Landing() {
  return (
    <div className="main" style={{ margin: '0 auto' }}>
      <header className="row between" style={{ marginBottom: 20 }}>
        <div className="brand" style={{ padding: 0 }}>
          <HandsomeDan size={30} furColor="#f4b183" bandanaColor="#00356b" />
          <div className="brand-name">Plan with Dan</div>
        </div>
        <div className="row">
          <a className="btn ghost sm" href="#/privacy">Privacy</a>
          <a className="btn sm" href="#auth">Log in</a>
        </div>
      </header>

      <section className="hero">
        <div className="stack" style={{ gap: 18 }}>
          <span className="sticker" style={{ alignSelf: 'flex-start' }}>Spring 2027 planning is open</span>
          <h1>Your chief of staff for the <span className="grad-text">SOM semester.</span></h1>
          <p className="muted" style={{ fontSize: 17, maxWidth: 540, margin: 0 }}>
            Dan watches your deadlines, plan and requirements, tells you the few decisions that matter this week, and
            ranks real courses against your goals. You stay in control: nothing changes until you click.
          </p>
          <div className="row">
            <a className="btn primary lg" href="#auth">Get started<ArrowRight className="icon" /></a>
            <a className="btn lg" href="#how">How it works</a>
          </div>
          <div className="row small muted" style={{ gap: 16 }}>
            <span className="row" style={{ gap: 6 }}><Check className="icon sm" />453 real SOM sections</span>
            <span className="row" style={{ gap: 6 }}><Check className="icon sm" />Every pick verified in code</span>
            <span className="row" style={{ gap: 6 }}><Check className="icon sm" />Undo for every change</span>
          </div>
        </div>
        <div className="mascot-stage">
          <Preview />
          <div className="float hide-mobile" style={{ position: 'absolute', right: -18, bottom: -28 }}><HandsomeDan size={92} furColor="#f4b183" bandanaColor="#00356b" /></div>
        </div>
      </section>

      <section className="grid two mt-lg" style={{ alignItems: 'start', gap: 28 }}>
        <div className="stack">
          <h2 id="how" style={{ margin: 0 }}>What Dan does</h2>
          <div className="grid two" style={{ gap: 10 }}>
            {FEATURES.map((f) => (
              <div key={f.title} className="card flat" style={{ padding: 14 }}>
                <f.icon className="icon lg" style={{ color: 'var(--pink)' }} />
                <h4 style={{ margin: '8px 0 4px' }}>{f.title}</h4>
                <p className="muted small" style={{ margin: 0 }}>{f.text}</p>
              </div>
            ))}
          </div>
        </div>
        <AuthCard />
      </section>

      <section className="card mt-lg">
        <div className="card-title"><ShieldCheck className="icon" /> How a recommendation is made</div>
        <div className="pipeline">
          {[['Your goals', 'code'], ['Retriever (code)', 'code'], ['Curator agent', 'ai'], ['Validator (code)', 'code'], ['Scheduler (code)', 'code'], ['Critic agent', 'ai']].map(([label, kind], i, arr) => (
            <span key={label} className="row" style={{ gap: 6 }}>
              <span className={`pipe-node ${kind}`}>{label}</span>
              {i < arr.length - 1 && <span className="pipe-arrow">→</span>}
            </span>
          ))}
        </div>
        <p className="muted small mt" style={{ marginBottom: 0 }}>
          The AI only chooses from real catalog courses. Code checks every pick, quote and clash before you see it.
          <span className="row" style={{ gap: 6, display: 'inline-flex', marginLeft: 8 }}><MessageCircle className="icon sm" />Ask Dan anything along the way.</span>
        </p>
      </section>

      <footer className="faint small mt-lg" style={{ textAlign: 'center' }}>
        Built by a Yale SOM student for MGT 409. Not an official Yale tool. Course data from SOM’s public course directory, Oct 2026. <a href="#/privacy">Privacy</a>
      </footer>
    </div>
  )
}
