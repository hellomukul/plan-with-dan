/* Month calendar shared by the signed-in Calendar page and the home page's Dates tab: academic dates, class
   meetings and booked appointments, a selected-day list and the next deadlines.
   Always six week rows and a fixed-height day list, so changing month or day never changes the page length. */
import { useMemo, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { CalendarEvents } from '../api'
import { daysUntil, prettyDate, relDays } from '../lib/format'
import '../pages/pages-a.css'

type EvKind = 'class' | 'personal' | 'deadline' | 'exam' | 'break' | 'holiday' | 'global'
interface Ev { kind: EvKind; label: string; detail: string; sort: number }

const KIND_STYLE: Record<string, { cls: EvKind; name: string }> = {
  deadline: { cls: 'deadline', name: 'Deadline' },
  classes: { cls: 'deadline', name: 'Term dates' },
  grades: { cls: 'deadline', name: 'Grades' },
  milestone: { cls: 'deadline', name: 'Milestone' },
  exam: { cls: 'exam', name: 'Exams' },
  break: { cls: 'break', name: 'Break' },
  holiday: { cls: 'holiday', name: 'Holiday' },
  global: { cls: 'global', name: 'Global week' },
}
const LEGEND: { cls: EvKind; label: string }[] = [
  { cls: 'class', label: 'Your classes' },
  { cls: 'personal', label: 'Your appointments' },
  { cls: 'deadline', label: 'Deadlines and dates' },
  { cls: 'exam', label: 'Exams' },
  { cls: 'global', label: 'Global week' },
  { cls: 'break', label: 'Breaks and holidays' },
]
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MAX_IN_CELL = 3
const WEEKS = 6  // every month gets six rows, so switching months never changes the height

const iso = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
const parseIso = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
const isoDay = (d: Date) => iso(d.getFullYear(), d.getMonth(), d.getDate())

function shortClock(min: number): string {
  const h = Math.floor(min / 60)
  return `${h % 12 || 12}:${String(min % 60).padStart(2, '0')}`
}
function fullClock(min: number): string {
  return `${shortClock(min)} ${Math.floor(min / 60) >= 12 ? 'PM' : 'AM'}`
}
const courseNumber = (title: string) => title.split(' ').slice(0, 2).join(' ')

interface Props {
  events: CalendarEvents
  /** shown under the legend, e.g. "no classes yet" */
  footer?: ReactNode
  /** extra controls in the header row, right of Today */
  actions?: ReactNode
  /** which legend entries apply (the home page has no appointments) */
  legend?: EvKind[]
  /** events shown per day before "+N more" (taller cells can show more) */
  perCell?: number
  /** how many upcoming dates to list */
  upcomingCount?: number
}

export default function MonthCalendar({ events, footer, actions, legend, perCell = MAX_IN_CELL, upcomingCount = 8 }: Props) {
  const today = events.today
  const [month, setMonth] = useState(() => { const t = parseIso(today); return { y: t.getFullYear(), m: t.getMonth() } })
  const [selected, setSelected] = useState(today)

  const byDate = useMemo(() => {
    const map = new Map<string, Ev[]>()
    const push = (date: string, ev: Ev) => { const a = map.get(date); if (a) a.push(ev); else map.set(date, [ev]) }
    for (const d of events.deadlines) {
      const st = KIND_STYLE[d.kind] ?? KIND_STYLE.deadline
      push(d.date, { kind: st.cls, label: d.title, detail: st.name, sort: -1 })
      // Multi-day entries (recess, finals, global weeks) show on every day they cover.
      const day = parseIso(d.date)
      const last = d.end ?? d.date
      for (day.setDate(day.getDate() + 1); isoDay(day) <= last; day.setDate(day.getDate() + 1)) {
        push(isoDay(day), { kind: st.cls, label: `${d.title.split(' (')[0]} (cont.)`, detail: st.name, sort: -1 })
      }
    }
    for (const c of events.classes) {
      push(c.date, {
        kind: 'class',
        label: `${courseNumber(c.title)} ${shortClock(c.start_min)}`,
        detail: `${c.title} · ${fullClock(c.start_min)}–${fullClock(c.end_min)}${c.room ? ` · ${c.room}` : ''}`,
        sort: c.start_min,
      })
    }
    for (const p of events.personal ?? []) {  // appointments the student booked (coach, interview room...)
      push(p.date, {
        kind: 'personal',
        label: `${shortClock(p.start_min)} ${p.title}`,
        detail: `${p.title} · ${fullClock(p.start_min)}–${fullClock(p.end_min)}${p.location ? ` · ${p.location}` : ''}`,
        sort: -1 + p.start_min / 10000,  // after all-day dates, before classes: a one-off booking shouldn't hide under "+N more"
      })
    }
    for (const a of map.values()) a.sort((x, y) => x.sort - y.sort)
    return map
  }, [events])

  const upcoming = useMemo(() => {
    const t = parseIso(today)
    return events.deadlines
      .filter((d) => d.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, upcomingCount)
      .map((d) => ({ ...d, rel: relDays(daysUntil(d.date, t)), st: KIND_STYLE[d.kind] ?? KIND_STYLE.deadline }))
  }, [events, today, upcomingCount])

  // ---- month grid (Sunday first, always six weeks)
  const first = new Date(month.y, month.m, 1)
  const cells: { date: string; day: number; other: boolean }[] = []
  for (let i = 0; i < WEEKS * 7; i++) {
    const d = new Date(month.y, month.m, 1 - first.getDay() + i)
    cells.push({ date: isoDay(d), day: d.getDate(), other: d.getMonth() !== month.m })
  }
  const monthLabel = first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const shift = (n: number) => { const d = new Date(month.y, month.m + n, 1); setMonth({ y: d.getFullYear(), m: d.getMonth() }) }
  const jump = (date: string) => { const t = parseIso(date); setMonth({ y: t.getFullYear(), m: t.getMonth() }); setSelected(date) }
  const prefix = iso(month.y, month.m, 1).slice(0, 7)
  const classesThisMonth = events.classes.filter((c) => c.date.startsWith(prefix)).length
  const dayEvents = byDate.get(selected) ?? []
  const legendItems = legend ? LEGEND.filter((l) => legend.includes(l.cls)) : LEGEND

  return (
    <div className="grid cal-layout">
      <div className="card">
        <div className="row between mb">
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn icon ghost" onClick={() => shift(-1)} aria-label="Previous month"><ChevronLeft className="icon" /></button>
            <h2 className="cal-title" aria-live="polite">{monthLabel}</h2>
            <button type="button" className="btn icon ghost" onClick={() => shift(1)} aria-label="Next month"><ChevronRight className="icon" /></button>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <span className="muted small hide-mobile"><span className="mono">{classesThisMonth}</span> class {classesThisMonth === 1 ? 'meeting' : 'meetings'}</span>
            <button type="button" className="btn sm" onClick={() => jump(today)}>Today</button>
            {actions}
          </div>
        </div>

        <div className="month cal-month" aria-label={monthLabel}>
          {DOW.map((d) => <div key={d} className="dow" aria-hidden="true">{d}</div>)}
          {cells.map((c) => {
            const evs = byDate.get(c.date) ?? []
            const extra = evs.length - perCell
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
                {evs.slice(0, perCell).map((e, i) => (
                  <span key={i} className={`ev ${e.kind}`} title={e.kind === 'class' ? e.detail : e.label}>{e.label}</span>
                ))}
                {extra > 0 && <span className="cal-more">+{extra}<span className="cal-more-word"> more</span></span>}
              </button>
            )
          })}
        </div>

        <div className="row cal-legend mt">
          {legendItems.map((l) => <span key={l.cls}><i className={`cal-swatch ${l.cls}`} aria-hidden="true" />{l.label}</span>)}
        </div>
        {footer}
      </div>

      <div className="stack cal-side">
        <div className="card">
          <div className="section-label">
            <span>{selected === today ? 'Today · ' : ''}{prettyDate(selected)}</span>
            {selected !== today && <span className="faint">{relDays(daysUntil(selected, parseIso(today)))}</span>}
          </div>
          <div className="cal-daylist">
            {dayEvents.length ? (
              <ul className="cal-list">
                {dayEvents.map((e, i) => (
                  <li key={i}>
                    <span className={`cal-swatch ${e.kind}`} aria-hidden="true" />
                    <div>
                      <div className={`cal-item-title ${e.kind === 'class' ? 'mono' : ''}`}>{e.label}</div>
                      <div className="muted small">{e.detail}</div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : <p className="muted small" style={{ margin: 0 }}>Nothing on this day.</p>}
          </div>
        </div>

        <div className="card cal-upcoming-card">
          <div className="section-label"><span>Upcoming deadlines</span></div>
          {upcoming.length ? (
            <ul className="cal-list">
              {upcoming.map((d) => (
                <li key={d.date + d.title}>
                  <span className={`cal-swatch ${d.st.cls}`} aria-hidden="true" />
                  <button type="button" className="cal-upcoming" onClick={() => jump(d.date)}>
                    <span className="cal-item-title">{d.title}</span>
                    <span className="muted small"><span className="mono">{prettyDate(d.date)}</span> · <span className={d.rel === 'today' || d.rel === 'tomorrow' ? 'cal-soon' : ''}>{d.rel}</span></span>
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className="muted small" style={{ margin: 0 }}>No more deadlines on the books.</p>}
        </div>
      </div>
    </div>
  )
}
