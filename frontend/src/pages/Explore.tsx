/* Catalog: browse every real SOM offering with filters that answer real questions.
   Calm style: a quiet filter panel (common filters up front, the rest behind "More filters")
   and results as a scannable list instead of a card grid. */
import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { Check, ChevronDown, ChevronUp, Clock, MapPin, Plus, RotateCcw, Search, SlidersHorizontal, Users } from 'lucide-react'
import type { Section } from '../api'
import CourseDrawer from '../components/CourseDrawer'
import { sectionsClash } from '../components/Timetable'
import { Empty, Spinner } from '../components/ui'
import { enrollLabel, PLANNING_TERM } from '../lib/format'
import { useApp } from '../state'
import './pages-a.css'

type TermFilter = '202701' | '202603' | 'all'
type SessionFilter = 'full' | '1' | '2'
type SortBy = 'relevance' | 'number' | 'seats'
type Quick = 'ldr' | 'gsr' | 'late' | 'fri' | 'bid' | 'fits'

const TERM_TABS: { value: TermFilter; label: string }[] = [
  { value: '202701', label: 'Spring 2027' },
  { value: '202603', label: 'Fall 2026' },
  { value: 'all', label: 'Both' },
]
const SESSIONS: { value: SessionFilter; label: string }[] = [
  { value: 'full', label: 'Full term' },
  { value: '1', label: 'Session 1' },
  { value: '2', label: 'Session 2' },
]
const QUICK: { value: Quick; label: string; hint: string }[] = [
  { value: 'fits', label: 'Fits my plan', hint: 'No time clash with anything already in your plan' },
  { value: 'ldr', label: 'Counts for Leadership', hint: 'Leadership Distribution Requirement (inferred)' },
  { value: 'gsr', label: 'Global Studies', hint: 'Counts toward the Global Studies Requirement (inferred)' },
  { value: 'late', label: 'Starts 10am or later', hint: 'Starts at 10:00 AM or later (or time TBA)' },
  { value: 'fri', label: 'Fridays free', hint: 'No Friday meetings' },
  { value: 'bid', label: 'Bid only', hint: 'Enrollment is by bidding' },
]
const PAGE = 48

function sessionPart(s: Section): SessionFilter {
  return s.session.endsWith('-1') ? '1' : s.session.endsWith('-2') ? '2' : 'full'
}

const norm = (x: string) => x.toLowerCase()

/** Score how well a section matches every search word (0 = no match). Course number hits weigh most. */
function score(s: Section, words: string[]): number {
  if (!words.length) return 1
  const num = norm(s.number).replace(/\s+/g, '')
  const title = norm(s.title)
  const fac = norm(s.faculty.join(' '))
  const topics = norm(s.topics.join(' '))
  const desc = norm(s.description)
  let total = 0
  for (const w of words) {
    let best = 0
    if (num.includes(w.replace(/\s+/g, ''))) best = 10
    else if (title.includes(w)) best = title.split(/\W+/).includes(w) ? 6 : 5
    else if (fac.includes(w)) best = 4
    else if (topics.includes(w)) best = 3
    else if (desc.includes(w)) best = 1
    if (!best) return 0
    total += best
  }
  return total
}

