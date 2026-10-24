import { useMemo, useState } from 'react'
import {
  instructorOverlap,
  rateMyWeek,
  subjectDepth,
} from '../planInsights'
import type { Group } from '../planInsights'

interface Props {
  chosen: Group[]
  all: Group[]
  sectionChoice: Record<string, string>
  semesters: string[]
  onOpenCourse: (key: string) => void
}

/** What the shortlist says about your week, beyond whether it clashes. */
export function PlanInsights({
  chosen,
  all,
  sectionChoice,
  semesters,
  onOpenCourse,
}: Props) {
  const [semester, setSemester] = useState(semesters[0] ?? '')
  const [openSubject, setOpenSubject] = useState<string | null>(null)

  const week = useMemo(
    () => rateMyWeek(chosen, sectionChoice, semester),
    [chosen, sectionChoice, semester],
  )
  const overlap = useMemo(() => instructorOverlap(chosen), [chosen])
  const depth = useMemo(() => subjectDepth(chosen, all), [chosen, all])

  if (chosen.length === 0) return null

  return (
    <div className="insights">
      <header className="insights__head">
        <h3>Your week</h3>
        {semesters.length > 1 && (
          <select
            value={semester}
            onChange={(e) => setSemester(e.target.value)}
            aria-label="Semester to analyse"
          >
            {semesters.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        )}
      </header>

      {week.length === 0 ? (
        <p className="insights__none">
          Nothing in {semester} has a published meeting time yet.
        </p>
      ) : (
        <ul className="insights__list">
          {week.map((i) => (
            <li key={i.headline} className={`insights__item is-${i.kind}`}>
              <strong>{i.headline}</strong>
              <span>{i.detail}</span>
            </li>
          ))}
        </ul>
      )}

      {overlap.length > 0 && (
        <>
          <h3>Same instructor</h3>
          <ul className="insights__list">
            {overlap.map((i) => (
              <li key={i.headline} className="insights__item is-info">
                <strong>{i.headline}</strong>
                <span>{i.detail}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {depth.length > 0 && (
        <>
          <h3>How deep you are</h3>
          <ul className="depth">
            {depth.map((d) => (
              <li key={d.subject}>
                <button
                  type="button"
                  className="depth__row"
                  onClick={() =>
                    setOpenSubject(openSubject === d.subject ? null : d.subject)
                  }
                  aria-expanded={openSubject === d.subject}
                >
                  <span className="depth__name">{d.subject}</span>
                  <span className="depth__bar" aria-hidden="true">
                    <i style={{ width: `${(d.taken / d.available) * 100}%` }} />
                  </span>
                  <span className="depth__count">
                    {d.taken} of {d.available}
                  </span>
                </button>

                {openSubject === d.subject && (
                  <ul className="depth__more">
                    {d.remaining.length === 0 ? (
                      <li className="depth__empty">
                        You have taken everything in {d.subject}.
                      </li>
                    ) : (
                      d.remaining.slice(0, 12).map((g) => (
                        <li key={g.key}>
                          <button
                            type="button"
                            onClick={() => onOpenCourse(g.key)}
                          >
                            <b>{g.course['Course Number']}</b>{' '}
                            {g.course['Course Title'].trim()}
                          </button>
                        </li>
                      ))
                    )}
                    {d.remaining.length > 12 && (
                      <li className="depth__empty">
                        …and {d.remaining.length - 12} more.
                      </li>
                    )}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
