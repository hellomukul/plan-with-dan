import { useMemo } from 'react'
import {
  ACADEMIC_CALENDAR,
  CALENDAR_SOURCE,
  KIND_LABEL,
  STUDENT_TOOLS,
} from '../campus'
import type { CalendarEntry } from '../campus'

/** Whole days from today, negative once the date has passed. */
function daysAway(iso: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const then = new Date(`${iso}T00:00:00`)
  return Math.round((then.getTime() - today.getTime()) / 86_400_000)
}

function countdown(days: number): string {
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days > 0) return `in ${days} days`
  if (days === -1) return 'yesterday'
  return `${Math.abs(days)} days ago`
}

/**
 * Term dates and the apps a new student is expected to already know. Both are
 * reference material rather than browsing, so they share a page.
 */
export function CampusGuide() {
  const all = useMemo(
    () => ACADEMIC_CALENDAR.flatMap((t) => t.entries),
    [],
  )

  /** The next thing on the calendar, so the page opens with an answer. */
  const next = useMemo(() => {
    const upcoming = all
      .map((e) => ({ e, d: daysAway(e.date) }))
      .filter((x) => x.d >= 0)
      .sort((a, b) => a.d - b.d)
    return upcoming[0] ?? null
  }, [all])

  const nextDeadline = useMemo(() => {
    const upcoming = all
      .filter((e) => e.kind === 'deadline')
      .map((e) => ({ e, d: daysAway(e.date) }))
      .filter((x) => x.d >= 0)
      .sort((a, b) => a.d - b.d)
    return upcoming[0] ?? null
  }, [all])

  const row = (e: CalendarEntry) => {
    const d = daysAway(e.date)
    const past = d < 0
    return (
      <li key={e.date + e.what} className={past ? 'is-past' : ''}>
        <span className={`cal__kind cal__kind--${e.kind}`}>{KIND_LABEL[e.kind]}</span>
        <div>
          <strong>{e.label}</strong>
          <p>{e.what}</p>
        </div>
        <span className="cal__away">{countdown(d)}</span>
      </li>
    )
  }

  return (
    <div className="campus">
      <section className="campus__block">
        <header className="campus__head">
          <div>
            <h2>Term dates</h2>
            <p>
              Yale SOM&apos;s academic calendar for 2026–27.{' '}
              <a href={CALENDAR_SOURCE} target="_blank" rel="noreferrer">
                Source ↗
              </a>
            </p>
          </div>

          {(next || nextDeadline) && (
            <div className="campus__next">
              {nextDeadline && (
                <div className="campus__nextcard campus__nextcard--warn">
                  <dt>Next deadline</dt>
                  <dd>{nextDeadline.e.what}</dd>
                  <span>{countdown(nextDeadline.d)}</span>
                </div>
              )}
              {next && (
                <div className="campus__nextcard">
                  <dt>Next up</dt>
                  <dd>{next.e.what}</dd>
                  <span>{countdown(next.d)}</span>
                </div>
              )}
            </div>
          )}
        </header>

        {ACADEMIC_CALENDAR.map((term) => (
          <div key={term.name} className="cal">
            <h3>{term.name}</h3>
            {/* Yale lists a few entries out of order; sort so the page reads
                as a timeline. */}
            <ul>
              {[...term.entries]
                .sort((a, b) => a.date.localeCompare(b.date))
                .map(row)}
            </ul>
          </div>
        ))}
      </section>

      <section className="campus__block">
        <header className="campus__head">
          <div>
            <h2>The apps you&apos;ll be told to sign into</h2>
            <p>
              Six of them, and nobody explains which is for what. Here is the
              short version.
            </p>
          </div>
        </header>

        <div className="tools">
          {STUDENT_TOOLS.map((t) => (
            <article key={t.name}>
              <header>
                <h3>{t.name}</h3>
                <span>{t.tagline}</span>
              </header>
              <p>{t.what}</p>
              <p className="tools__when">
                <strong>When:</strong> {t.when}
              </p>
              <a href={t.url} target="_blank" rel="noreferrer">
                Open {t.name} ↗
              </a>
            </article>
          ))}
        </div>

        <p className="tools__note">
          All of these need your Yale NetID. If one refuses to let you in, the
          IT service catalog is the place to start rather than email.
        </p>
      </section>
    </div>
  )
}
