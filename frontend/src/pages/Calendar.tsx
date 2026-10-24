/* Calendar: month view of classes + academic dates, and one-tap sync to Google / Outlook / Apple. */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, type CalendarEvents, type CalendarLinks } from '../api'
import { Empty, Spinner } from '../components/ui'
import { daysUntil, prettyDate, relDays } from '../lib/format'
import { useApp } from '../state'
import './pages-a.css'

type EvKind = 'class' | 'deadline' | 'exam' | 'break' | 'holiday' | 'global'
interface Ev { kind: EvKind; label: string; detail: string; sort: number; emoji: string }

const KIND_STYLE: Record<string, { cls: EvKind; emoji: string; name: string }> = {
  deadline: { cls: 'deadline', emoji: '⏰', name: 'Deadline' },
  classes: { cls: 'deadline', emoji: '📅', name: 'Term dates' },
  grades: { cls: 'deadline', emoji: '📊', name: 'Grades' },
  milestone: { cls: 'deadline', emoji: '🎓', name: 'Milestone' },
  exam: { cls: 'exam', emoji: '📝', name: 'Exams' },
  break: { cls: 'break', emoji: '🌴', name: 'Break' },
  holiday: { cls: 'holiday', emoji: '🎉', name: 'Holiday' },
  global: { cls: 'global', emoji: '🌍', name: 'Global week' },
}
const LEGEND: { cls: EvKind; label: string }[] = [
  { cls: 'class', label: '🎒 Your classes' },
  { cls: 'deadline', label: '⏰ Deadlines & dates' },
  { cls: 'exam', label: '📝 Exams' },
  { cls: 'global', label: '🌍 Global week' },
  { cls: 'break', label: '🌴 Breaks & holidays' },
]
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MAX_IN_CELL = 3

const iso = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
const parseIso = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }

function shortClock(min: number): string {
  const h = Math.floor(min / 60)
  return `${h % 12 || 12}:${String(min % 60).padStart(2, '0')}`
}
function fullClock(min: number): string {
  return `${shortClock(min)} ${Math.floor(min / 60) >= 12 ? 'PM' : 'AM'}`
}
const courseNumber = (title: string) => title.split(' ').slice(0, 2).join(' ')

