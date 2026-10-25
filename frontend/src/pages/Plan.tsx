/* My plan: saved courses, requirement progress, weekly timetable, clashes and fixes.
   Calm style: bars for progress, status colour only where it means something, and every
   change (remove, switch section, status) comes back with an Undo toast. */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  BookOpen, CalendarPlus, Check, CircleAlert, Clock, Compass, History, Info, MapPin, RotateCcw, Search, Sparkles, TriangleAlert, X,
} from 'lucide-react'
import { api, type ActionEntry, type Clash, type PlanItem, type PlanResponse, type Section } from '../api'
import CourseDrawer from '../components/CourseDrawer'
import Timetable, { sectionsClash } from '../components/Timetable'
import { Bar, Empty, Spinner } from '../components/ui'
import { DAYS, DAY_NAMES, PLANNING_TERM, TERM_NAMES, shortExam } from '../lib/format'
import { useApp } from '../state'
import './pages-a.css'
import './plan-actions.css'

type SessionView = 'all' | '1' | '2'
type Status = PlanItem['status']

const STATUSES: { value: Status; label: string }[] = [
  { value: 'planned', label: 'Planned' },
  { value: 'bidding', label: 'Bidding' },
  { value: 'enrolled', label: 'Enrolled' },
  { value: 'completed', label: 'Completed' },
]
const NOTE_ICON = {
  good: <Check className="icon sm pa-ok" aria-label="Good" />,
  warn: <TriangleAlert className="icon sm pa-warn" aria-label="Heads up" />,
  info: <Info className="icon sm faint" aria-label="Note" />,
} as const

const units = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))

function termStatus(status: 'ok' | 'low' | 'needs_approval', minApplies = true, min: number | null = 16, max: number | null = 24): { text: string; tone: string; cls: string } {
  if (status === 'low') return { text: `Below the ${min}-unit minimum`, tone: 'amber', cls: 'pa-warn' }
  if (status === 'needs_approval') return { text: `Over ${max} units, needs approval`, tone: 'red', cls: 'pa-bad' }
  if (minApplies && min != null) return { text: max ? `In range (${min}–${max})` : `At least ${min}`, tone: 'green', cls: 'pa-ok' }
  return { text: max ? `Under the ${max}-unit cap` : 'No unit limits stated', tone: 'green', cls: 'pa-ok' }
}

const CHECK_TONE: Record<string, string> = { done: 'pa-ok', planned: '', missing: 'pa-warn', info: 'muted', unconfirmed: 'faint' }
const CHECK_TEXT: Record<string, string> = { done: 'Done', planned: 'Planned', missing: 'Not yet', info: 'Note', unconfirmed: 'Unconfirmed' }

/** What every plan change returns: the action id lets the toast offer Undo. */
type Work = () => Promise<{ ok: boolean; action_id?: number }>

function inSessionView(s: Section, view: SessionView): boolean {
  if (view === '1') return !s.session.endsWith('-2')
  if (view === '2') return !s.session.endsWith('-1')
  return true
}

const shortTime = (s: Section) => (s.start_min == null ? 'Time TBA' : s.time)

