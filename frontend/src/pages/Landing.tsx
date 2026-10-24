/* Public home page. One job per band:
   1. Header: brand, three anchors, Log in / Sign up (opens a dialog; no form on the page).
   2. Hero: the one-line promise on the left, the product itself on the right.
   3. Try it, no account: build a clash-checked week from real SOM courses (saved in this browser).
   4. Every SOM program at a glance, plus the next key dates (public facts from the Bulletin).
   5. What you get with an account, how a pick is made, honest FAQ.
   6. Footer: privacy, suggestions email, credit. */
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  AlarmClock, ArrowRight, CalendarDays, Check, Compass, ExternalLink, Globe, Lock, Plus, Search, ShieldCheck,
  Sparkles, Target, TriangleAlert, X,
} from 'lucide-react'
import { api, type ProgramsInfo, type Section } from '../api'
import Timetable, { sectionsClash } from '../components/Timetable'
import DanChat from '../components/DanChat'
import { Overlay } from '../components/ui'
import HandsomeDan from '../mascots/HandsomeDan'
import { prettyDate, relDays, daysUntil, TERM_NAMES } from '../lib/format'
import { importTryout, loadTryout, saveTryout, type Tryout } from '../lib/tryout'
import { useApp } from '../state'
import './landing.css'

export const BRAND = { name: 'Plan with Dan', tagline: 'Your chief of staff at Yale SOM' }
const CREATOR = { name: 'Mukul Gupta', line: 'Yale SOM Class of 2028', url: 'https://www.linkedin.com/in/hellomukul/' }
const CONTACT = 'mukul.gupta@yale.edu'

const FEATURES = [
  { icon: AlarmClock, title: "Dan's Desk", text: 'A two-line brief and the 3 decisions that matter this week, each with its real SOM deadline.' },
  { icon: Sparkles, title: 'Best fits', text: 'Real courses ranked against your goals, with the line from the description that proves it.' },
  { icon: Compass, title: 'Clash-proof plan', text: 'Half-terms, sections and your program’s unit rules, checked in code. Backups that fit the same slot.' },
  { icon: Globe, title: 'Global Studies', text: 'IE, GNW, SNOC or exchange, mapped against your funded travel days.' },
  { icon: Target, title: 'Bid coach', text: 'Split your points by priority and seat demand. Honest about what nobody knows.' },
  { icon: CalendarDays, title: 'Calendar sync', text: 'One private link for Google, Outlook or Apple Calendar, breaks already removed.' },
]