export default function Calendar() {
  const { toast, go } = useApp()
  const [events, setEvents] = useState<CalendarEvents | null>(null)
  const [links, setLinks] = useState<CalendarLinks | null>(null)
  const [error, setError] = useState(false)
  const [month, setMonth] = useState<{ y: number; m: number } | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [rotating, setRotating] = useState(false)

  const load = useCallback(() => {
    Promise.all([api.calendarEvents(), api.calendarLinks()])
      .then(([ev, ln]) => {
        setEvents(ev)
        setLinks(ln)
        const t = parseIso(ev.today)
        setMonth((cur) => cur ?? { y: t.getFullYear(), m: t.getMonth() })
        setSelected((cur) => cur ?? ev.today)
      })
      .catch(() => setError(true))
  }, [])

  useEffect(() => { load() }, [load])

  const byDate = useMemo(() => {
    const map = new Map<string, Ev[]>()
    if (!events) return map
    const push = (date: string, ev: Ev) => { const a = map.get(date); if (a) a.push(ev); else map.set(date, [ev]) }
    for (const d of events.deadlines) {
      const st = KIND_STYLE[d.kind] ?? KIND_STYLE.deadline
      push(d.date, { kind: st.cls, label: d.title, detail: st.name, sort: -1, emoji: st.emoji })
    }
    for (const c of events.classes) {
      push(c.date, {
        kind: 'class',
        label: `${courseNumber(c.title)} ${shortClock(c.start_min)}`,
        detail: `${c.title} · ${fullClock(c.start_min)}–${fullClock(c.end_min)}${c.room ? ` · 📍 ${c.room}` : ''}`,
        sort: c.start_min,
        emoji: '🎒',
      })
    }
    for (const a of map.values()) a.sort((x, y) => x.sort - y.sort)
    return map
  }, [events])

  const today = events?.today ?? ''
  const upcoming = useMemo(() => {
    if (!events) return []
    const t = parseIso(events.today)
    return events.deadlines
      .filter((d) => d.date >= events.today)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 8)
      .map((d) => ({ ...d, rel: relDays(daysUntil(d.date, t)), st: KIND_STYLE[d.kind] ?? KIND_STYLE.deadline }))
  }, [events])

  const copy = async () => {
    if (!links) return
    try {
      await navigator.clipboard.writeText(links.feed_url)
      toast('Feed link copied 📋 Paste it into “Subscribe from URL”.', 'good')
    } catch {
      toast('Could not copy. Select the link in the box and copy it manually.', 'bad')
    }
  }

  const rotate = async () => {
    if (!window.confirm('Reset your private calendar link? Any calendar already subscribed with the old link will stop updating, and you will need to subscribe again.')) return
    setRotating(true)
    try {
      setLinks(await api.rotateCalendar())
      toast('New private link made 🔐 Old one is dead.', 'good')
    } catch (e) {
      toast((e as Error).message || 'Could not reset the link.', 'bad')
    } finally {
      setRotating(false)
    }
  }

  const head = (
    <div className="page-head">
      <div>
        <h1>Calendar 📆</h1>
        <p>Your classes plus every SOM deadline in one place, and a private feed so it all shows up in the calendar app you actually use.</p>
      </div>
    </div>
  )

  if (error) {
    return <div>{head}<div className="card"><Empty icon="😵‍💫" title="Couldn't load your calendar"><button type="button" className="btn primary sm" onClick={() => { setError(false); load() }}>Try again</button></Empty></div></div>
  }
  if (!events || !links || !month) {
    return <div>{head}<div className="empty"><Spinner label="Loading your calendar…" /></div></div>
  }

  // ---- month grid (Sunday first)
  const first = new Date(month.y, month.m, 1)
  const startPad = first.getDay()
  const daysInMonth = new Date(month.y, month.m + 1, 0).getDate()
  const cells: { date: string; day: number; other: boolean }[] = []
  for (let i = startPad; i > 0; i--) {
    const d = new Date(month.y, month.m, 1 - i)
    cells.push({ date: iso(d.getFullYear(), d.getMonth(), d.getDate()), day: d.getDate(), other: true })
  }
  for (let d = 1; d <= daysInMonth; d++) cells.push({ date: iso(month.y, month.m, d), day: d, other: false })
  while (cells.length % 7) {
    const d = new Date(month.y, month.m, daysInMonth + (cells.length - startPad - daysInMonth) + 1)
    cells.push({ date: iso(d.getFullYear(), d.getMonth(), d.getDate()), day: d.getDate(), other: true })
  }
  const monthLabel = first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const shift = (n: number) => { const d = new Date(month.y, month.m + n, 1); setMonth({ y: d.getFullYear(), m: d.getMonth() }) }
  const goToday = () => { const t = parseIso(today); setMonth({ y: t.getFullYear(), m: t.getMonth() }); setSelected(today) }
  const prefix = iso(month.y, month.m, 1).slice(0, 7)
  const classesThisMonth = events.classes.filter((c) => c.date.startsWith(prefix)).length
  const dayEvents = selected ? byDate.get(selected) ?? [] : []

  return (
    <div>
      {head}

      <div className="grid cal-layout">
        {/* ------------------------------------------------ month */}
        <div className="card">
          <div className="row between mb">
            <div className="row" style={{ gap: 8 }}>
              <button type="button" className="btn icon" onClick={() => shift(-1)} aria-label="Previous month">‹</button>
              <h2 className="cal-title" aria-live="polite">{monthLabel}</h2>
              <button type="button" className="btn icon" onClick={() => shift(1)} aria-label="Next month">›</button>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <span className="muted small">{classesThisMonth} class {classesThisMonth === 1 ? 'meeting' : 'meetings'}</span>
              <button type="button" className="btn sm" onClick={goToday}>Today</button>
            </div>
          </div>

          <div className="month cal-month" aria-label={monthLabel}>
            {DOW.map((d) => <div key={d} className="dow" aria-hidden="true">{d}</div>)}
            {cells.map((c) => {
              const evs = byDate.get(c.date) ?? []
              const extra = evs.length - MAX_IN_CELL
              return (
                <button
                  key={c.date}
                  type="button"
                  className={`day cal-day ${c.other ? 'other' : ''} ${c.date === today ? 'today' : ''} ${c.date === selected ? 'sel' : ''}`}
                  aria-pressed={c.date === selected}
                  aria-label={`${prettyDate(c.date)}${evs.length ? `, ${evs.length} ${evs.length === 1 ? 'event' : 'events'}` : ''}`}
                  onClick={() => setSelected(c.date)}
                >
                  <span className="num">{c.day}</span>
                  {evs.slice(0, MAX_IN_CELL).map((e, i) => (
                    <span key={i} className={`ev ${e.kind}`} title={e.kind === 'class' ? e.detail : e.label}>{e.kind === 'class' ? e.label : `${e.emoji} ${e.label}`}</span>
                  ))}
                  {extra > 0 && <span className="cal-more">+{extra} more</span>}
                </button>
              )
            })}
          </div>

          <div className="row cal-legend mt">
            {LEGEND.map((l) => <span key={l.cls} className={`ev ${l.cls}`}>{l.label}</span>)}
          </div>
          {!events.classes.length && (
            <p className="faint small mt" style={{ marginBottom: 0 }}>
              No classes showing yet: add courses with published times to your plan.{' '}
              <button type="button" className="link-btn" onClick={() => go('explore')}>Explore catalog →</button>
            </p>
          )}
        </div>

        {/* ------------------------------------------------ side: day + upcoming */}
        <div className="stack">
          <div className="card">
            <div className="card-title">{selected === today ? '📍 Today' : '🗓️'} {selected ? prettyDate(selected) : ''}</div>
            {selected && <p className="faint small" style={{ marginTop: -6 }}>{relDays(daysUntil(selected, parseIso(today)))}</p>}
            {dayEvents.length ? (
              <ul className="cal-list">
                {dayEvents.map((e, i) => (
                  <li key={i}>
                    <span className={`cal-dot ${e.kind}`} aria-hidden="true" />
                    <div>
                      <div className="cal-item-title">{e.kind === 'class' ? e.label : `${e.emoji} ${e.label}`}</div>
                      <div className="muted small">{e.detail}</div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : <p className="muted small" style={{ margin: 0 }}>Nothing on this day. Touch grass 🌿</p>}
          </div>

          <div className="card">
            <div className="card-title">⏳ Upcoming deadlines</div>
            {upcoming.length ? (
              <ul className="cal-list">
                {upcoming.map((d) => (
                  <li key={d.date + d.title}>
                    <span className={`cal-dot ${d.st.cls}`} aria-hidden="true" />
                    <button type="button" className="cal-upcoming" onClick={() => { const t = parseIso(d.date); setMonth({ y: t.getFullYear(), m: t.getMonth() }); setSelected(d.date) }}>
                      <span className="cal-item-title">{d.st.emoji} {d.title}</span>
                      <span className="muted small">{prettyDate(d.date)} · <b className={d.rel === 'today' || d.rel === 'tomorrow' ? 'cal-soon' : ''}>{d.rel}</b></span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : <p className="muted small" style={{ margin: 0 }}>No more deadlines on the books 🎉</p>}
          </div>
        </div>
      </div>

      {/* ------------------------------------------------ sync */}
      <div className="card glow mt-lg">
        <div className="card-title">🔗 Put your classes in your calendar</div>
        <p className="muted" style={{ maxWidth: 720 }}>
          Subscribe once and your planned classes stay in sync with your phone and laptop. Change your plan here and your calendar follows.
        </p>

        {links.is_local && (
          <div className="cal-note amber">
            <b>🏠 You're running Plan with Dan locally.</b> Subscription links only work when the app is online, because Google and Outlook
            have to reach this server to fetch your feed. For now, use <b>Download .ics</b> and import the file instead.
          </div>
        )}

        <div className="row mt">
          <a className="btn primary" href={links.google_subscribe} target="_blank" rel="noreferrer">📅 Google Calendar</a>
          <a className="btn" href={links.outlook_subscribe} target="_blank" rel="noreferrer">📨 Outlook</a>
          <a className="btn" href={links.webcal_url}>🍎 Apple Calendar</a>
          <a className="btn lime" href="/api/plan.ics" download="plan-with-dan.ics">⬇️ Download .ics</a>
        </div>

        <div className="cal-feed mt">
          <label className="cal-feed-label" htmlFor="cal-feed-url">Your private feed link</label>
          <div className="input-row">
            <input id="cal-feed-url" type="text" readOnly value={links.feed_url} onFocus={(e) => e.currentTarget.select()} className="mono" />
            <button type="button" className="btn" onClick={copy}>📋 Copy feed link</button>
          </div>
        </div>

        <div className="grid two mt">
          <div className="cal-note sky">
            <b>⏱️ How fast does it update?</b> Apple Calendar and Outlook refresh fairly quickly. Google refreshes subscribed calendars
            slowly, so changes can take up to ~24 hours to show up there.
          </div>
          <div className="cal-note pink">
            <b>🔐 This link is private.</b> Anyone who has it can see your class schedule. Don't post it anywhere; if you shared it by
            accident, reset it below (old subscriptions will stop updating).
          </div>
        </div>

        <div className="row end mt">
          <button type="button" className="btn sm danger" onClick={rotate} disabled={rotating}>{rotating ? 'Resetting…' : '♻️ Reset private link'}</button>
        </div>
      </div>
    </div>
  )
}
