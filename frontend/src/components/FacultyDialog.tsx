import { useEffect, useRef } from 'react'
import { directorySearch, linkedinSearch } from '../faculty'
import type { Faculty } from '../faculty'
import { sessionLabel } from '../facets'

interface Props {
  faculty: Faculty
  onClose: () => void
  /** Open one of their courses. */
  onOpenCourse: (key: string) => void
}

/**
 * Answers "what else does this person teach?" where the question is asked —
 * from any instructor name on a card or in a course dialog.
 */
export function FacultyDialog({ faculty, onClose, onOpenCourse }: Props) {
  const ref = useRef<HTMLDivElement>(null)

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
        className="cdlg fdlg"
        role="dialog"
        aria-modal="true"
        aria-label={faculty.name}
        tabIndex={-1}
        ref={ref}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="cdlg__head">
          <span
            className="fdlg__avatar"
            aria-hidden="true"
            style={{
              background: `linear-gradient(140deg, hsl(${faculty.hue} 55% 46%), hsl(${(faculty.hue + 28) % 360} 58% 34%))`,
            }}
          >
            {faculty.initials}
          </span>
          <div>
            <p className="cdlg__number">Instructor</p>
            <h2>{faculty.name}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <div className="cdlg__body">
          <div className="cdlg__tags">
            <span className="cdlg__tag">
              {faculty.courses.length}{' '}
              {faculty.courses.length === 1 ? 'course' : 'courses'}
            </span>
            <span className="cdlg__tag">
              {faculty.sections}{' '}
              {faculty.sections === 1 ? 'section' : 'sections'}
            </span>
            {faculty.semesters.map((s) => (
              <span key={s} className="cdlg__tag">
                {s}
              </span>
            ))}
            {faculty.topics.map((s) => (
              <span key={s} className="cdlg__tag">
                {s}
              </span>
            ))}
          </div>

          <div className="fdlg__links">
            {faculty.profile ? (
              <a href={faculty.profile} target="_blank" rel="noreferrer">
                Yale SOM profile ↗
              </a>
            ) : (
              <a href={directorySearch(faculty.raw)} target="_blank" rel="noreferrer">
                Find in the SOM directory ↗
              </a>
            )}
            <a href={linkedinSearch(faculty.raw)} target="_blank" rel="noreferrer">
              Search LinkedIn ↗
            </a>
            {faculty.email && (
              <a href={`mailto:${faculty.email}`}>{faculty.email}</a>
            )}
          </div>

          <h3>Teaching this year</h3>
          <table className="cdlg__sections fdlg__courses">
            <thead>
              <tr>
                <th>Course</th>
                <th>Title</th>
                <th>Term</th>
                <th>Units</th>
              </tr>
            </thead>
            <tbody>
              {faculty.courses.map((g) => (
                <tr key={g.key}>
                  <td>{g.course['Course Number']}</td>
                  <td>
                    <button type="button" onClick={() => onOpenCourse(g.key)}>
                      {g.course['Course Title'].trim()}
                    </button>
                  </td>
                  <td>{sessionLabel(g.course['Course Session'])}</td>
                  <td>{g.course.Units}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {faculty.bio && (
            <>
              <h3>About</h3>
              <p className="cdlg__text">{faculty.bio}</p>
            </>
          )}

          {!faculty.profile && (
            <p className="fdlg__note">
              Yale did not publish a directory slug for this instructor in our
              data, so the link above searches the directory rather than
              pointing straight at a profile — a guessed URL is wrong about a
              third of the time.
            </p>
          )}
        </div>

        <footer className="cdlg__foot">
          <span>
            {faculty.courses.length} course
            {faculty.courses.length === 1 ? '' : 's'} in this catalog
          </span>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </footer>
      </div>
    </div>
  )
}
