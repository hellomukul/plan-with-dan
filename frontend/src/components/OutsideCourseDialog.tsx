/* "Add a course from outside SOM": school, number, title, units, term, days and time. It joins the term, the timetable
   and the clash check; its units show apart from SOM's totals (how they count is the registrar's call). Used from My
   plan, and prefilled from a course at another Yale school in the Course explorer or Course picks. */
import { useState } from 'react'
import { X } from 'lucide-react'
import { api } from '../api'
import { useApp } from '../state'
import { Overlay } from './ui'
import '../pages/plan-years.css'

const DAY_OPTS = ['M', 'T', 'W', 'Th', 'F'] as const
const SCHOOLS = ['Graduate School (GSAS)', 'Yale College', 'Law School', 'Jackson School of Global Affairs', 'School of the Environment', 'School of Public Health', 'School of Engineering', 'Divinity School', 'Other']
const toMin = (t: string) => (t ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) : null)

/** "Add a course from outside SOM": school, number, title, units, term, days and time. It joins the term, the
    timetable and the clash check; how its units count toward the MBA is the registrar's call, and we say so. */
export default function OutsideCourseDialog({ terms, termName, onClose, initial }: {
  terms: string[]; termName: (t: string) => string; onClose: () => void
  /** prefill from a Yale course picked in the explorer or Course picks */
  initial?: Partial<{ school: string; number: string; title: string; units: string; term: string }>
}) {
  const { refreshPlan, toast } = useApp()
  const [f, setF] = useState({ school: 'Graduate School (GSAS)', number: '', title: '', units: '4', term: terms.find((t) => t === '202701') ?? terms[0] ?? '', days: [] as string[], start: '', end: '', ...initial })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (f.title.trim().length < 2) { setError('Add the course title.'); return }
    if (!!f.start !== !!f.end || (f.start && f.end <= f.start)) { setError('Give both a start and an end time, with the end after the start.'); return }
    if ((f.start || f.end) && !f.days.length) { setError('Pick the days it meets.'); return }
    setSaving(true)
    try {
      const r = await api.addOutside({ school: f.school, number: f.number.trim(), title: f.title.trim(), units: Number(f.units) || 0, term: f.term,
        days: f.days, start_min: toMin(f.start), end_min: toMin(f.end) })
      await refreshPlan()
      toast(r.clashes.length ? `Added, but it clashes with ${r.clashes.map((c) => (c.a_id === r.course.section.id ? c.b : c.a)).join(', ')}` : `Added ${r.course.number || r.course.title} to ${termName(f.term)}`,
        r.clashes.length ? 'bad' : 'good')
      onClose()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }
  return (
        <Overlay onClose={onClose} center>
          <form className="py-out-form" onSubmit={(e) => void save(e)}>
            <div className="row between"><h3 style={{ margin: 0 }}>Add a course from outside SOM</h3>
              <button type="button" className="btn icon ghost" aria-label="Close" onClick={onClose}><X className="icon" /></button></div>
            <p className="muted small" style={{ margin: 0 }}>For a class at another Yale school. It joins your term, your timetable and the clash check. Its units show apart from SOM’s totals: ask the registrar how they count toward your degree.</p>
            <div className="py-out-grid">
              <label className="field">School
                <select value={f.school} onChange={(e) => setF({ ...f, school: e.target.value })}>{SCHOOLS.map((x) => <option key={x}>{x}</option>)}</select>
              </label>
              <label className="field">Course number (optional)
                <input value={f.number} maxLength={16} placeholder="e.g. ENGL 3450" onChange={(e) => setF({ ...f, number: e.target.value })} />
              </label>
            </div>
            <label className="field">Title
              <input value={f.title} maxLength={120} required placeholder="e.g. Shakespeare: Comedies and Romances" onChange={(e) => setF({ ...f, title: e.target.value })} />
            </label>
            <div className="py-out-grid">
              <label className="field">Term
                <select value={f.term} onChange={(e) => setF({ ...f, term: e.target.value })}>{terms.map((t) => <option key={t} value={t}>{termName(t)}</option>)}</select>
              </label>
              <label className="field">Units
                <input type="number" min={0} max={8} step={0.5} value={f.units} onChange={(e) => setF({ ...f, units: e.target.value })} />
              </label>
            </div>
            <fieldset className="py-out-days"><legend className="small muted">Days (optional)</legend>
              {DAY_OPTS.map((d) => (
                <button key={d} type="button" className={`chip ${f.days.includes(d) ? 'on' : ''}`} aria-pressed={f.days.includes(d)}
                  onClick={() => setF({ ...f, days: f.days.includes(d) ? f.days.filter((x) => x !== d) : [...f.days, d] })}>{d}</button>
              ))}
            </fieldset>
            <div className="py-out-grid">
              <label className="field">Starts<input type="time" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></label>
              <label className="field">Ends<input type="time" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></label>
            </div>
            <p className="small error-text py-out-err" role={error ? 'alert' : undefined}>{error || '\u00a0'}</p>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn primary" disabled={saving} aria-busy={saving}>{saving ? 'Adding…' : 'Add to my plan'}</button>
            </div>
          </form>
        </Overlay>
  )
}
