/* Global studies & Leadership: two separate MBA requirements.
   GSR = one global experience, planned against the 10-day GSA budget. LDR = one elective from the approved list.
   The auction rules come from the registrar's email (GET /api/programs -> auction) and show to first-year MBAs only. */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, ArrowDown, Check, ChevronDown, Circle, CircleDot, Compass, ExternalLink, Globe, GraduationCap, Monitor, Plane, Plus, Sprout, X,
  type LucideIcon,
} from 'lucide-react'
import { api, auctionApplies, type AuctionInfo, type GlobalChoice, type GsrOption, type ProgramInfo, type RequirementsResponse } from '../api'
import CourseDrawer from '../components/CourseDrawer'
import { Empty, Spinner } from '../components/ui'
import { daysUntil, prettyDate, quarterDates, relDays, termName } from '../lib/format'
import { blockedLabel, verdict as sectionVerdict } from '../lib/eligibility'
import { useApp } from '../state'
import './pages-b.css'
import './global.css'

const OPTION_ICON: Record<string, LucideIcon> = {
  ie: Plane, gnw: Globe, snoc: Monitor, gse_india: Compass, gse_spring: Sprout, exchange: GraduationCap,
}
const SHORT: Record<string, string> = {
  ie: 'IE', gnw: 'GNW', snoc: 'SNOC', gse_india: 'GSE India', gse_spring: 'Spring GSE', exchange: 'Exchange term',
}
const STATUSES: { value: GlobalChoice['status'] | ''; label: string }[] = [
  { value: '', label: 'Not tracking' },
  { value: 'considering', label: 'Considering' },
  { value: 'applied', label: 'Applied' },
  { value: 'done', label: 'Done' },
]
/** Terms a student can aim an option at. Second-years and one-year programs finish in May 2027; first-year MBAs
    (and other multi-year students) can plan into 2027-28. An exchange is a second-year term, so first-years get
    Fall 2027 or Spring 2028 for it. Values are plain term names, as saved before. */
function targetTerms(optKey: string, program?: string, year?: string): string[] {
  const finishing = year === '2' || /^(MAM|MMS)/.test(program ?? '')
  if (finishing) return [termName('202701')]
  if (optKey === 'exchange') return [termName('202703'), termName('202801')]
  return ['202701', '202703', '202801'].map(termName)
}

/** "Spring-1 → Spring-2 break" when a travel window falls between a term's two quarters (from catalog dates). */
function quarterBreak(q: Record<string, { starts: string; ends: string }>, start: string, end: string): string {
  for (const [season, name] of [['fall', 'Fall'], ['spring', 'Spring']]) {
    const a = q[`${season}-1`], b = q[`${season}-2`]
    if (a && b && a.ends < start && end < b.starts) return `${name}-1 → ${name}-2 break`
  }
  return ''
}

type FitKey = 'travel' | 'fullTerm' | 'tight'
const FIT_QUESTIONS: { key: FitKey; label: string }[] = [
  { key: 'travel', label: 'I want to travel' },
  { key: 'fullTerm', label: 'I want a full term abroad' },
  { key: 'tight', label: 'Keep my costs low' },
]

/** Pure client logic: which options to spotlight for the toggles, with a one-line why. Uses only facts from rules.py. */
function recommend(fit: Record<FitKey, boolean>, options: GsrOption[]): Record<string, string> {
  const out: Record<string, string> = {}
  if (fit.fullTerm) out.exchange = 'A whole term at a partner school in your second year.'
  if (fit.travel && !fit.tight) {
    out.ie = 'The deepest trip: half a term in class, then a ~10-day trip.'
    out.gse_spring = 'One week of fieldwork in March on a social-enterprise project.'
  }
  if (fit.travel) out.gnw = fit.tight ? 'The shortest trip (about a week), so fewer days to fund.' : 'About a week at a Global Network school, twice a year.'
  if (fit.tight || (!fit.travel && !fit.fullTerm)) out.snoc = 'Online with Global Network classmates: zero travel cost. A seat is not guaranteed, so keep a backup.'
  // Never spotlight something the GSA rules already rule out (e.g. IE after any day is used).
  for (const o of options) if (out[o.key] && !o.budget_check.ok) delete out[o.key]
  return out
}

/** US spelling for program notes that come from the Bulletin's British wording ("subsidised"). */
const us = (t: string) => t.replace(/subsidis/gi, (m) => (m[0] === 'S' ? 'Subsidiz' : 'subsidiz'))

