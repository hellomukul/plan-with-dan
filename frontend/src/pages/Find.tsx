import { useEffect, useRef, useState } from 'react'
import { api, type RecPick, type RecResult } from '../api'
import AgentTrace from '../components/AgentTrace'
import CourseDrawer from '../components/CourseDrawer'
import { CostChip, Empty } from '../components/ui'
import { AlertTriangle, Check, Clock, ShieldCheck, Target } from 'lucide-react'
import { enrollLabel } from '../lib/format'
import { useApp } from '../state'

const STAGES = [
  { key: 'retrieve', label: 'Retriever', kind: 'code', hint: 'filters 100+ courses to a shortlist' },
  { key: 'Curator', label: 'Curator', kind: 'ai', hint: 'picks for your goals' },
  { key: 'validate', label: 'Validator', kind: 'code', hint: 'drops anything invented' },
  { key: 'assemble', label: 'Scheduler', kind: 'code', hint: 'clash-free sections + backups' },
  { key: 'Critic', label: 'Critic', kind: 'ai', hint: 'honest second opinion' },
]
const GOAL_BADGE: Record<string, string> = { 'short-term': 'pink', 'long-term': 'lilac', interest: 'sky' }
const PRIORITY: Record<number, string> = { 1: 'Must-have', 2: 'Strong pick', 3: 'Nice to have' }

function PickCard({ pick, onOpen }: { pick: RecPick; onOpen: (key: string) => void }) {
  const { addCourse, plannedIds, sectionById } = useApp()
  const inPlan = plannedIds.has(pick.section_id)
  const enrol = enrollLabel(pick.enrollment)
  return (
    <article className={`card ${pick.priority === 1 ? 'glow' : ''} stack`} style={{ gap: 10 }}>
      <div className="row between top">
        <div>
          <div className="course-num">{pick.number} · §{pick.section} · {pick.session}</div>
          <button className="link-btn course-title" style={{ color: 'var(--text)', textAlign: 'left' }} onClick={() => onOpen(pick.key)}>{pick.title}</button>
        </div>
        <span className={`badge ${pick.priority === 1 ? 'pink' : pick.priority === 2 ? 'lilac' : 'gray'}`}>{PRIORITY[pick.priority]}</span>
      </div>
      <div className="row" style={{ gap: 6 }}>
        <span className={`badge ${GOAL_BADGE[pick.goal]}`}><Target className="icon sm" />{pick.goal}</span>
        <span className={`badge ${enrol.tone}`}>{enrol.text}</span>
        {pick.ldr && <span className="badge lilac">LDR</span>}
        {pick.gsr && <span className="badge sky">Global</span>}
        {pick.topics.slice(0, 2).map((t) => <span key={t} className="badge gray">{t}</span>)}
      </div>
      <p style={{ margin: 0 }}><b>Why:</b> {pick.why}</p>
      {pick.evidence ? (
        <p className="small muted" style={{ margin: 0, borderLeft: '3px solid var(--lime)', paddingLeft: 10 }}>
          From the course description: “{pick.evidence}”
        </p>
      ) : pick.evidence_note ? <p className="small faint" style={{ margin: 0 }}>{pick.evidence_note}</p> : null}
      <div className="meta">
        <span><Clock className="icon sm" />{pick.time}</span><span>{pick.units} units</span>{pick.seats && <span>{pick.seats} seats</span>}
      </div>
      {pick.fits ? (
        <span className="badge green" style={{ alignSelf: 'flex-start' }}><Check className="icon sm" />Fits your timetable</span>
      ) : (
        <span className="badge red" style={{ alignSelf: 'flex-start' }}><AlertTriangle className="icon sm" />Clashes with {pick.clash_with?.join(', ') || 'your plan'}</span>
      )}
      <div className="row between">
        {inPlan ? <span className="badge green"><Check className="icon sm" />In your plan</span> : (
          <button className="btn sm" onClick={() => addCourse(pick.section_id, 'dan')}>Add to plan</button>
        )}
        <button className="btn sm ghost" onClick={() => onOpen(pick.key)}>Details</button>
      </div>
      {pick.alternates.length > 0 && (
        <div className="stack tight">
          <span className="faint small">Backups if you don’t win a seat:</span>
          {pick.alternates.map((a) => (
            <div key={a.key} className="row between small" style={{ background: 'var(--bg-2)', padding: '6px 10px', borderRadius: 10, flexWrap: 'nowrap' }}>
              <span style={{ minWidth: 0 }}><b>{a.number}</b> {a.title} <span className="faint">· {a.time}</span></span>
              {plannedIds.has(a.section_id) ? <span className="badge green"><Check className="icon sm" /></span> :
                <button className="btn sm ghost" onClick={() => addCourse(a.section_id)} disabled={!sectionById.has(a.section_id)}>+</button>}
            </div>
          ))}
        </div>
      )}
    </article>
  )
}

