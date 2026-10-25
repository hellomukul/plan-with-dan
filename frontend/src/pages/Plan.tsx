/* My plan: a two-year planner organised the way SOM runs the year. Each term has two quarters (Fall-1 + Fall-2,
   Spring-1 + Spring-2); full-term courses run through both. "All years" lays every term out on one screen with
   units against the 16 / 24 rules and a running total toward the degree. This year's terms keep the week
   timetable; 2027-28 terms list *expected* courses (copied from this year's offering, times TBA).
   Calm style: status colour only where it means something, and every change comes back with an Undo toast. */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import {
  ArrowRight, ArrowRightLeft, BookOpen, Building2, CalendarPlus, Check, CircleAlert, Clock, Compass, History, Info, MapPin, Plus, RotateCcw, Search, Sparkles,
  Ellipsis, TriangleAlert, X,
} from 'lucide-react'
import { api, type ActionEntry, type Clash, type OutsideCourse, type PlanItem, type PlanResponse, type Section } from '../api'
import CourseDrawer from '../components/CourseDrawer'
import Timetable, { sectionsClash } from '../components/Timetable'
import { Empty, Spinner } from '../components/ui'
import { scoreOffering } from '../lib/courseSearch'
import { DAYS, DAY_NAMES, NEXT_YEAR, PLANNING_TERM, QUARTER_SHORT, TERM_NAMES, quarterLabel, shortExam, termName as baseTermName } from '../lib/format'
import { addDropClosed } from '../lib/eligibility'
import { useApp } from '../state'
import './pages-a.css'
import './plan-actions.css'
import './plan-years.css'
import { taughtWithLabel } from '../components/TaughtWith'
import NextYearNote from '../components/NextYearNote'
import OutsideCourseDialog from '../components/OutsideCourseDialog'

type SessionView = 'all' | '1' | '2'
type Status = PlanItem['status']
type TermStatus = 'ok' | 'low' | 'needs_approval'

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
const OVERVIEW = 'all'
const TAB_KEY = 'pwd-plan-tab'

const CHECK_TONE: Record<string, string> = { done: 'pa-ok', planned: '', missing: 'pa-warn', info: 'muted', unconfirmed: 'faint' }
const CHECK_TEXT: Record<string, string> = { done: 'Done', planned: 'Planned', missing: 'Not yet', info: 'Note', unconfirmed: 'Unconfirmed' }

/** What every plan change returns: the action id lets the toast offer Undo. */
type Work = () => Promise<{ ok: boolean; action_id?: number }>

/* ---------------------------------------------------------------- terms, quarters, rules */

const seasonOf = (term: string) => (term.endsWith('03') ? 'fall' : 'spring')
/** the academic year a term belongs to: Fall 2026 and Spring 2027 are both 2026 (2026–27) */
const academicYear = (term: string) => (term.endsWith('03') ? Number(term.slice(0, 4)) : Number(term.slice(0, 4)) - 1)
const yearLabel = (y: number) => `${y}–${String(y + 1).slice(2)}`
const SOURCE_TERM: Record<string, string> = Object.fromEntries(Object.entries(NEXT_YEAR).map(([a, b]) => [b, a]))

function inSessionView(s: Section, view: SessionView): boolean {
  if (view === '1') return !s.session.endsWith('-2')
  if (view === '2') return !s.session.endsWith('-1')
  return true
}

const shortTime = (s: Section) => (s.start_min == null ? 'Time TBA' : s.time)

interface TermRule { units: number; min: number | null; max: number | null; status: TermStatus }

/** Units and the 16 / 24 rule for one term. The server checks every term with units in it; an empty term
    gets the same rule here (MBA: 16 in each of the first three terms, 24 max; other programs: their per-term minimum). */
function termRule(plan: PlanResponse, term: string, year: string): TermRule {
  const p = plan.progress
  const got = p.terms.find((t) => t.term === term)
  const u = plan.terms[term]?.units ?? got?.units ?? 0
  if (got) return { units: u, min: got.min_applies ? got.min_units ?? null : null, max: got.max_units ?? null, status: got.status }
  const sibling = p.terms.find((t) => t.max_units != null)
  const mba = p.mba_rules !== false
  const max = sibling?.max_units ?? (mba ? 24 : null)
  let min: number | null = null
  if (mba) {
    const firstThree: Record<string, string[]> = { '1': ['202603', '202701', '202703'], '2': ['202603'], admit: ['202703', '202801'], '': ['202603', '202701', '202703'] }
    min = (firstThree[year] ?? []).includes(term) ? 16 : null
  } else {
    const withMin = p.terms.find((t) => t.min_applies && t.min_units != null)
    min = withMin?.min_units ?? null
  }
  const status: TermStatus = min != null && u < min ? 'low' : max != null && u > max ? 'needs_approval' : 'ok'
  return { units: u, min, max, status }
}

function ruleBadge(r: TermRule): { text: string; tone: string; long: string } {
  if (r.status === 'low') return { text: `Under ${r.min} min`, tone: 'amber', long: `Below the ${r.min}-unit minimum` }
  if (r.status === 'needs_approval') return { text: `Over ${r.max}: approval`, tone: 'red', long: `Over ${r.max} units, needs approval` }
  if (r.min != null) return { text: r.max ? `In range ${r.min}–${r.max}` : `${r.min}+ met`, tone: 'green', long: r.max ? `In range (${r.min}–${r.max})` : `At least ${r.min}` }
  return { text: r.max ? `Under ${r.max} cap` : 'No limits', tone: 'gray', long: r.max ? `No minimum this term; over ${r.max} needs approval` : 'No unit limits stated' }
}

/** One course in a term: a plan item, or a core section SOM assigns. */
interface Entry { s: Section; item?: PlanItem; core: boolean }

