/* My plan: saved courses, requirement progress, weekly timetable, clashes and fixes. */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, type Clash, type PlanItem, type PlanResponse, type Section } from '../api'
import CourseDrawer from '../components/CourseDrawer'
import Timetable, { sectionsClash } from '../components/Timetable'
import { Bar, Empty, Spinner } from '../components/ui'
import { DAYS, DAY_NAMES, PLANNING_TERM, TERM_NAMES } from '../lib/format'
import { useApp } from '../state'
import './pages-a.css'

type SessionView = 'all' | '1' | '2'
type Status = PlanItem['status']

const STATUSES: { value: Status; label: string }[] = [
  { value: 'planned', label: '📝 Planned' },
  { value: 'bidding', label: '🎯 Bidding' },
  { value: 'enrolled', label: '✅ Enrolled' },
  { value: 'completed', label: '🎓 Completed' },
]
const NOTE_TONE = { good: 'lime', warn: 'amber', info: 'sky' } as const
const NOTE_ICON = { good: '✨', warn: '⚠️', info: '💡' } as const

const units = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))

function termStatus(status: 'ok' | 'low' | 'needs_approval'): { text: string; tone: string } {
  if (status === 'low') return { text: 'Below the 16-unit minimum', tone: 'amber' }
  if (status === 'needs_approval') return { text: 'Over 24 units: needs approval', tone: 'red' }
  return { text: 'In range (16–24) ✓', tone: 'lime' }
}

function inSessionView(s: Section, view: SessionView): boolean {
  if (view === '1') return !s.session.endsWith('-2')
  if (view === '2') return !s.session.endsWith('-1')
  return true
}

const shortTime = (s: Section) => (s.start_min == null ? 'Time TBA' : s.time)

export default function Plan() {
  const { plan, refreshPlan, toast, go } = useApp()
  const [loaded, setLoaded] = useState(false)
  const [term, setTerm] = useState(PLANNING_TERM)
  const [view, setView] = useState<SessionView>('all')
  const [open, setOpen] = useState<string | null>(null)
  const [busy, setBusy] = useState<number | null>(null)

  useEffect(() => {
    refreshPlan().finally(() => setLoaded(true))
  }, [refreshPlan])

  const close = useCallback(() => setOpen(null), [])

  const run = useCallback(async (id: number, work: () => Promise<unknown>, ok: string) => {
    setBusy(id)
    try {
      await work()
      await refreshPlan()
      toast(ok, 'good')
    } catch (e) {
      toast((e as Error).message || 'That did not save. Try again?', 'bad')
    } finally {
      setBusy(null)
    }
  }, [refreshPlan, toast])

  if (!plan) {
    return (
      <div>
        <div className="page-head"><div><h1>My plan 🗓️</h1></div></div>
        {loaded ? (
          <Empty icon="😵‍💫" title="Couldn't load your plan">
            <button type="button" className="btn primary sm" onClick={() => { setLoaded(false); refreshPlan().finally(() => setLoaded(true)) }}>Try again</button>
          </Empty>
        ) : <div className="empty"><Spinner label="Loading your plan…" /></div>}
      </div>
    )
  }

  if (!plan.items.length) {
    return (
      <div>
        <div className="page-head"><div><h1>My plan 🗓️</h1><p>Your saved courses, timetable and requirement check live here.</p></div></div>
        <div className="card">
          <Empty icon="🪹" title="Your plan is empty (for now)">
            <p style={{ margin: 0, maxWidth: 420 }}>Let Dan pick courses that fit your goals and schedule, or browse the full catalog yourself.</p>
            <div className="row" style={{ justifyContent: 'center' }}>
              <button type="button" className="btn primary" onClick={() => go('find')}>✨ Let Dan recommend</button>
              <button type="button" className="btn" onClick={() => go('explore')}>🔎 Explore catalog</button>
            </div>
          </Empty>
        </div>
      </div>
    )
  }

  return (
    <PlanBody
      plan={plan} term={term} setTerm={(t) => { setTerm(t); setView('all') }} view={view} setView={setView} busy={busy} run={run}
      onOpen={setOpen} go={go}
    >
      {open && <CourseDrawer courseKey={open} onClose={close} />}
    </PlanBody>
  )
}

interface BodyProps {
  plan: PlanResponse
  term: string
  setTerm: (t: string) => void
  view: SessionView
  setView: (v: SessionView) => void
  busy: number | null
  run: (id: number, work: () => Promise<unknown>, ok: string) => Promise<void>
  onOpen: (key: string) => void
  go: ReturnType<typeof useApp>['go']
  children?: ReactNode
}

