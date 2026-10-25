/* Bid coach: split auction points, browse crowdsourced bid history, report your own result.
   Honesty rule: SOM doesn't publish clearing prices. Rows marked sample_only are illustrative SAMPLE data. */
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { AlertTriangle, CalendarClock, Check, Inbox, Info, Search, Send, ShoppingBag, X } from 'lucide-react'
import { api, auctionApplies, type AuctionInfo, type BidCourse, type BidSplit } from '../api'
import { Bar, Empty, SampleBanner, Spinner } from '../components/ui'
import { daysUntil, relDays, TERM_NAMES } from '../lib/format'
import HandsomeDan from '../mascots/HandsomeDan'
import { useApp } from '../state'
import './pages-b.css'
import './bids.css'

type Mine = Awaited<ReturnType<typeof api.bids>>['mine'][number]

const PRIORITIES = [
  { value: 1, label: 'Must-have', short: 'Must' },
  { value: 2, label: 'Want', short: 'Want' },
  { value: 3, label: 'Nice to have', short: 'Nice' },
] as const
const PRIO_BADGE: Record<number, string> = { 1: 'pink', 2: 'gray', 3: 'gray' }
const REPORT_TERMS = [
  { code: '202603', name: 'Fall 2026' },
  { code: '202701', name: 'Spring 2027' },
]

const pts = (v: number | null | undefined) => (v == null ? '–' : Math.round(v).toLocaleString('en-US'))
const SampleTag = () => <span className="badge amber" title="Illustrative sample data, not a real SOM result">SAMPLE</span>

export default function Bids() {
  return (
    <div className="bd-page">
      <div className="page-head">
        <div>
          <h1>Bid coach</h1>
          <p>SOM doesn't publish past clearing prices, so we split your points with a clear rule of thumb and pool real results from classmates.</p>
        </div>
      </div>
      <AuctionSection />
      <SplitSection />
      <HistoryAndReport />
    </div>
  )
}

/* ------------------------------------------------------------------ this year's auction (registrar email) */
const monthDay = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }

/** The registrar's 2026-27 auction email went to first-year MBAs (Class of 2028) only, so only they see it.
    Everything here comes from GET /api/programs (backend/rules.py AUCTION); exact round dates are never guessed. */
function AuctionSection() {
  const { profile } = useApp()
  const [auction, setAuction] = useState<AuctionInfo | null>(null)
  const show = auctionApplies(profile?.program, profile?.year)
  useEffect(() => { if (show) api.programs().then((p) => setAuction(p.auction ?? null)).catch(() => undefined) }, [show])
  if (!show || !auction) return null

  const toOpen = daysUntil(auction.opens), toClose = daysUntil(auction.closes)
  const status = toOpen > 0 ? `Opens ${relDays(toOpen)}` : toClose >= 0 ? `Open now, closes ${relDays(toClose)}` : 'Closed'
  const sessions = auction.sessions.filter((x) => daysUntil(x.date) >= 0)
  return (
    <section className="card pad-lg bd-auction" aria-labelledby="auction-h">
      <div className="bd-auction-head">
        <div>
          <h2 id="auction-h" className="pb-h2"><CalendarClock className="icon" aria-hidden="true" />The 2026–27 course auction</h2>
          <p className="bd-window">
            <span>{monthDay(auction.opens)}, {auction.opens_time}</span>
            <span aria-hidden="true">→</span>
            <span>{monthDay(auction.closes)}, {auction.closes_time}</span>
          </p>
        </div>
        <span className={`badge ${toOpen > 0 ? 'pink' : toClose >= 0 ? 'green' : 'gray'} bd-status`}>{status}</span>
      </div>

      <div className="bd-auction-grid">
        <div>
          <h3>Rounds</h3>
          <ul className="pb-list small">{auction.rounds.map((r) => <li key={r}>{r}</li>)}</ul>
        </div>
        <div>
          <h3>After the auction</h3>
          <ul className="pb-list small"><li>{auction.add_drop}</li><li>{auction.exchange}</li></ul>
        </div>
        <div>
          <h3>Good to know</h3>
          <ul className="pb-list small">{auction.policies.map((r) => <li key={r}>{r}</li>)}</ul>
        </div>
      </div>

      {sessions.length > 0 && (
        <ul className="bd-sessions" aria-label="Questions? Sessions from the registrar">
          {sessions.map((x) => (
            <li key={x.date + x.title}><span className="bd-session-date">{monthDay(x.date)}</span><span><b>{x.title}</b> <span className="muted">· {x.time} · {x.where}</span></span></li>
          ))}
        </ul>
      )}
      <p className="small faint" style={{ margin: '12px 0 0' }}>Source: {auction.source}. Shown to first-year MBAs, who got this email.</p>
    </section>
  )
}

