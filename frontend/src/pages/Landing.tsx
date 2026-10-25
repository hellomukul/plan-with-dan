/* Public home page. Order and copy come from a 5-persona survey (docs/landing_survey.md):
   1. Header: name, three links, Log in / Sign up (a dialog; no form on the page).
   2. Hero: a plain promise, two buttons and a trust line on the left; the live week builder on the right.
   3. "Ask Dan anything" bar: opens the Dan chat with the question already sent.
   4. Every program at a glance, synced with the builder, with "Coming up" dates beside it.
   5. Straight answers (moved above features: trust decides sign-up), incl. how picks are made.
   6. What a free account adds: six compact cards in plain words.
   7. Footer: privacy, suggestions email, credit. */
import { useEffect, useState, type FormEvent } from 'react'
import { ArrowRight, ExternalLink, Lock, MessageCircle, X, AlarmClock, CalendarDays, Compass, Globe, Sparkles, Target } from 'lucide-react'
import { api, type ProgramsInfo } from '../api'
import DanChat from '../components/DanChat'
import WeekBuilder from '../components/WeekBuilder'
import { Overlay } from '../components/ui'
import HandsomeDan from '../mascots/HandsomeDan'
import { prettyDate, relDays, daysUntil } from '../lib/format'
import { importTryout, loadTryout, type Tryout } from '../lib/tryout'
import { useApp } from '../state'
import './landing.css'

export const BRAND = { name: 'Plan with Dan', tagline: 'Your chief of staff at Yale SOM' }
const CREATOR = { name: 'Mukul Gupta', line: 'Yale SOM Class of 2028', url: 'https://www.linkedin.com/in/hellomukul/' }
const CONTACT = 'mukul.gupta@yale.edu'
const OWN_CALENDAR = new Set(['EMBA', 'MMS-PEM'])

const FEATURES = [
  { icon: AlarmClock, title: 'Weekly to-dos', sub: "Dan's Desk", text: 'The 3 things to do this week, each with its real SOM deadline.' },
  { icon: Sparkles, title: 'Course suggestions', sub: 'Best fits', text: 'Real courses matched to your goals, with the line from the description that shows why.' },
  { icon: Compass, title: 'Clash and rule checks', sub: 'My plan', text: 'Catches classes at the same time and checks your program’s unit rules.' },
  { icon: Globe, title: 'Global Studies planner', sub: 'For MBAs', text: 'Compare trips and online options against your funded travel days.' },
  { icon: Target, title: 'Bidding help', sub: 'Bid coach', text: 'Suggests how to spread your auction points. Past prices aren’t public, so it says so.' },
  { icon: CalendarDays, title: 'Calendar sync', sub: 'Google, Outlook, Apple', text: 'One private link; holidays and breaks already taken out.' },
]