function PlanBody({ plan, term, setTerm, view, setView, busy, run, onOpen, go, children }: BodyProps) {
  const p = plan.progress
  const terms = useMemo(() => Array.from(new Set([...Object.keys(plan.terms), PLANNING_TERM])).sort(), [plan.terms])
  const termName = (t: string) => plan.terms[t]?.name ?? TERM_NAMES[t] ?? t
  const info = plan.terms[term]
  const items = plan.items.filter((i) => i.section.term === term)
  const shown = items.filter((i) => inSessionView(i.section, view)).map((i) => i.section)
  const shownIds = new Set(shown.map((s) => s.id))
  const conflicts = info?.conflicts ?? []
  const clashIds = new Set(conflicts.filter((c) => shownIds.has(c.a_id) && shownIds.has(c.b_id)).flatMap((c) => [c.a_id, c.b_id]))
  const tba = shown.filter((s) => s.start_min == null || !s.days.length)
  const spring = p.terms.find((t) => t.term === PLANNING_TERM)
  const springUnits = plan.terms[PLANNING_TERM]?.units ?? 0
  const corePct = p.core.target ? (100 * p.core.counted) / p.core.target : 0
  const elecPct = p.electives.target ? (100 * p.electives.planned) / p.electives.target : 0
  const hasHalves = items.some((i) => /-(1|2)$/.test(i.section.session))

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>My <span className="grad-text">plan</span> 🗓️</h1>
          <p>Everything you've saved, your week at a glance, and how you're tracking on degree requirements.</p>
        </div>
        <div className="card flat pl-headstat">
          <div className="stat">
            <span className="label">Spring 2027</span>
            <span className="value">{units(springUnits)} <span className="muted small">units</span></span>
          </div>
          {spring
            ? <span className={`badge ${termStatus(spring.status).tone}`}>{termStatus(spring.status).text}</span>
            : <span className="badge gray">Nothing planned yet</span>}
        </div>
      </div>

      {/* ---------------------------------------------------------- requirements */}
      <div className="card">
        <div className="card-title">🎓 Requirement check</div>
        <div className="grid four pl-req">
          <div className="stack tight">
            <div className="row between"><b>Core</b><span className="muted small">{units(p.core.counted)} / {units(p.core.target)} units</span></div>
            <Bar pct={corePct} />
            <span className="faint small">{p.core.counted >= p.core.target ? 'Core complete 🙌' : 'Counted from your year + planned core'}</span>
          </div>
          <div className="stack tight">
            <div className="row between"><b>Electives</b><span className="muted small">{units(p.electives.planned)} / {units(p.electives.target)} units</span></div>
            <Bar pct={elecPct} tone="lime" />
            <span className="faint small">Planned across all terms</span>
          </div>
          <div className="stack tight">
            <b>Leadership (LDR)</b>
            <span>{p.ldr.met ? <span className="badge lime">✓ Met</span> : <span className="badge amber">Not yet: add an LDR course</span>}</span>
          </div>
          <div className="stack tight">
            <b>Global Studies</b>
            <span>
              {p.gsr.met ? <span className="badge lime">✓ Met</span>
                : p.gsr.in_plan.length ? <span className="badge sky">On track ({p.gsr.in_plan.length} in plan)</span>
                  : <span className="badge amber">Not yet</span>}
            </span>
            {!p.gsr.met && <button type="button" className="link-btn small" style={{ textAlign: 'left' }} onClick={() => go('global')}>See Global options →</button>}
          </div>
        </div>
        {p.terms.length > 0 && (
          <>
            <hr className="divider" />
            <div className="row pl-terms">
              {p.terms.map((t) => {
                const st = termStatus(t.status)
                return (
                  <span key={t.term} className="row" style={{ gap: 6 }}>
                    <b className="small">{termName(t.term)}</b>
                    <span className="muted small">{units(t.units)} units</span>
                    <span className={`badge ${st.tone}`}>{st.text}</span>
                  </span>
                )
              })}
            </div>
          </>
        )}
        {p.notes.length > 0 && (
          <ul className="pl-notes faint small">{p.notes.map((n) => <li key={n}>{n}</li>)}</ul>
        )}
      </div>

      {/* ---------------------------------------------------------- term + session */}
      <div className="row between mt-lg mb">
        <div className="tabs" role="group" aria-label="Term">
          {terms.map((t) => {
            const n = plan.items.filter((i) => i.section.term === t).length
            return (
              <button key={t} type="button" className={term === t ? 'on' : ''} aria-pressed={term === t} onClick={() => setTerm(t)}>
                {termName(t)}{n ? ` · ${n}` : ''}
              </button>
            )
          })}
        </div>
        {hasHalves && (
          <div className="tabs" role="group" aria-label="Session">
            {(['all', '1', '2'] as const).map((v) => (
              <button key={v} type="button" className={view === v ? 'on' : ''} aria-pressed={view === v} onClick={() => setView(v)}>
                {v === 'all' ? 'All' : `Session ${v}`}
              </button>
            ))}
          </div>
        )}
      </div>

      {!items.length ? (
        <div className="card">
          <Empty icon="🌱" title={`Nothing in ${termName(term)} yet`}>
            <div className="row" style={{ justifyContent: 'center' }}>
              <button type="button" className="btn primary sm" onClick={() => go('find')}>✨ Let Dan recommend</button>
              <button type="button" className="btn sm" onClick={() => go('explore')}>🔎 Explore catalog</button>
            </div>
          </Empty>
        </div>
      ) : (
        <>
          <div className="grid pl-week">
            <div className="card">
              <div className="row between mb">
                <div className="card-title" style={{ margin: 0 }}>📅 Your week · {termName(term)}</div>
                <span className="muted small">{units(info?.units ?? 0)} units</span>
              </div>
              {view === 'all' && hasHalves && (
                <p className="faint small">Half-term courses (S1/S2) never clash with each other: flip to Session 1 or 2 to see each half on its own.</p>
              )}
              <Timetable sections={shown} clashIds={clashIds} onOpen={(s) => onOpen(s.key)} />
              {tba.length > 0 && (
                <div className="mt">
                  <b className="small">🕒 Time TBA</b>
                  <div className="row mt" style={{ gap: 6 }}>
                    {tba.map((s) => (
                      <button key={s.id} type="button" className="chip" onClick={() => onOpen(s.key)}>{s.number} · {s.title}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="stack">
              <ConflictCard conflicts={conflicts} items={items} busy={busy} run={run} />
              <div className="card">
                <div className="card-title">🧐 Week review</div>
                <div className="row pl-days" aria-label="Days on campus">
                  {DAYS.map((d) => {
                    const on = info?.review.days_on_campus.includes(d)
                    return <span key={d} className={`pl-day ${on ? 'on' : ''}`} title={on ? 'On campus' : 'Free day'}>{DAY_NAMES[d]}</span>
                  })}
                </div>
                <p className="faint small mt" style={{ marginBottom: 8 }}>
                  {info?.review.days_on_campus.length ?? 0} {info?.review.days_on_campus.length === 1 ? 'day' : 'days'} on campus
                </p>
                {info?.review.notes.length ? (
                  <ul className="pl-review">
                    {info.review.notes.map((n, i) => (
                      <li key={i}><span className={`badge ${NOTE_TONE[n.kind]}`}>{NOTE_ICON[n.kind]} {n.kind}</span> <span>{n.text}</span></li>
                    ))}
                  </ul>
                ) : <p className="muted small" style={{ margin: 0 }}>Nothing to flag. Clean week 😌</p>}
              </div>
            </div>
          </div>

          <h3 className="mt-lg">📚 Courses in {termName(term)}</h3>
          <div className="stack">
            {items.map((item) => (
              <PlanRow key={`${item.id}-${item.bid_points ?? ''}-${item.section.id}`} item={item} busy={busy === item.id} run={run} onOpen={onOpen} />
            ))}
          </div>
        </>
      )}
      {children}
    </div>
  )
}

/* ---------------------------------------------------------------- conflicts + fixes */

function ConflictCard({ conflicts, items, busy, run }: {
  conflicts: Clash[]
  items: PlanItem[]
  busy: number | null
  run: BodyProps['run']
}) {
  if (!conflicts.length) {
    return (
      <div className="card">
        <div className="card-title">🧩 Time clashes</div>
        <span className="badge lime">✓ No clashes. You're good!</span>
      </div>
    )
  }
  const byId = new Map(items.map((i) => [i.section.id, i]))
  return (
    <div className="card pl-clash">
      <div className="card-title">😬 {conflicts.length} time {conflicts.length === 1 ? 'clash' : 'clashes'}</div>
      <div className="stack">
        {conflicts.map((c, idx) => {
          const sides = [byId.get(c.a_id), byId.get(c.b_id)].filter((x): x is PlanItem => !!x)
          const fixes = sides.flatMap((item) => {
            const others = items.filter((i) => i.id !== item.id).map((i) => i.section)
            return item.other_sections
              .filter((o) => o.time !== item.section.time)
              .map((o) => ({ item, alt: o, fits: !others.some((x) => sectionsClash(o, x)) }))
          })
          return (
            <div key={`${c.a_id}-${c.b_id}-${idx}`} className="pl-clash-row">
              <div><b>{c.a}</b> <span className="muted">vs</span> <b>{c.b}</b> <span className="muted">on {DAY_NAMES[c.day] ?? c.day} {c.window}</span></div>
              {fixes.length ? (
                <div className="stack tight mt">
                  <span className="faint small">💡 Fix it by switching to another section:</span>
                  <div className="row" style={{ gap: 6 }}>
                    {fixes.map(({ item, alt, fits }) => (
                      <button
                        key={`${item.id}-${alt.id}`}
                        type="button"
                        className={`btn sm ${fits ? 'lime' : ''}`}
                        disabled={busy === item.id}
                        onClick={() => run(item.id, () => api.updatePlan(item.id, { course_id: alt.id }), `Switched ${alt.number} to §${alt.section} ✨`)}
                        title={fits ? 'This section fits with the rest of your plan' : 'Heads up: this section still clashes with something'}
                      >
                        Switch {alt.number} → §{alt.section} · {shortTime(alt)}{fits ? ' ✓' : ''}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="faint small mt" style={{ margin: 0 }}>No other sections at a different time. Drop one, or check if half-terms make it work.</p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- one course row */

function PlanRow({ item, busy, run, onOpen }: { item: PlanItem; busy: boolean; run: BodyProps['run']; onOpen: (key: string) => void }) {
  const s = item.section
  const [points, setPoints] = useState(item.bid_points == null ? '' : String(item.bid_points))
  const statusId = `status-${item.id}`
  const bidId = `bid-${item.id}`

  const saveBid = () => {
    const n = points.trim() === '' ? null : Math.round(Number(points))
    if (n == null || Number.isNaN(n) || n < 0) {
      if (points.trim() !== '') setPoints(item.bid_points == null ? '' : String(item.bid_points))
      return
    }
    if (n === item.bid_points) return
    run(item.id, () => api.updatePlan(item.id, { bid_points: n }), `Saved ${n} bid points for ${s.number} 🎯`)
  }

  const remove = () => {
    if (!window.confirm(`Remove ${s.number} ${s.title} from your plan?`)) return
    run(item.id, () => api.removeFromPlan(item.id), `Removed ${s.number} from your plan`)
  }

  return (
    <div className="card flat pl-row">
      <button type="button" className="pl-row-main" onClick={() => onOpen(s.key)} aria-label={`Details for ${s.number} ${s.title}`}>
        <span className="course-num">{s.number} §{s.section} · {s.session_name}</span>
        <span className="course-title">{s.title}</span>
        <span className="meta">
          <span>🕒 {shortTime(s)}</span>
          <span>📚 {units(s.units)} units</span>
          {s.room && <span>📍 {s.room}</span>}
          {item.added_by === 'dan' && <span className="badge pink">🐶 Dan's pick</span>}
        </span>
      </button>
      <div className="pl-row-controls">
        <label className="field" htmlFor={statusId}>
          Status
          <select
            id={statusId}
            value={item.status}
            disabled={busy}
            onChange={(e) => {
              const v = e.target.value as Status
              run(item.id, () => api.updatePlan(item.id, { status: v }), `${s.number} marked ${v}`)
            }}
          >
            {STATUSES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        {item.status === 'bidding' && (
          <label className="field pl-bid" htmlFor={bidId}>
            Bid points
            <input
              id={bidId}
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              placeholder="e.g. 500"
              value={points}
              disabled={busy}
              onChange={(e) => setPoints(e.target.value)}
              onBlur={saveBid}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
            />
          </label>
        )}
        <div className="row pl-row-actions">
          {item.google_link && (
            <a className="btn sm ghost" href={item.google_link} target="_blank" rel="noreferrer">📆 Add to Google Calendar</a>
          )}
          <button type="button" className="btn sm danger" disabled={busy} onClick={remove} aria-label={`Remove ${s.number} from plan`}>Remove</button>
        </div>
      </div>
    </div>
  )
}
