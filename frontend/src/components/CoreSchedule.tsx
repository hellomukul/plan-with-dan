import { useMemo, useState } from 'react'
import type { Course } from '../api'
import {
  COHORTS,
  COHORT_DOT,
  CORE_COURSE_COLORS,
  COHORT_SECTIONS,
} from '../cohorts'
import type { Cohort } from '../cohorts'
import { requirementsOf } from '../facets'
import { DAYS, DAY_NAMES, formatClock, parseMeeting } from '../schedule'
import type { Day } from '../schedule'

interface Group {
  key: string
  course: Course
  sections: Course[]
}

interface Props {
  groups: Group[]
  /** From the visitor's profile, so the page opens on their own week. */
  cohort?: Cohort
  /** Second years have no fixed timetable; say so rather than show them this. */
  year?: string
  onGoToPlan?: () => void
}

const SESSION_ORDER = [
  { id: 'fall-1', label: 'Fall 1' },
  { id: 'fall-2', label: 'Fall 2' },
  { id: 'spring-1', label: 'Spring 1' },
  { id: 'spring-2', label: 'Spring 2' },
]

const DAY_START = 8 * 60
const DAY_END = 18 * 60
const PX_PER_MIN = 52 / 60 // 52px per hour row

interface Block {
  key: string
  number: string
  title: string
  room: string
  day: Day
  start: number
  end: number
}

/**
 * The first-year core week for one cohort. Unlike the shortlist timetable this
 * needs no picking: your cohort determines every section, so choosing Gold
 * draws Gold's actual week.
 */
