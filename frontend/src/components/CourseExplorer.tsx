/* Course Explorer: its own feature, below the student's week.
   Layout is a fixed-height master/detail panel so the page never jumps while you search, select or add:
   - left: search + filters + results (scrolls inside the panel)
   - right: the selected course, decision first (can I take it? does each section fit my week?), then details;
     or a professor's card (lib/faculty, FacultyCard) when you pick or search for one; or the daily faculty spotlight.
   Search is the shared engine (lib/courseSearch); eligibility reasons come from lib/eligibility.
   Two variants: 'home' (the public home page, below the week builder) and 'page' (the signed-in Course explorer
   page), which adds a few more filters in a popover, an optional slot in the list (Elihu's box), and links to the
   Faculty page. Props stay backward compatible: WeekBuilder passes only who / week / autoIds / onAdd. */
import { Fragment, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { AlertCircle, AlertTriangle, ArrowLeft, ArrowLeftRight, CalendarClock, Check, ChevronDown, ExternalLink, Plus, Search, SlidersHorizontal, X } from 'lucide-react'
import type { Section } from '../api'
import { NEXT_YEAR, prettyDate, termName } from '../lib/format'
import { isTrip, scoreOffering } from '../lib/courseSearch'
import { blockedLabel, courseVerdict, nextYearSection, verdict as sectionVerdict, type Verdict, type Who } from '../lib/eligibility'
import { buildFaculty, courseCount, displayName, resolveFaculty, searchFaculty, spotlight, type Faculty } from '../lib/faculty'
import { sectionsClash } from './Timetable'
import StarButton from './StarButton'
import { Avatar, FacultyCard, FacultySpotlight } from './FacultyCard'
import FacultyPicker from './FacultyPicker'
import QuarterPill from './QuarterPill'
import NextYearAction from './NextYearAction'
import { useApp } from '../state'
import './course-explorer.css'
import TaughtWith from './TaughtWith'

type TermPick = 'all' | '202701' | '202603'
type Extra = 'ldr' | 'gsr' | 'late' | 'fri' | 'bid' | 'cross'
/** Quarters: SOM terms have two (Fall-1 + Fall-2, Spring-1 + Spring-2). A quarter chip shows the half-term courses that
    run in exactly that quarter; full-term courses (which run through both quarters) have their own chip, so every
    course sits in one bucket and "Fall-1" never means "Fall-1, plus 40 courses that also run in Fall-2". */
type QuarterPick = 'all' | 'fall-1' | 'fall-2' | 'spring-1' | 'spring-2' | 'full'
const QUARTERS: { value: QuarterPick; label: string; title: string }[] = [
  { value: 'all', label: 'All quarters', title: 'Every quarter, and full-term courses' },
  { value: 'fall-1', label: 'Fall-1', title: 'Half-term courses in the first fall quarter (Fall 2026)' },
  { value: 'fall-2', label: 'Fall-2', title: 'Half-term courses in the second fall quarter (Fall 2026)' },
  { value: 'spring-1', label: 'Spring-1', title: 'Half-term courses in the first spring quarter (Spring 2027)' },
  { value: 'spring-2', label: 'Spring-2', title: 'Half-term courses in the second spring quarter (Spring 2027)' },
  { value: 'full', label: 'Full term', title: 'Courses that run through both quarters of their term' },
]
/** The published term a quarter belongs to ('full' fits either). */
const quarterTerm = (q: QuarterPick): TermPick => (q.startsWith('fall') ? '202603' : q.startsWith('spring') ? '202701' : 'all')
/** First-years and admits in a two-year program still have 2027-28 to plan (same rule as the backend's planning_terms). */
const secondYearAhead = (w: Who) => ['MBA', 'MBA-JOINT', 'EMBA'].includes(w.program) && ['1', '', 'admit'].includes(w.year)
const inQuarter = (s: Section, q: QuarterPick) => q === 'all' || (q === 'full' ? s.session === 'fall' || s.session === 'spring' : s.session === q)
const PAGE = 60

const EXTRAS: { value: Extra; label: string; hint: string }[] = [
  { value: 'ldr', label: 'Counts for Leadership', hint: 'Leadership Distribution Requirement (inferred from SOM’s feed)' },
  { value: 'gsr', label: 'Global Studies', hint: 'Counts toward the Global Studies Requirement (inferred)' },
  { value: 'cross', label: 'Taught with another Yale school', hint: 'Cross-listed with Law, Jackson, Environment, Yale College and more' },
  { value: 'late', label: 'Starts 10am or later', hint: 'A section that starts at 10:00 AM or later (or time TBA)' },
  { value: 'fri', label: 'Fridays free', hint: 'A section with no Friday meetings' },
  { value: 'bid', label: 'Through the auction', hint: 'Enrollment is through the course auction (you bid points)' },
]

interface Props {
  who: Who
  week: Section[] // everything on the student's grid, both terms
  autoIds: string[] // core / required sections (labelled as such in clash messages)
  /** May return a promise: the Add buttons stay disabled until it settles, so a double-click adds once. */
  onAdd: (s: Section) => void | Promise<unknown>
  /** A section that's in session with add/drop closed can still be added as enrolled ("I'm taking it").
      Only offered when this is passed (the signed-in page). */
  onEnroll?: (s: Section) => void | Promise<unknown>
  /** 'page' = the signed-in Course explorer page (more filters, list slot, faculty-page links). Default 'home'. */
  variant?: 'home' | 'page'
  /** Start filtered to this professor (catalog name), e.g. from the Faculty page. */
  initialFaculty?: string
  /** Rendered between the 2nd and 3rd course in the list (page variant), e.g. "Stuck between two electives?". */
  listSlot?: (ctx: { selectedKey: string | null }) => ReactNode
  /** Link to a person's Faculty page (page variant). */
  facultyHref?: (name: string) => string
}

interface Row { key: string; secs: Section[]; lead: Section; score: number; open: Section[]; reason: string; tag?: Verdict['tag']; fits: Section | null; inWeek: boolean; inWeekClash: boolean }

export default function CourseExplorer({ who, week: weekIn, autoIds, onAdd, onEnroll, variant = 'home', initialFaculty, listSlot, facultyHref }: Props) {
  const { sections, topics, user, plan } = useApp()
  const page = variant === 'page'
  // Courses planned for 2027-28 are expected (no times) and never part of this year's week or its clash checks.
  const week = useMemo(() => weekIn.filter((s) => !s.projected), [weekIn])
  // Course number -> "Fall 2027" for the student's expected 2027-28 courses (a pill in the list).
  const nextYear = useMemo(() => new Map((plan?.items ?? []).filter((i) => i.expected && i.target_term)
    .map((i) => [i.section.number, termName(i.target_term!)])), [plan])
  const [q, setQ] = useState('')
  const [term, setTerm] = useState<TermPick>('all')
  const [quarter, setQuarter] = useState<QuarterPick>('all')
  const [onlyOpen, setOnlyOpen] = useState(true)
  const [onlyFits, setOnlyFits] = useState(false)
  const [topic, setTopic] = useState('')
  const [extras, setExtras] = useState<Set<Extra>>(new Set())
  const [moreOpen, setMoreOpen] = useState(false)
  const [moreRight, setMoreRight] = useState(false)  // open the popover leftwards when it would spill past the card
  const [selected, setSelected] = useState<string | null>(null)
  const [active, setActive] = useState(-1)  // keyboard/hover row; none until the student moves (no row looks picked by default)
  const [limit, setLimit] = useState(PAGE)
  const [facFilter, setFacFilter] = useState('')  // catalog name of the professor the list is filtered to
  const [prof, setProf] = useState<string | null>(null)  // the professor shown on the right (or the one you came from)
  const bodyRef = useRef<HTMLDivElement>(null)
  const moreRef = useRef<HTMLDivElement>(null)

  const faculty = useMemo(() => buildFaculty(sections), [sections])
  const byName = useMemo(() => new Map(faculty.map((f) => [f.name, f])), [faculty])
  const facMatches = useMemo(() => (q.trim().length >= 2 ? searchFaculty(faculty, q, 4) : []), [faculty, q])
  const spot = useMemo(() => spotlight(faculty), [faculty])

  // Arriving from the Faculty page ("see their courses"): filter to that person once the catalog is loaded.
  useEffect(() => {
    const f = initialFaculty ? resolveFaculty(faculty, initialFaculty) : null  // catalog or display name
    if (f) { setFacFilter(f.name); setProf(f.name); setSelected(null) }
  }, [initialFaculty, faculty])

  // The "More filters" popover floats over the panel (so opening it never moves the page); close on outside click.
  useEffect(() => {
    if (!moreOpen) return
    const away = (e: MouseEvent) => { if (!moreRef.current?.contains(e.target as Node)) setMoreOpen(false) }
    const esc = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') setMoreOpen(false) }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc) }
  }, [moreOpen])

  const weekKeys = useMemo(() => new Set(week.map((s) => s.key)), [week])
  const weekIds = useMemo(() => new Set(week.map((s) => s.id)), [week])
  const clashesFor = (x: Section) => week.filter((p) => p.term === x.term && p.key !== x.key && sectionsClash(p, x))

  const offerings = useMemo(() => {
    const m = new Map<string, Section[]>()
    for (const s of sections) {
      const list = m.get(s.key)
      if (list) list.push(s); else m.set(s.key, [s])
    }
    return m
  }, [sections])

  const { rows, hiddenNotOpen } = useMemo(() => {
    const searching = q.trim().length >= 2
    const out: Row[] = []
    let hidden = 0
    const timeOk = (s: Section) => (!extras.has('late') || s.start_min == null || s.start_min >= 600) && (!extras.has('fri') || !s.days.includes('F'))
    for (const [key, every] of offerings) {
      // A quarter pick narrows an offering to its sections in that quarter (a rare course runs one section per quarter).
      const all = quarter === 'all' ? every : every.filter((s) => inQuarter(s, quarter))
      if (!all.length) continue
      const lead = all[0]
      if (term !== 'all' && lead.term !== term) continue
      if (topic && !lead.topics.includes(topic)) continue
      if (facFilter && !all.some((s) => s.faculty.includes(facFilter))) continue
      if (extras.has('ldr') && !lead.ldr) continue
      if (extras.has('gsr') && !lead.gsr) continue
      if (extras.has('cross') && !lead.taught_with?.length) continue
      if (extras.has('bid') && lead.enrollment.trim().toLowerCase() !== 'bid') continue
      const secs = extras.has('late') || extras.has('fri') ? all.filter(timeOk) : all  // only the sections that pass
      if (!secs.length) continue
      const { score } = scoreOffering(all, searching ? q : '')
      if (!score) continue
      const v = courseVerdict(secs, who)
      // Not open to you: counted, so the student can choose to see them. A search for this exact course number
      // ("MGT 405", "mgt410") always shows it, with the reason, so a course never seems not to exist.
      if (onlyOpen && !v.open.length && score < 100) { hidden += 1; continue }
      const fits = v.open.find((x) => !week.some((p) => p.term === x.term && p.key !== x.key && sectionsClash(p, x))) ?? null
      if (onlyFits && !fits) continue
      out.push({ key, secs: all, lead, score: score + (v.open.length ? 5 : 0) + (fits ? 3 : 0) + (lead.term === '202701' ? 1 : 0),
        open: v.open, reason: v.verdict.ok ? '' : v.verdict.reason, tag: v.verdict.tag, fits, inWeek: weekKeys.has(key),
        inWeekClash: all.some((x) => weekIds.has(x.id) && week.some((p) => p.term === x.term && p.key !== x.key && sectionsClash(p, x))) })
    }
    const byNum = (a: Row, b: Row) => a.lead.number.localeCompare(b.lead.number, undefined, { numeric: true }) || a.lead.title.localeCompare(b.lead.title)
    out.sort(searching ? (a, b) => b.score - a.score || byNum(a, b)
      : (a, b) => Number(Boolean(b.fits)) - Number(Boolean(a.fits)) || Number(isTrip(a.lead)) - Number(isTrip(b.lead)) || byNum(a, b))
    return { rows: out, hiddenNotOpen: searching || facFilter || quarter !== 'all' ? hidden : 0 }
  }, [offerings, q, term, quarter, topic, facFilter, extras, onlyOpen, onlyFits, who, week, weekKeys, weekIds])

  const sel = rows.find((r) => r.key === selected)
  const selSecs = selected ? offerings.get(selected) : undefined
  const profObj = prof ? byName.get(prof) : undefined
  // Typing a professor's name shows them on the right straight away, until you pick something else.
  const autoProf = !selSecs && !profObj ? facMatches[0] : undefined
  // On phones the list and the detail share one fixed-height pane: picking something swaps the list for the detail
  // (with "Back to results"), and the pane scrolls into view if its top is off-screen, so a tap always shows a result.
  const phone = () => window.matchMedia('(max-width: 900px)').matches
  const reveal = () => {
    if (!phone()) return
    setTimeout(() => {
      const top = bodyRef.current?.getBoundingClientRect().top
      if (top != null && (top < 0 || top > window.innerHeight * 0.4)) bodyRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    }, 0)
  }
  const backToResults = () => { setSelected(null); setProf(null) }
  const pick = (key: string) => { setSelected(key); setProf(null); reveal() }
  const pickProf = (name: string) => { setProf(name); setSelected(null); reveal() }
  const openFromCard = (from: Faculty) => (key: string) => { setProf(from.name); setSelected(key); reveal() }
  // One keyboard list: matching faculty first, then courses.
  const items: ({ kind: 'fac'; f: Faculty } | { kind: 'course'; r: Row })[] = [
    ...facMatches.map((f) => ({ kind: 'fac' as const, f })), ...rows.slice(0, limit).map((r) => ({ kind: 'course' as const, r }))]
  const onKey = (e: KeyboardEvent) => {
    const it = items[active]
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter' && (it ?? items[0])) {  // Enter with nothing highlighted opens the best match
      e.preventDefault(); const x = it ?? items[0]; if (x.kind === 'fac') pickProf(x.f.name); else pick(x.r.key)
    }
    else if (e.key === 'Escape') setQ('')
  }
  const chooseFaculty = (name: string) => { setFacFilter(name); setActive(-1); setLimit(PAGE); pickProf(name) }
  const clearFaculty = () => { if (prof === facFilter) setProf(null); setFacFilter('') }
  const toggleExtra = (x: Extra) => {
    setExtras((cur) => { const next = new Set(cur); if (next.has(x)) next.delete(x); else next.add(x); return next })
    setActive(-1); setLimit(PAGE)
  }
  // Term and quarter compose: picking Fall-1 while Spring 2027 is on switches the term to Fall 2026 (and back).
  const pickTerm = (t: TermPick) => { setTerm(t); if (t !== 'all' && quarterTerm(quarter) !== 'all' && quarterTerm(quarter) !== t) setQuarter('all'); setActive(-1); setLimit(PAGE) }
  const pickQuarter = (x: QuarterPick) => { setQuarter(x); const t = quarterTerm(x); if (term !== 'all' && t !== 'all' && t !== term) setTerm(t); setActive(-1); setLimit(PAGE) }
  const resetFilters = () => { setTerm('all'); setQuarter('all'); setOnlyOpen(true); setOnlyFits(false); setTopic(''); setQ(''); setExtras(new Set()); clearFaculty() }
  const facChosen = facFilter ? byName.get(facFilter) : undefined
  const quarterName = quarter === 'all' || quarter === 'full' ? '' : QUARTERS.find((x) => x.value === quarter)!.label
  const slot = page && listSlot ? listSlot({ selectedKey: selected }) : null
  const slotAt = Math.min(2, rows.length)  // between the 2nd and 3rd course: "stuck between two electives?"

  return (
    <section className={`cx card ${page ? 'page' : ''} ${selSecs || profObj ? 'has-detail' : ''}`} aria-labelledby={page ? undefined : 'cx-title'} aria-label={page ? 'Course explorer' : undefined}>
      {!page && (
        <header className="cx-head">
          <div>
            <h3 id="cx-title">Course explorer</h3>
            <p className="muted small">Every SOM course this year, and the faculty who teach them. Search by name, number or professor, check whether it’s open to you and fits your week, then add it.</p>
          </div>
        </header>
      )}

      <div className="cx-controls">
        <div className="cx-search">
          <Search className="icon faint" aria-hidden />
          <input value={q} onChange={(e) => { setQ(e.target.value); setActive(-1); setLimit(PAGE); if (phone()) backToResults() }} onKeyDown={onKey}
            placeholder="Try “private equity”, “MGT 846” or a professor’s name" aria-label="Search SOM courses and faculty" />
          {q && <button type="button" className="btn icon ghost" aria-label="Clear search" onClick={() => setQ('')}><X className="icon sm" /></button>}
        </div>
        <div className="cx-filters" role="group" aria-label="Filters">
          <div className="tabs cx-seg" role="group" aria-label="Term">
            {([['all', 'Both terms'], ['202701', 'Spring 2027'], ['202603', 'Fall 2026']] as const).map(([v, l]) => (
              <button key={v} type="button" className={term === v ? 'on' : ''} aria-pressed={term === v} onClick={() => pickTerm(v)}>{l}</button>
            ))}
          </div>
          <div className="tabs cx-seg cx-qseg" role="group" aria-label="Quarter">
            {QUARTERS.map((x) => (
              <button key={x.value} type="button" title={x.title} className={quarter === x.value ? 'on' : ''} aria-pressed={quarter === x.value}
                onClick={() => pickQuarter(x.value)}>{x.label}</button>
            ))}
          </div>
          <button type="button" className={`chip ${onlyOpen ? 'on' : ''}`} aria-pressed={onlyOpen} onClick={() => setOnlyOpen((v) => !v)}>Open to me</button>
          <button type="button" className={`chip ${onlyFits ? 'on' : ''}`} aria-pressed={onlyFits} onClick={() => setOnlyFits((v) => !v)}>Fits my week</button>
          <label className="cx-topic">
            <SlidersHorizontal className="icon sm faint" aria-hidden />
            <select value={topic} onChange={(e) => setTopic(e.target.value)} aria-label="Topic">
              <option value="">Any topic</option>
              {topics.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <FacultyPicker faculty={faculty} value={facFilter} onChange={(name) => (name ? chooseFaculty(name) : clearFaculty())} />
          {page && (
            <div className="cx-more-wrap" ref={moreRef}>
              <button type="button" className={`chip cx-more-btn ${extras.size ? 'on' : ''}`} aria-expanded={moreOpen} aria-controls="cx-more-pop"
                onClick={(e) => {
                  const card = e.currentTarget.closest('.cx')?.getBoundingClientRect()
                  setMoreRight(Boolean(card && e.currentTarget.getBoundingClientRect().left + 344 > card.right - 8))
                  setMoreOpen((v) => !v)
                }}>
                <SlidersHorizontal className="icon sm" aria-hidden />More filters
                <span className="cx-more-n mono" aria-label={extras.size ? `${extras.size} on` : undefined}>{extras.size || ''}</span>
                <ChevronDown className="icon sm" aria-hidden />
              </button>
              {moreOpen && (
                <div id="cx-more-pop" className={`cx-more-pop ${moreRight ? 'right' : ''}`} role="group" aria-label="More filters">
                  <div className="section-label"><span>Requirements, timing and school</span></div>
                  <div className="cx-more-chips">
                    {EXTRAS.map((x) => (
                      <button key={x.value} type="button" title={x.hint} className={`chip ${extras.has(x.value) ? 'on' : ''}`} aria-pressed={extras.has(x.value)}
                        onClick={() => toggleExtra(x.value)}>{extras.has(x.value) && <Check className="icon xs" />}{x.label}</button>
                    ))}
                  </div>
                  <div className="cx-more-foot">
                    <button type="button" className="link-btn small" disabled={!extras.size} onClick={() => setExtras(new Set())}>Clear these</button>
                    <button type="button" className="btn sm" onClick={() => setMoreOpen(false)}>Done</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="cx-body" ref={bodyRef}>
        <div className="cx-results">
          <div className="cx-count small muted" aria-live="polite">
            <span className="cx-count-text">
              {rows.length} course{rows.length === 1 ? '' : 's'}
              {facMatches.length > 0 && ` · ${facMatches.length} faculty`}
              {q.trim().length >= 2 ? ` for “${q.trim()}”` : ''}
              {facChosen && ` taught by ${facChosen.display}`}
            </span>
            {(term !== 'all' || quarter !== 'all' || !onlyOpen || onlyFits || topic || q || facFilter || extras.size > 0) && <button type="button" className="link-btn small" onClick={resetFilters}>Reset</button>}
          </div>
          {hiddenNotOpen > 0 && (
            <div className="cx-hidden small">
              {hiddenNotOpen} more match{hiddenNotOpen === 1 ? 'es' : ''} but {hiddenNotOpen === 1 ? 'isn’t' : 'aren’t'} open to you.
              <button type="button" className="link-btn small" onClick={() => setOnlyOpen(false)}>Show {hiddenNotOpen === 1 ? 'it' : 'them'} with the reason</button>
            </div>
          )}
          {items.length === 0 ? (
            <div className="cx-empty small muted">
              <p>{hiddenNotOpen > 0 ? `Nothing open to you matches${q ? ` “${q.trim()}”` : ''}${quarterName ? ` in ${quarterName}` : ''}.` : `No course matches${q ? ` “${q.trim()}”` : ''} with these filters.`}</p>
              <button type="button" className="btn sm" onClick={resetFilters}>Clear search and filters</button>
            </div>
          ) : (
            <ul className="cx-list" role="listbox" aria-label="Faculty and courses">
              {facMatches.length > 0 && <li className="cx-group" role="presentation">Faculty</li>}
              {facMatches.map((f, i) => {
                const on = !selSecs && (profObj ?? autoProf)?.name === f.name
                return (
                  <li key={`fac:${f.name}`}>
                    <button type="button" role="option" aria-selected={on}
                      className={`cx-fac-row ${on ? 'selected' : ''} ${i === active ? 'active' : ''}`}
                      onMouseEnter={() => setActive(i)} onClick={() => pickProf(f.name)}>
                      <Avatar f={f} />
                      <span className="cx-fac-row-text">
                        <span className="cx-row-title">{f.display}</span>
                        <span className="cx-row-meta faint small">
                          {courseCount(f)} this year · {f.numbers.join(', ')}
                        </span>
                      </span>
                      <span className="cx-pill in">Faculty</span>
                    </button>
                  </li>
                )
              })}
              {facMatches.length > 0 && <li className="cx-group" role="presentation">Courses</li>}
              {facMatches.length > 0 && rows.length === 0 && (
                <li role="presentation">
                  <div className="cx-empty small muted">
                    <p>{hiddenNotOpen > 0 ? `Nothing open to you matches “${q.trim()}”.` : `No course matches “${q.trim()}” with these filters.`}</p>
                    <button type="button" className="btn sm" onClick={resetFilters}>Clear search and filters</button>
                  </div>
                </li>
              )}
              {rows.slice(0, limit).map((r, idx) => {
                const i = idx + facMatches.length
                return (
                <Fragment key={r.key}>
                {slot && idx === slotAt && <li role="presentation" className="cx-slot">{slot}</li>}
                <li>
                  <button type="button" role="option" aria-selected={selected === r.key}
                    className={`${selected === r.key ? 'selected' : ''} ${i === active ? 'active' : ''}`}
                    onMouseEnter={() => setActive(i)} onClick={() => pick(r.key)}>
                    <span className="cx-row-top">
                      <span className="course-num">{r.lead.number}</span>
                      <span className="cx-row-title">{r.lead.title}</span>
                    </span>
                    <span className="cx-row-meta faint small">{(r.fits ?? r.lead).time || 'Time TBA'} · {r.lead.faculty[0] ? displayName(r.lead.faculty[0]) : 'Faculty TBA'}</span>
                    <span className="cx-row-pills">
                      <QuarterPill session={r.lead.session} term={r.lead.term} year />
                      {r.inWeek && r.inWeekClash ? <span className="cx-pill warn"><AlertTriangle className="icon xs" />In your week · clashes</span>
                        : r.inWeek ? <span className="cx-pill in"><Check className="icon xs" />In your week</span>
                        : !r.open.length && r.secs.some((x) => autoIds.includes(x.id)) ? <span className="cx-pill in">Your core</span>
                        : !r.open.length ? <span className="cx-pill no">{r.tag === 'closed' ? 'Add/drop closed' : r.tag === 'ended' ? 'Ended' : 'Not for you'}</span>
                          : isTrip(r.lead) ? <span className="cx-pill plain" title="A Global Studies experience: you apply on its timeline (see Requirements)">By application</span>
                          : r.lead.start_min == null ? <span className="cx-pill plain">Time TBA</span>
                          : r.fits ? <span className="cx-pill ok">Fits your week</span> : <span className="cx-pill warn">Clashes</span>}
                      <span className="cx-pill plain">{r.lead.units} {r.lead.units === 1 ? "unit" : "units"}</span>
                      <TaughtWith schools={r.lead.taught_with} calendar={r.lead.partner_calendar} className="cx-pill" />
                      {nextYear.has(r.lead.number) && <span className="cx-pill in" title={`Planned for ${nextYear.get(r.lead.number)} (expected, times TBA)`}><CalendarClock className="icon xs" />{nextYear.get(r.lead.number)}</span>}
                    </span>
                  </button>
                </li>
                </Fragment>
                )
              })}
              {slot && rows.length > 0 && slotAt === rows.slice(0, limit).length && <li role="presentation" className="cx-slot">{slot}</li>}
              {rows.length > limit && (
                <li><button type="button" className="cx-more" onClick={() => setLimit((n) => n + PAGE)}>Show {Math.min(PAGE, rows.length - limit)} more</button></li>
              )}
            </ul>
          )}
        </div>

        <div className="cx-detail" aria-live="polite">
          {(selSecs || profObj) && (
            <button type="button" className="link-btn small cx-phone-back" onClick={backToResults}><ArrowLeft className="icon sm" />Back to results</button>
          )}
          {selSecs ? (
            <Detail key={selSecs[0].key} secs={selSecs} row={sel} who={who} autoIds={autoIds} clashesFor={clashesFor} onAdd={onAdd} onEnroll={onEnroll} inWeek={weekKeys.has(selSecs[0].key)} weekIds={weekIds}
              nextYear={page ? 'action' : user ? 'none' : 'hint'}
              back={profObj ? { label: profObj.display, onClick: () => setSelected(null) } : undefined} onPerson={pickProf} />
          ) : profObj ? (
            <FacultyCard key={profObj.name} f={profObj} byName={byName} onOpenCourse={openFromCard(profObj)} onOpenPerson={pickProf}
              pageHref={facultyHref?.(profObj.name)} />
          ) : autoProf ? (
            <FacultyCard key={autoProf.name} f={autoProf} byName={byName} label={`Faculty match for “${q.trim()}”`} onOpenCourse={openFromCard(autoProf)} onOpenPerson={pickProf}
              pageHref={facultyHref?.(autoProf.name)} />
          ) : (
            <FacultySpotlight people={spot} total={faculty.length} onOpenPerson={pickProf} />
          )}
        </div>
      </div>
    </section>
  )
}

function Detail({ secs, row, who, autoIds, clashesFor, onAdd, onEnroll, inWeek, weekIds, back, onPerson, nextYear }: {
  secs: Section[]; row: Row | null | undefined; who: Who; autoIds: string[]; clashesFor: (x: Section) => Section[]
  onAdd: (s: Section) => void | Promise<unknown>; onEnroll?: (s: Section) => void | Promise<unknown>; inWeek: boolean; weekIds: Set<string>
  back?: { label: string; onClick: () => void }; onPerson: (name: string) => void
  /** 2027-28: 'action' = "Plan for Fall 2027" (signed-in page), 'hint' = a one-line sign-up hint (visitors), 'none'. */
  nextYear: 'action' | 'hint' | 'none'
}) {
  const lead = secs[0]
  const { verdict, open, enrollable } = courseVerdict(secs, who)
  // One add at a time: buttons disable while the request is in flight and repeat clicks are ignored (QA H2).
  const [busyId, setBusyId] = useState<string | null>(null)
  const lock = useRef(false)
  const run = async (s: Section, fn: (s: Section) => void | Promise<unknown>) => {
    if (lock.current) return
    lock.current = true
    setBusyId(s.id)
    try { await fn(s) } finally { lock.current = false; setBusyId(null) }
  }
  const busy = busyId !== null
  const canEnroll = Boolean(onEnroll) && !inWeek && enrollable.length > 0
  const faculty = [...new Set(secs.flatMap((s) => s.faculty))]
  const label = (p: Section) => `${p.number}${autoIds.includes(p.id) ? ' (your core)' : ''}`
  const fits = row?.fits ?? open.find((x) => !clashesFor(x).length) ?? null
  // The section already in the student's week, and whether it clashes (the verdict must say so, not a green tick).
  const mine = secs.find((s) => weekIds.has(s.id))
  const mineClash = mine ? clashesFor(mine) : []
  const better = mine && mineClash.length ? open.find((x) => x.id !== mine.id && !clashesFor(x).length) : undefined
  return (
    <article className="cx-card">
      {back && <button type="button" className="link-btn small cx-back" onClick={back.onClick}><ArrowLeft className="icon sm" />Back to {back.label}</button>}
      <div className="cx-card-head">
        <div style={{ minWidth: 0 }}>
          <div className="cx-card-kicker"><span className="course-num">{lead.number}</span><QuarterPill session={lead.session} term={lead.term} year /></div>
          <h4>{lead.title}</h4>
          <div className="cx-meta small muted">
            <span>{lead.units} {lead.units === 1 ? "unit" : "units"}</span>
            <span className="cx-people">{faculty.length ? faculty.map((n, i) => (
              <Fragment key={n}>{i ? ', ' : ''}<button type="button" className="link-btn" title={`Meet ${displayName(n)}`} onClick={() => onPerson(n)}>{displayName(n)}</button></Fragment>
            )) : 'Faculty TBA'}</span>
            {lead.limit ? <span>{lead.limit} seats</span> : null}
            {lead.enrollment && <span>{lead.enrollment[0].toUpperCase() + lead.enrollment.slice(1)}</span>}
          </div>
        </div>
        <StarButton courseKey={lead.key} title={lead.number} label />
      </div>

      {!verdict.ok && verdict.canEnroll && inWeek ? (
        <div className="cx-verdict ok"><Check className="icon sm" /><span>In your week. It’s in session and add/drop has closed, so a section change goes through Academic Affairs.</span></div>
      ) : !verdict.ok ? (
        <div className="cx-verdict no" role="alert"><AlertCircle className="icon sm" />
          <span>{verdict.reason}{verdict.note && (!verdict.canEnroll || canEnroll) ? ` ${verdict.note}` : ''}</span>
          {canEnroll && enrollable.length === 1 && (
            <button type="button" className="btn sm" disabled={busy} aria-busy={busyId === enrollable[0].id}
              onClick={() => void run(enrollable[0], onEnroll!)}><Check className="icon sm" />{busyId === enrollable[0].id ? 'Adding…' : 'I’m taking it'}</button>
          )}</div>
      ) : inWeek && mine && mineClash.length ? (
        <div className="cx-verdict warn"><AlertTriangle className="icon sm" /><span>In your week, but §{mine.section} clashes with {mineClash.map(label).join(', ')}.{' '}
          {better ? `Section ${better.section} fits: switch to it below.` : 'SOM removes one of two overlapping courses after add/drop, so drop one or ask Academic Affairs.'}</span></div>
      ) : inWeek ? (
        <div className="cx-verdict ok"><Check className="icon sm" /><span>In your week. Switch sections below if another time suits you better.</span></div>
      ) : fits ? (
        <div className="cx-verdict ok"><Check className="icon sm" /><span>Open to you, and section {fits.section} fits your week.{verdict.note ? ` ${verdict.note}` : ''}</span>
          <button type="button" className="btn primary sm" disabled={busy} aria-busy={busyId === fits.id} onClick={() => void run(fits, onAdd)}>
            <Plus className="icon sm" />{busyId === fits.id ? 'Adding…' : 'Add to my week'}</button></div>
      ) : (
        <div className="cx-verdict warn"><AlertTriangle className="icon sm" /><span>Open to you, but every section clashes with your week. Pick one below to add it anyway; the clash shows on your grid.</span></div>
      )}

      {nextYear === 'action' && <NextYearAction secs={secs} program={who.program} />}
      {nextYear === 'hint' && NEXT_YEAR[lead.term] && secondYearAhead(who) && nextYearSection(secs, who) && (
        <p className="cx-nx-hint faint small">Thinking about 2027–28?{' '}
          <button type="button" className="link-btn small" onClick={() => window.dispatchEvent(new CustomEvent('pwd:signup', { detail: 'Plan your second year' }))}>
            Plan your second year with a free account</button></p>
      )}

      <div className="cx-sections">
        <div className="section-label"><span>Sections</span></div>
        <ul>
          {secs.map((s) => {
            const ok = open.includes(s)
            const enrol = canEnroll && enrollable.includes(s)
            const blockers = ok || s === mine ? clashesFor(s) : []
            const clashText = blockers.length ? `Clashes with ${blockers.map(label).join(', ')}` : ''
            return (
              <li key={s.id} className={s === mine ? 'mine' : ''}>
                <span className="cx-sec-main">
                  <span className="cx-sec-line"><span className="mono">§{s.section}</span> <QuarterPill session={s.session} term={s.term} /> <span className="cx-sec-time">{s.time || 'Time TBA'}</span>{s.room ? <span className="faint cx-sec-room">{s.room}</span> : null}</span>
                  <span className="faint small cx-sec-sub">
                    {s === mine ? clashText || 'Your section'
                      : autoIds.includes(s.id) ? 'Your core section, assigned by SOM'
                      : !ok ? blockedLabel(sectionVerdict(s, who)) : clashText || 'Fits your week'}
                    {s.ends ? ` · ends ${prettyDate(s.ends)}` : ''}
                  </span>
                </span>
                {s === mine ? <span className="cx-pill in cx-sec-in"><Check className="icon xs" />In your week</span>
                  : autoIds.includes(s.id) ? <span className="cx-pill in cx-sec-in"><Check className="icon xs" />Your core</span>
                  : ok && <button type="button" className={`btn sm ${blockers.length ? 'ghost' : ''}`} disabled={busy} aria-busy={busyId === s.id}
                  onClick={() => void run(s, onAdd)}>
                  {mine ? <ArrowLeftRight className="icon sm" /> : <Plus className="icon sm" />}
                  {busyId === s.id ? (mine ? 'Switching…' : 'Adding…') : mine ? (blockers.length ? 'Switch anyway' : 'Switch') : blockers.length ? 'Add anyway' : 'Add'}</button>}
                {enrol && s !== mine && <button type="button" className="btn sm ghost" disabled={busy} aria-busy={busyId === s.id}
                  title="Add it as enrolled: it's in session and add/drop has closed" onClick={() => void run(s, onEnroll!)}>
                  <Check className="icon sm" />{busyId === s.id ? 'Adding…' : 'I’m taking it'}</button>}
              </li>
            )
          })}
        </ul>
      </div>

      {lead.description && <div><div className="section-label"><span>What it covers</span></div><p className="small muted cx-p">{lead.description}</p></div>}
      {lead.bio && <details className="cx-bio"><summary className="small">About the faculty</summary><p className="small muted cx-p">{lead.bio}</p></details>}
      {lead.syllabus && <a className="small" href={lead.syllabus} target="_blank" rel="noreferrer">Syllabus<ExternalLink className="icon sm" /></a>}
    </article>
  )
}