/** The GSA check in plain words: what this option would use from the days you still have (not what you've spent). */
function budgetText(opt: GsrOption, left: number): string {
  const bc = opt.budget_check
  if (!bc.ok) return bc.reason.replace(/\d{4}-\d{2}-\d{2}/g, (d) => prettyDate(d).replace(/^\w+, /, ''))
  const need = opt.gsa_days || 0
  if (!need) return 'Uses none of your GSA days. Cash costs, if any, are separate.'
  if (need > left) return `Uses about ${need} days and you have ${left} left, so the rest is out of pocket.`
  return `Uses about ${need} of your ${left} days left; ${left - need === 0 ? 'none' : left - need} left after. Cash costs like airfare are separate.`
}

/** "Mar 8–19" / "Mar 8 – Apr 2" from two ISO dates. */
function span(start: string, end: string) {
  const f = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d) }
  const a = f(start), b = f(end)
  const mon = (d: Date) => d.toLocaleDateString('en-US', { month: 'short' })
  return a.getMonth() === b.getMonth() ? `${mon(a)} ${a.getDate()}–${b.getDate()}` : `${mon(a)} ${a.getDate()} – ${mon(b)} ${b.getDate()}`
}
const shortDate = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }

type Tone = 'done' | 'progress' | 'todo'
function Pill({ tone, children }: { tone: Tone; children: string }) {
  const Icon = tone === 'done' ? Check : tone === 'progress' ? CircleDot : Circle
  return <span className={`gl-pill ${tone}`}><Icon className="icon sm" aria-hidden="true" />{children}</span>
}

