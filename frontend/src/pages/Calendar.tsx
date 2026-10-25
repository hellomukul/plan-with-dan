/* Calendar: month view of classes + academic dates, and one-tap sync to Google / Outlook / Apple.
   Calm style: plain labels, small colour squares for event kinds, one primary action.
   The month grid itself is components/MonthCalendar (shared with the home page's Dates tab). */
import { useCallback, useEffect, useRef, useState } from 'react'
import { CalendarDays, CircleAlert, Clock, Copy, Download, House, Lock, Mail, PartyPopper, RotateCcw, Smartphone, Trash2 } from 'lucide-react'
import { api, type CalendarEvents, type CalendarLinks, type PersonalEvent } from '../api'
import { consumeCalendarIntent } from '../components/AuthDialog'
import MonthCalendar from '../components/MonthCalendar'
import { Empty, Spinner, useConfirm } from '../components/ui'
import { clock, prettyDate } from '../lib/format'
import { useApp } from '../state'
import './pages-a.css'
import './calendar-sync.css'

export default function Calendar() {
  const { toast, go } = useApp()
  const [events, setEvents] = useState<CalendarEvents | null>(null)
  const [links, setLinks] = useState<CalendarLinks | null>(null)
  const [error, setError] = useState(false)
  const [rotating, setRotating] = useState(false)
  const [ask, confirmUi] = useConfirm()
  // Came here through "Link your calendar" (signed up or logged in from that sheet): put the sync card first.
  const [justLinked] = useState(consumeCalendarIntent)
  const [savedWeek] = useState(() => {
    const n = Number(sessionStorage.getItem('pwd-saved-week') || 0)
    sessionStorage.removeItem('pwd-saved-week')
    return n
  })

  const load = useCallback(() => {
    return Promise.all([api.calendarEvents(), api.calendarLinks()])
      .then(([ev, ln]) => { setEvents(ev); setLinks(ln) })
      .catch(() => setError(true))
  }, [])

  useEffect(() => { load() }, [load])
  // Once there are appointments, keep their card even after the last one is deleted (it holds the Undo).
  const [hadAppts, setHadAppts] = useState(false)
  useEffect(() => { if (events?.personal?.length) setHadAppts(true) }, [events])

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
    if (!(await ask({ title: 'Reset your private calendar link?', body: 'Any calendar already subscribed with the old link will stop updating, and you will need to subscribe again.', confirmLabel: 'Reset link', danger: true }))) return
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
        {events?.calendar_note && <p className="small" style={{ color: 'var(--amber)' }}>{events.calendar_note}</p>}
      </div>
    </div>
  )

  if (error) {
    return <div>{head}<div className="card"><Empty icon={<CircleAlert className="icon lg faint" />} title="Couldn't load your calendar"><button type="button" className="btn primary sm" onClick={() => { setError(false); load() }}>Try again</button></Empty></div></div>
  }
  if (!events || !links) {
    // Shaped like the loaded page (month + day list, then the sync card), so nothing jumps when data arrives.
    return (
      <div aria-busy="true">
        {head}
        <span className="sr-only"><Spinner label="Loading your calendar…" /></span>
        <div className="grid cal-layout" aria-hidden="true">
          <span className="skeleton cal-skel-month" />
          <div className="stack cal-side"><span className="skeleton cal-skel-day" /><span className="skeleton cal-skel-upcoming" /></div>
        </div>
        <span className="skeleton cal-skel-sync mt-lg" aria-hidden="true" />
      </div>
    )
  }

  const personal = events.personal ?? []
  const month = (
    <>
    <MonthCalendar
      events={events}
      footer={!events.classes.length && (
        <p className="faint small mt" style={{ marginBottom: 0 }}>
          No classes showing yet. Add courses with published times to your plan.{' '}
          <button type="button" className="link-btn" onClick={() => go('explore')}>Open the course explorer</button>
        </p>
      )}
    />
    {(personal.length > 0 || hadAppts) && (
      <Appointments events={personal} today={events.today}
        onRemoved={(id) => setEvents((e) => (e ? { ...e, personal: (e.personal ?? []).filter((p) => p.id !== id) } : e))}
        onRestored={load} />
    )}
    </>
  )

  // One click per app. Outlook has two homes: Yale (and most school/work) accounts are Microsoft 365 on
  // outlook.office.com; personal Outlook/Hotmail accounts are on outlook.live.com.
  const apps = [
    { href: links.webcal_url, icon: Smartphone, name: 'Apple Calendar', sub: 'iPhone, iPad and Mac', newTab: false },
    { href: links.google_subscribe, icon: CalendarDays, name: 'Google Calendar', sub: 'Gmail and Android', newTab: true },
    { href: links.outlook_yale_subscribe, icon: Mail, name: 'Outlook: Yale', sub: 'Yale or work Microsoft 365', newTab: true },
    { href: links.outlook_subscribe, icon: Mail, name: 'Outlook.com', sub: 'Personal Outlook or Hotmail', newTab: true },
  ]

  const sync = (
    <div className={`card cal-sync ${justLinked ? 'is-new' : 'mt-lg'}`} id="sync">
      {justLinked && (
        <p className="cal-sync-hello">
          <PartyPopper className="icon sm" />
          <span><b>You’re in.</b> Pick your calendar app and your week stays in sync from now on.
            {savedWeek ? ` We saved ${savedWeek} course${savedWeek > 1 ? 's' : ''} from your try-out week to your plan.` : ''}</span>
        </p>
      )}
      <div className="section-label"><span>Sync to your calendar app</span></div>
      <p className="muted" style={{ maxWidth: 720 }}>
        One click subscribes your calendar to your plan: classes, your cohort core and SOM's deadlines. Change your plan here and your calendar follows.
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

      <div className="cal-sync-grid mt">
        {apps.map((a) => (
          <a key={a.name} className="cal-sync-btn" href={a.href} {...(a.newTab ? { target: '_blank', rel: 'noreferrer' } : {})}>
            <a.icon className="icon" />
            <span><b>{a.name}</b><small>{a.sub}</small></span>
          </a>
        ))}
      </div>
      <div className="row mt cal-sync-more">
        <a className={`btn sm ${links.is_local ? 'primary' : ''}`} href="/api/plan.ics" download="plan-with-dan.ics"><Download className="icon sm" />Download .ics</a>
        <span className="faint small">Any other app, or a one-time import.</span>
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
  )

  return (
    <div>
      {head}
      {justLinked ? <>{sync}<div className="mt-lg">{month}</div></> : <>{month}{sync}</>}
      {confirmUi}
    </div>
  )
}

