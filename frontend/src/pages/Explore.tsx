/* Explore catalog: browse every real SOM offering with filters that answer real questions. */
import { useCallback, useMemo, useState } from 'react'
import type { Section } from '../api'
import CourseCard from '../components/CourseCard'
import CourseDrawer from '../components/CourseDrawer'
import { sectionsClash } from '../components/Timetable'
import { Empty, Spinner } from '../components/ui'
import { PLANNING_TERM, TOPIC_EMOJI } from '../lib/format'
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
  { value: 'ldr', label: '🧭 Counts for LDR', hint: 'Leadership Distribution Requirement (inferred)' },
  { value: 'gsr', label: '🌍 Global Studies', hint: 'Counts toward the Global Studies Requirement (inferred)' },
  { value: 'late', label: '😴 No classes before 10am', hint: 'Starts at 10:00 AM or later (or time TBA)' },
  { value: 'fri', label: '🏖️ Fridays free', hint: 'No Friday meetings' },
  { value: 'bid', label: '🎯 Bid only', hint: 'Enrollment is by bidding' },
  { value: 'fits', label: '🧩 Fits my plan', hint: 'No time clash with anything already in your plan' },
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
  const { sections, topics, plan, plannedIds, addCourse, user, go } = useApp()
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
      if (mbaOnly && !c.programs.includes('MBA')) continue
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
  }, [groups, term, mbaOnly, showCore, sessions, pickedTopics, quick, words, sort, planned, plannedIds])

  const toggle = <T,>(set: Set<T>, value: T, apply: (s: Set<T>) => void) => {
    const next = new Set(set)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    apply(next)
    setLimit(PAGE)
  }

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
          <h1>Explore the <span className="grad-text">catalog</span> 🔎</h1>
          <p>Every real SOM course, straight from the public feed. Filter it down, tap a card for the full scoop, add what you vibe with.</p>
        </div>
      </div>

      <div className="card flat ex-filters">
        <div className="ex-search-row">
          <label className="field ex-search">
            <span className="sr-only">Search courses</span>
            <input
              type="search"
              placeholder="Search by number, title, professor, topic… (try “negotiation” or “846”)"
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
          <span className="ex-label">Term</span>
          <div className="tabs" role="group" aria-label="Term">
            {TERM_TABS.map((t) => (
              <button key={t.value} type="button" className={term === t.value ? 'on' : ''} aria-pressed={term === t.value}
                onClick={() => { setTerm(t.value); setLimit(PAGE) }}>{t.label}</button>
            ))}
          </div>
        </div>

        <div className="ex-filter-row">
          <span className="ex-label">Session</span>
          <div className="row ex-chips" role="group" aria-label="Session">
            {SESSIONS.map((s) => (
              <button key={s.value} type="button" className={`chip ${sessions.has(s.value) ? 'on' : ''}`} aria-pressed={sessions.has(s.value)}
                onClick={() => toggle(sessions, s.value, setSessions)}>{s.label}</button>
            ))}
          </div>
        </div>

        <div className="ex-filter-row">
          <span className="ex-label">Quick</span>
          <div className="row ex-chips" role="group" aria-label="Quick filters">
            {QUICK.map((f) => (
              <button key={f.value} type="button" title={f.hint} className={`chip ${quick.has(f.value) ? 'on' : ''}`} aria-pressed={quick.has(f.value)}
                onClick={() => toggle(quick, f.value, setQuick)}>{f.label}</button>
            ))}
          </div>
        </div>

        {topics.length > 0 && (
          <div className="ex-filter-row">
            <span className="ex-label">Topics</span>
            <div className="row ex-chips" role="group" aria-label="Topics">
              {topics.map((t) => (
                <button key={t} type="button" className={`chip ${pickedTopics.has(t) ? 'on' : ''}`} aria-pressed={pickedTopics.has(t)}
                  onClick={() => toggle(pickedTopics, t, setPickedTopics)}>{TOPIC_EMOJI[t] ?? '•'} {t}</button>
              ))}
            </div>
          </div>
        )}

        <div className="row between ex-foot">
          <div className="row" style={{ gap: 18 }}>
            <label className="toggle"><input type="checkbox" checked={mbaOnly} onChange={(e) => { setMbaOnly(e.target.checked); setLimit(PAGE) }} /> MBA courses only</label>
            <label className="toggle"><input type="checkbox" checked={showCore} onChange={(e) => { setShowCore(e.target.checked); setLimit(PAGE) }} /> Show core courses</label>
          </div>
          {activeCount > 0 && <button type="button" className="link-btn small" onClick={reset}>Reset filters ↺</button>}
        </div>
      </div>

      <div className="row between mt mb">
        <span className="muted" aria-live="polite">
          {sections.length ? <><b className="ex-count">{results.length}</b> {results.length === 1 ? 'course' : 'courses'} match</> : null}
        </span>
        {quick.has('fits') && !planned.length && <span className="badge gray">Your plan is empty, so everything fits ✨</span>}
      </div>

      {!sections.length ? (
        <div className="empty"><Spinner label="Loading the catalog…" /></div>
      ) : !results.length ? (
        <Empty icon="🫠" title="No courses match — loosen a filter">
          <p style={{ margin: 0 }}>Try fewer chips, another term, or a shorter search.</p>
          <button type="button" className="btn primary sm" onClick={reset}>Reset all filters</button>
        </Empty>
      ) : (
        <>
          <div className="grid auto">
            {results.slice(0, limit).map(({ lead, count, inPlan }) => (
              <CourseCard
                key={lead.key}
                course={lead}
                sectionCount={count}
                onOpen={() => setOpen(lead.key)}
                footer={
                  <div className="row between">
                    <button type="button" className="btn sm ghost" onClick={() => setOpen(lead.key)}>Details</button>
                    {inPlan ? (
                      <button type="button" className="btn sm lime" onClick={() => go('plan')} title="Already in your plan. Open My plan">✓ In plan</button>
                    ) : user ? (
                      <button type="button" className="btn sm primary" disabled={adding === lead.id}
                        onClick={() => add(lead.id)} aria-label={`Add ${lead.number} ${lead.title} to my plan`}>
                        {adding === lead.id ? 'Adding…' : '+ Add'}
                      </button>
                    ) : (
                      <button type="button" className="btn sm" onClick={() => go('home')}>Sign in to add</button>
                    )}
                  </div>
                }
              />
            ))}
          </div>
          {results.length > limit && (
            <div className="row mt-lg" style={{ justifyContent: 'center' }}>
              <button type="button" className="btn" onClick={() => setLimit((n) => n + PAGE)}>
                Show more ({results.length - limit} left) 👇
              </button>
            </div>
          )}
        </>
      )}

      {open && <CourseDrawer courseKey={open} onClose={close} />}
    </div>
  )
}
