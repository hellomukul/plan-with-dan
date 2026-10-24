import { useMemo, useState } from 'react'
import type { Course } from '../api'
import { programsOf, requirementsOf, termOf } from '../facets'
import type { Selection } from '../facets'
import {
  CORE_COURSES_FULL_YEAR,
  CURRICULUM_SOURCE,
  ELECTIVES_SOURCE,
  GRADE_BANDS,
  GRADING_SOURCE,
  GSR_OPTIONS,
  GSR_SOURCE,
  LDR,
  LDR_SOURCE,
  MBA_REQUIREMENTS,
  REQUIREMENTS_SOURCE,
  YEAR_AWARE_PROGRAMMES,
  YEAR_MAP,
} from '../requirements'

interface Group {
  key: string
  course: Course
  sections: Course[]
}

interface Props {
  groups: Group[]
  programmes: string[]
  initialProgramme?: string
  initialRequirement?: string
  initialYear?: string
  onJump: (sel: Partial<Selection>) => void
  /** Pin the grid to an explicit set of course keys. */
  onShowCourses: (keys: string[], label: string) => void
}

const TERM_ORDER = [
  'Fall 1',
  'Fall 2',
  'Fall (full term)',
  'Spring 1',
  'Spring 2',
  'Spring (full term)',
]

/**
 * "I'm an MBA first-year planning Fall 2" in three dropdowns, plus the degree
 * requirements transcribed from Yale's bulletin with links back to the source.
 */