export default function Global() {
  const { profile, refreshProfile, addCourse, plannedIds, toast, sectionById, sections } = useApp()
  const [data, setData] = useState<RequirementsResponse | null>(null)
  const [auction, setAuction] = useState<AuctionInfo | null>(null)
  const [programs, setPrograms] = useState<ProgramInfo[]>([])
  const [adding, setAdding] = useState<string | null>(null)  // one add at a time (no double adds on double-click)
  const [error, setError] = useState('')
  const [drawerKey, setDrawerKey] = useState<string | null>(null)
  const [daysDraft, setDaysDraft] = useState<string | null>(null)
  const [savingDays, setSavingDays] = useState(false)
  const [busyOption, setBusyOption] = useState<string | null>(null)
  const [fit, setFit] = useState<Record<FitKey, boolean>>({ travel: false, fullTerm: false, tight: false })
  const [showAllLdr, setShowAllLdr] = useState(false)
  // Phones: each option's details and course list fold away (the page was 10,000px tall); you open the ones you want.
  const [openOpts, setOpenOpts] = useState<Set<string>>(new Set())
  const toggleOpt = (key: string) => setOpenOpts((cur) => { const n = new Set(cur); if (n.has(key)) n.delete(key); else n.add(key); return n })

  const load = useCallback(() => api.requirements().then(
    (r) => { setData(r); setError('') },
    (e: Error) => setError(e.message || 'Could not load your requirements.'),
  ), [])

  useEffect(() => { void load() }, [load])
  // The registrar's auction email (public, stored in rules.py). Optional: the page works without it.
  useEffect(() => { api.programs().then((p) => { setAuction(p.auction ?? null); setPrograms(p.programs ?? []) }).catch(() => undefined) }, [])

  const choices = useMemo(() => {
    const m = new Map<string, GlobalChoice>()
    for (const c of data?.progress.gsr.choices ?? []) m.set(c.option_key, c)
    return m
  }, [data])

  const recs = useMemo(() => (data ? recommend(fit, data.gsr.options) : {}), [fit, data])
  const quarters = useMemo(() => quarterDates(sections), [sections])
  const anyFit = fit.travel || fit.fullTerm || fit.tight
  const firstYear = auctionApplies(profile?.program, profile?.year)
  const mba = !profile?.program || profile.program === 'MBA' || profile.program === 'MBA-JOINT'
  const myProgram = programs.find((p) => p.code === profile?.program)
  const who = { program: profile?.program || 'MBA', year: profile?.year ?? '', cohort: profile?.cohort ?? '' }
  const add = async (key: string, id: string) => {
    if (adding) return
    setAdding(key)
    try { await addCourse(id); await load() } finally { setAdding(null) }
  }

  if (error && !data) {
    return (
      <>
        <PageHead />
        <div className="card">
          <Empty icon={<AlertTriangle className="icon lg" style={{ color: 'var(--amber)' }} />} title="Couldn't load Global studies">
            <p className="error-text" style={{ margin: 0 }}>{error}</p>
            <button className="btn primary" onClick={() => void load()}>Try again</button>
          </Empty>
        </div>
      </>
    )
  }
  if (!data) {
    return (
      <>
        <PageHead />
        <GlobalSkeleton />
      </>
    )
  }

  const { gsr, ldr, progress, sources } = data
  const left = Math.max(0, gsr.gsa_days - gsr.gsa_used)
  const draftNum = daysDraft === null ? gsr.gsa_used : Number(daysDraft)
  // an empty field is not 0: it has to be a number from 0 to 10 before Save turns on
  const draftValid = (daysDraft === null || daysDraft.trim() !== '') && Number.isInteger(draftNum) && draftNum >= 0 && draftNum <= gsr.gsa_days
  const draftChanged = draftValid && draftNum !== gsr.gsa_used

  const gsrTone: Tone = progress.gsr.met ? 'done' : progress.gsr.planned || choices.size ? 'progress' : 'todo'
  const ldrTone: Tone = progress.ldr.met ? 'done' : progress.ldr.planned ? 'progress' : 'todo'
  const ieWeek = gsr.weeks.find((w) => /international experience/i.test(w.name))
  // "rounds 1–2" exactly as the registrar wrote it; never guessed.
  const globalRounds = firstYear ? auction?.rounds[0]?.match(/rounds?\s+\d+\s*[–-]\s*\d+/i)?.[0] : undefined
  const steps = [
    { title: 'Pick an option', sub: mba ? `Six ways below, each checked against your ${gsr.gsa_days} GSA days.` : 'Six MBA options below; GNW and online courses are open to many programs.' },
    globalRounds && auction
      ? { title: `Bid in ${globalRounds}`, sub: `IE, GNW and SNOC go through the course auction, ${shortDate(auction.opens)} – ${shortDate(auction.closes)}.` }
      : { title: 'Bid in the auction', sub: 'IE, GNW and SNOC seats go through the course auction.' },
    ieWeek
      ? { title: `Travel ${span(ieWeek.start, ieWeek.end)}`, sub: quarterBreak(quarters, ieWeek.start, ieWeek.end)
        ? `In the ${quarterBreak(quarters, ieWeek.start, ieWeek.end)}: no SOM classes while IE and GNW travel.` : 'No SOM classes while IE and GNW travel.' }
      : { title: 'Travel', sub: 'Dates are on the option you pick.' },
  ]

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  const saveDays = async () => {
    if (!profile) { toast('Your profile is still loading. Try again in a moment.', 'bad'); return }
    if (!draftValid) { toast(`Enter a whole number from 0 to ${gsr.gsa_days}.`, 'bad'); return }
    setSavingDays(true)
    try {
      await api.saveProfile({ ...profile, gsa_days_used: draftNum })
      await Promise.all([refreshProfile(), load()])
      setDaysDraft(null)
      toast('GSA days updated', 'good')
    } catch (e) {
      toast((e as Error).message, 'bad')
    } finally {
      setSavingDays(false)
    }
  }

  const track = async (opt: GsrOption, patch: { status?: GlobalChoice['status'] | ''; target_term?: string }) => {
    const prev = choices.get(opt.key)
    setBusyOption(opt.key)
    try {
      if (patch.status === '') {
        await api.removeGlobal(opt.key)
        toast(`Stopped tracking ${opt.name}.`)
      } else {
        await api.saveGlobal({
          option_key: opt.key,
          target_term: patch.target_term ?? prev?.target_term ?? '',
          status: patch.status ?? prev?.status ?? 'considering',
          note: prev?.note ?? '',
        })
        if (patch.status === 'done') toast('Global Studies marked done. Nice work.', 'good')
        else if (patch.status) toast(`${opt.name}: marked ${patch.status}`, 'good')
      }
      await load()
    } catch (e) {
      toast((e as Error).message, 'bad')
    } finally {
      setBusyOption(null)
    }
  }

  const ldrShown = showAllLdr ? ldr.courses : ldr.courses.slice(0, 10)
  const upcomingSessions = (auction?.sessions ?? []).filter((s) => daysUntil(s.date) >= 0)
  // Travel weeks for everyone; the registrar's global-option auction deadlines for first-year MBAs only.
  const keyDates = [
    ...gsr.weeks.map((w) => ({ name: w.name, start: w.start, end: w.end })),
    ...(firstYear && auction
      ? auction.dates.filter((d) => d.kind === 'deadline' && /\b(GNW|IE|SNOC)\b|course auction/i.test(d.title))
        .map((d) => ({ name: d.title, start: d.date, end: d.end }))
      : []),
  ].sort((a, b) => a.start.localeCompare(b.start))

  return (
    <>
      <PageHead />

      {/* ------------------------------------------------ the two requirements */}
      <section className="card pad-lg gl-reqs" aria-labelledby="reqs-h">
        <div className="gl-reqs-head">
          <h2 id="reqs-h">Two separate requirements</h2>
          <p>{mba
            ? 'You need both to graduate, and one never counts for the other.'
            : 'Both are full-time MBA requirements, shown here for reference. Your program’s rule is in the note above.'}</p>
        </div>
        <div className="gl-req-grid">
          <button type="button" className="gl-req" onClick={() => scrollTo('gsr')}>
            <span className="gl-req-top"><span className="gl-code">GSR</span>{mba ? <Pill tone={gsrTone}>{gsrTone === 'done' ? 'Done' : gsrTone === 'progress' ? 'In progress' : 'Not started'}</Pill> : <span className="gl-pill">MBA rule</span>}</span>
            <b>Global Studies</b>
            <span className="gl-req-text">{mba ? `One global experience, paid with your ${gsr.gsa_days} funded travel days.` : `Full-time MBAs do one global experience, paid with ${gsr.gsa_days} funded travel days.`}</span>
            <span className="gl-req-go">See the six options<ArrowDown className="icon sm" aria-hidden="true" /></span>
          </button>
          <button type="button" className="gl-req" onClick={() => scrollTo('ldr')}>
            <span className="gl-req-top"><span className="gl-code">LDR</span>{mba ? <Pill tone={ldrTone}>{ldrTone === 'done' ? 'Done' : ldrTone === 'progress' ? 'In your plan' : 'Not started'}</Pill> : <span className="gl-pill">MBA rule</span>}</span>
            <b>Leadership</b>
            <span className="gl-req-text">{ldr.summary}</span>
            <span className="gl-req-go">See the approved list<ArrowDown className="icon sm" aria-hidden="true" /></span>
          </button>
        </div>
      </section>

      {/* ------------------------------------------------ GSR */}
      <section id="gsr" className="gl-section" aria-labelledby="gsr-h">
        <div className="pb-section-head">
          <div>
            <h2 id="gsr-h">Global Studies Requirement (GSR)</h2>
            <p>Do one global experience before you graduate. Most options spend some of your funded days, so pick with the budget in mind.</p>
          </div>
        </div>

        <ol className="gl-steps" aria-label="How the GSR works">
          {steps.map((s, i) => (
            <li key={s.title} className="gl-step">
              <span className="gl-step-n" aria-hidden="true">{i + 1}</span>
              <span className="gl-step-body"><b>{s.title}</b><span>{s.sub}</span></span>
            </li>
          ))}
        </ol>

        {firstYear && auction && (
          <div className="card gl-auction mt" aria-labelledby="gl-auction-h">
            <div className="section-label"><span id="gl-auction-h">Bidding on IE, GNW or SNOC</span><span className="badge pink">Class of 2028</span></div>
            <div className="gl-auction-grid">
              <ul className="pb-list small">
                {[auction.rounds[0], ...auction.global].filter(Boolean).map((line) => <li key={line}>{line}</li>)}
              </ul>
              {upcomingSessions.length > 0 && (
                <ul className="gl-sessions" aria-label="Sessions">
                  {upcomingSessions.map((s) => (
                    <li key={s.date + s.title}>
                      <span className="gl-session-date">{shortDate(s.date)}</span>
                      <span className="gl-session-main"><b>{s.title}</b><span>{s.time} · {s.where}</span></span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <p className="small faint" style={{ margin: '10px 0 0' }}>Source: {auction.source}.</p>
          </div>
        )}

        {/* ------------------------------------------------ GSA budget */}
        {!mba ? (
          <div className="card pad-lg mt gl-prog">
            <div className="section-label"><span>Travel funding for {myProgram?.label ?? 'your program'}</span></div>
            {(() => {
              // Lead with the number when the Bulletin gives one ("5 subsidised travel days"); the full rule is in the note above.
              const days = myProgram?.global.match(/(\d+)\s+(?:subsidi[sz]ed|funded)\s+travel days/i)?.[1]
              return days
                ? <p className="pb-big" style={{ margin: 0 }}>{days} <small>funded travel days for a GNW or GSE course</small></p>
                : <p className="gl-prog-text">{myProgram ? us(myProgram.global) : 'Loading your program’s rule…'}</p>
            })()}
            <p className="small muted" style={{ margin: 0 }}>Full-time MBAs have a 10-day Global Studies Account instead; the day checks below are their rules, shown for reference.</p>
          </div>
        ) : (
        <div className="card pad-lg pb-hero mt">
          <div>
            <div className="section-label"><span>Global Studies Account (GSA)</span></div>
            <div className="pb-big" aria-live="polite">
              {left} <small>of {gsr.gsa_days} funded days left</small>
            </div>
            <div className="pb-days" role="img" aria-label={`${left} of ${gsr.gsa_days} GSA days left, ${gsr.gsa_used} used`}>
              {Array.from({ length: gsr.gsa_days }, (_, i) => (
                <span key={i} className={`pb-day ${i < left ? 'left' : ''}`}>{i + 1}</span>
              ))}
            </div>
            <div className="row mt" style={{ gap: 8 }}>
              <label htmlFor="gsa-used" className="small muted">Days I've already used</label>
              <input
                id="gsa-used"
                className="pb-inline-num"
                type="number"
                min={0}
                max={gsr.gsa_days}
                step={1}
                inputMode="numeric"
                value={daysDraft ?? String(gsr.gsa_used)}
                onChange={(e) => setDaysDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && draftChanged) void saveDays() }}
                aria-invalid={!draftValid}
                aria-describedby="gsa-note"
              />
              <button className={`btn sm gl-save ${draftChanged ? 'primary' : ''}`} onClick={() => void saveDays()} disabled={!draftChanged || savingDays}>
                {savingDays ? 'Saving…' : 'Save'}
              </button>
            </div>
            {/* the note and the error share one cell, so a typo never changes the page length */}
            <p id="gsa-note" className="small gl-swap" aria-live="polite">
              <span className={`muted ${draftValid ? 'on' : ''}`}>Everyone starts with {gsr.gsa_days}. They're never topped up and unused days are lost, so spend them on purpose.</span>
              <span className={`error-text ${draftValid ? '' : 'on'}`}>Enter a whole number from 0 to {gsr.gsa_days}.</span>
            </p>
          </div>

          <dl className="pb-kv gl-where">
            <dt>In your plan</dt>
            <dd>{progress.gsr.in_plan.length ? progress.gsr.in_plan.join(' · ') : 'No Global Studies course yet.'}</dd>
            <dt>Tracking</dt>
            <dd>
              {choices.size
                ? [...choices.values()].map((c) => {
                  const name = SHORT[c.option_key] ?? c.option_key
                  return `${name} (${c.status}${c.target_term ? `, ${c.target_term}` : ''})`
                }).join(' · ')
                : 'Nothing yet. Set a status on any option below.'}
            </dd>
          </dl>
        </div>
        )}

        {/* ------------------------------------------------ helper + dates */}
        <div className="grid two mt">
          <div className="card gl-fit-card">
            <div className="section-label"><span>Which one fits me?</span></div>
            <p className="small muted">Turn on what's true for you and we'll highlight the matches. Simple rules, no AI.</p>
            <div className="pb-toggles">
              {FIT_QUESTIONS.map((q) => (
                <button
                  key={q.key}
                  type="button"
                  role="switch"
                  aria-checked={fit[q.key]}
                  className="pb-switch"
                  onClick={() => setFit((f) => ({ ...f, [q.key]: !f[q.key] }))}
                >
                  <span>{q.label}</span>
                  <span className="pb-knob" aria-hidden="true" />
                </button>
              ))}
            </div>
            {/* fixed box: room for the longest answer (four one-line matches), so switching never moves the page */}
            <div className="gl-fit" aria-live="polite">
              {!anyFit ? (
                <p className="faint">Your matches show up here and get a "Good fit" tag below.</p>
              ) : Object.keys(recs).length ? (
                <ul>
                  {gsr.options.filter((o) => recs[o.key]).map((o) => (
                    <li key={o.key} title={`${o.name}: ${recs[o.key]}`}><b>{SHORT[o.key] ?? o.name}</b> <span className="muted">· {recs[o.key]}</span></li>
                  ))}
                </ul>
              ) : (
                <p className="muted">Nothing matches that combination with your current GSA days. Try turning one off.</p>
              )}
            </div>
          </div>

          <div className="card">
            <div className="section-label"><span>Key dates</span></div>
            <ol className="pb-timeline">
              {keyDates.map((w) => {
                const d = daysUntil(w.start)
                const past = daysUntil(w.end) < 0
                return (
                  <li key={`${w.name}-${w.start}`} className={past ? 'past' : ''}>
                    <span className="pb-dot" aria-hidden="true" />
                    <div className="gl-week">
                      <b>{w.name}</b>
                      <span className={`badge ${!past && d <= 60 ? 'amber' : 'gray'}`}>{past ? 'Done' : relDays(d)}</span>
                      <span className="pb-date">{prettyDate(w.start)}{w.end !== w.start ? ` – ${prettyDate(w.end)}` : ''}, {w.start.slice(0, 4)}{quarterBreak(quarters, w.start, w.end) ? ` · ${quarterBreak(quarters, w.start, w.end)}` : ''}</span>
                    </div>
                  </li>
                )
              })}
            </ol>
          </div>
        </div>

        {/* ------------------------------------------------ options */}
        <div className="pb-section-head mt-lg">
          <div>
            <h2>Six ways to finish it</h2>
            <p>Pick one. Each is checked against your GSA days and lists the matching courses from SOM's public catalog.</p>
          </div>
        </div>
        <div className="pb-opts">
          {gsr.options.map((opt) => {
            const choice = choices.get(opt.key)
            const highlighted = anyFit && Boolean(recs[opt.key])
            const dim = anyFit && !highlighted
            const bc = opt.budget_check
            const fitsTone = !bc.ok ? 'no' : /out of pocket/i.test(bc.reason) ? 'warn' : 'ok'
            const CheckIcon = fitsTone === 'ok' ? Check : fitsTone === 'warn' ? AlertTriangle : X
            const Icon = OPTION_ICON[opt.key] ?? Globe
            const busy = busyOption === opt.key
            // the quarters its catalog courses run in ("Spring-1 2027"), straight from the sections; none for exchange
            const optQuarters = [...new Set(opt.courses.flatMap((c) => c.section_ids.map((id) => sectionById.get(id)?.quarter).filter(Boolean)))]
            return (
              <article key={opt.key} className={`pb-opt ${highlighted ? 'hi' : ''} ${dim ? 'dim' : ''} ${openOpts.has(opt.key) ? 'open' : ''}`} aria-labelledby={`opt-${opt.key}`}>
                <div className="pb-opt-head">
                  <span className="pb-opt-icon" aria-hidden="true"><Icon className="icon" /></span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="gl-opt-title">
                      <h3 id={`opt-${opt.key}`}>{opt.name}</h3>
                      {/* always in the layout (hidden when off), so the title never re-wraps */}
                      <span className={`badge pink gl-fit-tag ${highlighted ? 'on' : ''}`} aria-hidden={!highlighted}>Good fit</span>
                    </div>
                    <div className="row" style={{ gap: 6 }}>
                      <span className="badge gray">{opt.units != null ? `${opt.units} units` : 'Units vary'}</span>
                      <span className="badge gray">{opt.gsa_days ? `~${opt.gsa_days} GSA days` : '0 GSA days'}</span>
                      {opt.airfare && <span className="badge amber"><Plane className="icon sm" />You pay airfare</span>}
                      {opt.requires_full_gsa && <span className="badge amber">Needs all 10 days</span>}
                      {opt.apply_by && opt.apply_by < new Date().toISOString().slice(0, 10) && <span className="badge gray">Applications closed {shortDate(opt.apply_by)}</span>}
                    </div>
                  </div>
                </div>

                {mba ? (
                  <div className={`pb-check ${fitsTone}`}>
                    <CheckIcon className="icon sm" aria-hidden="true" />
                    <span><span className="pb-sr">{fitsTone === 'ok' ? '' : fitsTone === 'warn' ? 'Partly fits: ' : 'Not available: '}</span>{budgetText(opt, left)}</span>
                  </div>
                ) : (
                  <div className="pb-check warn"><Globe className="icon sm" aria-hidden="true" /><span>MBA option. Open to you only where a course below says so.</span></div>
                )}

                <button type="button" className="gl-opt-toggle" aria-expanded={openOpts.has(opt.key)} aria-controls={`opt-body-${opt.key}`} onClick={() => toggleOpt(opt.key)}>
                  <span>{openOpts.has(opt.key) ? 'Hide details' : `When, cost${opt.courses.length ? ` and ${opt.courses.length} course${opt.courses.length === 1 ? '' : 's'}` : ' and how to enroll'}`}</span>
                  <ChevronDown className="icon sm" aria-hidden="true" />
                </button>
                <div className="pb-opt-body" id={`opt-body-${opt.key}`}>
                  <dl className="pb-kv">
                    <dt>When</dt><dd>{opt.timing}</dd>
                    {optQuarters.length > 0 && <><dt>Quarter</dt><dd>{optQuarters.join(', ')}</dd></>}
                    <dt>Enroll</dt><dd>{opt.enrol}</dd>
                    <dt>Cost</dt><dd>{opt.cost}</dd>
                  </dl>

                  <div>
                    <div className="section-label"><span>Matching courses</span></div>
                    {opt.courses.length ? (
                      <div className="pb-courses">
                        {opt.courses.map((c) => {
                          const inPlan = c.section_ids.some((id) => plannedIds.has(id))
                          // Add only when the option itself is available (e.g. IE needs all 10 days unused) and a
                          // section is open to this student right now; otherwise say why, never a dead Add.
                          const secs = c.section_ids.map((id) => sectionById.get(id)).filter((x): x is NonNullable<typeof x> => Boolean(x))
                          const verdicts = secs.map((sc) => ({ sc, v: sectionVerdict(sc, who) }))
                          const openSec = verdicts.find((x) => x.v.ok)?.sc
                          const why = mba && !bc.ok ? 'Not available' : openSec ? '' : secs.length ? blockedLabel(verdicts[0].v) : 'Not open to you'
                          return (
                            <div key={c.key} className="pb-course">
                              <div className="pb-course-main">
                                <div className="course-num">{c.number}</div>
                                <div className="pb-course-title">{c.title}</div>
                                <div className="small muted">
                                  {secs.find((x) => x.quarter)?.quarter ?? c.term_name ?? 'Term TBA'} · <span className="mono">{c.time || 'Time TBA'}</span>{c.seats ? <> · <span className="mono">{c.seats}</span> seats</> : ''}
                                </div>
                              </div>
                              <div className="row gl-course-act" style={{ gap: 6 }}>
                                <button className="btn sm ghost" onClick={() => setDrawerKey(c.key)} aria-label={`Details for ${c.number} ${c.title}`}>Details</button>
                                {inPlan
                                  ? <span className="badge green gl-inplan"><Check className="icon sm" />In plan</span>
                                  : why ? <span className="badge gray gl-inplan gl-why" title={why}>{why === 'In session · add/drop closed' ? 'Add/drop closed' : why}</span>
                                  : (
                                    <button
                                      className="btn sm gl-add"
                                      disabled={!openSec || adding !== null}
                                      aria-busy={adding === c.key}
                                      onClick={() => openSec && void add(c.key, openSec.id)}
                                      aria-label={`Add ${c.number} to my plan`}
                                    ><Plus className="icon sm" />{adding === c.key ? 'Adding…' : 'Add'}</button>
                                  )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <p className="small muted" style={{ margin: 0 }}>
                        {opt.key === 'exchange'
                          ? 'Not a catalog course: you apply through Academic Affairs and Student Life.'
                          : 'No matching course in the public Fall 2026 or Spring 2027 feed yet. Check back when the next term posts.'}
                      </p>
                    )}
                  </div>
                </div>

                <div className="pb-track" aria-busy={busy}>
                  <span className="small muted" id={`track-${opt.key}`}>My status</span>
                  <div className="tabs" role="radiogroup" aria-labelledby={`track-${opt.key}`}>
                    {STATUSES.map((s) => {
                      const on = (choice?.status ?? '') === s.value
                      return (
                        <button
                          key={s.value || 'none'}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          className={on ? 'on' : ''}
                          disabled={busy || (on && s.value === '')}
                          onClick={() => !on && void track(opt, { status: s.value })}
                        >{s.value === 'done' && <Check className="icon sm gl-done-check" aria-hidden="true" />}{s.label}</button>
                      )
                    })}
                  </div>
                  {/* always in place (disabled until you pick a status), so tracking never moves the page */}
                  <select
                    className="gl-term"
                    aria-label={`Target term for ${opt.name}`}
                    title={choice ? undefined : 'Pick a status first'}
                    value={choice?.target_term ?? ''}
                    disabled={!choice || busy}
                    onChange={(e) => void track(opt, { target_term: e.target.value })}
                  >
                    <option value="">Target term…</option>
                    {[...new Set([...targetTerms(opt.key, profile?.program, profile?.year), choice?.target_term ?? ''].filter(Boolean))].map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <span className={`gl-busy ${busy ? 'on' : ''}`}><Spinner /></span>
                </div>
              </article>
            )
          })}
        </div>

        <div className="pb-sources mt">
          <span>Sources:</span>
          {sources.gsr && <a href={sources.gsr} target="_blank" rel="noreferrer">SOM Global Studies Requirement<ExternalLink className="icon sm" /></a>}
          {sources.gsr_funding && <a href={sources.gsr_funding} target="_blank" rel="noreferrer">GSA funding rules (Bulletin)<ExternalLink className="icon sm" /></a>}
          {sources.gnw && <a href={sources.gnw} target="_blank" rel="noreferrer">Global Network Weeks<ExternalLink className="icon sm" /></a>}
        </div>
      </section>

      {/* ------------------------------------------------ LDR */}
      <section id="ldr" className="card pad-lg mt-lg gl-section" aria-labelledby="ldr-h">
        <div className="gl-ldr-head">
          <h2 id="ldr-h" className="pb-h2">Leadership Distribution Requirement (LDR)</h2>
          {mba ? <Pill tone={ldrTone}>{ldrTone === 'done' ? 'Done' : ldrTone === 'progress' ? 'In your plan' : 'Not started'}</Pill> : <span className="gl-pill">MBA rule</span>}
        </div>
        <p className="muted small">{ldr.summary} It's separate from the GSR: a global course doesn't count here.</p>
        <div className="pb-callout mb">
          <span><b>Worth knowing:</b> {ldr.how_flagged} {ldr.petition}</span>
        </div>
        {ldr.courses.length ? (
          <>
            <div className="section-label"><span>LDR-flagged courses</span><span className="faint mono">{ldr.courses.length}</span></div>
            <ul className="pb-ldr-list">
              {ldrShown.map((c) => (
                <li key={`${c.number}-${c.term_name}`}>
                  <span className="course-num">{c.number}</span>
                  <span className="pb-ldr-title">{c.title}</span>
                  <span className="faint small">{c.term_name || 'Term TBA'}</span>
                </li>
              ))}
            </ul>
            {ldr.courses.length > 10 && (
              <button className="btn sm ghost mt gl-more" onClick={() => setShowAllLdr((v) => !v)} aria-expanded={showAllLdr}>
                {showAllLdr ? 'Show fewer' : `Show all ${ldr.courses.length} flagged courses`}
              </button>
            )}
          </>
        ) : (
          <p className="small muted">No LDR-flagged MBA courses in the public feed right now.</p>
        )}
        {ldr.source && (
          <div className="pb-sources mt"><span>Source:</span><a href={ldr.source} target="_blank" rel="noreferrer">MBA curriculum (Bulletin)<ExternalLink className="icon sm" /></a></div>
        )}
      </section>

      {drawerKey && <CourseDrawer courseKey={drawerKey} onClose={() => { setDrawerKey(null); void load() }} />}
    </>
  )
}

function PageHead() {
  const { profile, plan } = useApp()
  const program = profile?.program || 'MBA'
  const mba = program === 'MBA' || program === 'MBA-JOINT'
  const note = plan?.progress.checks?.find((c) => c.label === 'Global')?.detail
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Requirements</h1>
          <p>{mba ? 'Global Studies and Leadership: plan your global experience around your 10 funded travel days, and pick up a leadership elective. Units per term are on My plan & timetable.'
            : 'Your program’s global travel rule, with the full-time MBA Global Studies and Leadership requirements for reference.'}</p>
        </div>
      </div>
      {!mba && (
        <div className="card" role="note" style={{ marginBottom: 16, borderColor: 'var(--pink-line)' }}>
          <b>For your program{plan?.progress.program_label ? ` (${plan.progress.program_label})` : ''}:</b>{' '}
          {note ? us(note) : 'The Global Studies Requirement below is a full-time MBA rule.'}{' '}
          <span className="muted">The options below are the MBA rules, shown for reference; Global Network Weeks and online courses are open to many programs.</span>
        </div>
      )}
    </>
  )
}

/** Loading: blocks shaped like the page (requirements, steps, GSA card, helper + dates, six options), so the page
    doesn't grow by thousands of pixels when the data lands on a slow network. */
function GlobalSkeleton() {
  return (
    <div className="gl-skel" aria-busy="true" aria-label="Loading your requirements">
      <div className="card gl-skel-reqs"><Spinner label="Loading your requirements…" /></div>
      <div className="gl-skel-steps" />
      <div className="card gl-skel-gsa" />
      <div className="grid two mt"><div className="card gl-skel-half" /><div className="card gl-skel-half" /></div>
      <div className="pb-opts mt-lg">{Array.from({ length: 6 }, (_, i) => <div key={i} className="card gl-skel-opt" />)}</div>
    </div>
  )
}
