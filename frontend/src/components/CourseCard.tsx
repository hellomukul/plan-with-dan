import { useState } from 'react'
import type { Course } from '../api'
import {
  PROGRAM_COLORS,
  sessionLabel,
  REQUIREMENT_COLORS,
  dansFor,
  enrollmentNote,
  subjectColor,
  subjectsOf,
} from '../facets'
import { CourseDialog } from './CourseDialog'
import HandsomeDan from './HandsomeDan'

const CATEGORY_HUES: Record<string, string> = {
  Core: 'core',
  EMBA: 'emba',
  PhD: 'phd',
  Finance: 'finance',
  Economics: 'economics',
  Marketing: 'marketing',
  Accounting: 'accounting',
}

function initials(name: string): string {
  const [last = '', first = ''] = name.split(',').map((s) => s.trim())
  return `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase() || '?'
}

function displayName(name: string): string {
  const [last, first] = name.split(',').map((s) => s.trim())
  return first ? `${first} ${last}` : name
}

/** "T  Th 8:30 AM-9:50 AM" — collapse the stray double spaces, tidy the dash. */
function meetingLabel(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().replace(/\s*-\s*/, '–')
}

interface Props {
  course: Course
  /** Every section row for this course, including `course` itself. */
  sections?: Course[]
  picked?: boolean
  onTogglePick?: () => void
  onOpenFaculty?: (raw: string) => void
}

export default function CourseCard({
  course,
  sections = [],
  picked = false,
  onTogglePick,
  onOpenFaculty,
}: Props) {
  const [detail, setDetail] = useState(false)
  const category = course['Course Category']
  const hue = CATEGORY_HUES[category] ?? 'default'
  const [programDan, requirementDan] = dansFor(course)
  const [subject] = subjectsOf(course)
  const chipColor = subjectColor(course)
  const enrol = enrollmentNote(course)
  const multi = sections.length > 1
  const rows = sections.length ? sections : [course]

  const faculty = [
    ...new Set(rows.map((s) => s['Faculty 1']?.trim()).filter(Boolean)),
  ]

  const description = course['Course Description'].trim()
  const preview =
    description.length > 140 ? `${description.slice(0, 140).trimEnd()}…` : description

  return (
    <>
      <article className={`card card--${hue}`}>
        <div className="card__headrow">
          <div className="card__headtext">
            <header className="card__top">
              <span className="card__number">{course['Course Number']}</span>
              {subject ? (
                <span
                  className="chip"
                  style={chipColor ? { color: chipColor, borderColor: chipColor } : undefined}
                >
                  {subject}
                </span>
              ) : null}
            </header>

            <h3 className="card__title">{course['Course Title']}</h3>
          </div>

          <span className="card__dans">
            <span className="card__danwrap card__danwrap--programme" title={programDan.title}>
              <HandsomeDan furColor={programDan.color} size={56} className="card__dan" />
            </span>
            <span
              className="card__danwrap card__danwrap--requirement"
              title={requirementDan.title}
            >
              <HandsomeDan furColor={requirementDan.color} size={44} className="card__dan" />
            </span>
          </span>
        </div>

        {/* The two Labubu facts, spelled out, plus term and credit weight. */}
        <div className="card__tags">
          <span
            className="tag tag--program"
            style={{ '--tag': PROGRAM_COLORS[programDan.label] ?? '#00356b' } as React.CSSProperties}
          >
            {programDan.label}
          </span>
          <span
            className="tag tag--req"
            style={{ '--tag': REQUIREMENT_COLORS[requirementDan.label] ?? '#0f766e' } as React.CSSProperties}
          >
            {requirementDan.label}
          </span>
          <span className="tag">{sessionLabel(course['Course Session'])}</span>
          <span className="tag">{course.Units} units</span>
          {multi ? <span className="tag">{sections.length} sections</span> : null}
        </div>

        {faculty.length > 0 ? (
          <div className="card__faculty">
            {faculty.slice(0, 2).map((name) =>
              onOpenFaculty ? (
                <button
                  key={name}
                  type="button"
                  className="card__person card__person--link"
                  onClick={() => onOpenFaculty(name)}
                  title={`What else does ${displayName(name)} teach?`}
                >
                  <span className="avatar" aria-hidden>
                    {initials(name)}
                  </span>
                  <span>{displayName(name)}</span>
                </button>
              ) : (
                <span key={name} className="card__person">
                  <span className="avatar" aria-hidden>
                    {initials(name)}
                  </span>
                  <span>{displayName(name)}</span>
                </span>
              ),
            )}
            {faculty.length > 2 && (
              <span className="card__person card__person--more">
                +{faculty.length - 2} more
              </span>
            )}
          </div>
        ) : (
          <div className="card__faculty card__faculty--tba">Instructor TBA</div>
        )}

        <dl className="card__facts">
          <div>
            <dt>{multi ? 'Meets' : 'When'}</dt>
            <dd>
              {multi
                ? `${sections.length} section times`
                : meetingLabel(course.Daytimes ?? '') || 'TBA'}
            </dd>
          </div>
          <div>
            <dt>Where</dt>
            <dd>{multi ? 'Varies by section' : course.Room?.trim() || 'TBA'}</dd>
          </div>
        </dl>

        {preview ? <p className="card__desc">{preview}</p> : null}

        <footer className="card__footer">
          {enrol ? <span className="badge">{enrol}</span> : <span />}
          <div className="card__actions">
            {onTogglePick && (
              <button
                type="button"
                className={`card__pick${picked ? ' is-on' : ''}`}
                onClick={onTogglePick}
                aria-pressed={picked}
              >
                {picked ? '✓ In my plan' : '+ Add to plan'}
              </button>
            )}
            <button type="button" onClick={() => setDetail(true)}>
              View details
            </button>
          </div>
        </footer>
      </article>

      {detail && (
        <CourseDialog
          course={course}
          sections={rows}
          faculty={faculty}
          onClose={() => setDetail(false)}
          onOpenFaculty={onOpenFaculty}
        />
      )}
    </>
  )
}