export function TermPlanner({
  groups,
  programmes,
  initialProgramme,
  initialRequirement,
  initialYear,
  onJump,
  onShowCourses,
}: Props) {
  const [programme, setProgramme] = useState(initialProgramme ?? 'MBA')
  // Requirement is its own control now. Choosing a year suggests a value but
  // never locks it — "year 1 + full term" was silently forced to zero before.
  const [requirement, setRequirement] = useState<string>(initialRequirement ?? 'Any')
  const [year, setYear] = useState(initialYear ?? 'any')
  const [term, setTerm] = useState('Fall 2')

  const yearAware = YEAR_AWARE_PROGRAMMES.includes(programme)

  // How many courses the current selection would show.
  const matching = useMemo(
    () =>
      groups.filter((g) => {
        if (!programsOf(g.course).includes(programme)) return false
        if (term !== 'Any' && !termOf(g.course).includes(term)) return false
        if (requirement !== 'Any' && !requirementsOf(g.course).includes(requirement)) {
          return false
        }
        return true
      }),
    [groups, programme, term, requirement],
  )
  const matchCount = matching.length

  /** When a combination is empty, say which part of it is responsible. */
  const emptyReason = useMemo(() => {
    if (matchCount > 0) return null
    const byProgramme = groups.filter((g) => programsOf(g.course).includes(programme))
    if (byProgramme.length === 0) return `No ${programme} courses in this catalog.`
    const withReq =
      requirement === 'Any'
        ? byProgramme
        : byProgramme.filter((g) => requirementsOf(g.course).includes(requirement))
    if (withReq.length === 0) {
      return `${programme} has no ${requirement.toLowerCase()} courses in this catalog.`
    }
    const terms = [...new Set(withReq.flatMap((g) => termOf(g.course)))]
    return `${programme} ${requirement === 'Any' ? 'courses' : requirement.toLowerCase() + ' courses'} run in ${terms.join(' and ')} — none in ${term}.`
  }, [matchCount, groups, programme, requirement, term])

  // How many MBA core courses this catalog holds at all, and per half-term.
  const coreThisCatalog = useMemo(() => {
    const all = groups.filter(
      (g) =>
        programsOf(g.course).includes('MBA') &&
        requirementsOf(g.course).includes('Core'),
    )
    const byTerm = new Map<string, number>()
    for (const g of all) {
      const [t] = termOf(g.course)
      if (t) byTerm.set(t, (byTerm.get(t) ?? 0) + 1)
    }
    return { total: all.length, byTerm }
  }, [groups])

  const termsInData = useMemo(() => {
    const present = new Set(groups.flatMap((g) => termOf(g.course)))
    return TERM_ORDER.filter((t) => present.has(t))
  }, [groups])

  /** Courses in this catalog that satisfy a GSR option, matched on title. */
  const gsrMatches = (o: (typeof GSR_OPTIONS)[number]): string[] => {
    if (o.notACourse) return []
    return groups
      .filter((g) => {
        const title = g.course['Course Title'].trim().toLowerCase()
        if (o.titleStartsWith) return title.startsWith(o.titleStartsWith.toLowerCase())
        if (o.titleIncludes) return title.includes(o.titleIncludes.toLowerCase())
        return false
      })
      .map((g) => g.key)
  }

  const apply = () =>
    onJump({
      program: [programme],
      ...(term !== 'Any' ? { term: [term] } : {}),
      ...(requirement !== 'Any' ? { requirement: [requirement] } : {}),
    })

  return (
    <section className="planner">
      <div className="planner__panel planner__panel--page">
          <div className="planner__pick">
            <label>
              <span>I&apos;m in</span>
              <select value={programme} onChange={(e) => setProgramme(e.target.value)}>
                {programmes.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>

            {/* Independent: first years take core *and*, from Session 2,
                electives — so these are two different questions. */}
            <label>
              <span>Year</span>
              <select
                value={year}
                onChange={(e) => setYear(e.target.value)}
                disabled={!yearAware}
                title={yearAware ? undefined : 'Yale documents years for the MBA only'}
              >
                <option value="any">Any year</option>
                <option value="1">First year</option>
                <option value="2">Second year</option>
              </select>
            </label>

            <label>
              <span>Course type</span>
              <select
                value={requirement}
                onChange={(e) => setRequirement(e.target.value)}
              >
                <option value="Any">Core and electives</option>
                <option value="Core">Core only</option>
                <option value="Elective">Electives only</option>
              </select>
            </label>

            <label>
              <span>Term</span>
              <select value={term} onChange={(e) => setTerm(e.target.value)}>
                <option value="Any">Any term</option>
                {termsInData.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              className="planner__go"
              onClick={apply}
              disabled={matchCount === 0}
            >
              Show {matchCount} {matchCount === 1 ? 'course' : 'courses'}
            </button>
          </div>

          {emptyReason && <p className="planner__empty">{emptyReason}</p>}

          <p className="planner__blurb">
            {yearAware ? (
              <>
                {year === '1' && YEAR_MAP['1'].blurb}
                {year === '2' && YEAR_MAP['2'].blurb}
                {year === 'any' &&
                  'Year and course type are separate questions: first years take the core and, from Session 2, electives too.'}
                {requirement === 'Core' && (
                  <>
                    {' '}
                    <span className="planner__reconcile">
                      {coreThisCatalog.total >= CORE_COURSES_FULL_YEAR
                        ? `All ${CORE_COURSES_FULL_YEAR} are here: `
                        : `${coreThisCatalog.total} of the ${CORE_COURSES_FULL_YEAR} appear in this catalog: `}
                      {[...coreThisCatalog.byTerm.entries()]
                        .map(([t, n]) => `${n} in ${t}`)
                        .join(', ')}
                      .
                    </span>
                  </>
                )}
              </>
            ) : (
              <>
                Yale documents the year-by-year structure for the full-time MBA.
                For {programme}, pick a term and browse — the catalog has no year
                field, so a year filter here would be invented.
              </>
            )}
          </p>

          <div className="planner__reqs">
            <h4>MBA degree requirements</h4>
            <dl>
              {MBA_REQUIREMENTS.map((r) => (
                <div key={r.label}>
                  <dt>{r.label}</dt>
                  <dd>
                    <strong>{r.value}</strong>
                    {r.note ? <span>{r.note}</span> : null}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="gsr">
              <h4>Leadership Distribution Requirement</h4>
              <p className="planner__dist">{LDR.summary}</p>
              <p className="planner__dist planner__dist--muted">{LDR.detail}</p>
              <p className="planner__dist planner__dist--muted">
                Examples Yale names: {LDR.examples.join(', ')}.{' '}
                <a href={LDR_SOURCE} target="_blank" rel="noreferrer">
                  Leadership &amp; Teams ↗
                </a>
              </p>
            </div>

            <div className="gsr">
              <h4>
                Global Studies Requirement — any <em>one</em> of these
              </h4>
              <ul>
                {GSR_OPTIONS.map((o) => {
                  const matches = gsrMatches(o)
                  return (
                    <li key={o.name}>
                      <div>
                        <strong>{o.name}</strong>
                        <span>{o.detail}</span>
                      </div>
                      {o.notACourse ? (
                        <span className="gsr__none">Applied for, not enrolled</span>
                      ) : matches.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => onShowCourses(matches, o.name)}
                        >
                          Show {matches.length}
                        </button>
                      ) : (
                        <span className="gsr__none">None this term</span>
                      )}
                    </li>
                  )
                })}
              </ul>
              <p className="planner__links">
                Source:{' '}
                <a href={GSR_SOURCE} target="_blank" rel="noreferrer">
                  Global Studies Requirement ↗
                </a>
              </p>
            </div>

            <div className="gsr">
              <h4>How you are graded</h4>
              <table className="gradetable">
                <thead>
                  <tr>
                    <th>Grade</th>
                    <th>Share of the class</th>
                    <th>On transcript</th>
                  </tr>
                </thead>
                <tbody>
                  {GRADE_BANDS.map((g) => (
                    <tr key={g.grade}>
                      <td>{g.grade}</td>
                      <td>{g.share}</td>
                      <td>{g.transcript ? 'Yes' : 'No'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="planner__links">
                A forced distribution: only High Honors and Honors are reported.{' '}
                <a href={GRADING_SOURCE} target="_blank" rel="noreferrer">
                  Grading policies ↗
                </a>
              </p>
              <p className="planner__dist planner__dist--muted">
                Course bidding rules live behind SOM&apos;s student portal and are
                not published, so they are not reproduced here — check with the
                registrar.
              </p>
            </div>
            <p className="planner__links">
              Source:{' '}
              <a href={REQUIREMENTS_SOURCE} target="_blank" rel="noreferrer">
                Yale Catalog — M.B.A. Degree Requirements ↗
              </a>{' '}
              ·{' '}
              <a href={CURRICULUM_SOURCE} target="_blank" rel="noreferrer">
                Integrated Curriculum ↗
              </a>{' '}
              ·{' '}
              <a href={ELECTIVES_SOURCE} target="_blank" rel="noreferrer">
                Year 2 Electives ↗
              </a>
              . Confirm with your advisor before you register.
            </p>
          </div>
      </div>
    </section>
  )
}