function termEntries(plan: PlanResponse, term: string, core: Section[]): Entry[] {
  const items = plan.items.filter((i) => i.section.term === term).map((i) => ({ s: i.section, item: i, core: false }))
  return [...core.map((s) => ({ s, core: true })), ...items]
}

function splitQuarters<T extends { s: Section }>(list: T[], term: string) {
  const season = seasonOf(term)
  const q1 = list.filter((e) => e.s.session === `${season}-1`)
  const q2 = list.filter((e) => e.s.session === `${season}-2`)
  const full = list.filter((e) => e.s.session !== `${season}-1` && e.s.session !== `${season}-2`)
  return { season, q1, q2, full }
}
const sumUnits = (list: { s: Section }[]) => list.reduce((a, e) => a + e.s.units, 0)

/** The core SOM assigns in a term, for the quarter board: the server lists it per quarter (finished quarters
    included), so look each course up in the catalog, preferring the student's cohort section. */
function boardCore(plan: PlanResponse, term: string, sections: Section[], cohort: string): Section[] {
  const info = plan.terms[term]
  if (!info?.core_units) return []
  const mine = new Set(plan.items.filter((i) => i.section.term === term).map((i) => i.section.number))
  const nums = [...new Set([...(info.quarters ?? []).flatMap((q) => q.courses), ...(info.full_term?.courses ?? [])])].filter((n) => !mine.has(n))
  return nums.map((n) => {
    const all = sections.filter((s) => s.term === term && s.number === n)
    return all.find((s) => s.core && cohort && s.cohort === cohort) ?? all.find((s) => s.core) ?? all[0]
  }).filter((s): s is Section => !!s)
}

/* ---------------------------------------------------------------- page */

export default function Plan() {
  const { plan, refreshPlan, toast, undoToast, go } = useApp()
  const [loaded, setLoaded] = useState(false)
  const [tab, setTabState] = useState<string>(() => sessionStorage.getItem(TAB_KEY) || OVERVIEW)
  const [open, setOpen] = useState<string | null>(null)
  const [busy, setBusy] = useState<number | null>(null)
  const pending = useRef(false)  // one plan change at a time; a double-click never sends the same change twice

  useEffect(() => {
    refreshPlan().finally(() => setLoaded(true))
  }, [refreshPlan])

  const setTab = useCallback((t: string) => {
    setTabState(t)
    try { sessionStorage.setItem(TAB_KEY, t) } catch { /* private mode */ }
  }, [])
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
        <div className="page-head"><div><h1>My plan &amp; timetable</h1><p>Your weekly timetable for each term, every term to Spring 2028 by quarter, and how you're tracking on units.</p></div></div>
        {loaded ? (
          <Empty icon={<CircleAlert className="icon lg faint" />} title="Couldn't load your plan">
            <button type="button" className="btn primary sm" onClick={() => { setLoaded(false); refreshPlan().finally(() => setLoaded(true)) }}>Try again</button>
          </Empty>
        ) : <div className="empty"><Spinner label="Loading your plan…" /></div>}
      </div>
    )
  }

  return (
    <PlanBody plan={plan} tab={tab} setTab={setTab} busy={busy} run={run} onOpen={setOpen} go={go}>
      {open && <CourseDrawer courseKey={open} onClose={close} />}
    </PlanBody>
  )
}

interface BodyProps {
  plan: PlanResponse
  tab: string
  setTab: (t: string) => void
  busy: number | null
  run: (id: number, work: Work, ok: string) => Promise<void>
  onOpen: (key: string) => void
  go: ReturnType<typeof useApp>['go']
  children?: ReactNode
}

function PlanBody({ plan, tab, setTab, busy, run, onOpen, go, children }: BodyProps) {
  const { profile, sectionById, sections } = useApp()
  const terms = useMemo(() => {
    const listed = plan.planning_terms?.map((t) => t.code) ?? [PLANNING_TERM]
    return Array.from(new Set([...listed, ...Object.keys(plan.terms)])).sort()
  }, [plan.planning_terms, plan.terms])
  const termName = useCallback((t: string) => plan.terms[t]?.name ?? plan.planning_terms?.find((x) => x.code === t)?.name ?? baseTermName(t), [plan])
  const isExpected = useCallback((t: string) => plan.terms[t]?.expected ?? !(t in TERM_NAMES), [plan.terms])
  const coreByTerm = useCoreByTerm(plan, terms, sectionById)
  const years = useMemo(() => Array.from(new Set(terms.map(academicYear))).sort(), [terms])
  const cohort = profile?.cohort ?? ''
  const boardCoreByTerm = useMemo(() => Object.fromEntries(terms.map((t) => [t, boardCore(plan, t, sections, cohort)])), [plan, terms, sections, cohort])
  const active = tab === OVERVIEW || terms.includes(tab) ? tab : OVERVIEW

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>My plan &amp; timetable</h1>
          <p>{years.length > 1
            ? `Every term from ${termName(terms[0])} to ${termName(terms[terms.length - 1])}, by quarter. Open a term to see its weekly timetable.`
            : 'Your year by quarter, your weekly timetable, and how you\'re tracking on units.'}</p>
        </div>
      </div>

      {/* ---------------------------------------------------------- tabs: overview + one per term */}
      <div className="pl-termbar mb">
        <div className="tabs py-tabs" role="group" aria-label="Term">
          <button type="button" className={active === OVERVIEW ? 'on' : ''} aria-pressed={active === OVERVIEW} onClick={() => setTab(OVERVIEW)}>
            {years.length > 1 ? 'All years' : 'Full year'}
          </button>
          {terms.map((t) => {
            const n = plan.items.filter((i) => i.section.term === t).length
            const exp = isExpected(t)
            return (
              <button key={t} type="button" className={active === t ? 'on' : ''} aria-pressed={active === t} onClick={() => setTab(t)}
                title={exp ? `${termName(t)}: expected courses, times TBA` : undefined}>
                {termName(t)}{exp && <span className="py-tab-exp" aria-label="expected">exp</span>}{n ? <span className="mono faint">{n}</span> : null}
              </button>
            )
          })}
        </div>
      </div>

      {/* Every view is rendered in the same grid cell and only the chosen one is shown, so switching never
          changes the page length (the tallest view sets it). */}
      <div className="pl-stack">
        <div className={`pl-pane ${active === OVERVIEW ? 'on' : ''}`} aria-hidden={active !== OVERVIEW || undefined} inert={active !== OVERVIEW}>
          <Overview plan={plan} terms={terms} years={years} coreByTerm={boardCoreByTerm} cohortSet={!!cohort} termName={termName} isExpected={isExpected}
            year={profile?.year ?? ''} setTab={setTab} onOpen={onOpen} go={go} />
        </div>
        {terms.map((t) => (isExpected(t) ? (
          <ExpectedPane key={t} plan={plan} term={t} active={t === active} termName={termName(t)} year={profile?.year ?? ''}
            busy={busy} run={run} onOpen={onOpen} go={go} />
        ) : (
          <TermPane key={t} plan={plan} term={t} active={t === active} core={coreByTerm[t] ?? []} year={profile?.year ?? ''}
            termName={termName(t)} busy={busy} run={run} onOpen={onOpen} go={go} />
        )))}
      </div>
      {children}
    </div>
  )
}

