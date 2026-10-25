/* The home page's Dates tab: SOM's 2026-27 academic calendar as a month view, with the classes from the
   visitor's week (My plan) on it, so the plan and the calendar are one picture. Nothing is stored. */
import { useEffect, useMemo, useState } from 'react'
import { Download, ExternalLink } from 'lucide-react'
import { api, auctionApplies, type CalendarEvents, type ProgramsInfo } from '../api'
import type { Tryout } from '../lib/tryout'
import { QUARTER_SHORT, quarterDates } from '../lib/format'
import { useApp } from '../state'
import MonthCalendar from './MonthCalendar'

const OWN_CALENDAR = new Set(['EMBA', 'MMS-PEM'])

export default function DatesTab({ t, info }: { t: Tryout; info: ProgramsInfo | null }) {
  const p = info?.programs.find((x) => x.code === t.program)
  const [showClasses, setShowClasses] = useState(true)
  const [classes, setClasses] = useState<CalendarEvents['classes']>([])
  const idsKey = t.ids.join(',')
  // When each quarter's classes run (from the catalog), for the line under the calendar: current and upcoming only.
  const { sections } = useApp()
  const quarters = useMemo(() => {
    const today = info?.today ?? new Date().toISOString().slice(0, 10)
    const fmt = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }
    return Object.entries(quarterDates(sections)).filter(([, q]) => q.ends >= today).sort((a, b) => a[1].starts.localeCompare(b[1].starts))
      .map(([k, q]) => `${QUARTER_SHORT[k] ?? k} ${fmt(q.starts)} – ${fmt(q.ends)}`)
  }, [sections, info?.today])

  useEffect(() => {
    if (!idsKey) { setClasses([]); return }
    let live = true
    const timer = setTimeout(() => {
      api.calendarPreview(idsKey.split(',')).then((r) => { if (live) setClasses(r.classes) }).catch(() => { if (live) setClasses([]) })
    }, 250)
    return () => { live = false; clearTimeout(timer) }
  }, [idsKey])

  const events = useMemo<CalendarEvents | null>(() => info && ({
    today: info.today,
    // the registrar's auction dates go to first-year MBAs only (the email went to the Class of 2028)
    deadlines: [...(info.calendar ?? info.dates ?? []), ...(auctionApplies(t.program, t.year) ? info.auction?.dates ?? [] : [])]
      .sort((a, b) => a.date.localeCompare(b.date)),
    classes: showClasses ? classes : [],
  }), [info, classes, showClasses, t.program, t.year])

  const download = async () => {
    const res = await fetch('/api/ics/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ course_ids: showClasses ? t.ids : [] }) })
    const url = URL.createObjectURL(await res.blob())
    Object.assign(document.createElement('a'), { href: url, download: showClasses && t.ids.length ? 'my-som-calendar.ics' : 'som-key-dates.ics' }).click()
    URL.revokeObjectURL(url)
  }

  if (p && OWN_CALENDAR.has(p.code)) {
    return (
      <div className="card ws-card">
        <p className="muted" style={{ margin: 0 }}>The {p.label} runs on its own calendar ({p.calendar.replace(/^Own calendar:?\s*/i, '')}), which Plan with Dan doesn’t model yet.{' '}
          <a href={p.sources[p.sources.length - 1]} target="_blank" rel="noreferrer">Open the official calendar<ExternalLink className="icon sm" /></a></p>
      </div>
    )
  }
  if (!events) return <div className="card ws-card faint small">Loading the SOM calendar…</div>

  return (
    <div className="dt">
      <MonthCalendar
        events={events}
        legend={['class', 'deadline', 'exam', 'global', 'break']}
        perCell={5}
        upcomingCount={30}
        actions={<button type="button" className="btn sm" onClick={download} aria-label="Add these dates to my calendar (calendar file)"><Download className="icon sm" /><span className="hide-mobile">Add to my calendar</span></button>}
        footer={
          <div className="dt-foot">
            <label className="dt-toggle">
              <input type="checkbox" checked={showClasses} onChange={(e) => setShowClasses(e.target.checked)} />
              Show my classes from Your week{t.ids.length ? ` (${t.ids.length})` : ''}
            </label>
            {quarters.length > 0 && <p className="small dt-quarters" title="Each term has two quarters; half-term courses run in one, full-term courses in both. Dates are the usual first and last class days.">
              <span className="faint">Quarters</span> {quarters.join(' · ')}</p>}
            <p className="faint small">
              {t.ids.length ? 'Classes follow Your week, including holidays and make-up days.' : 'Add courses in Your week and their classes show up here.'}{' '}
              Dates from the 2026–27 SOM academic calendar (MBA, MAM and MMS){auctionApplies(t.program, t.year) ? ', plus the course auction dates from the registrar' : ''}.
            </p>
          </div>
        }
      />
    </div>
  )
}
