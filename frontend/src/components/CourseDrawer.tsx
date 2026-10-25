import type { Section } from '../api'
import { X } from 'lucide-react'
import { enrollLabel } from '../lib/format'
import { useApp } from '../state'
import { Overlay } from './ui'

/** Full details for one offering (all its sections) with add-to-plan per section. */
export default function CourseDrawer({ courseKey, onClose }: { courseKey: string; onClose: () => void }) {
  const { sections, addCourse, plannedIds, user, go } = useApp()
  const rows = sections.filter((s) => s.key === courseKey).sort((a, b) => a.section.localeCompare(b.section))
  if (!rows.length) return null
  const c: Section = rows[0]
  const enrol = enrollLabel(c.enrollment)
  return (
    <Overlay onClose={onClose}>
      <div className="row between top">
        <div>
          <div className="course-num">{c.number} · {c.term_name} · {c.session_name}</div>
          <h2 style={{ marginTop: 4 }}>{c.title}</h2>
        </div>
        <button className="btn icon ghost" onClick={onClose} aria-label="Close"><X className="icon" /></button>
      </div>
      <div className="row" style={{ gap: 6 }}>
        <span className={`badge ${enrol.tone}`}>{enrol.text}</span>
        <span className="badge gray">{c.units} units</span>
        {c.limit && <span className="badge gray">{c.limit} seats</span>}
        {c.ldr && <span className="badge lilac">Counts for LDR*</span>}
        {c.gsr && <span className="badge sky">Global Studies*</span>}
        {c.topics.map((t) => <span key={t} className="badge gray">{t}</span>)}
      </div>
      {(c.ldr || c.gsr) && <p className="faint small mt">* Inferred from attribute codes in SOM's public course feed. Confirm on the internal list.</p>}

      <h4 className="mt">Sections</h4>
      <div className="stack">
        {rows.map((s) => (
          <div key={s.id} className="card flat" style={{ padding: 14 }}>
            <div className="row between">
              <div>
                <b>Section {s.section}</b> <span className="muted">· {s.time}</span>
                <div className="small muted">{s.room || 'Room TBA'} · {s.faculty.join(', ') || 'Instructor TBA'}</div>
                {s.starts && <div className="small faint">{s.starts} → {s.ends}</div>}
                {s.exam && <div className="small faint">Final exam: {s.exam}</div>}
              </div>
              {user ? (
                plannedIds.has(s.id)
                  ? <span className="badge green">In plan</span>
                  : <button className="btn sm primary" onClick={() => addCourse(s.id)}>Add</button>
              ) : (
                <button className="btn sm" onClick={() => go('home')}>Sign in to add</button>
              )}
            </div>
          </div>
        ))}
      </div>

      <h4 className="mt-lg">What it covers</h4>
      <p className="muted" style={{ whiteSpace: 'pre-line' }}>{c.description || 'No description published yet.'}</p>
      {c.prerequisite && <p><b>Prerequisite:</b> <span className="muted">{c.prerequisite}</span></p>}
      {c.bio && (
        <>
          <h4 className="mt">About the instructor</h4>
          <p className="muted small">{c.bio}</p>
        </>
      )}
      <div className="row mt">
        {c.syllabus && <a className="btn sm" href={c.syllabus} target="_blank" rel="noreferrer">Syllabus ↗</a>}
        {c.emails[0] && <a className="btn sm" href={`mailto:${c.emails[0]}`}>Email instructor</a>}
      </div>
    </Overlay>
  )
}
