import { useMemo, useState } from 'react'
import type { Course } from '../api'
import { requirementsOf } from '../facets'
import { parseMeeting, planClashes } from '../schedule'
import { Timetable } from './Timetable'
import { PlanInsights } from './PlanInsights'
import { semesterOf } from '../facets'
import { shareUrl } from '../share'

interface Group {
  key: string
  course: Course
  sections: Course[]
}

interface Props {
  groups: Group[]
  picked: string[]
  onRemove: (key: string) => void
  onClear: () => void
  /** Send an empty plan back to the catalog. */
  onBrowse: () => void
  /** The whole catalog, for "what else is in this subject". */
  allGroups: Group[]
  onOpenCourse: (key: string) => void
}

const ICS_DAY: Record<string, string> = {
  M: 'MO',
  T: 'TU',
  W: 'WE',
  Th: 'TH',
  F: 'FR',
}

/** "20260902 000000.000" -> "20260902" */
function icsDate(raw: string | undefined): string | null {
  const m = (raw ?? '').match(/^(\d{8})/)
  return m ? m[1] : null
}

function icsTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}${String(minutes % 60).padStart(2, '0')}00`
}

/**
 * A weekly-repeating event per course, so the plan can land in Google
 * Calendar or Apple Calendar rather than living only in this tab.
 */
function exportIcs(chosen: Group[], sectionChoice: Record<string, string>): void {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Yale SOM Course Explorer//EN',
    'CALSCALE:GREGORIAN',
  ]

  for (const g of chosen) {
    const section =
      g.sections.find((s) => s.Section?.trim() === sectionChoice[g.key]) ?? g.sections[0]
    const meet = parseMeeting(section.Daytimes)
    const start = icsDate(section['Course Session Start date'])
    const end = icsDate(section['Course Session End Date'])
    if (!meet || !start) continue

    const days = meet.days.map((d) => ICS_DAY[d]).filter(Boolean).join(',')
    lines.push(
      'BEGIN:VEVENT',
      `UID:${g.key.replace(/[^a-z0-9]/gi, '')}@som-course-explorer`,
      `SUMMARY:${g.course['Course Number']} ${g.course['Course Title']}`,
      `LOCATION:${section.Room?.trim() || 'TBA'}`,
      `DESCRIPTION:Section ${section.Section?.trim() || '-'} · ${g.course['Faculty 1'] || 'TBA'}`,
      `DTSTART;TZID=America/New_York:${start}T${icsTime(meet.start)}`,
      `DTEND;TZID=America/New_York:${start}T${icsTime(meet.end)}`,
      `RRULE:FREQ=WEEKLY;BYDAY=${days}${end ? `;UNTIL=${end}T235900Z` : ''}`,
      'END:VEVENT',
    )
  }

  lines.push('END:VCALENDAR')
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'yale-som-plan.ics'
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * A shortlist with the two checks the catalog cannot do for you: whether the
 * units add up, and whether two courses put you in two rooms at once.
 *
 * Multi-section courses are handled properly — a clash is only "hard" when
 * every combination of sections collides. If some combinations are free, it is
 * a section-choice problem, not a dealbreaker.
 */
export function MyPlan({
  groups,
  picked,
  onRemove,
  onClear,
  onBrowse,
  allGroups,
  onOpenCourse,
}: Props) {
  const [copied, setCopied] = useState(false)
  const [view, setView] = useState<'list' | 'timetable'>('list')
  const [ttTerm, setTtTerm] = useState('Fall 1')
  const [sectionChoice, setSectionChoice] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(localStorage.getItem('som-section-choice') ?? '{}')
    } catch {
      return {}
    }
  })

  const chooseSection = (groupKey: string, sectionId: string) => {
    setSectionChoice((prev) => {
      const next = { ...prev, [groupKey]: sectionId }
      if (!sectionId) delete next[groupKey]
      try {
        localStorage.setItem('som-section-choice', JSON.stringify(next))
      } catch {
        // Not worth breaking the panel over.
      }
      return next
    })
  }

  const chosen = useMemo(
    () => picked.map((k) => groups.find((g) => g.key === k)).filter(Boolean) as Group[],
    [groups, picked],
  )

  const totalUnits = useMemo(
    () =>
      chosen.reduce((sum, g) => {
        const u = Number.parseFloat(g.course.Units)
        return sum + (Number.isFinite(u) ? u : 0)
      }, 0),
    [chosen],
  )

  const clashes = useMemo(() => planClashes(chosen), [chosen])

  const hard = clashes.filter((c) => c.kind === 'hard')
  const soft = clashes.filter((c) => c.kind === 'soft')
  const coreCount = chosen.filter((g) => requirementsOf(g.course).includes('Core')).length

  if (picked.length === 0) {
    return (
      <section className="planpage planpage--empty">
        <h2>Nothing in your plan yet</h2>
        <p>
          Browse the catalog and press <b>+ Add to plan</b> on any course. This
          page then totals your units, flags timetable clashes, draws a
          Monday–Friday timetable and exports to your calendar.
        </p>
        <button type="button" onClick={onBrowse}>
          Browse courses
        </button>
      </section>
    )
  }

  return (
    <section className="planpage">
      <div className="myplan__panel myplan__panel--page">
          <header>
            <h3>Shortlist</h3>
            <span className="myplan__actions">
              <button
                type="button"
                onClick={() => {
                  const url = shareUrl({
                    numbers: chosen.map((g) => g.course['Course Number']),
                    sections: Object.fromEntries(
                      chosen
                        .map((g) => [g.course['Course Number'], sectionChoice[g.key]])
                        .filter(([, sec]) => sec),
                    ),
                  })
                  void navigator.clipboard
                    .writeText(url)
                    .then(() => {
                      setCopied(true)
                      setTimeout(() => setCopied(false), 2200)
                    })
                    .catch(() => window.prompt('Copy this link', url))
                }}
              >
                {copied ? '✓ Link copied' : 'Share plan'}
              </button>
              <button type="button" onClick={() => exportIcs(chosen, sectionChoice)}>
                Export .ics
              </button>
              <button type="button" onClick={onClear}>
                Clear
              </button>
            </span>
          </header>

          <div className="myplan__tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={view === 'list'}
              className={view === 'list' ? 'is-on' : ''}
              onClick={() => setView('list')}
            >
              List
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === 'timetable'}
              className={view === 'timetable' ? 'is-on' : ''}
              onClick={() => setView('timetable')}
            >
              Timetable
            </button>
            {view === 'timetable' && (
              <select value={ttTerm} onChange={(e) => setTtTerm(e.target.value)}>
                <option>Fall 1</option>
                <option>Fall 2</option>
              </select>
            )}
          </div>

          <dl className="myplan__totals">
            <div>
              <dt>Courses</dt>
              <dd>{chosen.length}</dd>
            </div>
            <div>
              <dt>Units</dt>
              <dd>{totalUnits.toFixed(1)}</dd>
            </div>
            <div>
              <dt>Core</dt>
              <dd>{coreCount}</dd>
            </div>
          </dl>

          {totalUnits > 0 && totalUnits < 16 && (
            <p className="myplan__note">
              Under the 16-unit minimum required in each of the first three
              terms.
            </p>
          )}

          {hard.length > 0 && (
            <div className="myplan__clash myplan__clash--hard">
              <strong>{hard.length === 1 ? 'Clash' : 'Clashes'}</strong>
              <ul>
                {hard.map((c) => (
                  <li key={`${c.a}-${c.b}`}>
                    {c.a} and {c.b} overlap ({c.detail}) in every section.
                  </li>
                ))}
              </ul>
            </div>
          )}

          {soft.length > 0 && (
            <div className="myplan__clash myplan__clash--soft">
              <strong>Section choice matters</strong>
              <ul>
                {soft.map((c) => (
                  <li key={`${c.a}-${c.b}`}>
                    {c.a} and {c.b} clash in some sections ({c.detail}) — pick
                    non-overlapping ones.
                  </li>
                ))}
              </ul>
            </div>
          )}

          {clashes.length === 0 && chosen.length > 1 && (
            <p className="myplan__ok">No timetable clashes.</p>
          )}

          {view === 'timetable' && (
            <Timetable
              chosen={chosen}
              term={ttTerm}
              sectionChoice={sectionChoice}
              onChooseSection={chooseSection}
            />
          )}

          {view === 'list' && (
          <ul className="myplan__list">
            {chosen.map((g) => {
              const meet = parseMeeting(g.course.Daytimes)
              return (
                <li key={g.key}>
                  <div>
                    <b>{g.course['Course Number']}</b>
                    <span>{g.course['Course Title']}</span>
                    <i>
                      {g.course.Units} units ·{' '}
                      {g.sections.length > 1
                        ? `${g.sections.length} sections`
                        : (meet?.label ?? 'TBA')}
                    </i>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemove(g.key)}
                    aria-label={`Remove ${g.course['Course Number']}`}
                  >
                    ×
                  </button>
                </li>
              )
            })}
          </ul>
          )}

          <PlanInsights
            chosen={chosen}
            all={allGroups}
            sectionChoice={sectionChoice}
            semesters={[...new Set(chosen.map((g) => semesterOf(g.course)))].sort()}
            onOpenCourse={onOpenCourse}
          />
      </div>
    </section>
  )
}
