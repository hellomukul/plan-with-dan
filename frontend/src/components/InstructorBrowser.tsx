import { useMemo, useState } from 'react'
import type { Faculty } from '../faculty'

interface Props {
  faculty: Faculty[]
  onOpen: (raw: string) => void
  /** Show a set of instructors' combined courses in the catalog. */
  onShowCourses: (keys: string[], label: string) => void
}

type Sort = 'name' | 'courses'

/**
 * Browsing 177 people needs more than a name box: filter by what they teach
 * and when, then tick several and see their courses together — which is how
 * you actually shop for a term ("what do Biasi and Zimmerman have?").
 */
export function InstructorBrowser({ faculty, onOpen, onShowCourses }: Props) {
  const [query, setQuery] = useState('')
  const [subjects, setSubjects] = useState<string[]>([])
  const [semester, setSemester] = useState<string>('Any')
  const [sort, setSort] = useState<Sort>('name')
  const [selected, setSelected] = useState<string[]>([])

  // Topics, not the catalog's subject field: 53% of rows have a programme
  // there instead of a subject, which is why the AI teacher never showed
  // under AI.
  const allSubjects = useMemo(() => {
    const counts = new Map<string, number>()
    for (const f of faculty) {
      for (const s of f.topics) counts.set(s, (counts.get(s) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }, [faculty])

  const allSemesters = useMemo(
    () => [...new Set(faculty.flatMap((f) => f.semesters))].sort(),
    [faculty],
  )

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = faculty.filter((f) => {
      if (subjects.length > 0 && !f.topics.some((s) => subjects.includes(s))) {
        return false
      }
      if (semester !== 'Any' && !f.semesters.includes(semester)) return false
      if (!q) return true
      return (
        f.name.toLowerCase().includes(q) ||
        f.subjects.some((s) => s.toLowerCase().includes(q)) ||
        f.topics.some((s) => s.toLowerCase().includes(q)) ||
        f.courses.some(
          (g) =>
            g.course['Course Title'].toLowerCase().includes(q) ||
            g.course['Course Number'].toLowerCase().includes(q),
        )
      )
    })
    return sort === 'courses'
      ? [...list].sort((a, b) => b.courses.length - a.courses.length)
      : list
  }, [faculty, query, subjects, semester, sort])

  const toggleSubject = (s: string) =>
    setSubjects((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    )

  const toggleSelected = (raw: string) =>
    setSelected((prev) =>
      prev.includes(raw) ? prev.filter((x) => x !== raw) : [...prev, raw],
    )

  const selectedCourses = useMemo(() => {
    const keys = new Set<string>()
    for (const f of faculty) {
      if (!selected.includes(f.raw)) continue
      for (const g of f.courses) keys.add(g.key)
    }
    return [...keys]
  }, [faculty, selected])

  return (
    <div className="ib">
      <div className="ib__controls">
        <input
          className="ib__search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Name, subject or course…"
          aria-label="Search instructors"
        />

        <select
          value={semester}
          onChange={(e) => setSemester(e.target.value)}
          aria-label="Teaching in"
        >
          <option value="Any">Any semester</option>
          {allSemesters.map((s) => (
            <option key={s} value={s}>
              Teaching in {s}
            </option>
          ))}
        </select>

        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          aria-label="Sort by"
        >
          <option value="name">A–Z</option>
          <option value="courses">Most courses first</option>
        </select>
      </div>

      <p className="ib__topicnote">
        Topics are read from course titles and descriptions, so a core course
        counts too — the catalog&apos;s own subject field is blank for more than
        half the rows.
      </p>

      <div className="ib__subjects">
        {allSubjects.map(([s, n]) => (
          <button
            key={s}
            type="button"
            className={subjects.includes(s) ? 'is-on' : ''}
            onClick={() => toggleSubject(s)}
            aria-pressed={subjects.includes(s)}
          >
            {s} <b>{n}</b>
          </button>
        ))}
        {subjects.length > 0 && (
          <button type="button" className="ib__clear" onClick={() => setSubjects([])}>
            clear topics
          </button>
        )}
      </div>

      <p className="count">
        {shown.length} {shown.length === 1 ? 'instructor' : 'instructors'}
        {selected.length > 0 && (
          <span className="count__term">{selected.length} selected</span>
        )}
      </p>

      <div className="facgrid">
        {shown.map((f) => {
          const on = selected.includes(f.raw)
          return (
            <div key={f.raw} className={`faccard${on ? ' is-selected' : ''}`}>
              <button
                type="button"
                className="faccard__tick"
                aria-label={`${on ? 'Deselect' : 'Select'} ${f.name}`}
                aria-pressed={on}
                onClick={() => toggleSelected(f.raw)}
              >
                {on ? '✓' : ''}
              </button>

              <button
                type="button"
                className="faccard__main"
                onClick={() => onOpen(f.raw)}
              >
                <span
                  className="faccard__avatar"
                  aria-hidden="true"
                  style={{
                    background: `linear-gradient(140deg, hsl(${f.hue} 48% 32%), hsl(${(f.hue + 28) % 360} 52% 22%))`,
                  }}
                >
                  {f.initials}
                </span>

                <span className="faccard__body">
                  <strong>{f.name}</strong>

                  <span className="faccard__meta">
                    {f.courses.length}{' '}
                    {f.courses.length === 1 ? 'course' : 'courses'} ·{' '}
                    {f.sections} {f.sections === 1 ? 'section' : 'sections'} ·{' '}
                    {f.semesters
                      .map((t) => t.replace(' 20', " '"))
                      .join(', ')}
                  </span>

                  {f.topics.length > 0 && (
                    <span className="faccard__topics">
                      {f.topics.slice(0, 3).map((t) => (
                        <i key={t}>{t}</i>
                      ))}
                      {f.topics.length > 3 && <i>+{f.topics.length - 3}</i>}
                    </span>
                  )}

                  <span className="faccard__courses">
                    {f.courses
                      .slice(0, 3)
                      .map((g) => g.course['Course Number'])
                      .join(' · ')}
                    {f.courses.length > 3 && ' …'}
                  </span>
                </span>
              </button>
            </div>
          )
        })}
      </div>

      {selected.length > 0 && (
        <div className="ib__bar">
          <span>
            <strong>{selected.length}</strong> instructor
            {selected.length === 1 ? '' : 's'} · {selectedCourses.length} course
            {selectedCourses.length === 1 ? '' : 's'}
          </span>
          <button
            type="button"
            onClick={() =>
              onShowCourses(
                selectedCourses,
                selected.length === 1
                  ? (faculty.find((f) => f.raw === selected[0])?.name ?? 'Instructor')
                  : `${selected.length} instructors`,
              )
            }
          >
            Show their courses
          </button>
          <button type="button" className="ib__barclear" onClick={() => setSelected([])}>
            Clear
          </button>
        </div>
      )}
    </div>
  )
}
