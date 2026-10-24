import { useEffect, useRef } from 'react'
import type { Course } from '../api'
import {
  cleanBio,
  dansFor,
  enrollmentNote,
  requirementsOf,
  sessionLabel,
  subjectsOf,
} from '../facets'
import { COHORT_DOT, cohortForSection, hasCohortMap } from '../cohorts'
import { COHORT_SOURCE } from '../requirements'
import { DAYS, parseMeeting, sectionsShareSlot } from '../schedule'
import HandsomeDan from './HandsomeDan'

interface Props {
  course: Course
  sections: Course[]
  faculty: string[]
  onClose: () => void
  onOpenFaculty?: (raw: string) => void
}

/**
 * Full course detail. Descriptions run to several hundred words and bios
 * longer still, so they live here rather than stretching one card in the grid
 * and leaving a ragged hole beside it.
 */
export function CourseDialog({ course, sections, faculty, onClose, onOpenFaculty }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const dans = dansFor(course)
  const bio = cleanBio(course.faculty_bio)
  const [subject] = subjectsOf(course)
  const enrol = enrollmentNote(course)
  const syllabus = course.Syllabus || course['Old Syllabus']

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    ref.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  return (
    <div className="cdlg__backdrop" onClick={onClose}>
      <div
        className="cdlg"
        role="dialog"
        aria-modal="true"
        aria-label={course['Course Title']}
        tabIndex={-1}
        ref={ref}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="cdlg__head">
          <div className="cdlg__dans" aria-hidden="true">
            {dans.map((d) => (
              <HandsomeDan key={d.kind} furColor={d.color} size={44} />
            ))}
          </div>
          <div>
            <p className="cdlg__number">
              {course['Course Number']}
              {sections.length > 1 ? ` · ${sections.length} sections` : ''}
            </p>
            <h2>{course['Course Title']}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <div className="cdlg__body">
          <div className="cdlg__tags">
            {dans.map((d) => (
              <span key={d.kind} className="cdlg__tag" style={{ borderColor: d.color, color: d.color }}>
                {d.label}
              </span>
            ))}
            {subject && <span className="cdlg__tag">{subject}</span>}
            <span className="cdlg__tag">{sessionLabel(course['Course Session'])}</span>
            <span className="cdlg__tag">{course.Units} units</span>
            {enrol && <span className="cdlg__tag cdlg__tag--warn">{enrol}</span>}
          </div>

          {faculty.length > 0 && (
            <p className="cdlg__faculty">
              Taught by{' '}
              {faculty.map((name, i) => (
                <span key={name}>
                  {i > 0 && ' and '}
                  {onOpenFaculty ? (
                    <button
                      type="button"
                      className="cdlg__faclink"
                      onClick={() => onOpenFaculty(name)}
                    >
                      {name}
                    </button>
                  ) : (
                    <strong>{name}</strong>
                  )}
                </span>
              ))}
            </p>
          )}

          <h3>Sections</h3>
          <table className="cdlg__sections">
            <thead>
              <tr>
                <th>Section</th>
                {hasCohortMap(course['Course Number']) && <th>Cohort</th>}
                <th>Days</th>
                <th>Time</th>
                <th>Room</th>
                <th>Instructor</th>
              </tr>
            </thead>
            <tbody>
              {sections.map((s) => {
                const meet = parseMeeting(s.Daytimes)
                const cohort = cohortForSection(course['Course Number'], s.Section)
                return (
                  <tr key={s['Course ID'] + s.Section}>
                    <td>{s.Section?.trim() || '—'}</td>
                    {hasCohortMap(course['Course Number']) && (
                      <td>
                        {cohort ? (
                          <span className="cohortpip">
                            <i style={{ background: COHORT_DOT[cohort] }} />
                            {cohort}
                          </span>
                        ) : (
                          <span className="cdlg__tba">—</span>
                        )}
                      </td>
                    )}
                    <td>
                      {meet ? (
                        <span className="daypips" aria-label={meet.days.join(', ')}>
                          {DAYS.map((d) => (
                            <i key={d} className={meet.days.includes(d) ? 'on' : ''}>
                              {d}
                            </i>
                          ))}
                        </span>
                      ) : (
                        <span className="cdlg__tba">TBA</span>
                      )}
                    </td>
                    <td>{meet ? meet.label : '—'}</td>
                    <td>{s.Room?.trim() || 'TBA'}</td>
                    <td>{s['Faculty 1']?.trim() || 'TBA'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {sections.length > 1 && sectionsShareSlot(sections) && (
            <p className="cdlg__hint">
              Every section meets at the same time — this one runs as a block,
              so the section you attend follows your cohort rather than your
              timetable.
            </p>
          )}

          {sections.length > 1 && requirementsOf(course).includes('Core') && (
            <p className="cdlg__hint">
              {hasCohortMap(course['Course Number']) ? (
                <>
                  Your cohort fixes your section. The pairing differs per course
                  — Silver sits in 01 for Accounting but 04 for Statistics —
                  so check each one.{' '}
                </>
              ) : (
                <>
                  You take the core with your cohort, assigned in your first
                  week.{' '}
                </>
              )}
              <a href={COHORT_SOURCE} target="_blank" rel="noreferrer">
                About cohorts ↗
              </a>
            </p>
          )}

          {course['Course Description'].trim() && (
            <>
              <h3>Description</h3>
              <p className="cdlg__text">{course['Course Description'].trim()}</p>
            </>
          )}

          {bio && (
            <>
              <h3>About the instructor</h3>
              <p className="cdlg__text">{bio}</p>
            </>
          )}
        </div>

        <footer className="cdlg__foot">
          {syllabus ? (
            <a href={syllabus} target="_blank" rel="noreferrer">
              Open syllabus ↗
            </a>
          ) : (
            <span>No syllabus posted</span>
          )}
          <button type="button" onClick={onClose}>
            Close
          </button>
        </footer>
      </div>
    </div>
  )
}
