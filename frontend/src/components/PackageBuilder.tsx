/* Course picks: one flow in three visible steps.
     1. Your goal       the student writes what they want from SOM, in their own words (with nudges to be specific)
     2. Pick what to keep   Elihu ranks real SOM courses by usefulness across every quarter left; the essentials come
                         pre-ticked, everything else is one tick away; each course can move to another quarter it's
                         offered in; see it by rank or by quarter, with units per term updating as you choose
     3. Add to your plan     everything ticked goes in at once, with one Undo
   Before the first run the page shows what you'll get (an example, clearly labelled), so it explains itself. */
import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ArrowRight, Check, Clock, Plus, ShieldCheck, Sparkles, Undo2 } from 'lucide-react'
import { api, type PackageApplied, type PackageItem, type PackageOption, type PackageResult, type PackageTerm } from '../api'
import { useApp } from '../state'
import { PACKAGE_GOAL_KEY, splitFollowups } from '../lib/elihu'
import AgentTrace from './AgentTrace'
import { Bar, CostChip } from './ui'
import './package.css'
import TaughtWith from './TaughtWith'
import NextYearNote from './NextYearNote'
import { AddYaleCourse, YaleBadge } from './YaleCourses'

const MAX_GOAL = 600
const TIER_TONE: Record<string, string> = { essential: 'pink', strong: 'lilac', 'worth a look': 'gray' }
const TIER_LABEL: Record<string, string> = { essential: 'Essential', strong: 'Strong fit', 'worth a look': 'Worth a look' }
const EXAMPLES = [
  'Move into healthcare private equity and understand how AI is changing healthcare',
  'Become a product leader at a climate-tech startup',
  'Get really good at negotiation, leading teams and managing people',
]
// "Make it specific": each nudge starts a sentence in the goal box.
const NUDGES = [
  { label: 'a role or industry', text: 'I want to work in ' },
  { label: 'a skill to build', text: 'I want to get good at ' },
  { label: 'something you’re curious about', text: 'I’m curious about ' },
]
const WORKING = [
  'Reading every course open to you in the quarters you have left',
  'Ranking them by how useful each is for your goal',
  'Checking every pick is a real SOM course',
  'Placing each one in a quarter where it’s offered and fits your week',
]

// A goal handed over from another page, kept until a package is built (survives a remount, read once per hand-over).
let handedGoal: string | null = null
function takeHandedGoal(): string | null {
  const fresh = sessionStorage.getItem(PACKAGE_GOAL_KEY)
  if (fresh) { sessionStorage.removeItem(PACKAGE_GOAL_KEY); handedGoal = fresh.slice(0, MAX_GOAL) }
  return handedGoal
}

interface Choice { keep: boolean; option: number }  // option = index into item.options
type Choices = Record<string, Choice>

const storeKey = (runId: string) => `pwd_picks_${runId}`
/** Saved ticks for this run, else Elihu's pre-selection: the essentials (at least the top three). */
function loadChoices(r: PackageResult): Choices {
  try {
    const saved = JSON.parse(localStorage.getItem(storeKey(r.run_id)) || 'null') as Choices | null
    if (saved) return saved
  } catch { /* fresh */ }
  const essentials = r.items.filter((i) => i.tier === 'essential').length
  return Object.fromEntries(r.items.map((i) => [i.key, {
    keep: i.tier === 'essential' || (essentials < 3 && i.rank <= 3),
    option: Math.max(0, i.options.findIndex((o) => o.course_id === i.placement.course_id && o.term === i.placement.term)),
  }]))
}

function termStatus(t: PackageTerm, units: number): { text: string; tone: '' | 'amber' | 'lime' } {
  if (t.max_units && units > t.max_units) return { text: `Over ${t.max_units}: needs approval`, tone: 'amber' }
  if (t.min_units && units < t.min_units) return { text: `Under the ${t.min_units}-unit minimum`, tone: 'amber' }
  return { text: t.min_units ? 'In range' : t.max_units ? `Under the ${t.max_units} cap` : 'No minimum', tone: 'lime' }
}
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))