export default function Explore() {
  const { sections, topics, plan, plannedIds, addCourse, user, go, profile } = useApp()
  const program = profile?.program || 'MBA'
  const [q, setQ] = useState('')
  const [term, setTerm] = useState<TermFilter>(PLANNING_TERM as TermFilter)
  const [sessions, setSessions] = useState<Set<SessionFilter>>(new Set())
  const [pickedTopics, setPickedTopics] = useState<Set<string>>(new Set())
  const [quick, setQuick] = useState<Set<Quick>>(new Set())
  const [mbaOnly, setMbaOnly] = useState(true)
  const [showCore, setShowCore] = useState(false)
  const [sort, setSort] = useState<SortBy>('relevance')
  const [limit, setLimit] = useState(PAGE)
  const [open, setOpen] = useState<string | null>(null)
  const [adding, setAdding] = useState<string | null>(null)
  const [moreOpen, setMoreOpen] = useState(false)

  const planned = useMemo(() => (plan?.items ?? []).map((i) => i.section), [plan])

  const groups = useMemo(() => {
    const m = new Map<string, Section[]>()
    for (const s of sections) {
      const arr = m.get(s.key)
      if (arr) arr.push(s)
      else m.set(s.key, [s])
    }
    for (const arr of m.values()) arr.sort((a, b) => a.section.localeCompare(b.section))
    return m
  }, [sections])

  const words = useMemo(() => norm(q).trim().split(/\s+/).filter(Boolean), [q])

  const results = useMemo(() => {
    const sectionOk = (s: Section) => {
      if (quick.has('late') && s.start_min != null && s.start_min < 600) return false
      if (quick.has('fri') && s.days.includes('F')) return false
      if (quick.has('fits') && planned.some((p) => p.key !== s.key && sectionsClash(s, p))) return false
      return true
    }
    const out: { lead: Section; count: number; score: number; inPlan: boolean }[] = []
    for (const rows of groups.values()) {
      const c = rows[0]
      if (term !== 'all' && c.term !== term) continue
      if (mbaOnly && !(c.audiences ?? c.programs).includes(program)) continue
      if (!showCore && c.core) continue
      if (sessions.size && !sessions.has(sessionPart(c))) continue
      if (pickedTopics.size && !c.topics.some((t) => pickedTopics.has(t))) continue
      if (quick.has('ldr') && !c.ldr) continue
      if (quick.has('gsr') && !c.gsr) continue
      if (quick.has('bid') && norm(c.enrollment) !== 'bid') continue
      const sc = score(c, words)
      if (!sc) continue
      const inPlan = rows.some((s) => plannedIds.has(s.id))
      const lead = rows.find((s) => plannedIds.has(s.id) && sectionOk(s)) ?? rows.find(sectionOk)
      if (!lead) continue
      out.push({ lead, count: rows.length, score: sc, inPlan })
    }
    const byNumber = (a: Section, b: Section) => a.number.localeCompare(b.number, undefined, { numeric: true }) || a.title.localeCompare(b.title)
    out.sort((a, b) => {
      if (sort === 'seats') return (a.lead.limit ?? Infinity) - (b.lead.limit ?? Infinity) || byNumber(a.lead, b.lead)
      if (sort === 'relevance' && words.length) return b.score - a.score || byNumber(a.lead, b.lead)
      return byNumber(a.lead, b.lead)
    })
    return out
  }, [groups, term, mbaOnly, program, showCore, sessions, pickedTopics, quick, words, sort, planned, plannedIds])

  const toggle = <T,>(set: Set<T>, value: T, apply: (s: Set<T>) => void) => {
    const next = new Set(set)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    apply(next)
    setLimit(PAGE)
  }

  // Filters tucked behind "More filters": count them so the toggle can say how many are on.
  const hiddenCount = sessions.size + pickedTopics.size + (mbaOnly ? 0 : 1) + (showCore ? 1 : 0)
  const showMore = moreOpen
  const activeCount = sessions.size + pickedTopics.size + quick.size + (q ? 1 : 0) + (mbaOnly ? 0 : 1) + (showCore ? 1 : 0) + (term === PLANNING_TERM ? 0 : 1)
  const reset = () => {
    setQ(''); setTerm(PLANNING_TERM as TermFilter); setSessions(new Set()); setPickedTopics(new Set()); setQuick(new Set())
    setMbaOnly(true); setShowCore(false); setSort('relevance'); setLimit(PAGE)
  }

  const close = useCallback(() => setOpen(null), [])

  const add = async (id: string) => {
    setAdding(id)
    try { await addCourse(id) } finally { setAdding(null) }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Catalog</h1>
          <p>Every SOM course from the public feed. Filter the list, open a course for details, and add it to your plan.</p>
        </div>
      </div>

      <div className="card ex-filters">
        <div className="ex-search-row">
          <label className="field ex-search">
            <span className="sr-only">Search courses</span>
            <Search className="icon sm" aria-hidden="true" />
            <input
              type="search"
              placeholder="Search by number, title, professor or topic"
              value={q}
              onChange={(e) => { setQ(e.target.value); setLimit(PAGE) }}
            />
          </label>
          <label className="field ex-sort">
            <span className="sr-only">Sort by</span>
            <select value={sort} onChange={(e) => setSort(e.target.value as SortBy)}>
              <option value="relevance">Sort: best match</option>
              <option value="number">Sort: course number</option>
              <option value="seats">Sort: fewest seats</option>
            </select>
          </label>
        </div>

        <div className="ex-filter-row">
          <span className="section-label">Term</span>
          <div className="tabs" role="group" aria-label="Term">
            {TERM_TABS.map((t) => (
              <button key={t.value} type="button" className={term === t.value ? 'on' : ''} aria-pressed={term === t.value}
                onClick={() => { setTerm(t.value); setLimit(PAGE) }}>{t.label}</button>
            ))}
          </div>
        </div>

        <div className="ex-filter-row">
          <span className="section-label">Quick</span>
          <div className="row ex-chips" role="group" aria-label="Quick filters">
            {QUICK.map((f) => (
              <button key={f.value} type="button" title={f.hint} className={`chip ${quick.has(f.value) ? 'on' : ''}`} aria-pressed={quick.has(f.value)}
                onClick={() => toggle(quick, f.value, setQuick)}>{f.label}</button>
            ))}
          </div>
        </div>

        {showMore && (
          <div className="ex-more" id="ex-more">
            <div className="ex-filter-row">
              <span className="section-label">Session</span>
              <div className="row ex-chips" role="group" aria-label="Session">
                {SESSIONS.map((s) => (
                  <button key={s.value} type="button" className={`chip ${sessions.has(s.value) ? 'on' : ''}`} aria-pressed={sessions.has(s.value)}
                    onClick={() => toggle(sessions, s.value, setSessions)}>{s.label}</button>
                ))}
              </div>
            </div>

            {topics.length > 0 && (
              <div className="ex-filter-row" style={{ alignItems: 'start' }}>
                <span className="section-label" style={{ paddingTop: 4 }}>Topics</span>
                <div className="row ex-chips" role="group" aria-label="Topics">
                  {topics.map((t) => (
                    <button key={t} type="button" className={`chip ${pickedTopics.has(t) ? 'on' : ''}`} aria-pressed={pickedTopics.has(t)}
                      onClick={() => toggle(pickedTopics, t, setPickedTopics)}>{t}</button>
                  ))}
                </div>
              </div>
            )}

            <div className="ex-filter-row">
              <span className="section-label">Include</span>
              <div className="row" style={{ gap: 18 }}>
                <label className="toggle small"><input type="checkbox" checked={mbaOnly} onChange={(e) => { setMbaOnly(e.target.checked); setLimit(PAGE) }} /> Open to my program</label>
                <label className="toggle small"><input type="checkbox" checked={showCore} onChange={(e) => { setShowCore(e.target.checked); setLimit(PAGE) }} /> Core courses</label>
              </div>
            </div>
          </div>
        )}

        <div className="ex-foot">
          <button type="button" className="btn sm ghost" aria-expanded={showMore} aria-controls="ex-more"
            onClick={() => setMoreOpen(!showMore)}>
            <SlidersHorizontal className="icon sm" />
            {showMore ? 'Fewer filters' : 'More filters'}
            {hiddenCount > 0 && <span className="badge pink mono" aria-label={`${hiddenCount} active`}>{hiddenCount}</span>}
            {showMore ? <ChevronUp className="icon sm" /> : <ChevronDown className="icon sm" />}
          </button>
          {activeCount > 0 && (
            <button type="button" className="btn sm ghost" onClick={reset}><RotateCcw className="icon sm" />Reset filters</button>
          )}
        </div>
      </div>

      <div className="row between mt mb">
        <span className="muted small" aria-live="polite">
          {sections.length ? <><span className="ex-count">{results.length}</span> {results.length === 1 ? 'course matches' : 'courses match'}</> : null}
        </span>
        {quick.has('fits') && !planned.length && <span className="faint small">Your plan is empty, so everything fits.</span>}
      </div>

      {!sections.length ? (
        <div className="empty"><Spinner label="Loading the catalog…" /></div>
      ) : !results.length ? (
        <div className="card">
          <Empty icon={<Search className="icon lg" style={{ color: 'var(--faint)' }} />} title="No courses match these filters">
            <p style={{ margin: 0 }}>Try fewer filters, another term, or a shorter search.</p>
            <button type="button" className="btn primary sm" onClick={reset}>Reset all filters</button>
          </Empty>
        </div>
      ) : (
        <>
          <div className="pa-list">
            {results.slice(0, limit).map(({ lead, count, inPlan }) => (
              <CourseRow
                key={lead.key}
                c={lead}
                sectionCount={count}
                onOpen={() => setOpen(lead.key)}
                action={
                  inPlan ? (
                    <button type="button" className="btn sm ghost" onClick={() => go('plan')} title="Already in your plan. Open My plan">
                      <Check className="icon sm pa-ok" />In plan
                    </button>
                  ) : user ? (
                    <button type="button" className="btn sm" disabled={adding === lead.id}
                      onClick={() => add(lead.id)} aria-label={`Add ${lead.number} ${lead.title} to my plan`}>
                      <Plus className="icon sm" />{adding === lead.id ? 'Adding…' : 'Add'}
                    </button>
                  ) : (
                    <button type="button" className="btn sm" onClick={() => go('home')}>Sign in to add</button>
                  )
                }
              />
            ))}
          </div>
          {results.length > limit && (
            <div className="row mt-lg" style={{ justifyContent: 'center' }}>
              <button type="button" className="btn" onClick={() => setLimit((n) => n + PAGE)}>
                Show more <span className="mono faint">({results.length - limit} left)</span><ChevronDown className="icon sm" />
              </button>
            </div>
          )}
        </>
      )}

      {open && <CourseDrawer courseKey={open} onClose={close} />}
    </div>
  )
}

