/* "Booked one? Add it to my calendar."
   Signed in: saves a personal event (it appears on the Calendar page and in the subscribed .ics feed) and warns,
   without blocking, if it overlaps a class. Signed out: downloads a one-off .ics file built right here in the
   browser; nothing is sent to the server. */
import { useRef, useState, type FormEvent } from 'react'
import { AlertTriangle, CalendarPlus, X } from 'lucide-react'
import { api } from '../api'
import { Overlay } from './ui'
import { useApp } from '../state'

const pad = (n: number) => String(n).padStart(2, '0')
const toIcsUtc = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/[,;]/g, (m) => `\\${m}`).replace(/\r?\n/g, '\\n')
const utf8 = new TextEncoder()
/** RFC 5545 §3.1: lines longer than 75 octets are folded (CRLF + one space), never inside a multi-byte character. */
function foldIcsLine(line: string): string {
  const out: string[] = []
  let cur = ''
  let octets = 0
  for (const ch of line) {
    const n = utf8.encode(ch).length
    if (octets + n > 75) { out.push(cur); cur = ' '; octets = 1 }
    cur += ch
    octets += n
  }
  out.push(cur)
  return out.join('\r\n')
}
/** Today in the student's own time zone (toISOString would give tomorrow's date after 8 PM in New Haven). */
const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }

function downloadIcs(title: string, date: string, start: string, end: string, location: string, note: string) {
  const s = new Date(`${date}T${start}`)  // the student's own clock (New Haven for nearly everyone)
  const e = new Date(`${date}T${end}`)
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Plan with Dan//Get help//EN', 'BEGIN:VEVENT',
    `UID:${crypto.randomUUID()}@planwithdan`, `DTSTAMP:${toIcsUtc(new Date())}`,
    `DTSTART:${toIcsUtc(s)}`, `DTEND:${toIcsUtc(e)}`, `SUMMARY:${esc(title)}`,
    ...(location ? [`LOCATION:${esc(location)}`] : []), ...(note ? [`DESCRIPTION:${esc(note)}`] : []),
    'END:VEVENT', 'END:VCALENDAR',
  ]
  const url = URL.createObjectURL(new Blob([lines.map(foldIcsLine).join('\r\n') + '\r\n'], { type: 'text/calendar' }))
  Object.assign(document.createElement('a'), { href: url, download: 'appointment.ics' }).click()
  URL.revokeObjectURL(url)
}

export default function BookedForm({ defaultTitle, onClose }: { defaultTitle: string; onClose: () => void }) {
  const { user, toast } = useApp()
  const [title, setTitle] = useState(defaultTitle)
  const [date, setDate] = useState(localToday)
  const [start, setStart] = useState('11:30')
  const [end, setEnd] = useState('12:00')
  const [location, setLocation] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [clashes, setClashes] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const pending = useRef(false)  // set synchronously, so a double-click can't send two saves before React re-renders

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (pending.current || saved) return
    setError('')
    if (!title.trim()) { setError('Give it a short title.'); return }
    if (end <= start) { setError('The end time needs to be after the start time.'); return }
    if (!user) { pending.current = true; downloadIcs(title.trim(), date, start, end, location.trim(), note.trim()); toast('Calendar file downloaded', 'good'); onClose(); return }
    pending.current = true
    setBusy(true)
    try {
      const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
      const r = await api.personalEventAdd({ title: title.trim(), date, start_min: toMin(start), end_min: toMin(end), location: location.trim(), note: note.trim() })
      setSaved(true)
      if (r.clashes.length) setClashes(r.clashes)
      else { toast('Added to your calendar', 'good'); onClose() }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      pending.current = false
      setBusy(false)
    }
  }

  return (
    <Overlay center onClose={onClose}>
      <form className="hg-form" onSubmit={submit} aria-label="Add a booked appointment to my calendar">
        <div className="hg-form-head">
          <h3 style={{ margin: 0 }}>Add it to my calendar</h3>
          <button type="button" className="btn icon ghost" aria-label="Close" onClick={onClose}><X className="icon" /></button>
        </div>
        <p className="muted small" style={{ margin: 0 }}>
          {user ? 'It shows on your Calendar page and in your subscribed calendar, so Dan can work around it.'
            : 'You’ll get a calendar file for this one appointment. Nothing is saved on our side.'}
        </p>
        <label className="field">Title<input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required /></label>
        <div className="hg-form-row">
          <label className="field">Date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></label>
          <label className="field">Starts<input type="time" value={start} onChange={(e) => setStart(e.target.value)} required /></label>
          <label className="field">Ends<input type="time" value={end} onChange={(e) => setEnd(e.target.value)} required /></label>
        </div>
        <label className="field">Location or link (optional)<input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={200} placeholder="e.g. Evans Hall 2400, or a Zoom link" /></label>
        <label className="field">Note (optional)<input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} /></label>
        {error && <div className="error-text" role="alert">{error}</div>}
        {clashes.length > 0 && (
          <div className="hg-warn" role="status">
            <AlertTriangle className="icon sm" />
            <span>Saved, but it overlaps {clashes.join(', ')}. You may want to pick another time.</span>
          </div>
        )}
        {saved && clashes.length > 0
          ? <button type="button" className="btn primary" onClick={onClose}>Done</button>
          : <button className="btn primary" disabled={busy}><CalendarPlus className="icon sm" />{user ? (busy ? 'Saving…' : 'Add to my calendar') : 'Download calendar file'}</button>}
      </form>
    </Overlay>
  )
}