/* ------------------------------------------------------------------ A. split my points */
function SplitSection() {
  const { plan, profile, go, toast } = useApp()
  const [budget, setBudget] = useState('500')
  const budgetTouched = useRef(false)
  // 2015 YDN figures: 300 points for first-years, 500 for second-years. A starting point, not a rule.
  useEffect(() => { if (!budgetTouched.current && profile?.year === '1') setBudget('300') }, [profile?.year])
  const [prio, setPrio] = useState<Record<string, number>>({})
  const [result, setResult] = useState<{ split: BidSplit[]; note: string; warnings?: string[]; budget: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const courses = useMemo(() => {
    const seen = new Set<string>()
    const out: { key: string; number: string; title: string; term: string; seats: number | null }[] = []
    for (const it of plan?.items ?? []) {
      const s = it.section
      // Only the spring auction is ahead; one row per course offering (two sections are one bid).
      if (s.enrollment.toLowerCase() !== 'bid' || it.status === 'completed' || s.term !== '202701' || seen.has(s.key)) continue
      seen.add(s.key)
      out.push({ key: s.key, number: s.number, title: s.title, term: s.term_name, seats: s.limit })
    }
    return out
  }, [plan])

  const budgetNum = Number(budget)
  const budgetOk = budget.trim() !== '' && Number.isInteger(budgetNum) && budgetNum >= 1 && budgetNum <= 100000
  // A split made for another budget is stale: dim it and say so (an invalid budget clears it outright).
  const stale = Boolean(result && budgetOk && result.budget !== budgetNum)
  const onBudget = (v: string) => {
    budgetTouched.current = true
    setBudget(v)
    const n = Number(v)
    const ok = v.trim() !== '' && Number.isInteger(n) && n >= 1 && n <= 100000
    if (!ok) { setResult(null); setError('Enter a whole number of points between 1 and 100,000.') } else setError('')
  }

  const run = async (e: FormEvent) => {
    e.preventDefault()
    if (!budgetOk) { setError('Enter a whole number of points between 1 and 100,000.'); return }
    setError('')
    setBusy(true)
    try {
      const priorities = Object.fromEntries(courses.map((c) => [c.key, prio[c.key] ?? 2]))
      setResult({ ...(await api.suggestBids(budgetNum, priorities)), budget: budgetNum })
    } catch (err) {
      setError((err as Error).message)
      toast('Could not split your points.', 'bad')
    } finally {
      setBusy(false)
    }
  }

  const anySample = result?.split.some((r) => r.sample_only) ?? false

  return (
    <section className="card pad-lg" aria-labelledby="split-h">
      <h2 id="split-h" className="pb-h2" style={{ marginBottom: 6 }}><span className="pb-step" aria-hidden="true">1</span>Split my points</h2>
      <p className="muted small">Rank the bid courses in your plan and we'll suggest how to spread your budget. You still place the bids in SOM's auction app.</p>

      {plan === null ? (
        <Spinner label="Loading your plan…" />
      ) : courses.length === 0 ? (
        <Empty icon={<ShoppingBag className="icon lg" style={{ color: 'var(--faint)' }} />} title="No bid courses in your plan yet">
          <p className="small" style={{ margin: 0 }}>Add a few auction electives first, then come back to split your points.</p>
          <button className="btn primary" onClick={() => go('explore')}>Open the course explorer</button>
        </Empty>
      ) : (
        <form onSubmit={run} className="stack mt">
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <label className="field" style={{ width: 180 }}>
              Points budget
              <input
                type="number"
                min={1}
                max={100000}
                step={1}
                inputMode="numeric"
                value={budget}
                onChange={(e) => onBudget(e.target.value)}
                aria-invalid={!budgetOk}
                aria-describedby="budget-help"
              />
            </label>
            <p id="budget-help" className="small faint" style={{ margin: 0, flex: '1 1 260px' }}>
              SOM doesn't publish the budget. The Yale Daily News reported 300 points for first-years and 500 for second-years back in 2015,
              which may be out of date. Use your real number.
            </p>
          </div>

          <div className="pb-prios">
            {courses.map((c) => {
              const current = prio[c.key] ?? 2
              return (
                <div key={c.key} className="pb-prio">
                  <div style={{ minWidth: 0, flex: '1 1 200px' }}>
                    <span className="course-num">{c.number}</span> <b>{c.title}</b>
                    <div className="small muted">{c.term}{c.seats ? ` · ${c.seats} seats` : ''}</div>
                  </div>
                  <div className="tabs" role="radiogroup" aria-label={`Priority for ${c.number}`}>
                    {PRIORITIES.map((p) => (
                      <button
                        key={p.value}
                        type="button"
                        role="radio"
                        aria-checked={current === p.value}
                        className={current === p.value ? 'on' : ''}
                        onClick={() => setPrio((m) => ({ ...m, [c.key]: p.value }))}
                      >{p.label}</button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="row">
            <button className="btn primary" type="submit" disabled={busy || !budgetOk}>
              {busy ? 'Splitting…' : 'Split my points'}
            </button>
            {error ? <span className="error-text" role="alert">{error}</span>
              : stale ? <span className="small" style={{ color: 'var(--amber)' }} role="status">Budget changed to {pts(budgetNum)}. Split again to update the plan below.</span> : null}
          </div>
        </form>
      )}

      {result && (
        <div className={`mt-lg stack ${stale ? 'bd-stale' : ''}`} aria-live="polite">
          {/* Dan's cheer sits with the result (not a floating pop-up over the history table) */}
          <div className="bd-ready"><HandsomeDan size={36} furColor="#f4b183" bandanaColor="#00356b" /><b>Bid plan ready for {pts(result.budget)} points.</b><span className="muted small">Go get those seats.</span></div>
          {(result.warnings ?? []).map((w) => <div key={w} className="pb-check warn small" role="alert">{w}</div>)}
          {anySample && <SampleBanner>SAMPLE data feeds some "median winning bid" numbers below: illustrative only, not real SOM results.</SampleBanner>}
          <div className="table-wrap">
            <table className="table bd-stack">
              <thead>
                <tr>
                  <th scope="col">Course</th>
                  <th scope="col">Priority</th>
                  <th scope="col" className="pb-right">Seats</th>
                  <th scope="col" className="pb-right">Median winning bid</th>
                  <th scope="col" className="pb-right">Suggested</th>
                  <th scope="col">Share</th>
                </tr>
              </thead>
              <tbody>
                {result.split.map((r) => {
                  const p = PRIORITIES.find((x) => x.value === r.priority)
                  return (
                    <tr key={r.key ?? r.number}>
                      <td data-label="Course" className="bd-first">
                        <span className="course-num">{r.number}</span>
                        <div className="small">{r.title}</div>
                        {r.term_name && <div className="small faint">{r.term_name}</div>}
                      </td>
                      <td data-label="Priority"><span className={`badge ${PRIO_BADGE[r.priority] ?? 'gray'}`}>{p?.short ?? r.priority}</span></td>
                      <td data-label="Seats" className="pb-right pb-num">{r.seats ?? '–'}</td>
                      <td data-label="Median win" className="pb-right pb-num">
                        {r.median_winning_bid == null
                          ? <span className="faint">no reports</span>
                          : <>{pts(r.median_winning_bid)} {r.sample_only && <SampleTag />}</>}
                      </td>
                      <td data-label="Suggested" className="pb-right"><span className="pb-points">{pts(r.suggested_points)}</span></td>
                      <td data-label="Share" className="pb-share">
                        <Bar pct={r.share * 100} tone={r.priority === 1 ? '' : 'gray'} />
                        <div className="pb-num faint" style={{ marginTop: 2 }}>{Math.round(r.share * 100)}%</div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="small faint row" style={{ margin: 0, gap: 6, flexWrap: 'nowrap', alignItems: 'flex-start' }}><Info className="icon sm" style={{ marginTop: 2 }} aria-hidden="true" /><span>{result.note}</span></p>
        </div>
      )}

      <div className="divider" />
      <div className="section-label"><span>Bidding tips</span></div>
      <ul className="pb-list small muted">
        <li><b>Go big on 1–2 must-haves.</b> Spreading points evenly is how you lose the class you actually wanted.</li>
        <li><b>Keep a same-slot backup.</b> Have a second course in the same time slot ready in case you miss.</li>
        <li><b>Big classes usually clear cheap.</b> Courses with large seat limits rarely need a big bid. Save points for small seminars.</li>
        <li><b>Add/drop is your safety net.</b> It lasts one week (Spring 2027 opens Jan 5). Seats free up as people shuffle.</li>
      </ul>
    </section>
  )
}

/* ------------------------------------------------------------------ B + C. history and reporting */
function HistoryAndReport() {
  const [courses, setCourses] = useState<BidCourse[] | null>(null)
  const [mine, setMine] = useState<Mine[]>([])
  const [error, setError] = useState('')

  const load = useCallback(() => api.bids().then(
    (r) => { setCourses(r.courses); setMine(r.mine); setError('') },
    (e: Error) => setError(e.message || 'Could not load bid history.'),
  ), [])

  useEffect(() => { void load() }, [load])

  return (
    <>
      <HistorySection courses={courses} error={error} onRetry={() => void load()} />
      <ReportSection mine={mine} onSaved={load} />
    </>
  )
}

function HistorySection({ courses, error, onRetry }: { courses: BidCourse[] | null; error: string; onRetry: () => void }) {
  const [q, setQ] = useState('')
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!courses) return []
    if (!needle) return courses
    return courses.filter((c) => c.course_number.toLowerCase().includes(needle) || c.title.toLowerCase().includes(needle))
  }, [courses, q])
  const anySample = courses?.some((c) => c.sample_only) ?? false

  return (
    <section className="card pad-lg mt-lg" aria-labelledby="hist-h">
      <div className="pb-section-head">
        <div>
          <h2 id="hist-h" className="pb-h2"><span className="pb-step" aria-hidden="true">2</span>Bid history</h2>
          <p>What classmates reported bidding, and whether they got in. It's only as good as the reports, so add yours below.</p>
        </div>
        <label className="field" style={{ width: 'min(280px, 100%)', position: 'relative' }}>
          <span className="pb-sr">Search courses</span>
          <Search className="icon sm" aria-hidden="true" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--faint)' }} />
          <input type="search" placeholder="Search by course number or title" value={q} onChange={(e) => setQ(e.target.value)} style={{ paddingLeft: 30 }} />
        </label>
      </div>

      {error && !courses ? (
        <Empty icon={<AlertTriangle className="icon lg" style={{ color: 'var(--amber)' }} />} title="Couldn't load bid history">
          <p className="error-text" style={{ margin: 0 }}>{error}</p>
          <button className="btn" onClick={onRetry}>Try again</button>
        </Empty>
      ) : !courses ? (
        <div className="bd-hist-box bd-hist-loading"><Spinner label="Loading bid history…" /></div>
      ) : courses.length === 0 ? (
        <Empty icon={<Inbox className="icon lg" style={{ color: 'var(--faint)' }} />} title="No reports yet">Be the first: report your result below.</Empty>
      ) : (
        <div className="stack">
          {anySample && <SampleBanner />}
          {/* fixed-height results box: typing in the search never changes the page length */}
          <div className="bd-hist-box">
          {filtered.length === 0 ? (
            <p className="muted small bd-hist-empty">No course matches “{q}”.</p>
          ) : (
            <div className="table-wrap">
              <table className="table bd-stack">
                <thead>
                  <tr>
                    <th scope="col">Course</th>
                    <th scope="col" className="pb-right">Seats</th>
                    <th scope="col" className="pb-right">Reports</th>
                    <th scope="col" className="pb-right">Won / lost</th>
                    <th scope="col" className="pb-right">Lowest win</th>
                    <th scope="col" className="pb-right">Median win</th>
                    <th scope="col" className="pb-right">Highest loss</th>
                    <th scope="col">Terms</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => (
                    <tr key={c.course_number}>
                      <td data-label="Course" className="bd-first">
                        <div className="row" style={{ gap: 6 }}>
                          <span className="course-num">{c.course_number}</span>
                          {c.sample_only && <SampleTag />}
                        </div>
                        <div className="small">{c.title}</div>
                      </td>
                      <td data-label="Seats" className="pb-right pb-num">{c.seats ?? '–'}</td>
                      <td data-label="Reports" className="pb-right pb-num">{c.reports}</td>
                      {c.too_few ? (
                        <td data-label="Prices" colSpan={4} className="small faint bd-wide">Hidden until 5 different students report, so no one's bid can be singled out.</td>
                      ) : (
                        <>
                          <td data-label="Won / lost" className="pb-right pb-num"><span className="pb-won">{c.won ?? 0}</span> / <span className="pb-lost">{c.lost ?? 0}</span></td>
                          <td data-label="Lowest win" className="pb-right pb-num">{pts(c.lowest_winning_bid)}</td>
                          <td data-label="Median win" className="pb-right pb-num" style={{ color: 'var(--text)', fontWeight: 500 }}>{pts(c.median_winning_bid)}</td>
                          <td data-label="Highest loss" className="pb-right pb-num">{pts(c.highest_losing_bid)}</td>
                        </>
                      )}
                      <td data-label="Terms" className="small muted">{(c.terms ?? []).map((t) => TERM_NAMES[t] ?? t).join(', ') || '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          </div>
          <p className="small faint" style={{ margin: 0 }}>
            Lowest win and highest loss bracket the price: if you bid above the highest losing bid, you'd likely have gotten in. A small number of reports is a hint, not a guarantee.
          </p>
        </div>
      )}
    </section>
  )
}

function ReportSection({ mine, onSaved }: { mine: Mine[]; onSaved: () => Promise<void> }) {
  const { sections, toast } = useApp()
  const [course, setCourse] = useState('')
  const [term, setTerm] = useState('202701')
  const [points, setPoints] = useState('')
  const [gotSeat, setGotSeat] = useState<boolean | null>(null)
  const [clearing, setClearing] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const numbers = useMemo(() => {
    const m = new Map<string, string>()
    for (const s of sections) if (!m.has(s.number)) m.set(s.number, s.title)
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
  }, [sections])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const num = course.trim().toUpperCase()
    const p = Number(points)
    const cl = clearing.trim() === '' ? null : Number(clearing)
    if (!num) return setError('Which course? Start typing, e.g. MGT 5…')
    if (numbers.length && !numbers.some(([n]) => n === num)) return setError(`${num} isn't in the SOM catalog. Pick one from the list.`)
    if (points.trim() === '' || !Number.isInteger(p) || p < 0) return setError('Points bid should be a whole number (0 or more).')
    if (gotSeat === null) return setError('Did you get a seat? Pick yes or no.')
    if (cl !== null && (!Number.isInteger(cl) || cl < 0)) return setError('Clearing points should be a whole number, or leave it blank.')
    setError('')
    setBusy(true)
    try {
      await api.reportBid({ course_number: num, term_code: term, points_bid: p, got_seat: gotSeat, clearing_points: cl })
      toast('Thanks for reporting. Your classmates will bid smarter because of it.', 'good')
      setCourse(''); setPoints(''); setGotSeat(null); setClearing('')
      await onSaved()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const titleFor = useMemo(() => new Map(numbers), [numbers])

  return (
    <section className="card pad-lg mt-lg" aria-labelledby="report-h">
      <h2 id="report-h" className="pb-h2"><span className="pb-step" aria-hidden="true">3</span>Report your result</h2>
      <div className="grid two mt">
        <form onSubmit={submit} className="pb-form" noValidate>
          <label className="field full">
            Course number
            <input
              list="pb-course-numbers"
              placeholder="e.g. MGT 527"
              value={course}
              onChange={(e) => setCourse(e.target.value)}
              autoComplete="off"
              required
            />
            {titleFor.get(course.trim().toUpperCase()) && <span className="small faint">{titleFor.get(course.trim().toUpperCase())}</span>}
          </label>
          <datalist id="pb-course-numbers">
            {numbers.map(([n, t]) => <option key={n} value={n}>{t}</option>)}
          </datalist>
          <label className="field">
            Term
            <select value={term} onChange={(e) => setTerm(e.target.value)}>
              {REPORT_TERMS.map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}
            </select>
          </label>
          <label className="field">
            Points you bid
            <input type="number" min={0} step={1} inputMode="numeric" value={points} onChange={(e) => setPoints(e.target.value)} required />
          </label>
          <fieldset className="pb-fieldset full">
            <legend>Did you get a seat?</legend>
            <div className="pb-yesno" role="radiogroup">
              <button type="button" role="radio" aria-checked={gotSeat === true} className={`chip yes ${gotSeat === true ? 'on' : ''}`} onClick={() => setGotSeat(true)}>{gotSeat === true && <Check className="icon sm" aria-hidden="true" />}Yes, I got in</button>
              <button type="button" role="radio" aria-checked={gotSeat === false} className={`chip no ${gotSeat === false ? 'on' : ''}`} onClick={() => setGotSeat(false)}>{gotSeat === false && <X className="icon sm" aria-hidden="true" />}No seat</button>
            </div>
          </fieldset>
          <label className="field full">
            Clearing points, if you know them (optional)
            <input type="number" min={0} step={1} inputMode="numeric" value={clearing} onChange={(e) => setClearing(e.target.value)} placeholder="Leave blank if unsure" />
          </label>
          <div className="full row">
            <button className="btn" type="submit" disabled={busy}><Send className="icon sm" aria-hidden="true" />{busy ? 'Sending…' : 'Submit report'}</button>
            {error && <span className="error-text" role="alert">{error}</span>}
          </div>
        </form>

        <div className="stack">
          <div className="pb-callout">
            <span><b>Why report?</b> SOM keeps past clearing prices behind a login, so every bid is a guess. Each report you add is
            pooled anonymously into the history above: classmates see counts, medians and ranges per course, never your name.
            The more people report, the less everyone overspends.</span>
          </div>
          <div>
            <div className="section-label"><span>My reports</span>{mine.length > 0 && <span className="faint mono">{mine.length}</span>}</div>
            {mine.length === 0 ? (
              <p className="small muted" style={{ margin: 0 }}>Nothing yet. Your first report shows up here.</p>
            ) : (
              <div className="table-wrap">
                <table className="table bd-stack">
                  <thead>
                    <tr>
                      <th scope="col">Course</th>
                      <th scope="col">Term</th>
                      <th scope="col" className="pb-right">Bid</th>
                      <th scope="col">Result</th>
                      <th scope="col" className="pb-right">Clearing</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mine.map((r) => (
                      <tr key={r.id}>
                        <td data-label="Course" className="bd-first"><span className="course-num">{r.course_number}</span> {r.source === 'sample' && <SampleTag />}</td>
                        <td data-label="Term" className="small muted">{TERM_NAMES[r.term_code] ?? (r.term_code || '–')}</td>
                        <td data-label="Bid" className="pb-right pb-num">{pts(r.points_bid)}</td>
                        <td data-label="Result">{r.got_seat ? <span className="badge green"><Check className="icon sm" />Got in</span> : <span className="badge red"><X className="icon sm" />No seat</span>}</td>
                        <td data-label="Clearing" className="pb-right pb-num">{pts(r.clearing_points)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
