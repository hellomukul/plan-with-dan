/* Calendar: month view of classes + academic dates, and one-tap sync to Google / Outlook / Apple.
   Calm style: plain labels, small colour squares for event kinds, one primary action. */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CalendarDays, ChevronLeft, ChevronRight, CircleAlert, Clock, Copy, Download, House, Lock, Mail, RotateCcw, Smartphone,
} from 'lucide-react'
import { api, type CalendarEvents, type CalendarLinks } from '../api'
import { Empty, Spinner } from '../components/ui'
import { daysUntil, prettyDate, relDays } from '../lib/format'
import { useApp } from '../state'
import './pages-a.css'

type EvKind = 'class' | 'deadline' | 'exam' | 'break' | 'holiday' | 'global'
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
  { cls: 'deadline', label: 'Deadlines and dates' },
  { cls: 'exam', label: 'Exams' },
  { cls: 'global', label: 'Global week' },
  { cls: 'break', label: 'Breaks and holidays' },
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
      push(d.date, { kind: st.cls, label: d.title, detail: st.name, sort: -1 })
    }
    for (const c of events.classes) {
      push(c.date, {
        kind: 'class',
        label: `${courseNumber(c.title)} ${shortClock(c.start_min)}`,
        detail: `${c.title} · ${fullClock(c.start_min)}–${fullClock(c.end_min)}${c.room ? ` · ${c.room}` : ''}`,
        sort: c.start_min,
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
      toast('Feed link copied. Paste it into “Subscribe from URL” in your calendar app.', 'good')
    } catch {
      toast('Could not copy. Select the link in the box and copy it manually.', 'bad')
    }
  }

  const rotate = async () => {
    if (!window.confirm('Reset your private calendar link? Any calendar already subscribed with the old link will stop updating, and you will need to subscribe again.')) return
    setRotating(true)
    try {
      setLinks(await api.rotateCalendar())
      toast('New private link created. The old link no longer works.', 'good')
    } catch (e) {
      toast((e as Error).message || 'Could not reset the link.', 'bad')
    } finally {
      setRotating(false)
    }
  }

  const head = (
    <div className="page-head">
      <div>
        <h1>Calendar</h1>
        <p>Your classes and SOM deadlines in one place, with a private feed for the calendar app you already use.</p>
      </div>
    </div>
  )

  if (error) {
    return <div>{head}<div className="card"><Empty icon={<CircleAlert className="icon lg faint" />} title="Couldn't load your calendar"><button type="button" className="btn primary sm" onClick={() => { setError(false); load() }}>Try again</button></Empty></div></div>
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
              <button type="button" className="btn icon ghost" onClick={() => shift(-1)} aria-label="Previous month"><ChevronLeft className="icon" /></button>
              <h2 className="cal-title" aria-live="polite">{monthLabel}</h2>
              <button type="button" className="btn icon ghost" onClick={() => shift(1)} aria-label="Next month"><ChevronRight className="icon" /></button>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <span className="muted small hide-mobile"><span className="mono">{classesThisMonth}</span> class {classesThisMonth === 1 ? 'meeting' : 'meetings'}</span>
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
                    <span key={i} className={`ev ${e.kind}`} title={e.kind === 'class' ? e.detail : e.label}>{e.label}</span>
                  ))}
                  {extra > 0 && <span className="cal-more">+{extra} more</span>}
                </button>
              )
            })}
          </div>

          <div className="row cal-legend mt">
            {LEGEND.map((l) => <span key={l.cls}><i className={`cal-swatch ${l.cls}`} aria-hidden="true" />{l.label}</span>)}
          </div>
          {!events.classes.length && (
            <p className="faint small mt" style={{ marginBottom: 0 }}>
              No classes showing yet. Add courses with published times to your plan.{' '}
              <button type="button" className="link-btn" onClick={() => go('explore')}>Browse the catalog</button>
            </p>
          )}
        </div>

        {/* ------------------------------------------------ side: day + upcoming */}
        <div className="stack">
          <div className="card">
            <div className="section-label">
              <span>{selected === today ? 'Today · ' : ''}{selected ? prettyDate(selected) : ''}</span>
              {selected && selected !== today && <span className="faint">{relDays(daysUntil(selected, parseIso(today)))}</span>}
            </div>
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

          <div className="card">
            <div className="section-label"><span>Upcoming deadlines</span></div>
            {upcoming.length ? (
              <ul className="cal-list">
                {upcoming.map((d) => (
                  <li key={d.date + d.title}>
                    <span className={`cal-swatch ${d.st.cls}`} aria-hidden="true" />
                    <button type="button" className="cal-upcoming" onClick={() => { const t = parseIso(d.date); setMonth({ y: t.getFullYear(), m: t.getMonth() }); setSelected(d.date) }}>
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

      {/* ------------------------------------------------ sync */}
      <div className="card mt-lg">
        <div className="section-label"><span>Sync to your calendar app</span></div>
        <p className="muted" style={{ maxWidth: 720 }}>
          Subscribe once and your planned classes stay in sync on your phone and laptop. Change your plan here and your calendar follows.
        </p>

        {links.is_local && (
          <div className="cal-note amber">
            <House className="icon sm" />
            <span>
              <b>You're running Plan with Dan locally.</b> Subscription links only work when the app is online, because Google and Outlook
              have to reach this server to fetch your feed. For now, use <b>Download .ics</b> and import the file instead.
            </span>
          </div>
        )}

        {/* One primary action: Download when running locally (subscriptions can't reach us), otherwise Google. */}
        <div className="row mt cal-sync-btns">
          <a className={`btn ${links.is_local ? '' : 'primary'}`} href={links.google_subscribe} target="_blank" rel="noreferrer"><CalendarDays className="icon sm" />Google Calendar</a>
          <a className="btn" href={links.outlook_subscribe} target="_blank" rel="noreferrer"><Mail className="icon sm" />Outlook</a>
          <a className="btn" href={links.webcal_url}><Smartphone className="icon sm" />Apple Calendar</a>
          <a className={`btn ${links.is_local ? 'primary' : ''}`} href="/api/plan.ics" download="plan-with-dan.ics"><Download className="icon sm" />Download .ics</a>
        </div>

        <div className="cal-feed mt">
          <label className="cal-feed-label" htmlFor="cal-feed-url">Your private feed link</label>
          <div className="input-row">
            <input id="cal-feed-url" type="text" readOnly value={links.feed_url} onFocus={(e) => e.currentTarget.select()} className="mono" />
            <button type="button" className="btn" onClick={copy}><Copy className="icon sm" />Copy link</button>
          </div>
        </div>

        <div className="grid two mt">
          <div className="cal-note">
            <Clock className="icon sm" />
            <span>
              <b>How fast does it update?</b> Apple Calendar and Outlook refresh fairly quickly. Google refreshes subscribed calendars
              slowly, so changes can take up to about 24 hours to appear there.
            </span>
          </div>
          <div className="cal-note">
            <Lock className="icon sm" />
            <span>
              <b>This link is private.</b> Anyone who has it can see your class schedule, so don't post it anywhere. If you shared it by
              accident, reset it below (old subscriptions will stop updating).
            </span>
          </div>
        </div>

        <div className="row end mt">
          <button type="button" className="btn sm danger" onClick={rotate} disabled={rotating}><RotateCcw className="icon sm" />{rotating ? 'Resetting…' : 'Reset private link'}</button>
        </div>
      </div>
    </div>
  )
}
