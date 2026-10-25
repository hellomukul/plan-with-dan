/* Public home page (v3). Founder's note + 3 reviewer agents (UX designer, growth lead, skeptical student):
   1. Header: name, three links, Log in / Sign up (a dialog; no form on the page).
   2. Hero: a plain promise on the left; Dan, inline, on the right (shared thread with the floating Dan).
   3. Workspace: "I'm an MBA first year in Blue" picker driving tabs: My plan · Dates · Tools · Requirements.
   4. Straight answers.
   5. The account pitch: 4 benefits that are true today, one button.
   6. Footer: privacy, suggestions email, credit. */
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowDown, ArrowRight, CalendarDays, Lock, Save, ShieldCheck, Sparkles, X } from 'lucide-react'
import { api, type ProgramsInfo } from '../api'
import DanChat from '../components/DanChat'
import HeroChat from '../components/HeroChat'
import Workspace, { whoLabel } from '../components/Workspace'
import { Overlay } from '../components/ui'
import HandsomeDan from '../mascots/HandsomeDan'
import { setChatContext } from '../lib/danChat'
import { importTryout, loadTryout, saveTryout, type Tryout } from '../lib/tryout'
import { useApp } from '../state'
import './landing.css'

export const BRAND = { name: 'Plan with Dan', tagline: 'Your chief of staff at Yale SOM' }
const CREATOR = { name: 'Mukul Gupta', line: 'Yale SOM Class of 2028', url: 'https://www.linkedin.com/in/hellomukul/' }
const CONTACT = 'mukul.gupta@yale.edu'

const BENEFITS = [
  { icon: Save, title: 'Save your plan', text: 'Your week and shortlist, waiting on your phone and laptop.' },
  { icon: Sparkles, title: 'Weekly deadline cards', text: 'Dan’s Desk shows the 3 things due this week, with real SOM dates.' },
  { icon: ShieldCheck, title: 'Rule and clash checks', text: 'Your saved plan, checked against your program’s units and required courses.' },
  { icon: CalendarDays, title: 'Calendar sync', text: 'One private link for Google, Outlook or Apple. Breaks already removed.' },
]

const FAQ: [string, string][] = [
  ['Is this an official Yale tool?', 'No. It’s a free, independent student project. Rules come from the 2026–27 Yale Bulletin and courses from SOM’s public course directory, with sources linked. Always confirm on the SOM portal.'],
  ['Will it register me or change my courses?', 'Never. Registration and bidding happen only in SOM’s own systems. Dan suggests; every change to your plan in this app is yours, and every one can be undone.'],
  ['What do you store, and who sees it?', 'Visitors: nothing on our servers (your week lives in this browser). With an account: your email, a hashed password, your profile and plan, visible only to you. Export or delete it all from the Privacy page.'],
  ['How does Dan answer?', 'AI suggests, software checks. Dan may only name real catalog courses, and code checks every course, quote, clash and unit rule. When the data doesn’t answer a question, Dan says so and links the official page.'],
  ['Why does Dan limit visitor questions?', 'Every answer costs real money to run, so visitors get 15 questions a day per device. Starter questions are often instant and don’t count. A free account gets its own daily budget.'],
]

/* ---------------------------------------------------------------- sign up / log in dialog */

function AuthDialog({ initial, onClose }: { initial: 'signup' | 'login'; onClose: () => void }) {
  const { setUser, toast } = useApp()
  const [mode, setMode] = useState(initial)
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
      // New accounts save their try-out week after onboarding (when the program is known); returning ones now.
      if (mode === 'login') {
        const added = await importTryout().catch(() => 0)
        if (added) toast(`Saved ${added} course${added > 1 ? 's' : ''} from your try-out week to your plan`, 'good')
      }
      setUser(r.user)
      window.location.hash = '/home'
      toast(mode === 'signup' ? `Welcome to ${BRAND.name}` : 'Welcome back', 'good')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Overlay center onClose={onClose}>
      <form className="stack auth-dialog" onSubmit={submit} style={{ gap: 14 }} aria-label={mode === 'signup' ? 'Create account' : 'Log in'}>
        <div className="row between">
          <div className="tabs" role="tablist">
            <button type="button" role="tab" aria-selected={mode === 'signup'} className={mode === 'signup' ? 'on' : ''} onClick={() => setMode('signup')}>Create account</button>
            <button type="button" role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'on' : ''} onClick={() => setMode('login')}>Log in</button>
          </div>
          <button type="button" className="btn icon ghost" aria-label="Close" onClick={onClose}><X className="icon" /></button>
        </div>
        {mode === 'signup' && (
          <label className="field">First name
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Alex" autoComplete="given-name" autoFocus />
          </label>
        )}
        <label className="field">Email
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@yale.edu"
            autoComplete="email" autoFocus={mode === 'login'} />
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
          <Lock className="icon sm" style={{ marginTop: 2, flex: 'none' }} />
          <span>Passwords are hashed with Argon2 and your plan is private to you. Don’t reuse your Yale NetID password. <a href="#/privacy">How we handle data</a></span>
        </p>
      </form>
    </Overlay>
  )
}

/* ---------------------------------------------------------------- page */