export default function PackageBuilder({ onOpenCourse }: { onOpenCourse: (key: string) => void }) {
  const { profile, plan, refreshPlan, toast, go } = useApp()
  const [goal, setGoal] = useState('')
  const [result, setResult] = useState<PackageResult | null>(null)
  const [choices, setChoices] = useState<Choices>({})
  const [running, setRunning] = useState(false)
  const [phase, setPhase] = useState(0)
  const [applying, setApplying] = useState(false)
  const [applied, setApplied] = useState<PackageApplied | null>(null)
  const [undoIds, setUndoIds] = useState<number[]>([])
  const [view, setView] = useState<'rank' | 'quarter'>('rank')
  const [showTrace, setShowTrace] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [editing, setEditing] = useState(false)  // with results on screen, the goal shows as one line until you change it
  const timer = useRef<number | null>(null)
  const goalRef = useRef<HTMLTextAreaElement>(null)
  const resultRef = useRef<HTMLElement>(null)

  // Prefill: a goal handed over from the landing page or the Desk, else the last run's goal, else the profile's goals.
  useEffect(() => {
    const handed = takeHandedGoal()
    if (handed) { setGoal(handed); setEditing(true); window.setTimeout(() => goalRef.current?.focus(), 0) }
    const fallback = (x: string) => setGoal((typed) => typed || x)  // never overwrite what's already in the box
    api.latestPackage().then((r) => {
      if (r.result) { setResult(r.result); setChoices(loadChoices(r.result)); if (!handed) fallback(r.result.goal) }
      else if (!handed) fallback([profile?.goal_short, profile?.goal_long].filter(Boolean).join(', then ').slice(0, MAX_GOAL))
    }).catch(() => undefined).finally(() => setLoaded(true))
    return () => { if (timer.current) window.clearInterval(timer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { if (result) localStorage.setItem(storeKey(result.run_id), JSON.stringify(choices)) }, [result, choices])

  const inPlan = useMemo(() => new Set((plan?.items ?? []).map((i) => i.section.number)), [plan])

  const build = async () => {
    const text = goal.trim()
    if (text.length < 3 || running) { goalRef.current?.focus(); return }
    handedGoal = null
    setRunning(true); setPhase(0); setApplied(null); setUndoIds([])
    timer.current = window.setInterval(() => setPhase((s) => Math.min(s + 1, WORKING.length - 1)), 2500)
    try {
      const r = await api.buildPackage(text)
      setResult(r)
      setChoices(loadChoices(r))
      if (r.items.length) setEditing(false)
      window.setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
    } catch (e) {
      toast((e as Error).message, 'bad')
    } finally {
      if (timer.current) window.clearInterval(timer.current)
      setRunning(false)
    }
  }

  const nudge = (text: string) => {
    setGoal((g) => {
      const base = g.trim()
      return (base ? `${base}${/[.!?]$/.test(base) ? '' : '.'} ${text}` : text).slice(0, MAX_GOAL)
    })
    window.setTimeout(() => { const el = goalRef.current; if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length) } }, 0)
  }

  const items = result?.items ?? []
  const chosen = (i: PackageItem): PackageOption => i.options[choices[i.key]?.option ?? 0] ?? i.placement
  const kept = items.filter((i) => choices[i.key]?.keep && !inPlan.has(i.number))
  const keptUnits = kept.reduce((n, i) => n + i.units, 0)
  const units = useMemo(() => {
    const out: Record<string, number> = {}
    for (const t of result?.terms ?? []) out[t.code] = t.base_units
    for (const i of kept) { const o = chosen(i); out[o.term] = (out[o.term] ?? 0) + i.units }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, choices, inPlan])

  const setChoice = (key: string, patch: Partial<Choice>) =>
    setChoices((c) => ({ ...c, [key]: { keep: c[key]?.keep ?? false, option: c[key]?.option ?? 0, ...patch } }))

  const apply = async () => {
    if (!kept.length || applying) return
    setApplying(true)
    try {
      const r = await api.applyPackage(kept.map((i) => ({ course_id: chosen(i).course_id, target_term: chosen(i).target_term })))
      setApplied(r)
      setUndoIds(r.added.map((a) => a.action_id).filter((x): x is number => typeof x === 'number'))
      await refreshPlan()
      if (!r.added.length) toast('Nothing new to add: those are already in your plan.', 'bad')
    } catch (e) {
      toast((e as Error).message, 'bad')
    } finally {
      setApplying(false)
    }
  }
  const undo = async () => {
    for (const id of [...undoIds].reverse()) await api.undo(id).catch(() => undefined)
    await refreshPlan()
    setApplied(null); setUndoIds([])
    toast('Taken back out of your plan')
  }

  const planned = items.filter((i) => inPlan.has(i.number)).length
  // Older saved runs may still carry a raw "FOLLOWUPS:" line: split it the same way everywhere.
  const summary = useMemo(() => splitFollowups(result?.summary ?? '', result?.followups), [result])
  const stage = applied && applied.added.length ? 3 : result && items.length ? 2 : 1
  const terms = result?.terms ?? []
  const termName = (code: string) => terms.find((t) => t.code === code)?.name ?? code

  const row = (i: PackageItem) => {
    const c = choices[i.key] ?? { keep: false, option: 0 }
    const o = chosen(i)
    const already = inPlan.has(i.number)
    return (
      <li key={i.key} className={`pk-item${c.keep && !already ? ' on' : ''}${already ? ' done' : ''}`}>
        {already ? (
          <span className="pk-check is-done" title="Already in your plan"><Check className="icon sm" aria-hidden="true" /><span className="sr-only">In your plan</span></span>
        ) : (
          <label className="pk-check" title={c.keep ? 'Untick to leave it out' : 'Tick to keep it'}>
            <input type="checkbox" checked={c.keep} onChange={(e) => setChoice(i.key, { keep: e.target.checked })}
              aria-label={`Keep ${i.number} ${i.title}`} />
            <span className="pk-box" aria-hidden="true"><Check className="icon xs" /></span>
          </label>
        )}
        <div className="pk-main">
          <div className="pk-line">
            <span className="pk-rank" aria-label={`Rank ${i.rank}`}>#{i.rank}</span>
            <span className={`badge ${TIER_TONE[i.tier] ?? 'gray'}`}>{TIER_LABEL[i.tier] ?? i.tier}</span>
            <span className="course-num">{i.number} · {fmt(i.units)} units</span>
            {i.ldr && <span className="badge lilac">LDR</span>}
            {i.gsr && <span className="badge sky">Global</span>}
            <TaughtWith schools={i.taught_with} />
            {already && <span className="badge green"><Check className="icon sm" />In your plan</span>}
          </div>
          <button type="button" className="link-btn pk-title" onClick={() => onOpenCourse(i.key)}>{i.title}</button>
          <p className="pk-why">{i.why}</p>
          {i.evidence && <p className="small muted pk-evidence">From the course description: “{i.evidence}”</p>}
          <div className="pk-when">
            {i.options.length > 1 && !already ? (
              <label className="pk-select">
                <span className="small faint">Take it in</span>
                <select value={c.option} onChange={(e) => setChoice(i.key, { option: Number(e.target.value) })} aria-label={`Quarter for ${i.number}`}>
                  {i.options.map((op, idx) => <option key={`${op.term}-${op.course_id}`} value={idx}>{op.quarter}{op.expected ? ' (expected)' : ''}</option>)}
                </select>
              </label>
            ) : <span className="badge gray">{o.quarter}</span>}
            {o.expected ? <span className="small faint">Expected from this year’s offering · times TBA</span>
              : <span className="small faint"><Clock className="icon xs" aria-hidden /> {o.time}{o.section ? ` · §${o.section}` : ''}</span>}
            {!o.fits && <span className="badge red"><AlertTriangle className="icon sm" />Clashes with {o.clash_with.join(', ') || 'your week'}</span>}
            {o.pref_note && <span className="badge amber"><AlertTriangle className="icon sm" />Outside your preferences: {o.pref_note}</span>}
          </div>
        </div>
      </li>
    )
  }

  const byQuarter = useMemo(() => {
    const groups = new Map<string, PackageItem[]>()
    for (const t of terms) groups.set(t.code, [])
    for (const i of items) { const t = chosen(i).term; groups.set(t, [...(groups.get(t) ?? []), i]) }
    return [...groups.entries()].filter(([, list]) => list.length)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, choices])

  return (
    <div className="pk">
      <ol className="pk-steps" aria-label="How Course picks works">
        {[
          { n: 1, title: 'Your goal', sub: 'In your own words' },
          { n: 2, title: 'Pick what to keep', sub: 'Ranked by usefulness, every quarter' },
          { n: 3, title: 'Add to your plan', sub: 'One click, and you can undo' },
        ].map((s) => (
          <li key={s.n} className={`pk-stepper${stage === s.n ? ' is-on' : ''}${stage > s.n ? ' is-done' : ''}`} aria-current={stage === s.n ? 'step' : undefined}>
            <span className="pk-stepper-n" aria-hidden="true">{stage > s.n ? <Check className="icon xs" /> : s.n}</span>
            <span className="pk-stepper-text"><b>{s.title}</b><span>{s.sub}</span></span>
          </li>
        ))}
      </ol>

      {result && items.length > 0 && !editing && !running ? (
        <section className="card pk-goal-line" aria-label="Your goal">
          <span className="small faint">Your goal</span>
          <span className="pk-goal-text" title={goal}>{goal || result.goal}</span>
          <button type="button" className="btn sm ghost" onClick={() => { setEditing(true); window.setTimeout(() => goalRef.current?.focus(), 0) }}>Change goal</button>
        </section>
      ) : (
      <section className="card pk-ask" aria-labelledby="pk-ask-h">
        <h2 id="pk-ask-h" className="pk-ask-title">What do you want to get out of SOM?</h2>
        <label className="sr-only" htmlFor="pk-goal">Your goal</label>
        <textarea id="pk-goal" ref={goalRef} className="pk-goal" rows={3} maxLength={MAX_GOAL} value={goal}
          placeholder={`e.g. ${EXAMPLES[0]}`} onChange={(e) => setGoal(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void build() }} />
        <div className="pk-nudges" aria-label="Make it specific">
          <span className="small faint">Make it specific: add</span>
          {NUDGES.map((n) => (
            <button key={n.label} type="button" className="chip pk-nudge" onClick={() => nudge(n.text)}><Plus className="icon xs" aria-hidden="true" />{n.label}</button>
          ))}
        </div>
        <div className="pk-ask-row">
          <p className="pk-trust small muted"><ShieldCheck className="icon sm" aria-hidden="true" />Real SOM courses only · about 10 seconds · nothing changes until you add</p>
          <button type="button" className="btn primary lg pk-go" onClick={() => void build()} disabled={running || goal.trim().length < 3} aria-busy={running}>
            <Sparkles className="icon sm" aria-hidden="true" />{running ? 'Elihu is ranking…' : result ? 'Rank again for this goal' : 'Rank courses for me'}
          </button>
        </div>
      </section>
      )}

      {running && (
        <section className="card pk-working mt" role="status" aria-live="polite">
          <ol>
            {WORKING.map((w, i) => (
              <li key={w} className={i < phase ? 'done' : i === phase ? 'on' : ''}>
                <span className="pk-working-dot" aria-hidden="true">{i < phase ? <Check className="icon xs" /> : null}</span>{w}
              </li>
            ))}
          </ol>
        </section>
      )}

      {!running && loaded && !result && <Preview />}

      {!running && result && (result.blocked || !items.length) && (
        <div className="pb-callout warn mt" role="status"><AlertTriangle className="icon sm" aria-hidden="true" /><span>{result.summary}</span></div>
      )}

      {!running && result && items.length > 0 && (
        <section ref={resultRef} className="card mt pk-result" aria-labelledby="pk-result-h">
          <div className="pk-result-head">
            <div>
              <h3 id="pk-result-h">{items.length} courses ranked for your goal</h3>
              {editing && <p className="small faint pk-for" title={result.goal}>For: “{result.goal}”</p>}
            </div>
          </div>
          <div className="brief" style={{ margin: 0 }}>{summary.text}</div>
          {summary.followups.length > 0 && (
            <div className="fd-followups" aria-label="Ask Dan a follow-up">
              <span className="faint small">Ask Dan next</span>
              {summary.followups.map((q) => (
                <button key={q} type="button" className="chip fd-followup" onClick={() => window.dispatchEvent(new CustomEvent('dan:ask', { detail: q }))}>{q}<ArrowRight className="icon xs" aria-hidden /></button>
              ))}
            </div>
          )}

          <div className="pk-howto">
            <p className="small"><b>Elihu ticked the essentials.</b> Tick anything else you want, untick what you don’t, and change the quarter if you’d rather take it another time.</p>
            <div className="tabs" role="tablist" aria-label="Show courses">
              <button type="button" role="tab" aria-selected={view === 'rank'} className={view === 'rank' ? 'on' : ''} onClick={() => setView('rank')}>By rank</button>
              <button type="button" role="tab" aria-selected={view === 'quarter'} className={view === 'quarter' ? 'on' : ''} onClick={() => setView('quarter')}>By quarter</button>
            </div>
          </div>

          {terms.some((t) => t.expected) && <NextYearNote compact />}
          <div className="pk-terms" role="list" aria-label="Units per term with what you tick">
            {terms.map((t) => {
              const u = Math.round((units[t.code] ?? 0) * 10) / 10
              const st = termStatus(t, u)
              const cap = t.max_units || 24
              return (
                <div key={t.code} className="pk-term" role="listitem">
                  <div className="row between"><b className="small">{t.name}</b>{t.expected && <span className="badge gray">expected</span>}</div>
                  <div className="pk-term-units"><span className="pk-num">{fmt(u)}</span> <span className="faint small">units{t.core_units ? ` · ${fmt(t.core_units)} core` : ''}</span></div>
                  <Bar pct={(100 * u) / cap} tone={st.tone} />
                  <span className={`small ${st.tone === 'amber' ? 'amber-text' : 'faint'}`}>{st.text}</span>
                </div>
              )
            })}
          </div>

          {view === 'rank' ? <ol className="pk-list">{items.map(row)}</ol> : (
            <div className="pk-groups">
              {byQuarter.map(([code, list]) => (
                <section key={code} className="pk-group" aria-label={termName(code)}>
                  <h4>{termName(code)} <span className="faint small">· {list.filter((i) => choices[i.key]?.keep && !inPlan.has(i.number)).length} ticked of {list.length}</span></h4>
                  <ol className="pk-list">{list.map(row)}</ol>
                </section>
              ))}
            </div>
          )}

          {(result.beyond_som ?? []).length > 0 && (
            <section className="pk-beyond" aria-labelledby="pk-beyond-h">
              <h4 id="pk-beyond-h">Beyond SOM: also at Yale</h4>
              <p className="small muted" style={{ margin: 0 }}>Closest matches for your goal at other Yale schools. You need the instructor’s permission, they follow that school’s calendar, and the registrar sets the units (typically 4).</p>
              <ul>
                {result.beyond_som!.map((c) => (
                  <li key={c.id}>
                    <div className="pk-beyond-main">
                      <span className="pk-line"><span className="course-num">{c.number}</span><YaleBadge c={c} /><span className="small faint">{c.term_names.join(' · ')}</span></span>
                      <b>{c.title}</b>
                      <span className="small muted pk-beyond-desc">{c.description}</span>
                    </div>
                    <AddYaleCourse c={c} label="Add" />
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className={`pk-footer${applied && applied.added.length ? ' is-done' : ''}`}>
            {applied && applied.added.length ? (
              <>
                <span className="pk-footer-text"><Check className="icon sm" aria-hidden="true" /><span><b>Added {applied.added.length} course{applied.added.length === 1 ? '' : 's'} to your plan.</b>{applied.skipped.length ? ` Skipped ${applied.skipped.length}.` : ''}</span></span>
                <span className="pk-footer-actions">
                  {undoIds.length > 0 && <button type="button" className="btn ghost sm" onClick={() => void undo()}><Undo2 className="icon sm" aria-hidden="true" />Undo</button>}
                  <button type="button" className="btn primary" onClick={() => go('plan')}>See my timetable<ArrowRight className="icon sm" aria-hidden="true" /></button>
                </span>
              </>
            ) : (
              <>
                <span className="pk-footer-text small muted">
                  {kept.length ? <>Ticked <b className="pk-num">{kept.length}</b> · {fmt(keptUnits)} units</> : 'Tick the courses you want'}
                  {planned > 0 && <> · {planned} already in your plan</>}
                </span>
                <button type="button" className="btn primary" onClick={() => void apply()} disabled={!kept.length || applying} aria-busy={applying}>
                  {applying ? 'Adding…' : <>Add {kept.length ? `${kept.length} ` : ''}to my plan<ArrowRight className="icon sm" aria-hidden /></>}
                </button>
              </>
            )}
          </div>
          {applied && (applied.skipped.length > 0 || applied.clashes.length > 0) && (
            <div className="pb-callout warn" role="status">
              <AlertTriangle className="icon sm" aria-hidden="true" />
              <span>
                {applied.skipped.length > 0 && <>Skipped {applied.skipped.map((s) => `${s.number} (${s.reason.replace(/\.$/, '')})`).join('; ')}. </>}
                {applied.clashes.length > 0 && <>Check your timetable: {applied.clashes.map((x) => `${x.a} and ${x.b}`).join(', ')} overlap.</>}
              </span>
            </div>
          )}
          <div className="pk-meta">
            <button type="button" className="link-btn small" onClick={() => setShowTrace((v) => !v)}>{showTrace ? 'Hide' : 'See'} how Elihu decided</button>
            {showTrace && <CostChip usage={result.usage} />}
            {result.dropped.length > 0 && <span className="small amber-text">The fact-check removed {result.dropped.length} pick{result.dropped.length > 1 ? 's' : ''} that weren’t real SOM courses.</span>}
          </div>
          {showTrace && <div className="card flat"><AgentTrace steps={result.trace} compact /></div>}
        </section>
      )}
    </div>
  )
}

/** Before the first run: what you'll get, as a clearly labelled example (not the student's data). */
function Preview() {
  return (
    <section className="card mt pk-preview" aria-labelledby="pk-preview-h">
      <div className="pk-preview-head">
        <h3 id="pk-preview-h">What you’ll get</h3>
        <span className="badge gray">Example</span>
      </div>
      <ul className="pk-preview-points">
        <li><b>Ranked by usefulness</b><span>10–15 real SOM courses, most useful for your goal first, each with a reason from its description.</span></li>
        <li><b>Placed in your quarters</b><span>Every quarter you have left, this year’s times and next year’s expected courses, clash-checked.</span></li>
        <li><b>You decide</b><span>Tick what you want, move a course to another quarter, then add them all at once. Nothing changes until you do.</span></li>
      </ul>
      <ol className="pk-list pk-sample" aria-hidden="true">
        <li className="pk-item on">
          <span className="pk-check"><span className="pk-box"><Check className="icon xs" /></span></span>
          <div className="pk-main">
            <div className="pk-line"><span className="pk-rank">#1</span><span className="badge pink">Essential</span><span className="course-num">MGT 846 · 2 units</span></div>
            <span className="pk-title">Introduction to Private Equity</span>
            <p className="pk-why">The broadest foundation for the PE work you want to move into.</p>
            <div className="pk-when"><span className="badge gray">Spring-1 2027</span><span className="small faint">Fits your week</span></div>
          </div>
        </li>
        <li className="pk-item">
          <span className="pk-check"><span className="pk-box" /></span>
          <div className="pk-main">
            <div className="pk-line"><span className="pk-rank">#7</span><span className="badge lilac">Strong fit</span><span className="course-num">MGT 860 · 2 units</span></div>
            <span className="pk-title">Generative AI for Managers</span>
            <p className="pk-why">A practical lens for judging how AI changes the companies you’d invest in.</p>
            <div className="pk-when"><span className="badge gray">Spring-2 2027</span><span className="small faint">Fits your week</span></div>
          </div>
        </li>
      </ol>
    </section>
  )
}