const FAQ = [
  ['Is this an official Yale tool?', 'No. It’s an independent student project. Rules come from the 2026–27 Yale Bulletin and course data from SOM’s public course directory, with sources linked. Always confirm on the SOM portal.'],
  ['Will it change my registration?', 'Never. Registration and bidding happen in SOM’s own systems. Dan only suggests; every change to your plan in this app is yours, and every one can be undone.'],
  ['What do you store, and who sees it?', 'Your email, a hashed password, your profile and plan. Only you can see them. You can export or delete everything from the Privacy page.'],
  ['Which programs does it support?', 'Full-time MBA (including joint degrees), MBA for Executives, MAM, every MMS track, and PhD students taking SOM courses. Where official data is missing, it says so instead of guessing.'],
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

/* ---------------------------------------------------------------- hero preview (the product, not a picture of it) */

function Preview() {
  return (
    <div className="card lp-preview" aria-label="Example of Dan's Desk">
      <div className="row between" style={{ marginBottom: 10 }}>
        <span style={{ fontWeight: 600 }}>Good afternoon, Alex</span>
        <span className="faint small mono">Dan’s Desk</span>
      </div>
      <div className="brief" style={{ fontSize: 14, marginBottom: 14 }}>
        Fall add/drop closes in 9 days. Spring is 3 units short of your minimum, and three clash-free fits are ready.
      </div>
      <div className="decisions">
        {[['Add 3 more units to Spring 2027', 'high', 'Jan 26'], ['Set your bid split for 4 courses', 'medium', 'Before the auction']].map(([t, s, d]) => (
          <div key={t} className="decision"><span className={`sev ${s}`} /><div className="body"><div className="title" style={{ fontSize: 13 }}>{t}</div></div><span className="due">{d}</span></div>
        ))}
      </div>
      <div className="fit" style={{ marginTop: 12 }}>
        <span className="tier strong"><span className="tier-dots"><i className="on" /><i className="on" /><i className="on" /></span>Strong fit</span>
        <span style={{ fontWeight: 600 }}>MGT 846 Introduction to Private Equity</span>
        <span className="row" style={{ gap: 6 }}><span className="reason">Matches: private equity</span><span className="reason">Fits Tue/Thu</span></span>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- try it: build a week, no account */

function TryTimetable({ programs, onSave }: { programs: ProgramsInfo['programs']; onSave: () => void }) {
  const { sections } = useApp()
  const [t, setT] = useState<Tryout>(loadTryout)
  const [q, setQ] = useState('')
  useEffect(() => { saveTryout(t) }, [t])

  const byId = useMemo(() => new Map(sections.map((s) => [s.id, s])), [sections])
  const open = (s: Section) => (s.audiences ?? s.programs).includes(t.program) && (!s.ends || s.ends >= new Date().toISOString().slice(0, 10))
  const picked = t.ids.map((id) => byId.get(id)).filter((s): s is Section => Boolean(s) && s!.term === t.term)
  const pickedKeys = new Set(picked.map((s) => s.key))

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (needle.length < 2) return []
    const seen = new Set<string>()
    const out: Section[] = []
    for (const s of sections) {
      if (s.term !== t.term || seen.has(s.key) || !open(s)) continue
      if (!`${s.number} ${s.title} ${s.faculty.join(' ')}`.toLowerCase().includes(needle)) continue
      seen.add(s.key)
      out.push(s)
      if (out.length >= 6) break
    }
    return out
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, sections, t.term, t.program])

  const clashIds = new Set<string>()
  const clashes: string[] = []
  picked.forEach((a, i) => picked.slice(i + 1).forEach((b) => {
    if (sectionsClash(a, b)) { clashIds.add(a.id); clashIds.add(b.id); clashes.push(`${a.number} and ${b.number}`) }
  }))
  const units = picked.reduce((n, s) => n + s.units, 0)
  const sectionsOf = (key: string) => sections.filter((s) => s.key === key && open(s))
  const add = (s: Section) => {
    const best = sectionsOf(s.key).find((x) => !picked.some((p) => sectionsClash(p, x))) ?? s
    setT((v) => ({ ...v, ids: [...v.ids.filter((id) => byId.get(id)?.key !== s.key), best.id].slice(-12) }))
    setQ('')
  }
  const swap = (oldId: string, newId: string) => setT((v) => ({ ...v, ids: v.ids.map((id) => (id === oldId ? newId : id)) }))
  const remove = (id: string) => setT((v) => ({ ...v, ids: v.ids.filter((x) => x !== id) }))

  return (
    <div className="lp-try">
      <div className="stack" style={{ gap: 12 }}>
        <div className="row" style={{ gap: 8 }}>
          <div className="tabs" role="tablist" aria-label="Term">
            {(['202701', '202603'] as const).map((code) => (
              <button key={code} type="button" className={t.term === code ? 'on' : ''} onClick={() => setT((v) => ({ ...v, term: code }))}>{TERM_NAMES[code]}</button>
            ))}
          </div>
          <label className="sr-only" htmlFor="try-program">Program</label>
          <select id="try-program" className="lp-select" value={t.program} onChange={(e) => setT((v) => ({ ...v, program: e.target.value }))}>
            {(programs.length ? programs : [{ code: 'MBA', label: 'Full-time MBA' }]).filter((p) => p.code !== 'MMS-PEM').map((p) => <option key={p.code} value={p.code}>{p.label}</option>)}
          </select>
        </div>
        <div className="lp-search">
          <Search className="icon sm faint" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a course, number or professor (try “private equity”)" aria-label="Search courses" />
        </div>
        {results.length > 0 && (
          <ul className="lp-results" role="listbox" aria-label="Matching courses">
            {results.map((s) => (
              <li key={s.key}>
                <button type="button" onClick={() => add(s)} disabled={pickedKeys.has(s.key)}>
                  <span><span className="course-num">{s.number}</span> {s.title}<span className="faint small"> · {s.time || 'time TBA'} · {s.units} units</span></span>
                  {pickedKeys.has(s.key) ? <Check className="icon sm" /> : <Plus className="icon sm" />}
                </button>
              </li>
            ))}
          </ul>
        )}
        <ul className="lp-picked">
          {picked.length === 0 && <li className="faint small">Add two or three courses to see your week and any clashes.</li>}
          {picked.map((s) => {
            const options = sectionsOf(s.key)
            return (
              <li key={s.id} className={clashIds.has(s.id) ? 'clash' : ''}>
                <span className="lp-picked-name"><span className="course-num">{s.number}</span> {s.title}</span>
                {options.length > 1 ? (
                  <select className="lp-select sm" value={s.id} onChange={(e) => swap(s.id, e.target.value)} aria-label={`Section of ${s.number}`}>
                    {options.map((o) => <option key={o.id} value={o.id}>§{o.section} · {o.time || 'TBA'}</option>)}
                  </select>
                ) : <span className="faint small">{s.time || 'time TBA'}</span>}
                <button type="button" className="btn icon ghost" aria-label={`Remove ${s.number}`} onClick={() => remove(s.id)}><X className="icon sm" /></button>
              </li>
            )
          })}
        </ul>
        {picked.length > 0 && (
          <div className="row between small" style={{ flexWrap: 'wrap', gap: 8 }}>
            <span className="mono">{units} units</span>
            {clashes.length
              ? <span className="lp-clash"><TriangleAlert className="icon sm" />{clashes.length === 1 ? `${clashes[0]} clash` : `${clashes.length} clashes`}. Try another section.</span>
              : <span className="pa-ok"><Check className="icon sm" /> No clashes</span>}
          </div>
        )}
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn primary" onClick={onSave} disabled={!picked.length}>Save this week to a free plan<ArrowRight className="icon sm" /></button>
          <span className="faint small">Saved in this browser until you do.</span>
        </div>
      </div>
      <div className="card lp-week"><Timetable sections={picked} clashIds={clashIds} /></div>
    </div>
  )
}

/* ---------------------------------------------------------------- every program at a glance */

function ProgramGuide({ info }: { info: ProgramsInfo | null }) {
  const [code, setCode] = useState('MBA')
  if (!info) return <div className="card faint small">Loading program rules…</div>
  const p = info.programs.find((x) => x.code === code) ?? info.programs[0]
  const today = new Date(info.today + 'T00:00:00')
  return (
    <div className="lp-programs">
      <div className="card stack" style={{ gap: 12 }}>
        <div className="lp-chips" role="tablist" aria-label="Program">
          {info.programs.map((x) => (
            <button key={x.code} type="button" role="tab" aria-selected={x.code === code} className={`chip ${x.code === code ? 'on' : ''}`} onClick={() => setCode(x.code)}>{x.label}</button>
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
        <ul className="lp-dates">
          {info.upcoming.map((d) => (
            <li key={d.date + d.title}>
              <span className="mono faint">{prettyDate(d.date)}</span>
              <span>{d.title.split(' (')[0]}</span>
              <span className="faint small">{relDays(daysUntil(d.date, today))}</span>
            </li>
          ))}
        </ul>
        <p className="faint small" style={{ marginBottom: 0 }}>{info.calendar_note}</p>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- page */

export default function Landing() {
  const [auth, setAuth] = useState<null | 'signup' | 'login'>(null)
  const [info, setInfo] = useState<ProgramsInfo | null>(null)
  useEffect(() => { api.programs().then(setInfo).catch(() => undefined) }, [])

  return (
    <div className="lp">
      <header className="lp-header">
        <a className="brand" href="#/" style={{ padding: 0 }} aria-label={`${BRAND.name} home`}>
          <HandsomeDan size={30} furColor="#f4b183" bandanaColor="#00356b" />
          <span className="brand-name">{BRAND.name}</span>
        </a>
        <nav className="lp-nav hide-mobile" aria-label="Sections">
          <a href="#try">Try it</a>
          <a href="#programs">Programs</a>
          <a href="#features">Features</a>
        </nav>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn ghost sm" onClick={() => setAuth('login')}>Log in</button>
          <button className="btn primary sm" onClick={() => setAuth('signup')}>Sign up</button>
        </div>
      </header>

      <main className="lp-main">
        <section className="hero">
          <div className="stack" style={{ gap: 18 }}>
            <span className="sticker" style={{ alignSelf: 'flex-start' }}>Spring 2027 planning is open</span>
            <h1>Your chief of staff for <span className="grad-text">life at Yale SOM.</span></h1>
            <p className="muted lp-lede">
              Dan watches your deadlines, plan and degree rules, tells you the few decisions that matter this week, and
              finds real courses that fit your goals. Nothing changes until you click.
            </p>
            <div className="row">
              <button className="btn primary lg" onClick={() => setAuth('signup')}>Start free<ArrowRight className="icon" /></button>
              <a className="btn lg" href="#try">Build your week, no account</a>
            </div>
            <div className="row small muted" style={{ gap: 16 }}>
              <span className="row" style={{ gap: 6 }}><Check className="icon sm" />Every SOM program</span>
              <span className="row" style={{ gap: 6 }}><Check className="icon sm" />Real courses, verified in code</span>
              <span className="row" style={{ gap: 6 }}><Check className="icon sm" />Undo for every change</span>
            </div>
          </div>
          <div className="mascot-stage"><Preview /></div>
        </section>

        <section id="try" className="lp-band">
          <div className="lp-band-head">
            <h2>Build your week. No account needed.</h2>
            <p className="muted">Real Fall 2026 and Spring 2027 SOM sections for your program, with clashes caught as you go, including half-term sessions.</p>
          </div>
          <TryTimetable programs={info?.programs ?? []} onSave={() => setAuth('signup')} />
        </section>

        <section id="programs" className="lp-band">
          <div className="lp-band-head">
            <h2>Every SOM program, at a glance.</h2>
            <p className="muted">Units, per-term limits, required courses and calendars from the 2026–27 Yale Bulletin, each with its source.</p>
          </div>
          <ProgramGuide info={info} />
        </section>

        <section id="features" className="lp-band">
          <div className="lp-band-head">
            <h2>With a free account, Dan keeps watch.</h2>
            <p className="muted">Your profile and goals turn the catalog into a plan, and Dan keeps it on track all term.</p>
          </div>
          <div className="lp-features">
            {FEATURES.map((f) => (
              <div key={f.title} className="card flat">
                <f.icon className="icon lg" style={{ color: 'var(--pink)' }} />
                <h4 style={{ margin: '8px 0 4px' }}>{f.title}</h4>
                <p className="muted small" style={{ margin: 0 }}>{f.text}</p>
              </div>
            ))}
          </div>
          <div className="card mt">
            <div className="card-title"><ShieldCheck className="icon" /> How a recommendation is made</div>
            <div className="pipeline">
              {[['Your goals', 'code'], ['Retriever (code)', 'code'], ['Curator agent', 'ai'], ['Validator (code)', 'code'], ['Scheduler (code)', 'code'], ['Critic agent', 'ai']].map(([label, kind], i, arr) => (
                <span key={label} className="row" style={{ gap: 6 }}>
                  <span className={`pipe-node ${kind}`}>{label}</span>
                  {i < arr.length - 1 && <span className="pipe-arrow">→</span>}
                </span>
              ))}
            </div>
            <p className="muted small mt" style={{ marginBottom: 0 }}>The AI only chooses from real catalog courses. Code checks every pick, quote and clash before you see it, and Dan says “I don’t know” rather than guess.</p>
          </div>
        </section>

        <section className="lp-band">
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