const FAQ: [string, string][] = [
  ['Is this an official Yale tool?', 'No. It’s a free, independent student project. Rules come from the 2026–27 Yale Bulletin and courses from SOM’s public course directory, with sources linked. Always confirm on the SOM portal.'],
  ['Will it register me or change my courses in SOM’s systems?', 'Never. Registration and bidding happen only in SOM’s own systems. Dan suggests; every change to your plan in this app is yours, and every one can be undone.'],
  ['What do you store, and who sees it?', 'Visitors: nothing (the week builder lives in your browser). With an account: your email, a hashed password, your profile and plan, visible only to you. Export or delete everything anytime from the Privacy page.'],
  ['How does Dan pick courses?', 'AI suggests, software checks. The AI may only choose from real catalog courses, and code checks every pick, quote, time clash and unit rule before you see it. When the data doesn’t answer a question, Dan says so.'],
  ['Which programs work?', 'Full-time MBA (and joint degrees), MBA for Executives, MAM, every MMS track, and PhD students taking SOM courses. Where official data is missing (for example EMBA meeting times or MGT 627), the app tells you instead of guessing.'],
  ['What do “units”, “auction” and “add/drop” mean?', 'Units are SOM credits (most electives are 2 or 4). The auction is how SOM fills popular electives: you bid points. Add/drop is the week at the start of each half-term when you can still change courses for free.'],
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

/* ---------------------------------------------------------------- ask Dan anything */

function AskBar({ programLabel }: { programLabel: string }) {
  const [q, setQ] = useState('')
  const ask = (text: string) => { if (text.trim()) { window.dispatchEvent(new CustomEvent('dan:ask', { detail: text.trim() })); setQ('') } }
  const chips = [`What does the ${programLabel} require?`, 'Find a spring course on healthcare strategy', 'What’s the biggest AI news this week?']
  return (
    <div className="card lp-ask">
      <div className="lp-ask-row">
        <span className="lp-ask-avatar"><HandsomeDan size={30} furColor="#f4b183" bandanaColor="#00356b" /></span>
        <form className="lp-ask-form" onSubmit={(e) => { e.preventDefault(); ask(q) }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} maxLength={2000} placeholder="Ask Dan anything about SOM courses, programs or AI" aria-label="Ask Dan a question" />
          <button className="btn primary" disabled={!q.trim()}><MessageCircle className="icon sm" />Ask</button>
        </form>
      </div>
      <div className="lp-ask-chips">{chips.map((c) => <button key={c} type="button" className="chip" onClick={() => ask(c)}>{c}</button>)}</div>
      <p className="faint small" style={{ margin: 0 }}>Free, no account. Dan is an AI: it answers from SOM’s course data and the Yale Bulletin, links its sources, and says when it doesn’t know.</p>
    </div>
  )
}

/* ---------------------------------------------------------------- every program at a glance */

function ProgramGuide({ info, code, setCode }: { info: ProgramsInfo | null; code: string; setCode: (c: string) => void }) {
  if (!info) return <div className="card faint small">Loading program rules…</div>
  const p = info.programs.find((x) => x.code === code) ?? info.programs[0]
  const today = new Date(info.today + 'T00:00:00')
  return (
    <div className="lp-programs">
      <div className="card stack" style={{ gap: 12 }}>
        <div className="lp-chips" role="tablist" aria-label="Program">
          {info.programs.map((x) => (
            <button key={x.code} type="button" role="tab" aria-selected={x.code === p.code} className={`chip ${x.code === p.code ? 'on' : ''}`} onClick={() => setCode(x.code)}>{x.label}</button>
          ))}
        </div>
        <h3 style={{ margin: 0 }}>{p.label}</h3>
        <div className="lp-stats">
          <div><b>{p.total_units ?? '–'}</b><span>units to graduate</span></div>
          <div><b>{p.min_units ?? '–'}</b><span>minimum per term{p.base === 'MBA' ? ' (first 3)' : ''}</span></div>
          <div><b>{p.max_units ? `>${p.max_units}` : '–'}</b><span>needs approval</span></div>
        </div>
        <p className="muted small" style={{ margin: 0 }}>{p.summary}</p>
        {p.required.length > 0 && (
          <div>
            <div className="section-label"><span>Required courses</span></div>
            <ul className="lp-req">{p.required.map((r) => <li key={r.number + r.term}><span className="course-num">{r.number}</span> {r.title} <span className="faint">· {r.term === '202603' ? 'Fall' : 'Spring'} · {r.units} units</span></li>)}</ul>
          </div>
        )}
        <dl className="lp-kv small">
          <dt>Global</dt><dd>{p.global}</dd>
          <dt>Calendar</dt><dd>{p.calendar}</dd>
        </dl>
        {p.unconfirmed.length > 0 && <p className="small" style={{ margin: 0, color: 'var(--amber)' }}>Not in official sources yet: {p.unconfirmed.join('; ')}.</p>}
        <div className="row small" style={{ gap: 12, flexWrap: 'wrap' }}>
          {p.sources.slice(0, 3).map((u, i) => <a key={u} href={u} target="_blank" rel="noreferrer">{i === 0 ? 'Official requirements' : `Source ${i + 1}`}<ExternalLink className="icon sm" /></a>)}
        </div>
      </div>
      <div className="card">
        <div className="section-label"><span>Coming up</span></div>
        {OWN_CALENDAR.has(p.code) ? (
          <p className="small muted" style={{ margin: 0 }}>The {p.label} runs on its own calendar ({p.calendar.replace(/^Own calendar:?\s*/i, '')}), which Plan with Dan doesn’t model yet. <a href={p.sources[p.sources.length - 1]} target="_blank" rel="noreferrer">See the official calendar<ExternalLink className="icon sm" /></a></p>
        ) : (
          <>
            <ul className="lp-dates">
              {info.upcoming.map((d) => (
                <li key={d.date + d.title}>
                  <span className="mono faint">{prettyDate(d.date)}</span>
                  <span>{d.title.split(' (')[0]}</span>
                  <span className="faint small">{relDays(daysUntil(d.date, today))}</span>
                </li>
              ))}
            </ul>
            <p className="faint small" style={{ marginBottom: 0 }}>Shared calendar for the MBA, MAM and MMS programs.</p>
          </>
        )}
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- page */

export default function Landing() {
  const [auth, setAuth] = useState<null | 'signup' | 'login'>(null)
  const [info, setInfo] = useState<ProgramsInfo | null>(null)
  const [t, setTState] = useState<Tryout>(loadTryout)
  const setT = (f: (v: Tryout) => Tryout) => setTState(f)
  useEffect(() => { api.programs().then(setInfo).catch(() => undefined) }, [])
  const programLabel = info?.programs.find((p) => p.code === t.program)?.label ?? 'Full-time MBA'
  const openChat = () => window.dispatchEvent(new CustomEvent('dan:ask', { detail: '' }))

  return (
    <div className="lp">
      <header className="lp-header">
        <a className="brand" href="#/" style={{ padding: 0 }} aria-label={`${BRAND.name} home`}>
          <HandsomeDan size={30} furColor="#f4b183" bandanaColor="#00356b" />
          <span className="brand-name">{BRAND.name}</span>
        </a>
        <nav className="lp-nav hide-mobile" aria-label="Sections">
          <a href="#week">Your week</a>
          <a href="#programs">Programs</a>
          <a href="#answers">Questions</a>
        </nav>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn ghost sm" onClick={() => setAuth('login')}>Log in</button>
          <button className="btn primary sm" onClick={() => setAuth('signup')}>Sign up</button>
        </div>
      </header>

      <main className="lp-main">
        <section className="lp-hero" id="week">
          <div className="lp-hero-copy">
            <span className="sticker">{BRAND.tagline}</span>
            <h1>Plan your SOM term. <span className="grad-text">Clash-free, rule-checked, on time.</span></h1>
            <p className="muted lp-lede">
              Build your week from real SOM courses, check it against your program’s rules, and get reminded before
              deadlines. Free for every SOM program.
            </p>
            <div className="row">
              <button className="btn primary lg" onClick={() => setAuth('signup')}>Create a free account<ArrowRight className="icon" /></button>
              <button className="btn lg" onClick={openChat}><MessageCircle className="icon" />Ask Dan a question</button>
            </div>
            <ul className="lp-trust">
              <li>Free, no card</li>
              <li>Independent student project, not official Yale</li>
              <li>Never registers you for anything</li>
              <li>Nothing stored until you sign up</li>
            </ul>
          </div>
          <WeekBuilder t={t} setT={setT} programs={info?.programs ?? []} dataAsOf={info?.data_as_of} onSave={() => setAuth('signup')} />
        </section>

        <section className="lp-band lp-band-tight">
          <AskBar programLabel={programLabel} />
        </section>

        <section id="programs" className="lp-band">
          <div className="lp-band-head">
            <h2>Every SOM program, at a glance.</h2>
            <p className="muted">Units, per-term limits, required courses and calendars from the 2026–27 Yale Bulletin, each with its source.</p>
          </div>
          <ProgramGuide info={info} code={t.program} setCode={(c) => setT((v) => ({ ...v, program: c, year: '', cohort: '' }))} />
        </section>

        <section id="answers" className="lp-band">
          <div className="lp-band-head"><h2>Straight answers</h2></div>
          <div className="lp-faq">
            {FAQ.map(([q, a], i) => (
              <details key={q} className="card flat" open={i < 2}>
                <summary>{q}</summary>
                <p className="muted small">{a}</p>
              </details>
            ))}
          </div>
        </section>

        <section id="features" className="lp-band">
          <div className="lp-band-head">
            <h2>What a free account adds</h2>
            <p className="muted">Save your week, then let Dan keep it on track all term.</p>
          </div>
          <div className="lp-features">
            {FEATURES.map((f) => (
              <div key={f.title} className="card flat lp-feature">
                <f.icon className="icon" style={{ color: 'var(--pink)' }} />
                <div>
                  <h4>{f.title} <span className="faint small">· {f.sub}</span></h4>
                  <p className="muted small">{f.text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <a href="#/privacy">Privacy</a>
        <span>Suggestions? Email us at <a href={`mailto:${CONTACT}`}>{CONTACT}</a></span>
        <span>Made by <a href={CREATOR.url} target="_blank" rel="noreferrer">{CREATOR.name}</a>, {CREATOR.line}</span>
        <span className="faint">Independent student project, not an official Yale tool.</span>
      </footer>

      <DanChat onSignup={() => setAuth('signup')} />
      {auth && <AuthDialog initial={auth} onClose={() => setAuth(null)} />}
    </div>
  )
}
