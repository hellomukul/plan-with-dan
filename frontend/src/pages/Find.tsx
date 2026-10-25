/* Find courses with Elihu: Dan's course recommender, given a name (Elihu, after Elihu Yale) and an owl built in
   HTML/CSS. Same backend as before (api.recommend); only the labels and copy changed. When the student arrives from
   the Course explorer's "Stuck between two electives?" box, the courses they were weighing show side by side. */
import { useEffect, useMemo, useRef, useState } from 'react'
import { api, type RecPick, type RecResult, type Section } from '../api'
import AgentTrace from '../components/AgentTrace'
import CourseDrawer from '../components/CourseDrawer'
import { CostChip, Empty } from '../components/ui'
import { AlertTriangle, ArrowRight, Check, Clock, MessageCircle, ScrollText, ShieldCheck, Sparkles, Target, X } from 'lucide-react'
import Elihu from '../mascots/Elihu'
import { clearElihuContext, readElihuContext, splitFollowups } from '../lib/elihu'
import { blockedLabel, courseVerdict } from '../lib/eligibility'
import { displayName } from '../lib/faculty'
import { enrollLabel, TERM_NAMES } from '../lib/format'
import { useApp } from '../state'
import './find.css'

// The same five steps as always, named for students rather than engineers.
const STAGES = [
  { key: 'retrieve', label: 'Shortlist', kind: 'code', hint: 'narrows 100+ courses to the ones open to you' },
  { key: 'Curator', label: 'Pick', kind: 'ai', hint: 'matches courses to your goals' },
  { key: 'validate', label: 'Fact-check', kind: 'code', hint: 'drops anything not in the real catalog' },
  { key: 'assemble', label: 'Fit your week', kind: 'code', hint: 'clash-free sections, plus backups' },
  { key: 'Critic', label: 'Second look', kind: 'ai', hint: 'an honest second opinion' },
]
const GOAL_BADGE: Record<string, string> = { 'short-term': 'pink', 'long-term': 'lilac', interest: 'sky' }
const PRIORITY: Record<number, string> = { 1: 'Must-have', 2: 'Strong pick', 3: 'Nice to have' }

/** One add at a time per card: the button disables while the request runs and repeat clicks are ignored (QA H2). */
function useOneAtATime() {
  const [busy, setBusy] = useState<string | null>(null)
  const lock = useRef(false)
  const run = async (id: string, fn: () => Promise<unknown>) => {
    if (lock.current) return
    lock.current = true
    setBusy(id)
    try { await fn() } finally { lock.current = false; setBusy(null) }
  }
  return { busy, run }
}

function PickCard({ pick, onOpen, locked }: { pick: RecPick; onOpen: (key: string) => void; locked: boolean }) {
  const { addCourse, plannedIds, sectionById } = useApp()
  const { busy, run } = useOneAtATime()
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
          <button className="btn sm" disabled={busy !== null || locked} aria-busy={busy === pick.section_id}
            onClick={() => void run(pick.section_id, () => addCourse(pick.section_id, 'dan'))}>{busy === pick.section_id ? 'Adding…' : 'Add to plan'}</button>
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
                <button className="btn sm ghost" aria-label={`Add backup ${a.number} to my plan`} aria-busy={busy === a.section_id}
                  onClick={() => void run(a.section_id, () => addCourse(a.section_id))} disabled={!sectionById.has(a.section_id) || busy !== null || locked}>+</button>}
            </div>
          ))}
        </div>
      )}
    </article>
  )
}