/* M3: the student's own booked appointments, each with Delete. A deleted row stays in place as "Deleted · Undo",
   so the list (and the page) keeps its length until the next visit. */
function Appointments({ events, today, onRemoved, onRestored }: {
  events: PersonalEvent[]; today: string; onRemoved: (id: number) => void; onRestored: () => Promise<unknown>
}) {
  const { toast } = useApp()
  const [ghosts, setGhosts] = useState<Record<number, { ev: PersonalEvent; action: number | null }>>({})  // deleted rows
  const [busy, setBusy] = useState<number | null>(null)
  const pending = useRef(false)
  const shown = [...events.filter((e) => !(e.id in ghosts)), ...Object.values(ghosts).map((g) => g.ev)]
    .sort((a, b) => a.date.localeCompare(b.date) || a.start_min - b.start_min || a.id - b.id)

  const remove = async (ev: PersonalEvent) => {
    if (pending.current) return
    pending.current = true
    setBusy(ev.id)
    try {
      const r = await api.personalEventRemove(ev.id)
      setGhosts((g) => ({ ...g, [ev.id]: { ev, action: r.action_id ?? null } }))
      onRemoved(ev.id)
      toast(`Deleted ${ev.title}`)
    } catch (e) {
      toast((e as Error).message || 'Could not delete it. Try again.', 'bad')
    } finally {
      pending.current = false
      setBusy(null)
    }
  }
  const undo = async (ev: PersonalEvent) => {
    const actionId = ghosts[ev.id]?.action
    if (pending.current || !actionId) return
    pending.current = true
    setBusy(ev.id)
    try {
      const r = await api.undo(actionId)
      if (!r.ok) throw new Error(r.detail || 'Nothing to undo')
      await onRestored()  // reload first, so the restored row replaces the ghost without the list jumping
      setGhosts((g) => { const n = { ...g }; delete n[ev.id]; return n })
      toast(`Restored ${ev.title}`, 'good')
    } catch (e) {
      toast((e as Error).message, 'bad')
    } finally {
      pending.current = false
      setBusy(null)
    }
  }

  return (
    <div className="card mt-lg cal-appts">
      <div className="section-label"><span>Your appointments</span><span className="faint small">{events.length} saved</span></div>
      <ul className="cal-appt-list">
        {shown.map((ev) => {
          const deleted = ev.id in ghosts
          return (
            <li key={ev.id} className={`${deleted ? 'deleted' : ''} ${ev.date < today ? 'past' : ''}`}>
              <span className="cal-swatch personal" aria-hidden="true" />
              <div className="cal-appt-text">
                <div className="cal-item-title">{ev.title}</div>
                <div className="muted small"><span className="mono">{prettyDate(ev.date)}</span> · {clock(ev.start_min)}–{clock(ev.end_min)}{ev.location ? ` · ${ev.location}` : ''}</div>
              </div>
              {deleted ? (
                <span className="cal-appt-actions">
                  <span className="faint small">Deleted</span>
                  {ghosts[ev.id].action != null && (
                    <button type="button" className="btn sm ghost" disabled={busy === ev.id} onClick={() => undo(ev)} aria-label={`Undo delete of ${ev.title}`}>
                      <RotateCcw className="icon sm" />Undo
                    </button>
                  )}
                </span>
              ) : (
                <button type="button" className="btn sm ghost cal-appt-del" disabled={busy === ev.id} onClick={() => remove(ev)}
                  aria-label={`Delete ${ev.title} on ${prettyDate(ev.date)}`}>
                  <Trash2 className="icon sm" />Delete
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