export default function Find() {
  const { profile, go, addCourse, plannedIds, toast } = useApp()
  const [term, setTerm] = useState('202701')
  const [result, setResult] = useState<RecResult | null>(null)
  const [running, setRunning] = useState(false)
  const [stage, setStage] = useState(-1)
  const [open, setOpen] = useState<string | null>(null)
  const [showTrace, setShowTrace] = useState(false)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    api.latestRecommendation().then((r) => r.result && setResult(r.result)).catch(() => undefined)
    return () => { if (timer.current) window.clearInterval(timer.current) }
  }, [])

  const run = async () => {
    setRunning(true)
    setStage(0)
    timer.current = window.setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length - 1)), 2600)
    try {
      setResult(await api.recommend(term))
    } catch (e) {
      toast((e as Error).message, 'bad')
    } finally {
      if (timer.current) window.clearInterval(timer.current)
      setRunning(false)
      setStage(-1)
    }
  }

  const addAllFitting = async () => {
    for (const p of result?.picks ?? []) {
      if (p.fits && !plannedIds.has(p.section_id)) await addCourse(p.section_id, 'dan')
    }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Find my courses</h1>
          <p>Dan’s crew reads your goals, scans every real {term === '202701' ? 'Spring 2027' : 'Fall 2026'} course, and builds a shortlist that fits your week.</p>
        </div>
      </div>

      <div className="card stack">
        <div className="row between">
          <div className="stack tight">
            <span className="faint small">Planning for</span>
            <div className="row" style={{ gap: 6 }}>
              <span className="chip static">{profile?.program} {profile?.year ? `Y${profile.year}` : ''}</span>
              {(profile?.interests ?? []).slice(0, 4).map((i) => <span key={i} className="chip static">{i}</span>)}
            </div>
            {(profile?.goal_short || profile?.goal_long) && (
              <span className="muted small">Goal: {profile?.goal_short}{profile?.goal_short && profile?.goal_long ? ' → ' : ''}{profile?.goal_long}</span>
            )}
          </div>
          <div className="row">
            <button className="btn sm ghost" onClick={() => go('profile')}>Edit answers</button>
            <div className="tabs">
              <button className={term === '202701' ? 'on' : ''} onClick={() => setTerm('202701')}>Spring 2027</button>
              <button className={term === '202603' ? 'on' : ''} onClick={() => setTerm('202603')}>Fall 2026</button>
            </div>
            <button className="btn primary lg" onClick={run} disabled={running}>{running ? 'Crew at work…' : result ? 'Run again' : 'Run Dan’s crew'}</button>
          </div>
        </div>
        <div className="pipeline">
          {STAGES.map((s, i) => (
            <span key={s.key} className="row" style={{ gap: 6 }}>
              <span className={`pipe-node ${s.kind} ${running && i === stage ? 'running' : ''} ${running && i < stage ? 'done' : ''}`} title={s.hint}>{s.label}</span>
              {i < STAGES.length - 1 && <span className="pipe-arrow">→</span>}
            </span>
          ))}
        </div>
        {running && <p className="muted small" style={{ margin: 0 }}>{STAGES[stage]?.label}: {STAGES[stage]?.hint}…</p>}
      </div>

      {!result && !running && (
        <Empty title="No shortlist yet">
          <p>Hit <b>Run Dan’s crew</b>. It takes about 15 seconds and costs less than a cent.</p>
        </Empty>
      )}

      {result && (
        <>
          <div className="card mt stack">
            <div className="row between">
              <h3 style={{ margin: 0 }}>Your {result.term_name} shortlist</h3>
              <CostChip usage={result.usage} />
            </div>
            <div className="brief" style={{ margin: 0 }}>{result.summary}</div>
            {result.schedule && (
              <div className="row" style={{ gap: 8 }}>
                <span className="badge pink">+{result.schedule.units_added} units fit</span>
                <span className="badge gray">{result.schedule.units_term_total} units this term with your plan</span>
                <span className={`badge ${result.schedule.has_ldr ? 'green' : 'gray'}`}>{result.schedule.has_ldr ? 'Includes LDR' : 'No LDR course'}</span>
                <span className={`badge ${result.schedule.has_gsr ? 'green' : 'gray'}`}>{result.schedule.has_gsr ? 'Includes Global' : 'No Global course'}</span>
                <span className="badge sky">On campus: {result.schedule.days_on_campus.join(' ') || '—'}</span>
              </div>
            )}
            <div className="row">
              <button className="btn" onClick={addAllFitting}>Add all that fit</button>
              <button className="btn ghost sm" onClick={() => setShowTrace((v) => !v)}>{showTrace ? 'Hide' : 'Show'} how the crew decided</button>
            </div>
            {showTrace && <div className="card flat"><AgentTrace steps={result.trace} compact /></div>}
            {result.dropped.length > 0 && (
              <p className="small" style={{ color: 'var(--amber)', margin: 0 }}>
                The validator removed {result.dropped.length} pick{result.dropped.length > 1 ? 's' : ''} that weren’t real catalog courses.
              </p>
            )}
          </div>

          <div className="grid auto mt">
            {result.picks.map((p) => <PickCard key={p.key} pick={p} onOpen={setOpen} />)}
          </div>

          {result.critique && (
            <div className="card mt">
              <div className="card-title"><ShieldCheck className="icon" />The Critic says</div>
              <p>{result.critique.verdict}</p>
              <ul className="muted" style={{ margin: 0, paddingLeft: 20 }}>
                {result.critique.watch_outs.map((w) => <li key={w}>{w}</li>)}
              </ul>
            </div>
          )}
          {result.schedule && result.schedule.notes.length > 0 && (
            <div className="card mt">
              <div className="card-title"><Clock className="icon" />Week check</div>
              <div className="stack tight">
                {result.schedule.notes.map((n) => (
                  <span key={n.text} className={`badge ${n.kind === 'good' ? 'lime' : n.kind === 'warn' ? 'amber' : 'sky'}`} style={{ alignSelf: 'flex-start' }}>{n.text}</span>
                ))}
              </div>
            </div>
          )}
        </>
      )}
      {open && <CourseDrawer courseKey={open} onClose={() => setOpen(null)} />}
    </div>
  )
}