/* ---------------------------------------------------------------- helpers */

const localIso = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

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

/* ---------------------------------------------------------------- shared pieces */

/** Units against the term's rules: a bar to the cap with a tick at the minimum. Colour only when off-range. */
function UnitMeter({ rule }: { rule: TermRule }) {
  const scale = Math.max(rule.max ?? 24, rule.units, rule.min ?? 0) || 24
  const pct = (n: number) => `${Math.min(100, (100 * n) / scale)}%`
  return (
    <div className={`py-meter ${rule.status}`} aria-hidden="true">
      <span className="py-meter-fill" style={{ width: pct(rule.units) }} />
      {rule.min != null && <i className="py-meter-tick" style={{ left: pct(rule.min) }} />}
      {rule.max != null && rule.max < scale && <i className="py-meter-tick cap" style={{ left: pct(rule.max) }} />}
    </div>
  )
}

function Chip({ e, onOpen, expected }: { e: Entry; onOpen: (key: string) => void; expected: boolean }) {
  const s = e.s
  if (e.core) {
    // core is assigned, not chosen: one quiet line, so the electives you picked stand out
    return (
      <button type="button" className="py-chip core line" onClick={() => onOpen(s.key)} title={`${s.number} ${s.title} · ${units(s.units)} units · your core, assigned by SOM`}>
        <span className="py-chip-top">
          <span className="py-chip-num">{s.number}</span>
          <span className="py-chip-title">{s.title}</span>
          <span className="py-chip-u">{units(s.units)}</span>
        </span>
      </button>
    )
  }
  const chip = (
    <button type="button" className={`py-chip${e.core ? ' core' : ''}${expected ? ' exp' : ''}`} onClick={() => onOpen(s.key)}
      title={`${s.number} ${s.title} · ${units(s.units)} units${e.core ? ' · your core, assigned by SOM' : ''}${expected ? ' · expected, times TBA' : ''}`}>
      <span className="py-chip-top">
        <span className="py-chip-num">{s.number}</span>
        {e.core ? <span className="py-chip-tag">Core</span> : <span className="py-chip-tag mine">{expected ? 'Expected' : 'Elective'}</span>}
        {!!s.taught_with?.length && <span className="py-chip-tag tw" title={taughtWithLabel(s.taught_with)}>{s.taught_with[0].replace(/^School of (the )?/, '').replace(' School', '')}</span>}
        <span className="py-chip-u">{units(s.units)}</span>
      </span>
      <span className="py-chip-title">{s.title}</span>
    </button>
  )
  return e.item ? <span className="py-chip-wrap">{chip}<ChipMenu item={e.item} s={s} /></span> : chip
}

const SAME_SEASON: Record<string, string> = { '202603': '202703', '202703': '202603', '202701': '202801', '202801': '202701' }

/** "⋯" on a course you planned: move it to the same season next (or this) year, or take it out. Both can be undone.
    (Student feedback: "since I'm over for Fall 27, drop some".) */
function ChipMenu({ item, s }: { item: PlanItem; s: Section }) {
  const { plan, refreshPlan, toast, undoToast, sections } = useApp()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (ev: MouseEvent | KeyboardEvent) => {
      if (ev instanceof KeyboardEvent ? ev.key === 'Escape' : !ref.current?.contains(ev.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close) }
  }, [open])
  const here = item.target_term || s.term
  const other = SAME_SEASON[here]
  // Next year takes any course of the same season (expected); this year only while one of its sections is still
  // before add/drop closes (e.g. not a Fall-1 course once Fall-1 has ended).
  const canMove = !!other && (plan?.planning_terms ?? []).some((t) => t.code === other && t.can_add !== false)
    && (other === '202703' || other === '202801'
      || sections.some((x) => x.key === s.key && x.term === other && !x.core && !addDropClosed(x) && !(x.ends && x.ends < new Date().toISOString().slice(0, 10))))
  const run = async (fn: () => Promise<{ action_id?: number }>, ok: string) => {
    if (busy) return
    setBusy(true)
    try {
      const r = await fn()
      await refreshPlan()
      undoToast(ok, r.action_id)
    } catch (err) {
      toast((err as Error).message, 'bad')
    } finally {
      setBusy(false); setOpen(false)
    }
  }
  return (
    <span className="py-chip-more" ref={ref}>
      <button type="button" className="py-chip-dots" aria-haspopup="menu" aria-expanded={open} aria-label={`Move or remove ${s.number}`}
        onClick={() => setOpen((v) => !v)}><Ellipsis className="icon sm" aria-hidden="true" /></button>
      {open && (
        <span className="py-chip-menu" role="menu">
          {canMove && (
            <button type="button" role="menuitem" disabled={busy} onClick={() => void run(() => api.movePlanItem(item.id, other), `Moved ${s.number} to ${baseTermName(other)}`)}>
              <ArrowRightLeft className="icon sm" aria-hidden="true" />Move to {baseTermName(other)}
            </button>
          )}
          <button type="button" role="menuitem" className="danger" disabled={busy} onClick={() => void run(() => api.removeFromPlan(item.id), `Removed ${s.number}`)}>
            <X className="icon sm" aria-hidden="true" />Remove from plan
          </button>
        </span>
      )}
    </span>
  )
}

