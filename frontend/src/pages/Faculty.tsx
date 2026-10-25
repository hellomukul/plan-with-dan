/* Faculty: everyone teaching SOM courses this year, built from the course catalog only (lib/faculty) and reusing the
   home page's pieces: initials avatars, the faculty card (courses this year, themes that recur across their courses,
   co-teachers, official SOM profile link) and the date-based daily spotlight. Respectful by design: no ratings, no AI
   opinions, no bios or photos. Fixed-height panels, so searching or picking someone never changes the page length. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Search, X } from 'lucide-react'
import CourseDrawer from '../components/CourseDrawer'
import { Avatar, FacultyCard } from '../components/FacultyCard'
import HandsomeDan from '../mascots/HandsomeDan'
import { buildFaculty, courseCount, resolveFaculty, searchFaculty, spotlight, type Faculty as Person } from '../lib/faculty'
import { TERM_NAMES } from '../lib/format'
import { useApp } from '../state'
import '../components/course-explorer.css'
import './faculty-page.css'

type TermPick = 'all' | '202603' | '202701'

export default function Faculty() {
  const { sections, routeArg, go } = useApp()
  const people = useMemo(() => buildFaculty(sections), [sections])
  const byName = useMemo(() => new Map(people.map((f) => [f.name, f])), [people])
  const spot = useMemo(() => spotlight(people), [people])
  const themes = useMemo(() => [...new Set(people.flatMap((f) => f.topics))].sort(), [people])
  const [q, setQ] = useState('')
  const [term, setTerm] = useState<TermPick>('all')
  const [theme, setTheme] = useState('')
  const [now, setNow] = useState(false)
  const [picked, setPicked] = useState<string | null>(null)
  const [course, setCourse] = useState<string | null>(null)
  const dirRef = useRef<HTMLElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => { window.scrollTo({ top: 0 }) }, [])
  // Deep links pick that person: #/faculty/<catalog name> ("Novemsky, Nathan") or the display name ("Nathan Novemsky").
  // A name that matches no one fills the search instead, so the student sees the closest matches or a clear "no one".
  // Picking someone here updates the link without a jump.
  useEffect(() => {
    if (!routeArg || !people.length) return
    const f = resolveFaculty(people, routeArg)
    if (!f) { setQ(routeArg); setPicked(null); return }
    setPicked(f.name)
    // show their tile in the list too (scrolling only the list, never the page)
    setTimeout(() => {
      const box = listRef.current
      const tile = box?.querySelector<HTMLElement>(`[data-name="${CSS.escape(f.name)}"]`)
      if (box && tile) box.scrollTop += tile.getBoundingClientRect().top - box.getBoundingClientRect().top - 40
    }, 0)
  }, [routeArg, people])
  // Phones: list and person share one fixed-height pane; picking someone swaps in their card and brings the pane
  // into view when its top is off-screen.
  const pick = useCallback((name: string) => {
    setPicked(name)
    history.replaceState(null, '', `#/faculty/${encodeURIComponent(name)}`)
    if (window.matchMedia('(max-width: 900px)').matches) {
      setTimeout(() => {
        const top = dirRef.current?.getBoundingClientRect().top
        if (top != null && (top < 0 || top > window.innerHeight * 0.4)) dirRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
      }, 0)
    }
  }, [])
  const unpick = () => { setPicked(null); history.replaceState(null, '', '#/faculty') }

  const shown = useMemo(() => {
    const base = q.trim() ? searchFaculty(people, q, people.length) : people
    return base.filter((f) => (term === 'all' || f.terms.includes(term)) && (!theme || f.topics.includes(theme))
      && (!now || f.courses.some((c) => c.status === 'now')))
  }, [people, q, term, theme, now])
  const grouped = !q.trim()  // A–Z headings while browsing; best match first while searching
  const letters = useMemo(() => [...new Set(shown.map((f) => initialOf(f)))], [shown])
  const jump = (letter: string) => {
    const box = listRef.current
    const el = box?.querySelector<HTMLElement>(`[data-letter="${letter}"]`)
    if (el && box) box.scrollTo({ top: el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - 4, behavior: 'smooth' })
  }
  const filtered = Boolean(q || term !== 'all' || theme || now)
  const reset = () => { setQ(''); setTerm('all'); setTheme(''); setNow(false) }
  const person = picked ? byName.get(picked) : undefined
  const coTaught = useMemo(() => new Set(sections.filter((s) => new Set(s.faculty).size > 1).map((s) => s.key)).size, [sections])
  const bothTerms = people.filter((f) => f.terms.length > 1).length

  return (
    <div className="fp">
      <div className="page-head">
        <div>
          <h1>Faculty</h1>
          <p>The people teaching SOM courses in 2026–27: what they teach, who they teach with, and where to read more. Facts from the course catalog only.</p>
        </div>
      </div>

      <section className="card fp-spot" aria-labelledby="fp-spot-title">
        <div className="fp-spot-head">
          <HandsomeDan size={40} furColor="#f4b183" bandanaColor="#00356b" />
          <div style={{ minWidth: 0 }}>
            <h2 id="fp-spot-title">Today’s spotlight</h2>
            <p className="small muted">{people.length ? <>{people.length} faculty · {coTaught} co-taught courses · {bothTerms} teach in both terms. A new four every day.</> : 'Loading the course list…'}</p>
          </div>
        </div>
        <ul className="fp-spot-grid">
          {(spot.length ? spot : Array.from({ length: 4 }, () => null)).map((f, i) => (
            <li key={f?.name ?? i}>
              {f ? (
                <button type="button" className={`fp-spot-card ${picked === f.name ? 'on' : ''}`} onClick={() => pick(f.name)}>
                  <Avatar f={f} size="lg" />
                  <span className="fp-spot-name">{f.display}</span>
                  <span className="faint small fp-spot-sub">{nextLine(f)}</span>
                </button>
              ) : <span className="fp-spot-card skel" aria-hidden />}
            </li>
          ))}
        </ul>
      </section>

      <section className={`card fp-dir ${picked && byName.has(picked) ? 'has-detail' : ''}`} aria-label="Faculty directory" ref={dirRef}>
        <div className="fp-dir-list">
          <div className="fp-controls">
            <div className="cx-search">
              <Search className="icon faint" aria-hidden />
              <input value={q} onChange={(e) => { setQ(e.target.value); if (window.matchMedia('(max-width: 900px)').matches) setPicked(null) }} placeholder="Search by name, e.g. “Sudhir”" aria-label="Search faculty by name" />
              {q && <button type="button" className="btn icon ghost" aria-label="Clear search" onClick={() => setQ('')}><X className="icon sm" /></button>}
            </div>
            <div className="fp-filters" role="group" aria-label="Filters">
              <div className="tabs cx-seg" role="group" aria-label="Term">
                {([['all', 'Both terms'], ['202603', 'Fall'], ['202701', 'Spring']] as const).map(([v, l]) => (
                  <button key={v} type="button" className={term === v ? 'on' : ''} aria-pressed={term === v} onClick={() => setTerm(v)}>{l}</button>
                ))}
              </div>
              <button type="button" className={`chip ${now ? 'on' : ''}`} aria-pressed={now} onClick={() => setNow((v) => !v)}>In the classroom now</button>
              <label className="cx-topic">
                <span className="sr-only">Theme</span>
                <select value={theme} onChange={(e) => setTheme(e.target.value)} aria-label="Theme across their courses">
                  <option value="">Any theme</option>
                  {themes.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
            </div>
          </div>
          <div className="cx-count small muted" aria-live="polite">
            <span className="cx-count-text">{shown.length} {shown.length === 1 ? 'person' : 'people'}{q.trim() ? ` for “${q.trim()}”` : ''}{theme ? ` · ${theme}` : ''}</span>
            {filtered && <button type="button" className="link-btn small" onClick={reset}>Reset</button>}
          </div>
          {grouped && letters.length > 1 && (
            <nav className="fp-az" aria-label="Jump to letter">
              {letters.map((l) => <button key={l} type="button" onClick={() => jump(l)}>{l}</button>)}
            </nav>
          )}
          <div className="fp-scroll" ref={listRef}>
            {shown.length === 0 ? (
              <div className="cx-empty small muted">
                <p>{q.trim() ? `No one teaching this year is named “${q.trim()}”.` : 'No one matches these filters.'} Visiting faculty may not be in SOM’s course list yet.</p>
                <button type="button" className="btn sm" onClick={reset}>Clear search and filters</button>
              </div>
            ) : (
              <ul className="fp-grid">
                {shown.map((f, i) => {
                  const head = grouped && (i === 0 || initialOf(shown[i - 1]) !== initialOf(f))
                  return (
                    <li key={f.name} className={head ? 'fp-first' : ''}>
                      {head && <span className="fp-letter" data-letter={initialOf(f)} aria-hidden>{initialOf(f)}</span>}
                      <button type="button" className={`fp-tile ${picked === f.name ? 'on' : ''}`} aria-pressed={picked === f.name} data-name={f.name} onClick={() => pick(f.name)}>
                        <Avatar f={f} />
                        <span className="fp-tile-text">
                          <span className="fp-tile-name">{f.display}</span>
                          <span className="faint small fp-tile-sub">{courseCount(f)} · {f.terms.map((t) => (TERM_NAMES[t] ?? t).split(' ')[0]).join(' & ')}</span>
                          <span className="fp-tile-tags">
                            {f.topics.slice(0, 1).map((t) => <span key={t} className="cx-pill plain fp-tag">{t}</span>)}
                            {f.topics.length > 1 && <span className="cx-pill plain fp-tag-more" title={f.topics.slice(1).join(', ')}>+{f.topics.length - 1}</span>}
                          </span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>

        <div className="fp-dir-detail" aria-live="polite">
          {person && <button type="button" className="link-btn small cx-phone-back" onClick={unpick}><ArrowLeft className="icon sm" />Back to all faculty</button>}
          {person ? (
            <FacultyCard key={person.name} f={person} byName={byName} onOpenCourse={setCourse} onOpenPerson={pick}
              extra={<a className="small cx-fac-link" href={`#/explore/${encodeURIComponent(person.name)}`}
                onClick={(e) => { e.preventDefault(); go('explore', person.name) }}>Check their courses against your week<ArrowRight className="icon sm" /></a>} />
          ) : (
            <div className="fp-welcome">
              <HandsomeDan size={56} furColor="#f4b183" bandanaColor="#00356b" />
              <h3>Pick anyone to meet them</h3>
              <p className="muted small">You’ll see the courses they teach this year, the colleagues they teach with, and a link to their official SOM profile. Then check any course against your week in one click.</p>
              <p className="faint small">Only what SOM publishes in the course catalog: no ratings, no reviews, no guesswork.</p>
            </div>
          )}
        </div>
      </section>

      {course && <CourseDrawer courseKey={course} onClose={() => setCourse(null)} />}
    </div>
  )
}

function initialOf(f: Person): string {
  const c = f.last.normalize('NFD').replace(/[̀-ͯ]/g, '').charAt(0).toUpperCase()
  return /[A-Z]/.test(c) ? c : '#'
}

function nextLine(f: Person): string {
  const next = f.courses.find((c) => c.status !== 'done') ?? f.courses[0]
  return next ? `${next.lead.number} ${next.lead.title}` : ''
}
