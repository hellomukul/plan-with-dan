/* Course package: the student writes a goal in their own words, Elihu ranks courses by usefulness across every
   quarter they have left, and the student keeps or drops each one (or moves it to another quarter it's offered in)
   before adding the kept ones to their plan in one go. Unit totals per term update as they choose. */
import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ArrowRight, Check, Clock, Plus, Sparkles, Undo2, X } from 'lucide-react'
import { api, type PackageApplied, type PackageItem, type PackageResult, type PackageTerm } from '../api'
import { useApp } from '../state'
import { PACKAGE_GOAL_KEY, splitFollowups } from '../lib/elihu'
import AgentTrace from './AgentTrace'
import { Bar, CostChip } from './ui'
import './package.css'

const MAX_GOAL = 600
const STEPS = [
  { label: 'Shortlist', kind: 'code', hint: 'every course open to you in the quarters you have left' },
  { label: 'Rank', kind: 'ai', hint: 'Elihu ranks them by how useful each is for your goal' },
  { label: 'Fact-check', kind: 'code', hint: 'drops anything that isn’t a real SOM course' },
  { label: 'Place', kind: 'code', hint: 'puts each one in a quarter where it’s offered and fits' },
]
const TIER_TONE: Record<string, string> = { essential: 'pink', strong: 'lilac', 'worth a look': 'gray' }
const EXAMPLES = [
  'Move into healthcare private equity and understand how AI is changing healthcare',
  'Become a product leader at a climate-tech startup',
  'Get really good at negotiation, leading teams and managing people',
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

const storeKey = (runId: string) => `pwd_pkg_${runId}`
function loadChoices(r: PackageResult): Choices {
  try {
    const saved = JSON.parse(localStorage.getItem(storeKey(r.run_id)) || 'null') as Choices | null
    if (saved) return saved
  } catch { /* fresh */ }
  return Object.fromEntries(r.items.map((i) => [i.key, { keep: true, option: Math.max(0, i.options.findIndex((o) => o.course_id === i.placement.course_id && o.term === i.placement.term)) }]))
}

function termStatus(t: PackageTerm, units: number): { text: string; tone: '' | 'amber' | 'lime' } {
  if (t.max_units && units > t.max_units) return { text: `Over ${t.max_units}: needs approval`, tone: 'amber' }
  if (t.min_units && units < t.min_units) return { text: `Under the ${t.min_units}-unit minimum`, tone: 'amber' }
  return { text: t.min_units ? 'In range' : 'No minimum', tone: 'lime' }
}

export default function PackageBuilder({ onOpenCourse }: { onOpenCourse: (key: string) => void }) {
  const { profile, plan, refreshPlan, toast } = useApp()
  const [goal, setGoal] = useState('')
  const [result, setResult] = useState<PackageResult | null>(null)
  const [choices, setChoices] = useState<Choices>({})
  const [running, setRunning] = useState(false)
  const [step, setStep] = useState(0)
  const [applying, setApplying] = useState(false)
  const [applied, setApplied] = useState<PackageApplied | null>(null)
  const [showTrace, setShowTrace] = useState(false)
  const timer = useRef<number | null>(null)
  const goalRef = useRef<HTMLTextAreaElement>(null)

  // Prefill: a goal handed over from the landing page or the Desk, else the last package's goal, else the profile.
  useEffect(() => {
    const handed = takeHandedGoal()
    if (handed) { setGoal(handed); goalRef.current?.focus() }
    const fallback = (x: string) => setGoal((typed) => typed || x)  // never overwrite what's already in the box
    api.latestPackage().then((r) => {
      if (r.result) { setResult(r.result); setChoices(loadChoices(r.result)); if (!handed) fallback(r.result.goal) }
      else if (!handed) fallback([profile?.goal_short, profile?.goal_long].filter(Boolean).join(', then ').slice(0, MAX_GOAL))
    }).catch(() => undefined)
    return () => { if (timer.current) window.clearInterval(timer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { if (result) localStorage.setItem(storeKey(result.run_id), JSON.stringify(choices)) }, [result, choices])

  const inPlan = useMemo(() => new Set((plan?.items ?? []).map((i) => i.section.number)), [plan])

  const build = async () => {
    const text = goal.trim()
    if (text.length < 3 || running) { goalRef.current?.focus(); return }
    handedGoal = null
    setRunning(true); setStep(0); setApplied(null)
    timer.current = window.setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 2600)
    try {
      const r = await api.buildPackage(text)
      setResult(r)
      setChoices(loadChoices(r))
    } catch (e) {
      toast((e as Error).message, 'bad')
    } finally {
      if (timer.current) window.clearInterval(timer.current)
      setRunning(false)
    }
  }

  const items = result?.items ?? []
  const chosen = (i: PackageItem) => i.options[choices[i.key]?.option ?? 0] ?? i.placement
  const kept = items.filter((i) => choices[i.key]?.keep !== false && !inPlan.has(i.number))
  const units = useMemo(() => {
    const out: Record<string, number> = {}
    for (const t of result?.terms ?? []) out[t.code] = t.base_units
    for (const i of kept) { const o = chosen(i); out[o.term] = (out[o.term] ?? 0) + i.units }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, choices, inPlan])

  const setChoice = (key: string, patch: Partial<Choice>) =>
    setChoices((c) => ({ ...c, [key]: { keep: c[key]?.keep ?? true, option: c[key]?.option ?? 0, ...patch } }))

  const apply = async () => {
    if (!kept.length || applying) return
    setApplying(true)
    try {
      const r = await api.applyPackage(kept.map((i) => ({ course_id: chosen(i).course_id, target_term: chosen(i).target_term })))
      setApplied(r)
      await refreshPlan()
      const ids = r.added.map((a) => a.action_id).filter((x): x is number => typeof x === 'number')
      if (r.added.length) {
        toast(`Added ${r.added.length} course${r.added.length === 1 ? '' : 's'} to your plan`, 'good', ids.length ? {
          label: 'Undo', run: async () => { for (const id of [...ids].reverse()) await api.undo(id); await refreshPlan(); setApplied(null) },
        } : undefined)
      } else toast('Nothing new to add: those are already in your plan.', 'bad')
    } catch (e) {
      toast((e as Error).message, 'bad')
    } finally {
      setApplying(false)
    }
  }

  const planned = items.filter((i) => inPlan.has(i.number)).length
  const droppedCount = items.length - kept.length - planned
  // Older saved runs may still carry a raw "FOLLOWUPS:" line: split it the same way the one-term finder does.
  const summary = useMemo(() => splitFollowups(result?.summary ?? '', result?.followups), [result])
  const left = MAX_GOAL - goal.length
  return (
    <div className="pk">
      <section className="card pk-ask" aria-labelledby="pk-ask-h">
        <h2 id="pk-ask-h" className="pk-ask-title">What do you want to get out of SOM?</h2>
        <p className="muted small pk-ask-sub">Write it in your own words. Elihu ranks courses by how useful each one is for it, across every quarter you have left, then you keep or drop them.</p>
        <label className="sr-only" htmlFor="pk-goal">Your goal</label>
        <textarea id="pk-goal" ref={goalRef} className="pk-goal" rows={3} maxLength={MAX_GOAL} value={goal}
          placeholder={`e.g. ${EXAMPLES[0]}`} onChange={(e) => setGoal(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void build() }} />
        <div className="pk-ask-row">
          <div className="pk-examples" aria-label="Example goals">
            {!goal.trim() ? EXAMPLES.slice(1).map((x) => (
              <button key={x} type="button" className="chip pk-example" onClick={() => setGoal(x)}>{x}</button>
            )) : <span className={`small ${left < 60 ? 'amber-text' : 'faint'}`}>{left} characters left</span>}
          </div>
          <button type="button" className="btn primary lg" onClick={() => void build()} disabled={running || goal.trim().length < 3} aria-busy={running}>
            <Sparkles className="icon sm" aria-hidden="true" />{running ? 'Elihu is ranking…' : result ? 'Rebuild my package' : 'Build my course package'}
          </button>
        </div>
        <p className="muted small fd-legend" aria-live="polite">
          {running ? <>{STEPS[step].label}: {STEPS[step].hint}…</>
            : <>{STEPS.map((s, i) => <span key={s.label} className="pk-step">{s.kind === 'ai' && <Sparkles className="icon xs fd-legend-ai" aria-hidden />}{s.label}{i < STEPS.length - 1 && <span className="pipe-arrow" aria-hidden> → </span>}</span>)}
              <span className="faint pk-legend-note">· about 10 seconds, under a cent</span></>}
        </p>
      </section>

      {result && (result.blocked || !items.length) && (
        <div className="pb-callout warn mt" role="status"><AlertTriangle className="icon sm" aria-hidden="true" /><span>{result.summary}</span></div>
      )}

      {result && items.length > 0 && (
        <section className="card mt pk-result" aria-labelledby="pk-result-h">
          <div className="row between pk-result-head">
            <h3 id="pk-result-h" style={{ margin: 0 }}>Your package: {items.length} courses, ranked for your goal</h3>
            <CostChip usage={result.usage} />
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

          <div className="pk-terms" role="list" aria-label="Units per term with the courses you keep">
            {result.terms.map((t) => {
              const u = Math.round((units[t.code] ?? 0) * 10) / 10
              const st = termStatus(t, u)
              const cap = t.max_units || 24
              return (
                <div key={t.code} className="pk-term" role="listitem">
                  <div className="row between"><b className="small">{t.name}</b>{t.expected && <span className="badge gray">expected</span>}</div>
                  <div className="pk-term-units"><span className="pk-num">{u}</span> <span className="faint small">units{t.core_units ? ` · ${t.core_units} core` : ''}</span></div>
                  <Bar pct={(100 * u) / cap} tone={st.tone} />
                  <span className={`small ${st.tone === 'amber' ? 'amber-text' : 'faint'}`}>{st.text}</span>
                </div>
              )
            })}
          </div>

          <ol className="pk-list">
            {items.map((i) => {
              const c = choices[i.key] ?? { keep: true, option: 0 }
              const o = chosen(i)
              const already = inPlan.has(i.number)
              const off = !c.keep && !already
              return (
                <li key={i.key} className={`pk-item ${off ? 'off' : ''} ${already ? 'done' : ''}`}>
                  <span className="pk-rank" aria-label={`Rank ${i.rank}`}>{i.rank}</span>
                  <div className="pk-main">
                    <div className="pk-line">
                      <span className="course-num">{i.number} · {i.units} units</span>
                      <span className={`badge ${TIER_TONE[i.tier] ?? 'gray'}`}>{i.tier}</span>
                      {i.ldr && <span className="badge lilac">LDR</span>}
                      {i.gsr && <span className="badge sky">Global</span>}
                    </div>
                    <button type="button" className="link-btn pk-title" onClick={() => onOpenCourse(i.key)}>{i.title}</button>
                    <p className="pk-why">{i.why}</p>
                    {i.evidence && <p className="small muted pk-evidence">From the description: “{i.evidence}”</p>}
                    <div className="pk-when">
                      {i.options.length > 1 && !already ? (
                        <label className="pk-select">
                          <span className="sr-only">Quarter for {i.number}</span>
                          <select value={c.option} disabled={off} onChange={(e) => setChoice(i.key, { option: Number(e.target.value) })}>
                            {i.options.map((op, idx) => <option key={`${op.term}-${op.course_id}`} value={idx}>{op.quarter}{op.expected ? ' (expected)' : ''}</option>)}
                          </select>
                        </label>
                      ) : <span className="badge gray">{o.quarter}</span>}
                      {o.expected ? <span className="small faint">Expected from this year’s offering · times TBA</span>
                        : <span className="small faint"><Clock className="icon xs" aria-hidden /> {o.time}{o.section ? ` · §${o.section}` : ''}</span>}
                      {!o.fits && <span className="badge red"><AlertTriangle className="icon sm" />Clashes with {o.clash_with.join(', ') || 'your week'}</span>}
                    </div>
                  </div>
                  <div className="pk-act">
                    {already ? <span className="badge green"><Check className="icon sm" />In your plan</span> : (
                      <button type="button" className={`btn sm ${c.keep ? '' : 'ghost'} pk-keep`} aria-pressed={c.keep}
                        aria-label={`${c.keep ? 'Drop' : 'Keep'} ${i.number} ${i.title}`} onClick={() => setChoice(i.key, { keep: !c.keep })}>
                        {c.keep ? <><Check className="icon sm" aria-hidden />Kept</> : <><Plus className="icon sm" aria-hidden />Keep</>}
                      </button>
                    )}
                    {!already && c.keep && <button type="button" className="btn sm ghost pk-drop" aria-label={`Drop ${i.number}`} onClick={() => setChoice(i.key, { keep: false })}><X className="icon sm" aria-hidden />Drop</button>}
                  </div>
                </li>
              )
            })}
          </ol>

          <div className="pk-footer">
            <span className="small muted">
              {kept.length ? <>Keeping <b className="pk-num">{kept.length}</b> · {kept.reduce((n, i) => n + i.units, 0)} units</>
                : planned ? 'Everything you kept is in your plan' : 'Nothing kept yet'}
              {planned > 0 && kept.length > 0 && <> · {planned} already in your plan</>}
              {droppedCount > 0 && <> · {droppedCount} dropped</>}
            </span>
            <div className="row" style={{ gap: 8 }}>
              <button type="button" className="btn ghost sm pk-trace-btn" onClick={() => setShowTrace((v) => !v)}>{showTrace ? 'Hide' : 'Show'} how Elihu decided</button>
              <button type="button" className="btn primary" onClick={() => void apply()} disabled={!kept.length || applying} aria-busy={applying}>
                {applying ? 'Adding…' : <>Add {kept.length || ''} to my plan<ArrowRight className="icon sm" aria-hidden /></>}
              </button>
            </div>
          </div>
          {applied && (applied.skipped.length > 0 || applied.clashes.length > 0) && (
            <div className="pb-callout warn" role="status">
              <AlertTriangle className="icon sm" aria-hidden="true" />
              <span>
                {applied.skipped.length > 0 && <>Skipped {applied.skipped.map((s) => `${s.number} (${s.reason.replace(/\.$/, '')})`).join('; ')}. </>}
                {applied.clashes.length > 0 && <>Check My plan: {applied.clashes.map((x) => `${x.a} and ${x.b}`).join(', ')} overlap.</>}
              </span>
            </div>
          )}
          {applied && applied.added.length > 0 && applied.skipped.length === 0 && (
            <p className="small muted" style={{ margin: 0 }}><Undo2 className="icon xs" aria-hidden /> Added. You can undo from the message at the bottom, or from Recent changes on My plan.</p>
          )}
          {showTrace && <div className="card flat"><AgentTrace steps={result.trace} compact /></div>}
          {result.dropped.length > 0 && (
            <p className="small" style={{ color: 'var(--amber)', margin: 0 }}>The fact-check removed {result.dropped.length} pick{result.dropped.length > 1 ? 's' : ''} that weren’t real SOM courses.</p>
          )}
        </section>
      )}
    </div>
  )
}