/** One term laid out as its two quarters. Full-term courses sit in a band across both quarter columns. */
function QuarterBoard({ term, entries, missingCore, expected, cohortSet = true, onOpen, go }: {
  term: string; entries: Entry[]; missingCore: number; expected: boolean; cohortSet?: boolean; onOpen: (key: string) => void; go: BodyProps['go']
}) {
  const { season, q1, q2, full } = splitQuarters(entries, term)
  const head = (key: string, list: Entry[]) => (
    <div className="py-qhead">
      <span>{QUARTER_SHORT[key]}</span>
      <span className="mono faint">{units(sumUnits(list))} u</span>
    </div>
  )
  const column = (list: Entry[], label: string) => (
    <ul className="py-qlist" aria-label={label}>
      {list.map((e) => <li key={e.s.id}><Chip e={e} onOpen={onOpen} expected={expected} /></li>)}
      {!list.length && <li className="py-qempty">Nothing yet</li>}
    </ul>
  )
  return (
    <div className="py-board">
      {head(`${season}-1`, q1)}
      {head(`${season}-2`, q2)}
      <div className={`py-full${full.length || missingCore ? '' : ' none'}`}>
        {(full.length > 0 || missingCore > 0) && (
          <span className="py-full-label"><span>Full term · both quarters</span><span className="mono">{units(sumUnits(full) + missingCore)} u</span></span>
        )}
        {full.map((e) => <Chip key={e.s.id} e={e} onOpen={onOpen} expected={expected} />)}
        {missingCore > 0 && (
          cohortSet ? (
            <div className="py-chip core ghost">
              <span className="py-chip-top"><span className="py-chip-num">Core</span><span className="py-chip-tag">Assigned</span><span className="py-chip-u">{units(missingCore)}</span></span>
              <span className="py-chip-title">Assigned by SOM for your cohort</span>
            </div>
          ) : (
            <button type="button" className="py-chip core ghost" onClick={() => go('profile')} title="Set your cohort to see your core sections">
              <span className="py-chip-top"><span className="py-chip-num">Core</span><span className="py-chip-tag">Assigned</span><span className="py-chip-u">{units(missingCore)}</span></span>
              <span className="py-chip-title">Set your cohort to see which</span>
            </button>
          )
        )}
        {!full.length && !missingCore && <span className="py-qempty">No full-term courses</span>}
      </div>
      {column(q1, QUARTER_SHORT[`${season}-1`])}
      {column(q2, QUARTER_SHORT[`${season}-2`])}
    </div>
  )
}

/* ---------------------------------------------------------------- overview: every term on one screen */