export function CoreSchedule({ groups, cohort: fromProfile, year, onGoToPlan }: Props) {
  const [session, setSession] = useState('fall-1')
  const [cohort, setCohort] = useState<Cohort>(fromProfile ?? 'Gold')

  // Follow the profile when it changes, without trapping manual selection.
  const [lastProfile, setLastProfile] = useState(fromProfile)
  if (fromProfile && fromProfile !== lastProfile) {
    setLastProfile(fromProfile)
    setCohort(fromProfile)
  }

  /** Only offer a session if we hold cohort pairings for courses in it. */
  const sessions = useMemo(() => {
    const mapped = new Set(
      groups
        .filter((g) => COHORT_SECTIONS[g.course['Course Number'].trim()])
        .map((g) => (g.course['Course Session'] ?? '').toLowerCase()),
    )
    return SESSION_ORDER.filter((s) => mapped.has(s.id))
  }, [groups])

  /** Core courses that exist in a session we have no pairings for. */
  const unmappedSessions = useMemo(() => {
    const shown = new Set(sessions.map((s) => s.id))
    const missing = new Set<string>()
    for (const g of groups) {
      const sess = (g.course['Course Session'] ?? '').toLowerCase()
      if (!sess.startsWith('spring') && !sess.startsWith('fall')) continue
      if (shown.has(sess)) continue
      if (!requirementsOf(g.course).includes('Core')) continue
      const label = SESSION_ORDER.find((s) => s.id === sess)?.label
      if (label) missing.add(label)
    }
    return [...missing]
  }, [groups, sessions])

  /** Core courses in this half-term that we hold a cohort mapping for. */
  const courses = useMemo(
    () =>
      groups
        .filter(
          (g) =>
            COHORT_SECTIONS[g.course['Course Number'].trim()] &&
            (g.course['Course Session'] ?? '').toLowerCase() === session,
        )
        .sort((a, b) =>
          a.course['Course Number'].localeCompare(b.course['Course Number']),
        ),
    [groups, session],
  )

  const blocks = useMemo(() => {
    const out: Block[] = []
    for (const g of courses) {
      const num = g.course['Course Number'].trim()
      const sectionId = COHORT_SECTIONS[num]?.[cohort]
      const row = g.sections.find((s) => s.Section?.trim() === sectionId)
      const meet = row ? parseMeeting(row.Daytimes) : null
      if (!row || !meet) continue

      for (const day of meet.days) {
        out.push({
          key: `${num}-${day}`,
          number: num,
          title: g.course['Course Title'].trim(),
          room: row.Room?.trim() || 'TBA',
          day,
          start: meet.start,
          end: meet.end,
        })
      }
    }
    return out
  }, [courses, cohort])

  const hours = useMemo(() => {
    const out: number[] = []
    for (let m = DAY_START; m <= DAY_END; m += 60) out.push(m)
    return out
  }, [])

  const bodyHeight = (DAY_END - DAY_START) * PX_PER_MIN

  if (year === '2') {
    return (
      <section className="core core--notice">
        <h2>Second years don&apos;t have a fixed timetable</h2>
        <p>
          The cohort week below is the first-year core: everyone in Gold sits
          the same classes at the same hours. In second year you build your own
          from electives, so there is no schedule to look up — there is only
          the one you assemble.
        </p>
        {onGoToPlan && (
          <button type="button" onClick={onGoToPlan}>
            Build it in My plan
          </button>
        )}
        <p className="core__peek">
          Curious about the first-year week anyway? Set your year to
          &ldquo;first year&rdquo; in the header.
        </p>
      </section>
    )
  }

  return (
    <section className="core">
      <header className="core__head">
        <div>
          <p className="core__eyebrow">Yale School of Management · first year</p>
          <h2>Core weekly schedule</h2>
        </div>
        <p className="core__sub">
          {fromProfile
            ? `Showing ${cohort}'s week — your cohort fixes your section in every core course.`
            : 'Pick a session and a cohort to see that group\u2019s week. Your cohort fixes your section in every core course.'}
        </p>
      </header>

      <div className="core__sessions" role="tablist">
        {sessions.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={session === s.id}
            className={session === s.id ? 'is-on' : ''}
            onClick={() => setSession(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="core__row">
        <div className="core__cohorts">
          {COHORTS.map((c) => (
            <button
              key={c}
              type="button"
              className={cohort === c ? 'is-on' : ''}
              onClick={() => setCohort(c)}
              aria-pressed={cohort === c}
            >
              <span className="dot" style={{ background: COHORT_DOT[c] }} />
              {c}
            </button>
          ))}
        </div>

        <div className="core__legend">
          {courses.map((g) => {
            const num = g.course['Course Number'].trim()
            return (
              <span key={num}>
                <i style={{ background: CORE_COURSE_COLORS[num]?.fg ?? '#00356b' }} />
                {g.course['Course Title'].trim()}
              </span>
            )
          })}
        </div>
      </div>

      {courses.length === 0 ? (
        <p className="core__empty">
          No mapped core courses in this session.
        </p>
      ) : (
        <div className="core__cal">
          <div className="core__calhead">
            <div />
            {DAYS.map((d) => (
              <div key={d}>{DAY_NAMES[d]}</div>
            ))}
          </div>

          <div className="core__calbody" style={{ height: bodyHeight }}>
            <div className="core__times">
              {hours.map((m) => (
                <div key={m} className="core__slot" style={{ height: 60 * PX_PER_MIN }}>
                  {formatClock(m).replace(':00', '')}
                </div>
              ))}
            </div>

            {DAYS.map((day) => (
              <div key={day} className="core__day">
                {hours.slice(0, -1).map((m) => (
                  <div key={m} className="core__line" style={{ height: 60 * PX_PER_MIN }} />
                ))}
                {blocks
                  .filter((b) => b.day === day)
                  .map((b) => {
                    const col = CORE_COURSE_COLORS[b.number] ?? {
                      fg: '#00356b',
                      bg: '#e2eaf2',
                    }
                    return (
                      <div
                        key={b.key}
                        className="core__block"
                        style={{
                          top: (b.start - DAY_START) * PX_PER_MIN,
                          height: (b.end - b.start) * PX_PER_MIN,
                          background: col.bg,
                          borderLeftColor: col.fg,
                          color: col.fg,
                        }}
                      >
                        <span className="t">{b.title}</span>
                        <span className="m">
                          {formatClock(b.start)}–{formatClock(b.end)}
                        </span>
                        <span className="m">{b.room}</span>
                      </div>
                    )
                  })}
              </div>
            ))}
          </div>
        </div>
      )}

      {unmappedSessions.length > 0 && (
        <p className="core__missing">
          Cohort pairings are loaded for the fall only, so{' '}
          {unmappedSessions.join(' and ')} core courses are not drawn here yet —
          their sections are in the catalog with times and rooms.
        </p>
      )}

      <p className="core__note">
        {courses
          .map((g) => `${g.course['Course Number']} ${g.course['Course Title'].trim()}`)
          .join(' · ')}
      </p>
    </section>
  )
}