/** The courses the student was weighing up in the Course explorer, side by side, with facts only. */
function Weighing({ keys, picked, onOpen, onClear }: { keys: string[]; picked: Set<string>; onOpen: (key: string) => void; onClear: () => void }) {
  const { sections, profile } = useApp()
  const who = { program: profile?.program || 'MBA', year: profile?.year ?? '', cohort: profile?.cohort ?? '' }
  const courses = keys.map((k) => sections.filter((s) => s.key === k)).filter((secs): secs is Section[] => secs.length > 0)
  if (!courses.length) return null
  const names = courses.map((secs) => secs[0].number)
  const label = (secs: Section[]) => `${secs[0].number} ${secs[0].title}`
  const ask = () => window.dispatchEvent(new CustomEvent('dan:ask', {
    detail: courses.length === 1 ? `Is ${label(courses[0])} a good fit for my goals and my week?`
      : `Help me choose between ${courses.map(label).join(' and ')}, given my goals and my week.`,
  }))
  return (
    <section className="card mt fd-weigh" aria-labelledby="fd-weigh-title">
      <div className="fd-weigh-head">
        <h3 id="fd-weigh-title"><ScrollText className="icon sm" />You were weighing up {names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`}</h3>
        <button type="button" className="btn icon ghost" aria-label="Clear these courses" onClick={onClear}><X className="icon sm" /></button>
      </div>
      <ul className="fd-weigh-grid">
        {courses.map((secs) => {
          const c = secs[0]
          const v = courseVerdict(secs, who)
          return (
            <li key={c.key}>
              <button type="button" className="fd-weigh-card" onClick={() => onOpen(c.key)}>
                <span className="course-num">{c.number} · {TERM_NAMES[c.term] ?? c.term_name}</span>
                <span className="fd-weigh-title">{c.title}</span>
                <span className="faint small fd-weigh-meta">{c.time || 'Time TBA'} · {c.units} units · {c.faculty[0] ? displayName(c.faculty[0]) : 'Faculty TBA'}</span>
                <span className="fd-weigh-pills">
                  {picked.has(c.key) ? <span className="cx-pill in"><Check className="icon xs" />In Elihu’s picks</span>
                    : v.open.length ? <span className="cx-pill plain">{enrollLabel(c.enrollment).text}</span>
                      : <span className="cx-pill no">{blockedLabel(v.verdict)}</span>}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      <p className="small muted fd-weigh-foot">
        Elihu picks from your goals; the cards above are facts from the catalog.{' '}
        <button type="button" className="link-btn" onClick={ask}><MessageCircle className="icon sm" style={{ verticalAlign: '-2px' }} /> {courses.length === 1 ? 'Ask Dan about it' : 'Ask Dan to compare them'}</button>
      </p>
    </section>
  )
}

export default function Find() {
  const { profile, go, addCourse, plannedIds, toast, sections } = useApp()
  const [ctx, setCtx] = useState(readElihuContext)
  const ctxTerm = useMemo(() => {
    const terms = new Set((ctx?.keys ?? []).map((k) => sections.find((s) => s.key === k)?.term).filter(Boolean))
    return terms.size === 1 ? [...terms][0] : ctx?.term
  }, [ctx, sections])
  const [term, setTerm] = useState(ctxTerm === '202603' ? '202603' : '202701')
  useEffect(() => { if (ctxTerm === '202603' || ctxTerm === '202701') setTerm(ctxTerm) }, [ctxTerm])
  const [result, setResult] = useState<RecResult | null>(null)
  const [running, setRunning] = useState(false)
  const [stage, setStage] = useState(-1)
  const [open, setOpen] = useState<string | null>(null)
  const [showTrace, setShowTrace] = useState(false)
  const [addingAll, setAddingAll] = useState(false)
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
    if (addingAll) return
    setAddingAll(true)
    try {
      for (const p of result?.picks ?? []) {
        if (p.fits && !plannedIds.has(p.section_id)) await addCourse(p.section_id, 'dan')
      }
    } finally { setAddingAll(false) }
  }
  // Never show the model's raw "FOLLOWUPS: a | b | c" line: it becomes tappable questions for Dan.
  const summary = useMemo(() => (result ? splitFollowups(result.summary, result.followups) : null), [result])
  const askDan = (text: string) => window.dispatchEvent(new CustomEvent('dan:ask', { detail: text }))

  return (
    <div className="fd">
      <div className="page-head fd-head elihu-host">
        <Elihu size={64} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <h1>Find courses with Elihu</h1>
          <p>Elihu is Dan’s bookish owl, named after Elihu Yale. He reads your goals, scans every real {term === '202701' ? 'Spring 2027' : 'Fall 2026'} course, and builds a shortlist that fits your week.</p>
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
            <div className="tabs" role="group" aria-label="Term to plan">
              <button type="button" className={term === '202701' ? 'on' : ''} aria-pressed={term === '202701'} onClick={() => setTerm('202701')}>Spring 2027</button>
              <button type="button" className={term === '202603' ? 'on' : ''} aria-pressed={term === '202603'} onClick={() => setTerm('202603')}>Fall 2026</button>
            </div>
            <button className="btn primary lg" onClick={run} disabled={running}>{running ? 'Elihu is reading…' : result ? 'Ask Elihu again' : 'Ask Elihu'}</button>
          </div>
        </div>
        <div className="pipeline">
          {STAGES.map((s, i) => (
            <span key={s.key} className="row" style={{ gap: 6 }}>
              <span className={`pipe-node ${s.kind} ${running && i === stage ? 'running' : ''} ${running && i < stage ? 'done' : ''}`} title={s.hint}>
                {s.kind === 'ai' && <Sparkles className="icon xs" aria-hidden />}{s.label}{s.kind === 'ai' && <span className="sr-only"> (AI step)</span>}</span>
              {i < STAGES.length - 1 && <span className="pipe-arrow">→</span>}
            </span>
          ))}
        </div>
        {/* one fixed line: the legend, or the step Elihu is on while he runs (so running never moves the page) */}
        <p className="muted small fd-legend" aria-live="polite">
          {running ? <>{STAGES[stage]?.label}: {STAGES[stage]?.hint}…</>
            : <><Sparkles className="icon xs fd-legend-ai" aria-hidden /> Outlined steps use AI; the others are plain code checks.</>}
        </p>
      </div>

      {ctx && <Weighing keys={ctx.keys} picked={new Set((result?.picks ?? []).flatMap((p) => [p.key, ...p.alternates.map((a) => a.key)]))}
        onOpen={setOpen} onClear={() => { clearElihuContext(); setCtx(null) }} />}

      {!result && !running && (
        <Empty title="No shortlist yet">
          <p>Hit <b>Ask Elihu</b>. It takes about 15 seconds and costs less than a cent.</p>
        </Empty>
      )}

      {result && (
        <>
          <div className="card mt stack">
            <div className="row between">
              <h3 style={{ margin: 0 }}>Your {result.term_name} shortlist</h3>
              <CostChip usage={result.usage} />
            </div>
            <div className="brief" style={{ margin: 0 }}>{summary?.text}</div>
            {summary && summary.followups.length > 0 && (
              <div className="fd-followups" aria-label="Ask Dan a follow-up">
                <span className="faint small">Ask Dan next</span>
                {summary.followups.map((q) => (
                  <button key={q} type="button" className="chip fd-followup" onClick={() => askDan(q)}>{q}<ArrowRight className="icon xs" aria-hidden /></button>
                ))}
              </div>
            )}
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
              <button className="btn" onClick={() => void addAllFitting()} disabled={addingAll} aria-busy={addingAll}>{addingAll ? 'Adding…' : 'Add all that fit'}</button>
              <button className="btn ghost sm" onClick={() => setShowTrace((v) => !v)}>{showTrace ? 'Hide' : 'Show'} how Elihu decided</button>
            </div>
            {showTrace && <div className="card flat"><AgentTrace steps={result.trace} compact /></div>}
            {result.dropped.length > 0 && (
              <p className="small" style={{ color: 'var(--amber)', margin: 0 }}>
                The fact-check removed {result.dropped.length} pick{result.dropped.length > 1 ? 's' : ''} that weren’t real catalog courses.
              </p>
            )}
          </div>

          <div className="grid auto mt">
            {result.picks.map((p) => <PickCard key={p.key} pick={p} onOpen={setOpen} locked={addingAll} />)}
          </div>

          {result.critique && (
            <div className="card mt">
              <div className="card-title"><ShieldCheck className="icon" />Elihu’s second look</div>
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