export default function Plan() {
  const { plan, refreshPlan, toast, undoToast, go } = useApp()
  const [loaded, setLoaded] = useState(false)
  const [term, setTerm] = useState(PLANNING_TERM)
  const [view, setView] = useState<SessionView>('all')
  const [open, setOpen] = useState<string | null>(null)
  const [busy, setBusy] = useState<number | null>(null)
  const pending = useRef(false)  // one plan change at a time; a double-click never sends the same change twice

  useEffect(() => {
    refreshPlan().finally(() => setLoaded(true))
  }, [refreshPlan])

  const close = useCallback(() => setOpen(null), [])

  const run = useCallback(async (id: number, work: Work, ok: string) => {
    if (pending.current) return
    pending.current = true
    setBusy(id)
    try {
      const r = await work()
      await refreshPlan()
      undoToast(ok, r?.action_id)
    } catch (e) {
      toast((e as Error).message || 'That did not save. Try again.', 'bad')
    } finally {
      pending.current = false
      setBusy(null)
    }
  }, [refreshPlan, toast, undoToast])

  if (!plan) {
    return (
      <div>
        <div className="page-head"><div><h1>My plan</h1><p>Your saved courses, your week, and how you're tracking on requirements.</p></div></div>
        {loaded ? (
          <Empty icon={<CircleAlert className="icon lg faint" />} title="Couldn't load your plan">
            <button type="button" className="btn primary sm" onClick={() => { setLoaded(false); refreshPlan().finally(() => setLoaded(true)) }}>Try again</button>
          </Empty>
        ) : <div className="empty"><Spinner label="Loading your plan…" /></div>}
      </div>
    )
  }

  if (!plan.items.length) {
    return (
      <div>
        <div className="page-head"><div><h1>My plan</h1><p>Your saved courses, your week, and how you're tracking on requirements.</p></div></div>
        <div className="card">
          <Empty icon={<Compass className="icon lg faint" />} title="Your plan is empty">
            <p style={{ margin: 0, maxWidth: 420 }}>Let Elihu pick courses that fit your goals and schedule, or open the Course explorer yourself.</p>
            <div className="row" style={{ justifyContent: 'center' }}>
              <button type="button" className="btn primary" onClick={() => go('find')}><Sparkles className="icon sm" />Ask Elihu for picks</button>
              <button type="button" className="btn" onClick={() => go('explore')}><Search className="icon sm" />Open the course explorer</button>
            </div>
          </Empty>
        </div>
        {plan.progress.mba_rules === false && (plan.progress.checks ?? []).length > 0 && (
          <div className="card mt">
            <div className="section-label"><span>What your program requires · {plan.progress.program_label}</span></div>
            <p className="muted small" style={{ marginTop: 0 }}>{plan.progress.notes[0]}</p>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
              {(plan.progress.checks ?? []).filter((c) => c.status !== 'done').map((c, i) => (
                <li key={i} className="small"><b style={{ fontWeight: 500 }}>{c.label}</b> <span className="faint">· {c.detail}</span></li>
              ))}
            </ul>
          </div>
        )}
        <RecentActions className="mt" />
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
  run: (id: number, work: Work, ok: string) => Promise<void>
  onOpen: (key: string) => void
  go: ReturnType<typeof useApp>['go']
  children?: ReactNode
}

function PlanBody({ plan, term, setTerm, view, setView, busy, run, onOpen, go, children }: BodyProps) {
  const p = plan.progress
  const terms = useMemo(() => Array.from(new Set([...Object.keys(plan.terms), PLANNING_TERM])).sort(), [plan.terms])
  const termName = (t: string) => plan.terms[t]?.name ?? TERM_NAMES[t] ?? t
  const spring = p.terms.find((t) => t.term === PLANNING_TERM)
  const springUnits = plan.terms[PLANNING_TERM]?.units ?? 0
  const corePct = p.core.target ? (100 * p.core.counted) / p.core.target : 0
  const elecPct = p.electives.target ? (100 * p.electives.planned) / p.electives.target : 0
  const { profile, sectionById } = useApp()
  const coreByTerm = useCoreByTerm(plan, terms, sectionById)
  const hasHalves = [...plan.items.filter((i) => i.section.term === term).map((i) => i.section), ...(coreByTerm[term] ?? [])]
    .some((s) => /-(1|2)$/.test(s.session))

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>My plan</h1>
          <p>Your saved courses, your week, and how you're tracking on requirements.</p>
        </div>
        <div className="card pl-headstat">
          <div className="stat">
            <span className="label">{TERM_NAMES[PLANNING_TERM]}</span>
            <span className="value">{units(springUnits)} <span className="muted small" style={{ fontFamily: 'var(--font)' }}>units</span></span>
          </div>
          {spring
            ? <span className={`badge ${termStatus(spring.status, spring.min_applies, spring.min_units ?? null, spring.max_units ?? null).tone}`}>{termStatus(spring.status, spring.min_applies, spring.min_units ?? null, spring.max_units ?? null).text}</span>
            : <span className="badge gray">Nothing planned yet</span>}
        </div>
      </div>

      {/* ---------------------------------------------------------- requirements */}
      <div className="card">
        <div className="section-label"><span>Requirements{p.program_label ? ` · ${p.program_label}` : ''}</span></div>
        {p.mba_rules === false ? (
          <ul className="pl-checks" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
            {(p.checks ?? []).map((c, i) => (
              <li key={i} className="row between small" style={{ flexWrap: 'nowrap', alignItems: 'flex-start', gap: 12 }}>
                <span><b style={{ fontWeight: 500 }}>{c.label}</b><br /><span className="faint">{c.detail}</span></span>
                <span className={CHECK_TONE[c.status]} style={{ whiteSpace: 'nowrap' }}>{CHECK_TEXT[c.status]}</span>
              </li>
            ))}
            {(p.sources ?? []).length > 0 && <li className="faint small">Sources: {(p.sources ?? []).map((u) => <a key={u} href={u} target="_blank" rel="noreferrer" style={{ marginRight: 12 }}>{sourceLabel(u)}</a>)}</li>}
          </ul>
        ) : (
        <div className="pl-req">
          <div className="meter">
            <span>Core</span><span className="mono">{units(p.core.counted)} / {units(p.core.target)}</span>
            <Bar pct={corePct} tone={p.core.counted >= p.core.target ? 'lime' : ''} />
            <span>Electives <span className="faint small">· all terms</span></span><span className="mono">{units(p.electives.planned)} / {units(p.electives.target)}</span>
            <Bar pct={elecPct} tone={p.electives.planned >= p.electives.target ? 'lime' : ''} />
          </div>
          <div className="pl-kv">
            <div>
              <span>Leadership</span>
              {p.ldr.met ? <span className="pa-inline-icon pa-ok"><Check className="icon sm" />Met</span>
                : p.ldr.planned ? <span>Planned, not done yet</span>
                  : <span className="pa-warn">Not yet, add a Leadership course</span>}
            </div>
            <div>
              <span>Global Studies</span>
              {p.gsr.met ? <span className="pa-inline-icon pa-ok"><Check className="icon sm" />Met</span>
                : p.gsr.planned ? <span>Planned, not done yet <span className="faint mono">({p.gsr.in_plan.length} in plan)</span></span>
                  : <span className="pa-warn">Not yet</span>}
            </div>
            {!p.gsr.met && (
              <div><span /><button type="button" className="link-btn small pl-gsr-link" onClick={() => go('global')}>See Global Studies options</button></div>
            )}
            <div><span>Core status</span><span className="muted small">{coreStatus(p.core.counted >= p.core.target, profile?.year ?? '')}</span></div>
          </div>
        </div>
        )}
        {p.terms.length > 0 && (
          <>
            <hr className="divider" />
            <div className="section-label"><span>Units by term</span></div>
            <div className="pl-terms">
              {p.terms.map((t) => {
                const st = termStatus(t.status, t.min_applies, t.min_units ?? null, t.max_units ?? null)
                return (
                  <div key={t.term}>
                    <span style={{ minWidth: 92 }}>{termName(t.term)}</span>
                    <span className="mono muted">{units(t.units)} units{t.core_units ? <span className="faint"> (incl. {units(t.core_units)} core)</span> : null}</span>
                    <span className={`small ${st.cls}`}>{st.text}</span>
                  </div>
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
      <div className="row between mt-lg mb pl-termbar">
        <div className="tabs" role="group" aria-label="Term">
          {terms.map((t) => {
            const n = plan.items.filter((i) => i.section.term === t).length
            return (
              <button key={t} type="button" className={term === t ? 'on' : ''} aria-pressed={term === t} onClick={() => setTerm(t)}>
                {termName(t)}{n ? <span className="mono faint">{n}</span> : null}
              </button>
            )
          })}
        </div>
        {hasHalves && (
          <div className="tabs" role="group" aria-label="Session">
            {(['all', '1', '2'] as const).map((v) => (
              <button key={v} type="button" className={view === v ? 'on' : ''} aria-pressed={view === v} onClick={() => setView(v)}>
                {v === 'all' ? 'Both sessions' : `Session ${v}`}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Every term is rendered in the same grid cell and only the chosen one is shown, so switching terms
          never changes the page length (the tallest term sets it). */}
      <div className="pl-stack">
        {terms.map((t) => (
          <TermPane key={t} plan={plan} term={t} active={t === term} view={t === term ? view : 'all'} core={coreByTerm[t] ?? []}
            termName={termName(t)} busy={busy} run={run} onOpen={onOpen} go={go} />
        ))}
      </div>
      {children}
    </div>
  )
}

/* ---------------------------------------------------------------- helpers */

const localIso = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** L23: "Complete" read as "done" to a first-year in October. Say what it means. */
function coreStatus(counted: boolean, year: string): string {
  if (!counted) return 'Counted from your year and planned core'
  if (year === '1') return 'Assigned by SOM for your cohort, counted in full'
  if (year === '2') return 'Done in your first year'
  return 'Counted in full'
}

const ACRONYMS = new Set(['mba', 'mam', 'mms', 'emba', 'phd', 'som', 'gsa', 'ldr'])
/** A readable name for a requirements source link instead of the raw URL. */
function sourceLabel(url: string): string {
  try {
    const u = new URL(url)
    const site = u.hostname.startsWith('catalog.') ? 'Yale Bulletin' : u.hostname.startsWith('som.') ? 'Yale SOM' : u.hostname.replace(/^www\./, '')
    const slug = u.pathname.split('/').filter(Boolean).pop() ?? ''
    const words = slug.replace(/\.[a-z]+$/, '').split('-').filter(Boolean).map((w) => (ACRONYMS.has(w) ? w.toUpperCase() : w))
    const page = words.join(' ')
    return page && page !== 'management' ? `${site}: ${page[0].toUpperCase()}${page.slice(1)}` : site
  } catch { return 'Source' }
}

/** First-year MBA core SOM schedules for each term (not in the plan, never bid on), so the grid can draw it. */
function useCoreByTerm(plan: PlanResponse, terms: string[], sectionById: Map<string, Section>): Record<string, Section[]> {
  const { profile } = useApp()
  const [ids, setIds] = useState<Record<string, string[]>>({})
  const want = terms.filter((t) => (plan.terms[t]?.core_units ?? 0) > 0).join(',')
  const program = profile?.program ?? ''
  const year = profile?.year ?? ''
  const cohort = profile?.cohort ?? ''
  useEffect(() => {
    let live = true
    if (!want || !program) { setIds({}); return }
    Promise.all(want.split(',').map((term) => api.starterWeek({ program, year, cohort, term })
      .then((r) => [term, r.example ? [] : r.ids] as const).catch(() => [term, [] as string[]] as const)))
      .then((pairs) => { if (live) setIds(Object.fromEntries(pairs)) })
    return () => { live = false }
  }, [want, program, year, cohort])
  return useMemo(() => {
    const planned = new Set(plan.items.map((i) => i.section.id))
    return Object.fromEntries(Object.entries(ids).map(([t, list]) => [t, list
      .map((id) => sectionById.get(id)).filter((x): x is Section => !!x && x.term === t && !planned.has(x.id))]))
  }, [ids, sectionById, plan.items])
}

/* ---------------------------------------------------------------- one term: week grid, review, courses */

function TermPane({ plan, term, active, view, core, termName, busy, run, onOpen, go }: {
  plan: PlanResponse
  term: string
  active: boolean
  view: SessionView
  core: Section[]
  termName: string
  busy: number | null
  run: BodyProps['run']
  onOpen: (key: string) => void
  go: BodyProps['go']
}) {
  const { sections } = useApp()
  const info = plan.terms[term]
  const items = plan.items.filter((i) => i.section.term === term)
  const shown = [...items.map((i) => i.section), ...core].filter((s) => inSessionView(s, view))
  const shownIds = new Set(shown.map((s) => s.id))
  const coreIds = useMemo(() => new Set(core.map((s) => s.id)), [core])
  const conflicts = info?.conflicts ?? []
  const clashIds = new Set(conflicts.filter((c) => shownIds.has(c.a_id) && shownIds.has(c.b_id)).flatMap((c) => [c.a_id, c.b_id]))
  const tba = shown.filter((s) => s.start_min == null || !s.days.length)
  const hasHalves = shown.some((s) => /-(1|2)$/.test(s.session))
  const daysOn = info?.review.days_on_campus.length ?? 0

  // L22: once a half-term has finished, its "Session 1: …" review notes are history, not advice.
  const over = useMemo(() => {
    const today = localIso()
    const ended = (suffix: string) => {
      const ends = sections.filter((s) => s.term === term && s.session.endsWith(suffix) && s.ends).map((s) => s.ends!)
      return ends.length > 0 && ends.every((e) => e < today)
    }
    return { '1': ended('-1'), '2': ended('-2') }
  }, [sections, term])
  const allNotes = info?.review.notes ?? []
  const notes = allNotes.filter((n) => !(over['1'] && n.text.startsWith('Session 1: ')) && !(over['2'] && n.text.startsWith('Session 2: ')))
  const hidden = allNotes.length - notes.length

  return (
    <div className={`pl-pane ${active ? 'on' : ''}`} aria-hidden={!active || undefined} inert={!active}>
      {!items.length && !core.length ? (
        <div className="card">
          <Empty icon={<BookOpen className="icon lg faint" />} title={`Nothing in ${termName} yet`}>
            <div className="row" style={{ justifyContent: 'center' }}>
              <button type="button" className="btn primary sm" onClick={() => go('find')}><Sparkles className="icon sm" />Ask Elihu for picks</button>
              <button type="button" className="btn sm" onClick={() => go('explore')}><Search className="icon sm" />Open the course explorer</button>
            </div>
          </Empty>
          <RecentActions className="mt" />
        </div>
      ) : (
        <>
          <div className="grid pl-week">
            <div className="card">
              <div className="section-label">
                <span>Your week · {termName}</span>
                <span className="mono">{units(info?.units ?? 0)} units</span>
              </div>
              {(info?.core_units ?? 0) > 0 && (
                <p className="faint small">
                  {core.length
                    ? <>Your cohort's core ({units(info!.core_units)} units) is on the grid with a dashed outline. SOM schedules it for you, and clash checks include it.</>
                    : <>Includes {units(info!.core_units)} units of your cohort's core, which SOM schedules for you{info!.core_times_known ? ' (clash checks include it)' : '. Set your cohort in your profile so clash checks can include it'}.</>}
                </p>
              )}
              {view === 'all' && hasHalves && (
                <p className="faint small">Half-term courses (S1 and S2) never clash with each other. Switch to Session 1 or 2 to see each half on its own.</p>
              )}
              <Timetable sections={shown} clashIds={clashIds} coreIds={coreIds} onOpen={(s) => onOpen(s.key)} />
              {tba.length > 0 && (
                <div className="mt">
                  <div className="section-label"><span className="pa-inline-icon"><Clock className="icon sm" />Time TBA</span></div>
                  <div className="row" style={{ gap: 6 }}>
                    {tba.map((s) => (
                      <button key={s.id} type="button" className="chip" onClick={() => onOpen(s.key)}><span className="mono">{s.number}</span> {s.title}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="stack">
              <ConflictCard conflicts={conflicts} items={items} busy={busy} run={run} />
              <div className="card">
                <div className="section-label">
                  <span>Week review</span>
                  <span className="faint"><span className="mono">{daysOn}</span> {daysOn === 1 ? 'day' : 'days'} on campus</span>
                </div>
                <div className="row pl-days" aria-label="Days on campus">
                  {DAYS.map((d) => {
                    const on = info?.review.days_on_campus.includes(d)
                    return <span key={d} className={`pl-day ${on ? 'on' : ''}`} title={on ? 'On campus' : 'Free day'}>{DAY_NAMES[d]}<span className="sr-only">{on ? ', on campus' : ', free'}</span></span>
                  })}
                </div>
                <div className="mt">
                  {notes.length ? (
                    <ul className="pl-review">
                      {notes.map((n, i) => (
                        <li key={i}>{NOTE_ICON[n.kind]}<span>{n.text}</span></li>
                      ))}
                    </ul>
                  ) : <p className="muted small" style={{ margin: 0 }}>Nothing to flag this week.</p>}
                  {hidden > 0 && <p className="faint small" style={{ margin: '8px 0 0' }}>Notes for the finished half-term are hidden.</p>}
                </div>
              </div>
              <RecentActions />
            </div>
          </div>

          <div className="section-label mt-lg">
            <span>Courses in {termName}</span>
            <span className="faint mono">{items.length}</span>
          </div>
          {items.length ? (
            <div className="pa-list">
              {items.map((item) => (
                <PlanRow key={`${item.id}-${item.bid_points ?? ''}-${item.section.id}`} item={item} busy={busy === item.id} run={run} onOpen={onOpen} />
              ))}
            </div>
          ) : (
            <div className="card">
              <p className="muted small" style={{ margin: 0 }}>
                Only your core so far.{' '}
                <button type="button" className="link-btn" onClick={() => go('explore')}>Find electives in the course explorer</button>
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

/* ---------------------------------------------------------------- recent actions (moved here from Dan's Desk) */

/** Every plan change you or Dan made, newest first, each with Undo. Reloads whenever the plan changes. */
function RecentActions({ className = '' }: { className?: string }) {
  const { plan, refreshPlan, toast } = useApp()
  const [actions, setActions] = useState<ActionEntry[] | null>(null)
  const [all, setAll] = useState(false)
  useEffect(() => { api.actions().then((r) => setActions(r.actions)).catch(() => setActions([])) }, [plan])
  const undo = async (a: ActionEntry) => {
    try {
      const r = await api.undo(a.id)
      await refreshPlan()
      toast(r.ok ? `Undone: ${a.summary}` : r.detail || 'Nothing to undo', r.ok ? 'good' : 'bad')
    } catch (e) {
      toast((e as Error).message, 'bad')
    }
  }
  const shown = (actions ?? []).slice(0, all ? 20 : 5)
  return (
    <div className={`card pl-actions ${className}`}>
      <div className="section-label">
        <span className="pa-inline-icon"><History className="icon sm" />Recent changes</span>
        {(actions?.length ?? 0) > 5 && (
          <button type="button" className="link-btn small" onClick={() => setAll((v) => !v)} aria-expanded={all}>{all ? 'Show fewer' : `All ${actions!.length}`}</button>
        )}
      </div>
      {actions == null ? <span className="skeleton" style={{ display: 'block', height: 40 }} />
        : actions.length === 0 ? <p className="faint small" style={{ margin: 0 }}>Every change you or Dan make shows up here, with undo.</p>
          : (
            <ul className="pl-actions-list">
              {shown.map((a) => (
                <li key={a.id}>
                  <span className={a.undone ? 'pl-action undone' : 'pl-action'} title={a.summary}>
                    {a.summary}{a.by === 'dan' ? <span className="faint"> · via Dan</span> : null}
                  </span>
                  {a.undone ? <span className="faint small">Undone</span>
                    : <button type="button" className="btn sm ghost pl-undo" aria-label={`Undo: ${a.summary}`} onClick={() => undo(a)}><RotateCcw className="icon sm" />Undo</button>}
                </li>
              ))}
            </ul>
          )}
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
        <div className="section-label"><span>Time clashes</span></div>
        <span className="pa-inline-icon pa-ok small"><Check className="icon sm" />No clashes</span>
      </div>
    )
  }
  const byId = new Map(items.map((i) => [i.section.id, i]))
  return (
    <div className="card pl-clash">
      <div className="section-label">
        <span className="pa-inline-icon pa-bad"><TriangleAlert className="icon sm" /><span className="mono">{conflicts.length}</span> time {conflicts.length === 1 ? 'clash' : 'clashes'}</span>
      </div>
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
              <div>
                <span className="mono">{c.a}</span> <span className="faint">and</span> <span className="mono">{c.b}</span>
                <div className="faint small">{DAY_NAMES[c.day] ?? c.day} <span className="mono">{c.window}</span></div>
              </div>
              {fixes.length ? (
                <div className="stack tight mt">
                  <span className="faint small">Fix it by switching to another section:</span>
                  <div className="row" style={{ gap: 6 }}>
                    {fixes.map(({ item, alt, fits }) => (
                      <button
                        key={`${item.id}-${alt.id}`}
                        type="button"
                        className="btn sm"
                        disabled={busy === item.id}
                        onClick={() => run(item.id, () => api.updatePlan(item.id, { course_id: alt.id }), `Switched ${alt.number} to section ${alt.section}`)}
                        title={fits ? 'This section fits with the rest of your plan' : 'This section still clashes with something'}
                      >
                        {fits ? <Check className="icon sm pa-ok" aria-label="Fits" /> : <TriangleAlert className="icon sm pa-warn" aria-label="Still clashes" />}
                        <span>Switch <span className="mono">{alt.number}</span> to §<span className="mono">{alt.section}</span> · <span className="mono">{shortTime(alt)}</span></span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="faint small mt" style={{ margin: 0 }}>No other sections meet at a different time. Drop one, or check whether the half-terms make it work.</p>
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
    run(item.id, () => api.updatePlan(item.id, { bid_points: n }), `Saved ${n} bid points for ${s.number}`)
  }

  // No confirm dialog: the toast offers Undo (and native dialogs are blocked in some in-app browsers).
  const remove = () => run(item.id, () => api.removeFromPlan(item.id), `Removed ${s.number}`)

  return (
    <div className="pl-row">
      <button type="button" className="pl-row-main" onClick={() => onOpen(s.key)} aria-label={`Details for ${s.number} ${s.title}`}>
        <span className="course-num">{s.number} §{s.section} · {s.session_name}</span>
        <span className="course-title">{s.title}</span>
        <span className="meta">
          <span><Clock className="icon sm" /><span className="mono">{shortTime(s)}</span></span>
          <span className="mono">{units(s.units)} units</span>
          {s.room && <span><MapPin className="icon sm" />{s.room}</span>}
          {s.exam && <span title={`Final exam: ${s.exam}`}>{shortExam(s.exam)}</span>}
          {item.added_by === 'dan' && <span className="badge gray">Dan's pick</span>}
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
            <a className="btn sm ghost" href={item.google_link} target="_blank" rel="noreferrer" title="Adds a weekly event; it doesn't skip breaks or the Jan 29 make-up day. Use the Calendar page's feed for exact dates.">
              <CalendarPlus className="icon sm" />Google Calendar
            </a>
          )}
          <button type="button" className="btn sm danger" disabled={busy} onClick={remove} aria-label={`Remove ${s.number} from plan`}>
            <X className="icon sm" />Remove
          </button>
        </div>
      </div>
    </div>
  )
}