export default function Landing() {
  const [auth, setAuth] = useState<null | 'signup' | 'login'>(null)
  const [info, setInfo] = useState<ProgramsInfo | null>(null)
  const [t, setTState] = useState<Tryout>(loadTryout)
  const setT = (f: (v: Tryout) => Tryout) => setTState(f)
  const [heroChatVisible, setHeroChatVisible] = useState(true)
  const heroRef = useRef<HTMLDivElement>(null)

  useEffect(() => { api.programs().then(setInfo).catch(() => undefined) }, [])
  useEffect(() => { saveTryout(t); setChatContext({ program: t.program, year: t.year, cohort: t.cohort }) }, [t])
  // One Dan at a time: hide the floating launcher while the hero chat is on screen.
  useEffect(() => {
    const el = heroRef.current
    if (!el || !('IntersectionObserver' in window)) return
    const io = new IntersectionObserver(([e]) => setHeroChatVisible(e.isIntersecting), { threshold: 0.25 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const who = whoLabel(t)
  const starters = [
    'What does my program require, and what’s left for spring?',
    'Find two spring electives on healthcare or AI that fit together',
    'How does bidding work, and when is add/drop?',
    'What’s the biggest AI news this week?',
  ]
  const toPlan = () => document.getElementById('plan')?.scrollIntoView({ behavior: 'smooth' })

  return (
    <div className="lp">
      <header className="lp-header">
        <a className="brand" href="#/" style={{ padding: 0 }} aria-label={`${BRAND.name} home`}>
          <HandsomeDan size={30} furColor="#f4b183" bandanaColor="#00356b" />
          <span className="brand-name">{BRAND.name}</span>
        </a>
        <nav className="lp-nav hide-mobile" aria-label="Sections">
          <a href="#ask">Ask Dan</a>
          <a href="#plan">My plan</a>
          <a href="#answers">Answers</a>
        </nav>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn ghost sm" onClick={() => setAuth('login')}>Log in</button>
          <button className="btn primary sm" onClick={() => setAuth('signup')}>Sign up</button>
        </div>
      </header>

      <main className="lp-main">
        <section className="lp-hero v3" id="ask">
          <div className="lp-hero-copy">
            <span className="sticker">{BRAND.tagline}</span>
            <h1>Your SOM term, planned. <span className="grad-text">Ask Dan anything.</span></h1>
            <p className="muted lp-lede">
              Dan answers from SOM’s course data and the Yale Bulletin, links its sources, and helps you build a
              clash-free week. For every SOM program.
            </p>
            <div className="row">
              <button className="btn primary lg" onClick={toPlan}>Build my week<ArrowDown className="icon" /></button>
              <button className="btn lg" onClick={() => setAuth('signup')}>Create a free account</button>
            </div>
            <ul className="lp-trust three">
              <li>Free, no card</li>
              <li>Never registers you for anything</li>
              <li>Independent, not official Yale</li>
            </ul>
          </div>
          <div ref={heroRef} className="lp-hero-chat">
            <HeroChat who={who} starters={starters} onChangeWho={toPlan} onSignup={() => setAuth('signup')} />
          </div>
        </section>

        <section id="plan" className="lp-band">
          <div className="lp-band-head">
            <h2>Build your week. No account needed.</h2>
            <p className="muted">Tell Dan who you are, and it fills in what SOM already schedules for you. Then add electives and watch for clashes.</p>
          </div>
          <Workspace t={t} setT={setT} info={info} onSave={() => setAuth('signup')} onSignup={() => setAuth('signup')} />
        </section>

        <section id="answers" className="lp-band">
          <div className="lp-band-head"><h2>Straight answers</h2></div>
          <div className="lp-faq">
            {FAQ.map(([q, a]) => (
              <details key={q} className="card flat">
                <summary>{q}</summary>
                <p className="muted small">{a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="lp-band lp-account">
          <div className="lp-account-head">
            <h2>Keep your plan. Let Dan watch the deadlines.</h2>
            <p className="muted">A free account takes a minute, and the week you built here comes with you.</p>
          </div>
          <div className="lp-benefits">
            {BENEFITS.map((b) => (
              <div key={b.title} className="card flat lp-benefit">
                <span className="lp-benefit-icon"><b.icon className="icon" /></span>
                <h4>{b.title}</h4>
                <p className="muted small">{b.text}</p>
              </div>
            ))}
          </div>
          <div className="lp-account-cta">
            <button className="btn primary lg" onClick={() => setAuth('signup')}>Create a free account<ArrowRight className="icon" /></button>
            <span className="faint small">Already have one? <button className="link-btn small" onClick={() => setAuth('login')}>Log in</button></span>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <a href="#/privacy">Privacy</a>
        <span>Suggestions? Email us at <a href={`mailto:${CONTACT}?subject=Plan%20with%20Dan%20suggestion`}>{CONTACT}</a></span>
        <span>Made by <a href={CREATOR.url} target="_blank" rel="noreferrer">{CREATOR.name}</a>, {CREATOR.line}</span>
        <span className="faint">Independent student project, not an official Yale tool.</span>
      </footer>

      <DanChat onSignup={() => setAuth('signup')} hideLauncher={heroChatVisible} />
      {auth && <AuthDialog initial={auth} onClose={() => setAuth(null)} />}
    </div>
  )
}