function Overview({ plan, terms, years, coreByTerm, cohortSet, termName, isExpected, year, setTab, onOpen, go }: {
  plan: PlanResponse; terms: string[]; years: number[]; coreByTerm: Record<string, Section[]>; cohortSet: boolean
  termName: (t: string) => string; isExpected: (t: string) => boolean; year: string
  setTab: (t: string) => void; onOpen: (key: string) => void; go: BodyProps['go']
}) {
  const p = plan.progress
  const target = p.total_target || 72
  const termUnits = terms.map((t) => plan.terms[t]?.units ?? 0)
  // What counts toward the degree but sits in no term shown here (a second-year's first-year core, say).
  const base = Math.max(0, p.planned_total - termUnits.reduce((a, b) => a + b, 0))
  const running: Record<string, number> = {}
  terms.reduce((acc, t, i) => { running[t] = acc + termUnits[i]; return running[t] }, base)

  return (
    <div className="py-overview">
      {!plan.items.length && (
        <div className="card py-empty">
          <Compass className="icon lg faint" />
          <span className="py-empty-text"><b>Nothing planned yet.</b> <span className="muted">Let Elihu pick courses, or browse the explorer and add them to any term below.</span></span>
          <span className="row py-empty-actions">
            <button type="button" className="btn primary sm" onClick={() => go('find')}><Sparkles className="icon sm" />Ask Elihu</button>
            <button type="button" className="btn sm" onClick={() => go('explore')}><Search className="icon sm" />Course explorer</button>
          </span>
        </div>
      )}
      <DegreeCard plan={plan} terms={terms} base={base} termName={termName} isExpected={isExpected} year={year} go={go} />
      {/* Core is assigned by SOM, electives are yours: the legend for the chips below (student feedback, Oct 25) */}
      <div className="py-key-row">
      <ul className="py-key" aria-label="What the colours mean">
        {year === '1' && <li><span className="py-swatch core" aria-hidden="true" />Core, assigned by SOM</li>}
        <li><span className="py-swatch mine" aria-hidden="true" />Your electives</li>
        {terms.some(isExpected) && <li><span className="py-swatch exp" aria-hidden="true" />Expected for 2027–28 · times TBA</li>}
        {(plan.outside ?? []).length > 0 && <li><span className="py-swatch out" aria-hidden="true" />Outside SOM</li>}
      </ul>
      <OutsideAdd terms={terms} termName={termName} />
      </div>

      {years.map((y) => {
        const ts = terms.filter((t) => academicYear(t) === y)
        const exp = ts.every(isExpected)
        const yUnits = ts.reduce((a, t) => a + (plan.terms[t]?.units ?? 0), 0)
        return (
          <section key={y} className={`py-year${exp ? ' exp' : ''}`} aria-label={`${yearLabel(y)} academic year`}>
            <header className="py-year-head">
              <h2>{yearLabel(y)}</h2>
              <span className="py-year-sub">{exp ? <><Clock className="icon sm" />Expected courses · times TBA</> : 'This year · times published'}</span>
              <span className="py-year-units mono">{units(yUnits)} units</span>
            </header>
            {exp && <NextYearNote />}
            <div className={`py-year-terms n${ts.length}`}>
              {ts.map((t) => {
                const info = plan.terms[t]
                const core = coreByTerm[t] ?? []
                const coreShown = core.reduce((a, s) => a + s.units, 0)
                const missingCore = Math.max(0, (info?.core_units ?? 0) - coreShown)
                const rule = termRule(plan, t, year)
                const badge = ruleBadge(rule)
                const texp = isExpected(t)
                return (
                  <article key={t} className={`py-term${texp ? ' exp' : ''}`}>
                    <header className="py-term-head">
                      <h3>{termName(t)}</h3>
                      {texp && <span className="badge gray py-exp-badge">Expected · times TBA</span>}
                      <span className="py-term-units"><span className="mono">{units(rule.units)}</span> units</span>
                    </header>
                    <div className="py-term-rule">
                      <UnitMeter rule={rule} />
                      <span className={`badge ${badge.tone}`} title={badge.long}>{badge.text}</span>
                    </div>
                    <QuarterBoard term={t} entries={termEntries(plan, t, core)} missingCore={missingCore > 0.05 ? missingCore : 0}
                      expected={texp} cohortSet={cohortSet} onOpen={onOpen} go={go} />
                    <OutsideChips list={(plan.outside ?? []).filter((o) => o.term === t)} />
                    <footer className="py-term-foot">
                      <span className="faint small">Progress towards degree <span className="mono py-run">{units(running[t])}</span> / {target}</span>
                      <button type="button" className="btn sm ghost py-open" onClick={() => setTab(t)}>
                        {texp ? <><Plus className="icon sm" />Plan courses</> : <>See the week<ArrowRight className="icon sm" /></>}
                      </button>
                    </footer>
                  </article>
                )
              })}
            </div>
          </section>
        )
      })}

      {p.mba_rules === false && (p.checks ?? []).length > 0 && (
        <div className="card">
          <div className="section-label"><span>What your program requires{p.program_label ? ` · ${p.program_label}` : ''}</span></div>
          <ul className="pl-checks" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
            {(p.checks ?? []).map((c, i) => (
              <li key={i} className="row between small" style={{ flexWrap: 'nowrap', alignItems: 'flex-start', gap: 12 }}>
                <span><b style={{ fontWeight: 500 }}>{c.label}</b><br /><span className="faint">{c.detail}</span></span>
                <span className={CHECK_TONE[c.status]} style={{ whiteSpace: 'nowrap' }}>{CHECK_TEXT[c.status]}</span>
              </li>
            ))}
            {(p.sources ?? []).length > 0 && <li className="faint small">Sources: {(p.sources ?? []).map((u) => <a key={u} href={u} target="_blank" rel="noreferrer" style={{ marginRight: 12 }}>{sourceLabel(u)}</a>)}</li>}
          </ul>
        </div>
      )}
      <RecentActions />
    </div>
  )
}

