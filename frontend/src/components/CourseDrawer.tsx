import { useEffect, useRef, useState } from 'react'
import { api, type BidCourse, type Section } from '../api'
import StarButton from './StarButton'
import { ExternalLink, Gavel, ListChecks, X } from 'lucide-react'
import { enrollLabel, prettyDate } from '../lib/format'
import { displayName } from '../lib/faculty'
import { addDropClosed } from '../lib/eligibility'
import QuarterPill from './QuarterPill'
import NextYearAction from './NextYearAction'
import { useApp } from '../state'
import { Overlay } from './ui'
import { gradedOn } from '../lib/workload'
import '../pages/pages-a.css'
import TaughtWith, { taughtWithLabel } from './TaughtWith'
import { isTrip } from '../lib/courseSearch'

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
  const number = rows[0]?.number ?? ''
  // Past bid outcomes for this course (signed in only): the same pooled numbers as Bidding and Shortlist compare.
  const [bid, setBid] = useState<BidCourse | null | undefined>(undefined)
  useEffect(() => {
    if (!user || !number) return
    let alive = true
    api.bids(number).then((r) => { if (alive) setBid(r.courses.find((x) => x.course_number === number) ?? null) }).catch(() => { if (alive) setBid(null) })
    return () => { alive = false }
  }, [user, number])
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
        <span className="badge gray">{c.units} {c.units === 1 ? "unit" : "units"}</span>
        {c.limit && <span className="badge gray">{c.limit} seats</span>}
        {c.ldr && <span className="badge lilac">Counts for LDR*</span>}
        {c.gsr && <span className="badge sky">Global Studies*</span>}
        <TaughtWith schools={c.taught_with} calendar={c.partner_calendar} />
        {c.topics.map((t) => <span key={t} className="badge gray">{t}</span>)}
      </div>
      {!!c.taught_with?.length && (
        <p className="small tw-note">
          <b>{taughtWithLabel(c.taught_with)}.</b> Cross-listed, so SOM students take it under {c.number}.
          {c.partner_calendar ? ` It follows the ${c.taught_with.length === 1 ? c.taught_with[0] : 'partner school'}’s academic calendar, so its start, end and break dates can differ from SOM’s quarters; check that school’s calendar before you plan around it.` : ' Check with the registrar how its dates line up with SOM’s calendar.'}
        </p>
      )}
      {(c.ldr || c.gsr) && <p className="faint small mt">* Inferred from attribute codes in SOM's public course feed. Confirm on the internal list.</p>}
      {isTrip(c) && <p className="small tw-note">A Global Studies experience: you apply for it on its own timeline, which can close well before the term. Check the window on <a href="#/global">Requirements</a> before planning around it.</p>}

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

      {/* Seats and bidding (student feedback: see bids while comparing) */}
      <h4 className="mt-lg">Seats and bidding</h4>
      <div className="cd-facts">
        <span><b>{c.limit ? `${c.limit} seats` : 'Seats not published'}</b> · {enrol.text}</span>
        {!user ? <span className="faint">Sign in to see past winning bids from classmates.</span>
          : bid === undefined ? <span className="skeleton cd-skel" aria-hidden="true" />
          : !bid || !bid.reports ? <span className="faint">No bid reports yet for {c.number}. <button type="button" className="link-btn small" onClick={() => go('bids')}>Report yours on Bidding</button></span>
          : bid.too_few ? <span className="faint">{bid.reports} classmate report{bid.reports === 1 ? '' : 's'} so far; numbers show once five students report.</span>
          : <span>{bid.sample_only ? <span className="badge gray">Sample</span> : null} Median winning bid <b>{bid.median_winning_bid ?? '—'}</b> pts{bid.highest_losing_bid != null ? ` · highest losing ${bid.highest_losing_bid}` : ''} · {bid.reports} report{bid.reports === 1 ? '' : 's'} <button type="button" className="link-btn small" onClick={() => go('bids')}><Gavel className="icon xs" /> Bidding</button></span>}
      </div>

      {/* What it's graded on, from the description (student feedback: workload, exam vs project) */}
      <h4 className="mt">How it’s graded</h4>
      {(() => {
        const graded = gradedOn(`${c.description} ${c.prerequisite}`, rows.some((r) => !!r.exam))
        return graded.length ? (
          <div className="cd-facts">
            <span className="row" style={{ gap: 6 }}><ListChecks className="icon sm faint" aria-hidden="true" />{graded.map((g) => <span key={g} className="badge gray">{g}</span>)}</span>
            <span className="faint small">Mentioned in the course description or exam schedule; the syllabus has the weights.</span>
          </div>
        ) : <p className="faint small" style={{ margin: 0 }}>The description doesn’t say. The syllabus (below) or the instructor will.</p>
      })()}

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
        {/* Official evaluations are behind Yale login, so we link rather than copy (student feedback: peer feedback) */}
        <a className="btn sm" href="https://som.yale.edu/myportal/courses/course-evaluations" target="_blank" rel="noreferrer"
          title="SOM's course evaluations (Yale login)">Course evaluations<ExternalLink className="icon xs" aria-hidden="true" /></a>
        {c.emails[0] && <a className="btn sm" href={`mailto:${c.emails[0]}`}>Email instructor</a>}
      </div>
    </Overlay>
  )
}
