/* Courses at other Yale schools that SOM students can take (Graduate School, Jackson, Environment, Public Health),
   from the public Yale Bulletin. Kept visibly apart from SOM's own courses: a violet "<School> · <department>" label
   everywhere, the SOM rules for taking them, and "Add to my plan" adds them as an outside course (term, timetable
   once you add times, clash checks; units apart from SOM's totals). */
import { useEffect, useMemo, useState } from 'react'
import { ExternalLink, GraduationCap, Plus, Search } from 'lucide-react'
import { api, type YaleCourse, type YaleCoursesResponse } from '../api'
import { useApp } from '../state'
import OutsideCourseDialog from './OutsideCourseDialog'
import { termName as baseTermName } from '../lib/format'
import './yale-courses.css'

const SHORT: Record<string, string> = {
  'Graduate School (GSAS)': 'Graduate School', 'Jackson School of Global Affairs': 'Jackson School', 'School of the Environment': 'School of the Environment',
  'School of Public Health': 'School of Public Health',
}
const sameAsSchool = (dept: string) => ['Environment', 'Global Affairs'].includes(dept)

/** The one label for a non-SOM course, used in the explorer, Course picks and anywhere else it shows. */
export function YaleBadge({ c }: { c: Pick<YaleCourse, 'school' | 'dept'> }) {
  return <span className="badge yc-badge" title={`${c.school} · ${c.dept}. Not an SOM course: you need the instructor's permission.`}><GraduationCap className="icon xs" aria-hidden="true" />{SHORT[c.school] ?? c.school}{sameAsSchool(c.dept) ? '' : ` · ${c.dept}`}</span>
}

/** "Add to my plan" for a non-SOM course: the outside-course form, prefilled. */
export function AddYaleCourse({ c, label = 'Add to my plan' }: { c: Pick<YaleCourse, 'school' | 'number' | 'title' | 'terms'>; label?: string }) {
  const { plan } = useApp()
  const [open, setOpen] = useState(false)
  const terms = (plan?.planning_terms ?? []).map((t) => t.code)
  const season = (t: string) => (t.endsWith('03') ? 'fall' : 'spring')
  const offered = new Set(c.terms.map(season))
  const allowed = terms.filter((t) => offered.has(season(t)))  // same season this year, or next year (expected)
  if (!allowed.length) return null
  return (
    <>
      <button type="button" className="btn sm" onClick={() => setOpen(true)}><Plus className="icon sm" aria-hidden="true" />{label}</button>
      {open && <OutsideCourseDialog terms={allowed} termName={baseTermName} onClose={() => setOpen(false)}
        initial={{ school: c.school, number: c.number, title: c.title, units: '4', term: allowed.find((t) => c.terms.includes(t)) ?? allowed[0] }} />}
    </>
  )
}

export default function YaleCourses() {
  const [q, setQ] = useState('')
  const [school, setSchool] = useState('')
  const [term, setTerm] = useState('')
  const [data, setData] = useState<YaleCoursesResponse | null>(null)
  const [open, setOpen] = useState<YaleCourse | null>(null)
  useEffect(() => {
    const t = window.setTimeout(() => { api.yaleCourses(q, school, term).then(setData).catch(() => setData(null)) }, 180)
    return () => window.clearTimeout(t)
  }, [q, school, term])
  const selected = useMemo(() => open ?? data?.courses[0] ?? null, [open, data])
  if (data && !data.count) return <div className="card"><p className="muted" style={{ margin: 0 }}>Courses at other Yale schools aren’t loaded yet.</p></div>
  return (
    <section className="yc" aria-label="Courses at other Yale schools">
      <div className="card yc-rules">
        <b>Open to SOM students, with the instructor’s permission.</b>{' '}
        <span className="muted">You follow that school’s enrollment steps, deadlines and calendar. Graduate-school courses typically count as 4 SOM units; the registrar decides. Yale College credit needs the dean of students’ approval first.</span>{' '}
        {data?.rules_source && <a href={data.rules_source} target="_blank" rel="noreferrer" className="small">SOM course policies<ExternalLink className="icon xs" aria-hidden="true" /></a>}
      </div>
      <div className="card yc-tools">
        <label className="yc-search"><Search className="icon sm" aria-hidden="true" /><span className="sr-only">Search courses at other Yale schools</span>
          <input value={q} onChange={(e) => { setQ(e.target.value); setOpen(null) }} placeholder="Try “Shakespeare”, “climate policy”, “ENGL 5709” or an instructor" /></label>
        <div className="row yc-filters">
          <div className="tabs" role="group" aria-label="Term">
            {[['', 'Both terms'], ['202701', 'Spring 2027'], ['202603', 'Fall 2026']].map(([v, l]) => (
              <button key={v} type="button" className={term === v ? 'on' : ''} aria-pressed={term === v} onClick={() => { setTerm(v); setOpen(null) }}>{l}</button>
            ))}
          </div>
          <select value={school} onChange={(e) => { setSchool(e.target.value); setOpen(null) }} aria-label="School" className="yc-school">
            <option value="">All schools{data ? ` (${data.count})` : ''}</option>
            {data?.schools.map((s) => <option key={s.name} value={s.name}>{s.name} ({s.count})</option>)}
          </select>
        </div>
      </div>
      <div className="yc-body">
        <ul className="card yc-list" aria-label="Courses">
          {!data ? <li className="faint small">Loading…</li> : !data.courses.length ? <li className="faint small">No courses match. Try other words.</li> : data.courses.map((c) => (
            <li key={c.id}>
              <button type="button" className={`yc-row${selected?.id === c.id ? ' on' : ''}`} onClick={() => setOpen(c)}>
                <span className="yc-row-top"><span className="mono">{c.number}</span><span className="yc-title">{c.title}</span></span>
                <span className="yc-row-meta"><YaleBadge c={c} /><span className="faint small">{c.term_names.join(' · ')}{c.instructor ? ` · ${c.instructor}` : ''}</span></span>
              </button>
            </li>
          ))}
        </ul>
        {selected && (
          <article className="card yc-detail" aria-label={`${selected.number} ${selected.title}`}>
            <span className="mono faint">{selected.number}{selected.also.length ? ` · also ${selected.also.join(', ')}` : ''}</span>
            <h3>{selected.title}</h3>
            <div className="row" style={{ gap: 6 }}><YaleBadge c={selected} />{selected.term_names.map((t) => <span key={t} className="badge gray">{t}</span>)}</div>
            {selected.instructor && <p className="small muted" style={{ margin: 0 }}>Taught by {selected.instructor}</p>}
            <p className="yc-desc">{selected.description || 'No description in the Bulletin.'}</p>
            <p className="faint small" style={{ margin: 0 }}>Times and rooms aren’t in the Bulletin: find them on Yale Course Search, then add them to your plan so clash checks include them.</p>
            <div className="row">
              <AddYaleCourse c={selected} />
              <a className="btn sm ghost" href={selected.source} target="_blank" rel="noreferrer">Yale Bulletin<ExternalLink className="icon xs" aria-hidden="true" /></a>
              <a className="btn sm ghost" href="https://courses.yale.edu/" target="_blank" rel="noreferrer">Yale Course Search<ExternalLink className="icon xs" aria-hidden="true" /></a>
            </div>
          </article>
        )}
      </div>
      {data?.fetched && <p className="faint small" style={{ marginTop: 8 }}>From the public Yale Bulletin 2026–27, read {data.fetched}. Graduate School, Jackson School, School of the Environment and School of Public Health.</p>}
    </section>
  )
}