/** Degree progress: one bar toward the total, split by term (expected terms drawn lighter), plus the requirement checks. */
function DegreeCard({ plan, terms, base, termName, isExpected, year, go }: {
  plan: PlanResponse; terms: string[]; base: number; termName: (t: string) => string; isExpected: (t: string) => boolean; year: string
  go: BodyProps['go']
}) {
  const p = plan.progress
  const target = p.total_target || 72
  const mba = p.mba_rules !== false
  const expUnits = plan.items.filter((i) => i.expected).reduce((a, i) => a + i.section.units, 0)
  const left = Math.max(0, target - p.planned_total)
  const segs = [
    ...(base > 0.05 ? [{ key: 'base', label: mba && year === '2' ? 'Year 1 core' : 'Counted earlier', units: base, kind: 'base' }] : []),
    ...terms.map((t) => ({ key: t, label: termName(t), units: plan.terms[t]?.units ?? 0, kind: isExpected(t) ? 'exp' : 'now' })),
  ]
  const scale = Math.max(target, segs.reduce((a, s) => a + s.units, 0))
  return (
    <section className="card py-degree" aria-label="Progress toward your degree">
      <div className="py-degree-top">
        <div className="py-degree-total">
          <span className="py-eyebrow">Toward your {p.program_label || 'degree'}</span>
          <span className="py-big"><span className="mono">{units(p.planned_total)}</span><span className="py-big-of"> / {target} units</span></span>
          <span className="small muted">
            {left > 0 ? `${units(left)} to plan` : 'All planned'}
            {expUnits > 0 && <> · incl. <span className="mono">{units(expUnits)}</span> expected for 2027–28</>}
          </span>
        </div>
        {mba && (
          <dl className="py-reqs">
            <div><dt>Core</dt><dd className={p.core.counted >= p.core.target ? 'pa-ok' : ''}><span className="mono">{units(p.core.counted)} / {units(p.core.target)}</span>{p.core.counted >= p.core.target && <Check className="icon sm" />}</dd></div>
            <div><dt>Electives</dt><dd><span className="mono">{units(p.electives.planned)} / {units(p.electives.target)}</span></dd></div>
            <div><dt>Leadership</dt><dd className={p.ldr.met ? 'pa-ok' : p.ldr.planned ? '' : 'pa-warn'}>{p.ldr.met ? <><Check className="icon sm" />Met</> : p.ldr.planned ? 'Planned' : 'Not yet'}</dd></div>
            <div>
              <dt>Global Studies</dt>
              <dd className={p.gsr.met ? 'pa-ok' : p.gsr.planned ? '' : 'pa-warn'}>
                {p.gsr.met ? <><Check className="icon sm" />Met</> : (
                  <button type="button" className="link-btn py-gsr" onClick={() => go('global')}>{p.gsr.planned ? 'Planned' : 'Not yet'} · options</button>
                )}
              </dd>
            </div>
          </dl>
        )}
      </div>
      <div className="py-track" role="img" aria-label={`${units(p.planned_total)} of ${target} units: ${segs.map((s) => `${s.label} ${units(s.units)}`).join(', ')}`}>
        {segs.filter((s) => s.units > 0).map((s) => (
          <span key={s.key} className={`py-seg ${s.kind}`} style={{ width: `${(100 * s.units) / scale}%` } as CSSProperties} title={`${s.label}: ${units(s.units)} units`} />
        ))}
      </div>
      <ul className="py-legend">
        {segs.map((s) => (
          <li key={s.key}><i className={`py-sw ${s.kind}`} aria-hidden="true" />{s.label}<span className="mono">{units(s.units)}</span></li>
        ))}
        {left > 0 && <li><i className="py-sw left" aria-hidden="true" />To plan<span className="mono">{units(left)}</span></li>}
      </ul>
      {p.notes.length > 0 && <ul className="pl-notes faint small">{p.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
    </section>
  )
}

/* ---------------------------------------------------------------- one term this year: week grid, review, courses */

function TermPane({ plan, term, active, core, termName, year, busy, run, onOpen, go }: {
  plan: PlanResponse
  term: string
  active: boolean
  core: Section[]
  termName: string
  year: string
  busy: number | null
  run: BodyProps['run']
  onOpen: (key: string) => void
  go: BodyProps['go']
}) {
  const { sections } = useApp()
  const [view, setView] = useState<SessionView>('all')
  const info = plan.terms[term]
  const items = plan.items.filter((i) => i.section.term === term)
  const outside = (plan.outside ?? []).filter((o) => o.term === term).map((o) => o.section)
  const shown = [...items.map((i) => i.section), ...core, ...outside].filter((s) => inSessionView(s, view))
  const shownIds = new Set(shown.map((s) => s.id))
  const coreIds = useMemo(() => new Set(core.map((s) => s.id)), [core])
  const conflicts = info?.conflicts ?? []
  const clashIds = new Set(conflicts.filter((c) => shownIds.has(c.a_id) && shownIds.has(c.b_id)).flatMap((c) => [c.a_id, c.b_id]))
  const tba = shown.filter((s) => s.start_min == null || !s.days.length)
  const all = [...items.map((i) => i.section), ...core]
  const hasHalves = all.some((s) => /-(1|2)$/.test(s.session))
  const daysOn = info?.review.days_on_campus.length ?? 0
  const rule = termRule(plan, term, year)
  const badge = ruleBadge(rule)
  const season = seasonOf(term)
  const groups = splitQuarters(items.map((i) => ({ s: i.section, item: i })), term)

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
  const notes = allNotes.filter((n) => !(over['1'] && /^(Fall|Spring)-1: /.test(n.text)) && !(over['2'] && /^(Fall|Spring)-2: /.test(n.text)))
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
              <div className="section-label py-week-head">
                <span>Your week · {termName}</span>
                <span className="row" style={{ gap: 8 }}>
                  <span className="mono">{units(rule.units)} units</span>
                  <span className={`badge ${badge.tone}`} title={badge.long}>{badge.text}</span>
                </span>
              </div>
              {hasHalves && (
                <div className="tabs py-qtabs" role="group" aria-label="Quarter">
                  {(['all', '1', '2'] as const).map((v) => (
                    <button key={v} type="button" className={view === v ? 'on' : ''} aria-pressed={view === v} onClick={() => setView(v)}>
                      {v === 'all' ? 'Both quarters' : QUARTER_SHORT[`${season}-${v}`]}
                    </button>
                  ))}
                </div>
              )}
              {(info?.core_units ?? 0) > 0 && (
                <p className="faint small">
                  {core.length
                    ? <>Your cohort's core ({units(info!.core_units)} units) is on the grid with a dashed outline. SOM schedules it for you, and clash checks include it.</>
                    : <>Includes {units(info!.core_units)} units of your cohort's core, which SOM schedules for you{info!.core_times_known ? ' (clash checks include it)' : '. Set your cohort in your profile so clash checks can include it'}.</>}
                </p>
              )}
              {view === 'all' && hasHalves && (
                <p className="faint small">{QUARTER_SHORT[`${season}-1`]} and {QUARTER_SHORT[`${season}-2`]} courses never clash with each other. Pick a quarter to see it on its own.</p>
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
                  {hidden > 0 && <p className="faint small" style={{ margin: '8px 0 0' }}>Notes for the finished quarter are hidden.</p>}
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
            <QuarterGroups term={term} groups={groups} render={(item) => (
              <PlanRow key={`${item.id}-${item.bid_points ?? ''}-${item.section.id}`} item={item} busy={busy === item.id} run={run} onOpen={onOpen} />
            )} />
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

/** A term's plan rows grouped by quarter: full term (both quarters), then quarter 1, then quarter 2. */
function QuarterGroups({ term, groups, render }: {
  term: string; groups: ReturnType<typeof splitQuarters<{ s: Section; item: PlanItem }>>; render: (item: PlanItem) => ReactNode
}) {
  const { season, q1, q2, full } = groups
  const list = [
    { key: season, label: `${quarterLabel(season, term)}`, sub: `${QUARTER_SHORT[`${season}-1`]} + ${QUARTER_SHORT[`${season}-2`]}`, rows: full },
    { key: `${season}-1`, label: quarterLabel(`${season}-1`, term), sub: '', rows: q1 },
    { key: `${season}-2`, label: quarterLabel(`${season}-2`, term), sub: '', rows: q2 },
  ].filter((g) => g.rows.length)
  return (
    <div className="pa-list py-groups">
      {list.map((g) => (
        <div key={g.key} className="py-group">
          <div className="py-group-head">
            <span>{g.label}{g.sub && <span className="faint"> · {g.sub}</span>}</span>
            <span className="faint mono">{g.rows.length} · {units(sumUnits(g.rows))} u</span>
          </div>
          {g.rows.map((r) => render(r.item))}
        </div>
      ))}
    </div>
  )
}

/* ---------------------------------------------------------------- one 2027-28 term: expected courses, no timetable */

function ExpectedPane({ plan, term, active, termName, year, busy, run, onOpen, go }: {
  plan: PlanResponse; term: string; active: boolean; termName: string; year: string
  busy: number | null; run: BodyProps['run']; onOpen: (key: string) => void; go: BodyProps['go']
}) {
  const items = plan.items.filter((i) => i.section.term === term)
  const rule = termRule(plan, term, year)
  const badge = ruleBadge(rule)
  const source = SOURCE_TERM[term]
  const groups = splitQuarters(items.map((i) => ({ s: i.section, item: i })), term)
  return (
    <div className={`pl-pane ${active ? 'on' : ''}`} aria-hidden={!active || undefined} inert={!active}>
      <div className="grid py-exp-grid">
        <div className="card py-exp-main">
          <div className="section-label py-week-head">
            <span>{termName} · by quarter</span>
            <span className="row" style={{ gap: 8 }}>
              <span className="mono">{units(rule.units)} units</span>
              <span className={`badge ${badge.tone}`} title={badge.long}>{badge.text}</span>
            </span>
          </div>
          <div className="py-term-rule"><UnitMeter rule={rule} /><span className="faint small">{badge.long}</span></div>
          <NextYearNote compact />
          <p className="py-exp-note">
            <Clock className="icon sm" />
            <span>Expected from this year’s {source ? baseTermName(source) : ''} offerings in the same quarter: what second-years are taking now. Times, rooms and sections are TBA.</span>
          </p>
          <QuarterBoard term={term} entries={items.map((i) => ({ s: i.section, item: i, core: false }))} missingCore={0} expected onOpen={onOpen} go={go} />
        </div>
        <AddForTerm plan={plan} term={term} termName={termName} busy={busy} run={run} onOpen={onOpen} go={go} />
      </div>

      <div className="section-label mt-lg">
        <span>Courses in {termName}</span>
        <span className="faint mono">{items.length}</span>
      </div>
      {items.length ? (
        <QuarterGroups term={term} groups={groups} render={(item) => (
          <PlanRow key={`${item.id}-${item.section.id}`} item={item} busy={busy === item.id} run={run} onOpen={onOpen} />
        )} />
      ) : (
        <div className="card">
          <p className="muted small" style={{ margin: 0 }}>Nothing planned for {termName} yet. Add a course on the right, or from the course explorer.</p>
        </div>
      )}
      <RecentActions className="mt" />
    </div>
  )
}

const ADD_ROWS = 6

/** Plan a course for a 2027-28 term from this year's same-season offering (the server copies it as expected). */
function AddForTerm({ plan, term, termName, busy, run, onOpen, go }: {
  plan: PlanResponse; term: string; termName: string; busy: number | null; run: BodyProps['run']; onOpen: (key: string) => void
  go: BodyProps['go']
}) {
  const { sections, profile } = useApp()
  const [q, setQ] = useState('')
  const source = SOURCE_TERM[term]
  const program = profile?.program || 'MBA'
  const isMba = program === 'MBA' || program === 'MBA-JOINT'
  const inPlan = useMemo(() => new Map(plan.items.map((i) => [i.section.number, i.section.term])), [plan.items])
  // One entry per course: this year's sections in the same season that aren't core and are open to the program.
  const offerings = useMemo(() => {
    const byNum = new Map<string, Section[]>()
    for (const s of sections) {
      if (s.term !== source || s.core) continue
      if (!(s.audiences ?? s.programs).includes(program)) continue
      if (s.enrollment.trim().toLowerCase() === 'no') continue
      if (s.category.toUpperCase() === 'GSR' && !isMba) continue
      byNum.set(s.number, [...(byNum.get(s.number) ?? []), s])
    }
    return [...byNum.values()].sort((a, b) => a[0].number.localeCompare(b[0].number))
  }, [sections, source, program, isMba])
  const results = useMemo(() => {
    // browsing: courses not yet in the plan first, so the box shows things you can still add
    if (!q.trim()) return [...offerings].sort((a, b) => Number(inPlan.has(a[0].number)) - Number(inPlan.has(b[0].number))).slice(0, ADD_ROWS)
    return offerings.map((secs) => ({ secs, score: scoreOffering(secs, q).score })).filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score).slice(0, ADD_ROWS).map((x) => x.secs)
  }, [offerings, q, inPlan])
  const inputId = `add-${term}`

  return (
    <section className="card py-add" aria-label={`Add a course for ${termName}`}>
      <div className="section-label"><span>Add a course for {termName}</span><span className="faint mono">{offerings.length}</span></div>
      <label className="sr-only" htmlFor={inputId}>Search {source ? baseTermName(source) : ''} courses</label>
      <div className="py-add-search">
        <Search className="icon sm faint" />
        <input id={inputId} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Number, title or professor" autoComplete="off" />
      </div>
      <p className="faint small py-add-hint">From this year's {source ? baseTermName(source) : ''} courses, planned as expected for {termName}.</p>
      <ul className="py-add-list">
        {results.map((secs) => {
          const s = secs[0]
          const where = inPlan.get(s.number)
          return (
            <li key={s.number}>
              <button type="button" className="py-add-main" onClick={() => onOpen(s.key)} aria-label={`Details for ${s.number} ${s.title}`}>
                <span className="py-add-top"><span className="mono">{s.number}</span><span className="py-add-q">{QUARTER_SHORT[s.session] ?? s.session_name}</span><span className="mono faint">{units(s.units)} u</span></span>
                <span className="py-add-title">{s.title}</span>
              </button>
              {where ? (
                <span className="py-add-in faint small" title={`Already in your plan for ${baseTermName(where)}`}><Check className="icon sm" />{where === term ? 'Planned' : baseTermName(where)}</span>
              ) : (
                <button type="button" className="btn sm py-add-btn" disabled={busy === -1}
                  onClick={() => run(-1, () => api.planNextYear(s.id, term as '202703' | '202801'), `Planned ${s.number} for ${termName} (expected)`)}
                  aria-label={`Plan ${s.number} for ${termName}`}>
                  <Plus className="icon sm" />Plan
                </button>
              )}
            </li>
          )
        })}
        {!results.length && <li className="py-add-none faint small">{offerings.length ? `No ${source ? baseTermName(source) : ''} course matches "${q}".` : sections.length ? `No ${source ? baseTermName(source) : ''} courses open to your program.` : 'Loading courses…'}</li>}
      </ul>
      <button type="button" className="link-btn small py-add-more" onClick={() => go('explore')}>Browse the course explorer<ArrowRight className="icon sm" /></button>
    </section>
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
                <p className="faint small mt" style={{ margin: 0 }}>No other sections meet at a different time. Drop one, or check whether the quarters make it work.</p>
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
  const expected = !!item.expected
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
  const remove = () => run(item.id, () => api.removeFromPlan(item.id), `Removed ${s.number}${expected ? ` from ${baseTermName(s.term)}` : ''}`)

  return (
    <div className={`pl-row${expected ? ' py-row-exp' : ''}`}>
      <button type="button" className="pl-row-main" onClick={() => onOpen(s.key)} aria-label={`Details for ${s.number} ${s.title}`}>
        <span className="course-num">{s.number}{expected ? '' : ` §${s.section}`} · {s.quarter ?? quarterLabel(s.session, s.term)}</span>
        <span className="course-title">{s.title}</span>
        <span className="meta">
          {expected
            ? <span className="badge gray"><Clock className="icon sm" />Expected · times TBA</span>
            : <span><Clock className="icon sm" /><span className="mono">{shortTime(s)}</span></span>}
          <span className="mono">{units(s.units)} units</span>
          {!expected && s.room && <span><MapPin className="icon sm" />{s.room}</span>}
          {!expected && s.exam && <span title={`Final exam: ${s.exam}`}>{shortExam(s.exam)}</span>}
          {expected && s.faculty.length > 0 && <span className="faint" title="This year's instructors; next year's may differ">This year: {s.faculty.slice(0, 2).join(', ')}</span>}
          {item.added_by === 'dan' && <span className="badge gray">Dan's pick</span>}
        </span>
      </button>
      <div className="pl-row-controls">
        {!expected && (
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
        )}
        {!expected && item.status === 'bidding' && (
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
          {!expected && item.google_link && (
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


/* ---------------------------------------------------------------- courses outside SOM (student feedback, Oct 25) */

/** Outside-SOM courses in one term: shown with their units apart from SOM's totals, each removable. */
function OutsideChips({ list }: { list: OutsideCourse[] }) {
  const { refreshPlan, toast } = useApp()
  if (!list.length) return null
  const total = list.reduce((n, o) => n + o.units, 0)
  const remove = async (o: OutsideCourse) => {
    try { await api.removeOutside(o.id); await refreshPlan(); toast(`Removed ${o.number || o.title}`) } catch (e) { toast((e as Error).message, 'bad') }
  }
  return (
    <div className="py-outside">
      <span className="py-full-label"><span>Outside SOM · not in SOM’s unit totals</span><span className="mono">{units(total)} u</span></span>
      {list.map((o) => (
        <span key={o.id} className="py-chip-wrap">
          <span className="py-chip out" title={`${o.school ? `${o.school} · ` : ''}${o.title}${o.section.time ? ` · ${o.section.time}` : ''}`}>
            <span className="py-chip-top">
              <span className="py-chip-num">{o.number || o.school || 'Outside'}</span>
              <span className="py-chip-tag out">{o.school || 'Outside SOM'}</span>
              <span className="py-chip-u">{units(o.units)}</span>
            </span>
            <span className="py-chip-title">{o.title}</span>
          </span>
          <span className="py-chip-more">
            <button type="button" className="py-chip-dots" aria-label={`Remove ${o.number || o.title}`} onClick={() => void remove(o)}><X className="icon sm" aria-hidden="true" /></button>
          </span>
        </span>
      ))}
    </div>
  )
}

/** "Add a course from outside SOM" button: opens the shared form (components/OutsideCourseDialog). */
function OutsideAdd({ terms, termName }: { terms: string[]; termName: (t: string) => string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className="btn sm ghost" onClick={() => setOpen(true)}><Building2 className="icon sm" aria-hidden="true" />Add a course from outside SOM</button>
      {open && <OutsideCourseDialog terms={terms} termName={termName} onClose={() => setOpen(false)} />}
    </>
  )
}
