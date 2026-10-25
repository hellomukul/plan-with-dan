import { useRef, useState } from 'react'
import type { Section } from '../api'
import StarButton from './StarButton'
import { X } from 'lucide-react'
import { enrollLabel, prettyDate } from '../lib/format'
import { displayName } from '../lib/faculty'
import { addDropClosed } from '../lib/eligibility'
import QuarterPill from './QuarterPill'
import NextYearAction from './NextYearAction'
import { useApp } from '../state'
import { Overlay } from './ui'
import '../pages/pages-a.css'

/** Full details for one offering (all its sections) with add-to-plan per section. */
export default function CourseDrawer({ courseKey, onClose }: { courseKey: string; onClose: () => void }) {
  const { sections, addCourse, plannedIds, user, go, profile } = useApp()
  // One add at a time: a double-click (or a second section's Add) waits for the first request to finish.
  const pending = useRef(false)
  const [adding, setAdding] = useState<string | null>(null)
  const add = async (id: string) => {
    if (pending.current) return
    pending.current = true
    setAdding(id)
    try { await addCourse(id) } finally { pending.current = false; setAdding(null) }
  }
  const rows = sections.filter((s) => s.key === courseKey).sort((a, b) => a.section.localeCompare(b.section))
  if (!rows.length) return null
  const c: Section = rows[0]
  const enrol = enrollLabel(c.enrollment)
  const d = new Date()
  const todayIso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  // First-year MBA core is assigned by cohort and never added by hand: mark the student's own section instead.
  const assignedCore = c.core && profile?.program === 'MBA' && profile?.year === '1'
  const mine = (s: Section) => assignedCore && !!profile?.cohort && s.cohort === profile.cohort
  const names = (s: Section) => s.faculty.map(displayName).join(', ') || 'Instructor TBA'
  return (
    <Overlay onClose={onClose}>
      <div className="row between top">
        <div>
          <div className="cx-card-kicker"><span className="course-num">{c.number}</span><QuarterPill session={c.session} term={c.term} year /></div>
          <h2 style={{ marginTop: 4 }}>{c.title}</h2>
        </div>
        <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
          <StarButton courseKey={c.key} title={c.number} label />
          <button className="btn icon ghost" onClick={onClose} aria-label="Close"><X className="icon" /></button>
        </div>
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

      {user && profile && <div className="cd-nx mt"><NextYearAction secs={rows} program={profile.program || 'MBA'} /></div>}

      <h4 className="mt">Sections</h4>
      {user && assignedCore && (
        <p className="muted small" style={{ marginTop: 0 }}>
          Core: SOM assigns your section by cohort, so there's nothing to add.{profile?.cohort ? '' : ' Set your cohort in your profile to see which section is yours.'}
        </p>
      )}
      <div className="stack">
        {rows.map((s) => (
          <div key={s.id} className="card flat cd-section" style={{ padding: 14 }}>
            <div className="row between">
              <div>
                <b>Section {s.section}</b> <QuarterPill session={s.session} term={s.term} /> <span className="muted cx-sec-time">{s.time}</span>
                <div className="small muted">{s.room || 'Room TBA'} · {names(s)}</div>
                {s.starts && <div className="small faint">{prettyDate(s.starts)}{s.ends ? ` – ${prettyDate(s.ends)}` : ''}</div>}
                {s.exam && <div className="small faint">Final exam: {s.exam}</div>}
              </div>
              {user ? (
                mine(s) ? <span className="badge green">Your section · core</span>
                : assignedCore ? null
                : s.ends && s.ends < todayIso ? <span className="faint small">Ended</span>
                : plannedIds.has(s.id)
                  ? <span className="badge green">In plan</span>
                  : addDropClosed(s) ? <span className="faint small" title="It's in session and add/drop has closed">In session · add/drop closed</span>
                  : <button className="btn sm primary" onClick={() => add(s.id)} disabled={adding != null} aria-busy={adding === s.id || undefined}>Add</button>
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
