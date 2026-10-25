/* The Desk's map of the product (student feedback: "what's this for, how do I use it, what do I do next?").
   1. Three steps, the order a semester actually goes: choose courses → plan your terms → lock it in. Each step
      says what it's for, shows where this student stands (live, from their plan), and opens the page that does it.
      The step they're on is marked "You're here".
   2. "Where to find it": the questions students actually ask ("where's my timetable?") with the one page that
      answers each. Labels and icons come from nav.ts, so the Desk, the sidebar and ⌘K always agree. */
import { ArrowRight, Check, CircleAlert } from 'lucide-react'
import type { ProgramsInfo } from '../api'
import { auctionApplies } from '../api'
import { auctionPhase } from '../lib/deskTime'
import { termName } from '../lib/format'
import { STEP_CHOOSE, STEP_LOCK, STEP_PLAN, navFor } from '../nav'
import { useApp, type Route } from '../state'

type Tone = 'good' | 'todo' | 'plain'
interface Step {
  n: 1 | 2 | 3
  title: string
  question: string
  status: string
  tone: Tone
  action: { label: string; route: Route }
  also: Route[]
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))
const stepTitle = (s: string) => s.replace(/^\d · /, '')

function useSteps(programs: ProgramsInfo | null, now: Date): { steps: Step[]; current: number } | null {
  const { plan, profile, shortlist } = useApp()
  if (!plan) return null
  const p = plan.progress
  const electives = plan.items.filter((i) => !i.section.core)
  const starred = shortlist.size
  const clashes = Object.values(plan.terms).reduce((n, t) => n + t.conflicts.length, 0)
  const low = (p.terms ?? []).find((t) => t.status === 'low' && t.min_applies && t.min_units)
  const target = p.total_target || 72
  const mbaRules = p.mba_rules !== false
  const reqLabel = (x: { met: boolean; planned: boolean }) => (x.met ? 'met' : x.planned ? 'planned' : 'not yet')
  const reqsOpen = mbaRules && (!(p.ldr.met || p.ldr.planned) || !(p.gsr.met || p.gsr.planned))
  const phase = auctionApplies(profile?.program, profile?.year) && programs?.auction ? auctionPhase(programs.auction, now) : null

  const steps: Step[] = [
    {
      n: 1, title: stepTitle(STEP_CHOOSE), question: 'What should I take?',
      status: electives.length ? `${electives.length} elective${electives.length === 1 ? '' : 's'} planned${starred ? ` · ${starred} starred` : ''}` : 'Not started',
      tone: electives.length ? 'good' : 'todo',
      action: { label: 'Get course picks', route: 'find' }, also: ['explore', 'shortlist'],
    },
    {
      n: 2, title: stepTitle(STEP_PLAN), question: 'Does it fit, every term?',
      status: clashes ? `${clashes} clash${clashes === 1 ? '' : 'es'} to fix`
        : low ? `${termName(low.term)}: ${fmt(low.units)} of ${fmt(low.min_units!)} units`
          : `${fmt(p.planned_total)} of ${target} units planned`,
      tone: clashes || low ? 'todo' : electives.length ? 'good' : 'plain',
      action: { label: 'Open my timetable', route: 'plan' }, also: ['calendar'],
    },
    {
      n: 3, title: stepTitle(STEP_LOCK), question: 'Am I on track, and how do I get seats?',
      status: mbaRules ? `Leadership: ${reqLabel(p.ldr)} · Global: ${reqLabel(p.gsr)}` : `Requirements for ${p.program_label || 'your program'}`,
      tone: reqsOpen ? 'todo' : mbaRules ? 'good' : 'plain',
      action: { label: 'Check requirements', route: 'global' }, also: ['bids'],
    },
  ]
  // The countdown tile shows the auction itself; here it only says the step is live.
  if (phase && phase.phase === 'open') steps[2].status += ' · auction open'
  const current = !electives.length ? 1 : clashes || low ? 2 : 3
  return { steps, current }
}

export function DeskSteps({ programs, now, go }: { programs: ProgramsInfo | null; now: Date; go: (r: Route) => void }) {
  const data = useSteps(programs, now)
  return (
    <section className="dk-steps" aria-labelledby="dk-steps-title">
      <div className="dk-steps-head">
        <h2 id="dk-steps-title">How Dan works</h2>
        <p>Three steps, from “what should I take?” to a plan you can bid on. Dan keeps track of where you are.</p>
      </div>
      <ol className="dk-steps-row">
        {!data && [1, 2, 3].map((n) => <li key={n} className="card dk-step" aria-busy="true"><span className="skeleton dk-step-skel" /></li>)}
        {data?.steps.map((s) => {
          const here = s.n === data.current
          return (
            <li key={s.n} className={`card dk-step${here ? ' is-here' : ''}`}>
              <div className="dk-step-top">
                <span className="dk-step-n" aria-hidden="true">{s.n}</span>
                <span className="dk-step-title">{s.title}</span>
                {here && <span className="dk-step-here">You’re here</span>}
              </div>
              <p className="dk-step-q">{s.question}</p>
              <p className={`dk-step-status t-${s.tone}`} title={s.status}>
                {s.tone === 'good' ? <Check className="icon xs" aria-hidden="true" /> : s.tone === 'todo' ? <CircleAlert className="icon xs" aria-hidden="true" /> : null}
                <span>{s.status}</span>
              </p>
              <div className="dk-step-foot">
                <button type="button" className={`btn sm ${here ? 'primary dk-step-go' : ''}`} onClick={() => go(s.action.route)}>
                  {s.action.label}<ArrowRight className="icon sm" aria-hidden="true" />
                </button>
                <span className="dk-step-also">
                  {s.also.map((r) => {
                    const item = navFor(r)
                    return item ? <button key={r} type="button" className="link-btn small" onClick={() => go(r)} title={item.hint}>{item.label}</button> : null
                  })}
                </span>
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

/** "I want to…" → the one page that does it. */
const WHERE: { want: string; route: Route }[] = [
  { want: 'See my weekly timetable', route: 'plan' },
  { want: 'Get courses picked for my goal', route: 'find' },
  { want: 'Look up a course or professor', route: 'explore' },
  { want: 'Compare courses I’m deciding between', route: 'shortlist' },
  { want: 'Check deadlines, or sync my calendar', route: 'calendar' },
  { want: 'See what I still need to graduate', route: 'global' },
  { want: 'Get ready for the course auction', route: 'bids' },
  { want: 'Ask anything about SOM', route: 'chat' },
]

export function DeskWhere({ go }: { go: (r: Route) => void }) {
  return (
    <section className="card dk-where" aria-labelledby="dk-where-title">
      <div className="dk-head"><h2 id="dk-where-title">Where to find it</h2></div>
      <ul className="dk-where-list">
        {WHERE.map((w) => {
          const item = navFor(w.route)
          if (!item) return null
          return (
            <li key={w.want}>
              <button type="button" className="dk-where-row" onClick={() => go(w.route)}>
                <span className="dk-where-want">{w.want}</span>
                <span className="dk-where-to"><item.icon className="icon sm" aria-hidden="true" />{item.label}<ArrowRight className="icon xs" aria-hidden="true" /></span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