/** One course as a list row. Clicking anywhere opens the drawer; the action button doesn't. */
function CourseRow({ c, sectionCount, onOpen, action }: { c: Section; sectionCount: number; onOpen: () => void; action: ReactNode }) {
  const enrol = enrollLabel(c.enrollment)
  return (
    <div className="ex-row" onClick={onOpen}>
      <div className="ex-row-main">
        <span className="course-num">{c.number} · {c.session_name}</span>
        <button type="button" className="ex-row-title" onClick={(e) => { e.stopPropagation(); onOpen() }}>{c.title}</button>
        <span className="meta">
          <span><Clock className="icon sm" /><span className="mono">{c.time}</span>{sectionCount > 1 ? <span className="faint">+{sectionCount - 1} more</span> : null}</span>
          <span className="mono">{c.units} units</span>
          {c.limit ? <span><Users className="icon sm" /><span className="mono">{c.limit}</span> seats</span> : null}
          {c.faculty.length > 0 && <span className="hide-mobile">{c.faculty[0]}{c.faculty.length > 1 ? ' +' : ''}</span>}
          {c.room && <span className="hide-mobile"><MapPin className="icon sm" />{c.room}</span>}
        </span>
        {c.description && <p className="ex-desc">{c.description}</p>}
        <span className="row" style={{ gap: 6 }}>
          <span className={`badge ${enrol.tone === 'amber' ? 'amber' : 'gray'}`}>{enrol.text}</span>
          {c.ldr && <span className="badge gray" title="Leadership Distribution Requirement (inferred from SOM's feed)">Leadership</span>}
          {c.gsr && <span className="badge gray" title="Counts toward the Global Studies Requirement (inferred)">Global Studies</span>}
          {c.new && <span className="badge gray">New</span>}
        </span>
      </div>
      <div className="ex-row-actions" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="btn sm ghost hide-mobile" onClick={onOpen}>Details</button>
        {action}
      </div>
    </div>
  )
}
