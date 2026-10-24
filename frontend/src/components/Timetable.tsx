import { useMemo } from 'react'
import type { Course } from '../api'
import { DAYS, DAY_NAMES, formatClock, parseMeeting } from '../schedule'
import type { Day } from '../schedule'

interface Group {
  key: string
  course: Course
  sections: Course[]
}

interface Props {
  chosen: Group[]
  /** Only show courses that run in this term, so halves do not pile up. */
  term: string
  /** groupKey -> chosen section id, so the grid shows your actual slot. */
  sectionChoice: Record<string, string>
  onChooseSection: (groupKey: string, sectionId: string) => void
}

interface Block {
  key: string
  number: string
  title: string
  day: Day
  start: number
  end: number
  room: string
  ambiguous: boolean
  /** Column index and column count, so overlapping blocks sit side by side. */
  lane: number
  lanes: number
}

/**
 * Two courses at the same hour must not be drawn on top of each other, so
 * overlapping blocks share the column: first free lane wins, and every block
 * in a cluster is told how many lanes the cluster needs.
 */
function layOutLanes(dayBlocks: Block[]): void {
  const sorted = [...dayBlocks].sort((a, b) => a.start - b.start || a.end - b.end)
  let cluster: Block[] = []
  let clusterEnd = -1

  const flush = () => {
    const lanes = cluster.reduce((max, b) => Math.max(max, b.lane + 1), 0)
    for (const b of cluster) b.lanes = lanes
    cluster = []
    clusterEnd = -1
  }

  for (const block of sorted) {
    if (cluster.length > 0 && block.start >= clusterEnd) flush()

    const taken = new Set(
      cluster.filter((b) => b.end > block.start).map((b) => b.lane),
    )
    let lane = 0
    while (taken.has(lane)) lane += 1
    block.lane = lane

    cluster.push(block)
    clusterEnd = Math.max(clusterEnd, block.end)
  }
  if (cluster.length > 0) flush()
}

const DAY_START = 8 * 60 // 8:00
const DAY_END = 20 * 60 // 20:00
const PX_PER_MIN = 0.75

/** A Monday–Friday grid of the shortlist, drawn from the parsed meeting times. */
export function Timetable({ chosen, term, sectionChoice, onChooseSection }: Props) {
  const blocks = useMemo(() => {
    const out: Block[] = []
    for (const g of chosen) {
      const inTerm = g.sections.filter((s) => {
        const t = (s['Course Session'] ?? '').toLowerCase()
        if (term === 'Fall 1') return t === 'fall-1' || t === 'fall'
        if (term === 'Fall 2') return t === 'fall-2' || t === 'fall'
        return true
      })
      if (inTerm.length === 0) continue

      // Use the section you picked; otherwise draw the first and mark it as
      // provisional.
      const picked = inTerm.find((s) => s.Section?.trim() === sectionChoice[g.key])
      const section = picked ?? inTerm[0]
      const meet = parseMeeting(section.Daytimes)
      if (!meet) continue

      for (const day of meet.days) {
        out.push({
          key: `${g.key}-${day}`,
          number: g.course['Course Number'],
          title: g.course['Course Title'],
          day,
          start: Math.max(meet.start, DAY_START),
          end: Math.min(meet.end, DAY_END),
          room: section.Room?.trim() || 'TBA',
          ambiguous: inTerm.length > 1 && !picked,
          lane: 0,
          lanes: 1,
        })
      }
    }
    for (const day of DAYS) layOutLanes(out.filter((b) => b.day === day))
    return out
  }, [chosen, term, sectionChoice])

  /** Courses in this term that have more than one section to choose between. */
  const choosable = useMemo(
    () =>
      chosen
        .map((g) => ({
          group: g,
          options: g.sections.filter((s) => {
            const t = (s['Course Session'] ?? '').toLowerCase()
            if (term === 'Fall 1') return t === 'fall-1' || t === 'fall'
            if (term === 'Fall 2') return t === 'fall-2' || t === 'fall'
            return true
          }),
        }))
        .filter((x) => x.options.length > 1),
    [chosen, term],
  )

  const unscheduled = useMemo(
    () =>
      chosen.filter((g) => !g.sections.some((s) => parseMeeting(s.Daytimes))),
    [chosen],
  )

  const hours = useMemo(() => {
    const out: number[] = []
    for (let m = DAY_START; m <= DAY_END; m += 60) out.push(m)
    return out
  }, [])

  const height = (DAY_END - DAY_START) * PX_PER_MIN

  if (blocks.length === 0) {
    return (
      <p className="tt__empty">
        Nothing in your shortlist has a published meeting time for {term}.
      </p>
    )
  }

  return (
    <div className="tt">
      <div className="tt__grid" style={{ height }}>
        <div className="tt__hours">
          {hours.map((m) => (
            <span key={m} style={{ top: (m - DAY_START) * PX_PER_MIN }}>
              {formatClock(m)}
            </span>
          ))}
        </div>

        {DAYS.map((day) => (
          <div key={day} className="tt__col">
            <header title={DAY_NAMES[day]}>{day}</header>
            <div className="tt__slots">
              {hours.map((m) => (
                <span
                  key={m}
                  className="tt__line"
                  style={{ top: (m - DAY_START) * PX_PER_MIN }}
                />
              ))}
              {blocks
                .filter((b) => b.day === day)
                .map((b) => (
                  <article
                    key={b.key}
                    className={`tt__block${b.ambiguous ? ' is-ambiguous' : ''}`}
                    style={{
                      top: (b.start - DAY_START) * PX_PER_MIN,
                      height: Math.max((b.end - b.start) * PX_PER_MIN, 22),
                      left: `calc(${(b.lane / b.lanes) * 100}% + 2px)`,
                      width: `calc(${100 / b.lanes}% - 4px)`,
                    }}
                    title={`${b.number} — ${b.title}${b.ambiguous ? ' (one of several sections)' : ''}`}
                  >
                    <b>{b.number}</b>
                    <span>{b.title}</span>
                    <i>{b.room}</i>
                  </article>
                ))}
            </div>
          </div>
        ))}
      </div>

      {choosable.length > 0 && (
        <div className="tt__sections">
          <h5>Pick your section</h5>
          <p className="tt__note">
            Dashed blocks are provisional. Choose a section and the grid — and
            the clash check — become exact.
          </p>
          <ul>
            {choosable.map(({ group, options }) => (
              <li key={group.key}>
                <b>{group.course['Course Number']}</b>
                <select
                  value={sectionChoice[group.key] ?? ''}
                  onChange={(e) => onChooseSection(group.key, e.target.value)}
                  aria-label={`Section for ${group.course['Course Number']}`}
                >
                  <option value="">Not chosen</option>
                  {options.map((s) => {
                    const m = parseMeeting(s.Daytimes)
                    const id = s.Section?.trim() ?? ''
                    return (
                      <option key={id} value={id}>
                        {id} — {m ? `${m.days.join('/')} ${m.label}` : 'TBA'}
                      </option>
                    )
                  })}
                </select>
              </li>
            ))}
          </ul>
        </div>
      )}

      {unscheduled.length > 0 && (
        <p className="tt__note">
          No published time yet:{' '}
          {unscheduled.map((g) => g.course['Course Number']).join(', ')}.
        </p>
      )}
    </div>
  )
}
