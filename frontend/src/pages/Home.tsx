/* Dan's Desk: the chief-of-staff home. One focal point (the brief), then decisions,
   then best fits, with a quiet supporting pane. See docs/design_brief.md. */
import { useCallback, useEffect, useState } from 'react'
import {
  AlarmClock, ArrowRight, Check, ChevronDown, ChevronRight, CircleHelp, Clock, MessageCircle, RotateCcw,
} from 'lucide-react'
import { api, type ActionEntry, type BestFits, type CalendarEvents, type DeskCard, type DeskResponse, type Fit } from '../api'
import CourseDrawer from '../components/CourseDrawer'
import { Bar } from '../components/ui'
import { PLANNING_TERM, prettyDate, relDays, daysUntil, usd } from '../lib/format'
import { useApp } from '../state'

const REASONS: { id: string; label: string }[] = [
  { id: 'time', label: 'Wrong time' },
  { id: 'interest', label: 'Not my interest' },
  { id: 'taken', label: 'Already taken' },
  { id: 'competitive', label: 'Too competitive' },
]

function greeting(): string {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

function dueLabel(c: DeskCard): string {
  if (c.days_left == null || !c.due) return 'No fixed date'
  return `${relDays(c.days_left)} · ${prettyDate(c.due)}`
}

function Decision({ card, onAct, onState }: { card: DeskCard; onAct: (c: DeskCard) => void; onState: (c: DeskCard, s: 'snoozed' | 'dismissed' | 'done') => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="decision">
      <span className={`sev ${card.severity}`} aria-label={`${card.severity} priority`} />
      <div className="body">
        <div className="title">{card.title}</div>
        <div className="detail">{card.detail}</div>
        {open && <div className="faint small" style={{ marginTop: 4 }}>Why you're seeing this: {card.why || 'computed from your plan'}. Source: <span className="mono">{card.source}</span></div>}
      </div>
      <span className="due hide-mobile">{dueLabel(card)}</span>
      <div className="actions">
        <button className="btn sm" onClick={() => onAct(card)}>{card.action.label}<ArrowRight className="icon sm" /></button>
        <button className="btn icon ghost" title="Why am I seeing this?" aria-label="Why am I seeing this?" onClick={() => setOpen((v) => !v)}><CircleHelp className="icon sm" /></button>
        <button className="btn icon ghost" title="Snooze 3 days" aria-label="Snooze 3 days" onClick={() => onState(card, 'snoozed')}><AlarmClock className="icon sm" /></button>
        <button className="btn icon ghost" title="Done" aria-label="Mark done" onClick={() => onState(card, 'done')}><Check className="icon sm" /></button>
      </div>
    </div>
  )
}

function TierLabel({ tier }: { tier: Fit['tier'] }) {
  const cls = tier === 'Strong fit' ? 'strong' : tier === 'Good fit' ? 'good' : 'look'
  const n = tier === 'Strong fit' ? 3 : tier === 'Good fit' ? 2 : 1
  return (
    <span className={`tier ${cls}`}>
      <span className="tier-dots" aria-hidden>{[0, 1, 2].map((i) => <i key={i} className={i < n ? 'on' : ''} />)}</span>
      {tier}
    </span>
  )
}

function FitCard({ fit, primary, onOpen, onDismiss }: { fit: Fit; primary: boolean; onOpen: (k: string) => void; onDismiss: (f: Fit, reason: string) => void }) {
  const { addCourse, plannedIds, celebrate } = useApp()
  const [why, setWhy] = useState(false)
  const [askReason, setAskReason] = useState(false)
  const inPlan = plannedIds.has(fit.section_id)
  const add = async () => {
    await addCourse(fit.section_id, 'dan')
    if (fit.tier === 'Strong fit') celebrate(`${fit.number} is in. Nice pick.`)
  }
  return (
    <article className="fit">
      <div className="row between" style={{ flexWrap: 'nowrap' }}>
        <TierLabel tier={fit.tier} />
        <span className="course-num">{fit.number}</span>
      </div>
      <button className="link-btn course-title" style={{ color: 'var(--text)', textAlign: 'left' }} onClick={() => onOpen(fit.key)}>{fit.title}</button>
      <div className="meta">
        <span><Clock className="icon sm" />{fit.time}</span>
        <span>{fit.units} units</span>
        <span style={{ color: 'var(--green)' }}><Check className="icon sm" />No clash</span>
      </div>
      <div className="row" style={{ gap: 6 }}>
        {fit.chips.map((c) => <span key={c} className="reason">{c}</span>)}
      </div>
      <div className="faint small">
        Demand: {fit.demand.level}{fit.demand.seats ? ` · ${fit.demand.seats} seats` : ''}
        {fit.demand.reports ? ` · ${fit.demand.reports} bid reports${fit.demand.sample ? ' (sample)' : ''}` : ''}
      </div>
      {why && (
        <div className="why">
          {fit.why.evidence ? <p style={{ margin: '0 0 6px' }}>From the course description: <q>{fit.why.evidence}</q></p> : <p style={{ margin: '0 0 6px' }}>No description line matched your goals closely.</p>}
          {fit.why.counter && <p style={{ margin: '0 0 6px' }}>Worth knowing: {fit.why.counter}.</p>}
          <a href="#/chat" onClick={() => sessionStorage.setItem('pwd-ask', `Is ${fit.number} ${fit.title} a good fit for my goals? What should I know before bidding?`)}>
            <MessageCircle className="icon sm" style={{ verticalAlign: '-3px' }} /> Ask Dan about this
          </a>
        </div>
      )}
      {askReason ? (
        <div className="row" style={{ gap: 6 }}>
          <span className="faint small">Why not?</span>
          {REASONS.map((r) => <button key={r.id} className="chip" onClick={() => onDismiss(fit, r.id)}>{r.label}</button>)}
          <button className="btn sm ghost" onClick={() => onDismiss(fit, '')}>Skip</button>
        </div>
      ) : (
        <div className="row" style={{ gap: 6, marginTop: 'auto' }}>
          {inPlan ? <span className="badge green"><Check className="icon sm" />In your plan</span>
            : <button className={`btn sm ${primary ? 'primary' : ''}`} onClick={add}>Add to plan</button>}
          <button className="btn sm ghost" onClick={() => setAskReason(true)}>Not for me</button>
          <button className="btn sm ghost" style={{ marginLeft: 'auto' }} onClick={() => setWhy((v) => !v)} aria-expanded={why}>
            Why? {why ? <ChevronDown className="icon sm" /> : <ChevronRight className="icon sm" />}
          </button>
        </div>
      )}
    </article>
  )
}

export default function Home() {
  const { user, profile, plan, go, toast, refreshPlan } = useApp()
  const [desk, setDesk] = useState<DeskResponse | null>(null)
  const [fits, setFits] = useState<BestFits | null>(null)
  const [cal, setCal] = useState<CalendarEvents | null>(null)
  const [actions, setActions] = useState<ActionEntry[]>([])
  const [showLater, setShowLater] = useState(false)
  const [showHow, setShowHow] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const closeDrawer = useCallback(() => setOpen(null), [])

  const loadDesk = useCallback(() => api.desk().then(setDesk).catch(() => undefined), [])
  const loadFits = useCallback(() => api.bestFits(PLANNING_TERM).then(setFits).catch(() => undefined), [])
  const loadActions = useCallback(() => api.actions().then((r) => setActions(r.actions)).catch(() => undefined), [])

  useEffect(() => {
    loadDesk(); loadFits(); loadActions()
    api.calendarEvents().then(setCal).catch(() => undefined)
  }, [loadDesk, loadFits, loadActions])

  // When the plan changes (add, undo), the desk, fits and action log change too.
  useEffect(() => { if (plan) { loadDesk(); loadFits(); loadActions() } }, [plan, loadDesk, loadFits, loadActions])

  const act = (c: DeskCard) => {
    if (c.action.type === 'scroll') document.getElementById(c.action.target || 'fits')?.scrollIntoView({ behavior: 'smooth' })
    else if (c.action.route) go(c.action.route as never)
  }
  const setState = async (c: DeskCard, s: 'snoozed' | 'dismissed' | 'done') => {
    await api.deskCard(c.id, s)
    await loadDesk()
    toast(s === 'snoozed' ? 'Snoozed for 3 days' : s === 'done' ? 'Marked done' : 'Dismissed', 'good', {
      label: 'Undo', run: async () => { await api.deskCard(c.id, 'active'); loadDesk() },
    })
  }
  const dismiss = async (f: Fit, reason: string) => {
    await api.dismissFit(f.key, reason)
    await loadFits()
    toast(`Hid ${f.number}. Similar courses rank lower now.`, 'good', {
      label: 'Undo', run: async () => { await api.undismissFit(f.key); loadFits() },
    })
  }
  const undo = async (a: ActionEntry) => {
    await api.undo(a.id)
    await refreshPlan()
    toast('Undone')
  }

  const today = cal?.today ?? new Date().toISOString().slice(0, 10)
  const nextUp = (cal?.deadlines ?? []).filter((d) => d.date >= today).slice(0, 2)
  const spring = plan?.terms[PLANNING_TERM]
  const prog = plan?.progress
  const clashes = Object.values(plan?.terms ?? {}).reduce((n, t) => n + t.conflicts.length, 0)
  const gsaLeft = 10 - (profile?.gsa_days_used ?? 0)
  const nearest = (cal?.deadlines ?? []).find((d) => d.date >= today && d.kind === 'deadline')

  return (
    <div>
      <div className="desk-head">
        <div>
          <h1>{greeting()}, {user?.name || 'there'}</h1>
          <div className="muted small">
            Spring 2027 planning{nearest ? ` · ${nearest.title.split(' (')[0]} ${relDays(daysUntil(nearest.date, new Date(today + 'T00:00:00')))}` : ''}
          </div>
        </div>
        <span className="faint small hide-mobile">Press <kbd>⌘K</kbd> to search</span>
      </div>

      <div className="brief" aria-live="polite">
        {desk ? desk.brief.text : <span className="skeleton" style={{ display: 'block', height: 44 }} />}
        {desk && (
          <span className="meta-line">
            Written by Dan from {desk.top.length} decision{desk.top.length === 1 ? '' : 's'} · {desk.brief.cached ? 'cached today' : 'fresh'}
            {desk.brief.cost_usd ? ` · ${usd(desk.brief.cost_usd)}` : ' · $0'}
          </span>
        )}
      </div>

      <div className="desk">
        <div>
          <div className="section-label">
            <span>Decisions needed</span>
            {desk && desk.hidden > 0 && <span className="faint">{desk.hidden} snoozed or done</span>}
          </div>
          <div className="decisions">
            {!desk && <div style={{ padding: 14 }}><span className="skeleton" style={{ display: 'block', height: 40 }} /></div>}
            {desk && desk.top.length === 0 && <div className="empty small" style={{ padding: 20 }}>You're all caught up. Dan will flag the next decision here.</div>}
            {desk?.top.map((c) => <Decision key={c.id} card={c} onAct={act} onState={setState} />)}
          </div>
          {desk && desk.later.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <button className="btn sm ghost" onClick={() => setShowLater((v) => !v)}>
                {showLater ? <ChevronDown className="icon sm" /> : <ChevronRight className="icon sm" />} Later ({desk.later.length})
              </button>
              {showLater && <div className="decisions" style={{ marginTop: 6 }}>{desk.later.map((c) => <Decision key={c.id} card={c} onAct={act} onState={setState} />)}</div>}
            </div>
          )}

          <div id="fits" className="section-label" style={{ marginTop: 26 }}>
            <span>Your best fits · Spring 2027</span>
            <span className="row" style={{ gap: 12 }}>
              <button className="link-btn small" onClick={() => setShowHow((v) => !v)}>Why these?</button>
              <button className="link-btn small" onClick={() => go('find')}>Deep dive with AI</button>
            </span>
          </div>
          {showHow && fits && <p className="faint small" style={{ marginTop: -2 }}>{fits.how} <a href="#/profile">Edit your goals</a>.</p>}
          {!fits && <div className="fits">{[0, 1, 2].map((i) => <div key={i} className="fit"><span className="skeleton" style={{ height: 120 }} /></div>)}</div>}
          {fits && fits.top.length === 0 && <div className="card empty small">No clash-free matches left. Try loosening your schedule preferences.</div>}
          {fits && fits.top.length > 0 && (
            <div className="fits">
              {fits.top.map((f, i) => <FitCard key={f.key} fit={f} primary={i === 0} onOpen={setOpen} onDismiss={dismiss} />)}
            </div>
          )}
          {fits && fits.swap_count > 0 && <p className="faint small" style={{ marginTop: 8 }}>{fits.swap_count} more courses would fit if you swapped something in your plan.</p>}

          {fits?.rows.map((row) => (
            <div key={row.id} className="fit-row">
              <div className="section-label"><span>{row.title}</span></div>
              <div className="strip">
                {row.items.map((f) => (
                  <button key={f.key} className="mini-fit" style={{ textAlign: 'left', color: 'inherit', font: 'inherit', cursor: 'pointer' }} onClick={() => setOpen(f.key)}>
                    <span className="row between" style={{ flexWrap: 'nowrap' }}><TierLabel tier={f.tier} /><span className="course-num">{f.number}</span></span>
                    <span style={{ fontWeight: 500 }}>{f.title}</span>
                    <span className="faint small">{f.time}{f.chips[0] ? ` · ${f.chips[0]}` : ''}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <aside className="side-pane">
          <div className="card">
            <div className="section-label"><span>Next up</span><button className="link-btn small" onClick={() => go('calendar')}>Calendar</button></div>
            {nextUp.length === 0 && <span className="faint small">Loading…</span>}
            {nextUp.map((d) => (
              <div key={d.date + d.title} className="row between" style={{ padding: '6px 0', flexWrap: 'nowrap' }}>
                <span style={{ fontSize: 13 }}>{d.title.split(' (')[0]}</span>
                <span className="mono faint">{relDays(daysUntil(d.date, new Date(today + 'T00:00:00')))}</span>
              </div>
            ))}
          </div>

          <div className="card">
            <div className="section-label"><span>Your plan</span><button className="link-btn small" onClick={() => go('plan')}>Open</button></div>
            <div className="meter">
              <span>Spring units</span><span className="mono">{spring?.units ?? 0} / 16</span>
              <Bar pct={((spring?.units ?? 0) / 16) * 100} tone={(spring?.units ?? 0) >= 16 ? 'lime' : ''} />
              <span>Electives</span><span className="mono">{prog?.electives.planned ?? 0} / 41.5</span>
              <Bar pct={((prog?.electives.planned ?? 0) / 41.5) * 100} />
              <span>Global Studies days left</span><span className="mono">{gsaLeft} / 10</span>
              <Bar pct={gsaLeft * 10} tone="gray" />
            </div>
            <div className="row between small"><span>Leadership</span><span style={{ color: prog?.ldr.met ? 'var(--green)' : 'var(--amber)' }}>{prog?.ldr.met ? 'Done' : 'Not yet'}</span></div>
            <div className="row between small" style={{ marginTop: 6 }}><span>Global Studies</span><span style={{ color: prog?.gsr.met ? 'var(--green)' : prog?.gsr.in_plan.length ? 'var(--text)' : 'var(--amber)' }}>{prog?.gsr.met ? 'Done' : prog?.gsr.in_plan.length ? 'Planned' : 'Not yet'}</span></div>
            <div className="row between small" style={{ marginTop: 6 }}><span>Clashes</span><span style={{ color: clashes ? 'var(--red)' : 'var(--green)' }}>{clashes ? `${clashes} to fix` : 'None'}</span></div>
          </div>

          <div className="card">
            <div className="section-label"><span>Recent actions</span></div>
            {actions.length === 0 && <span className="faint small">Every change you or Dan make shows up here, with undo.</span>}
            {actions.slice(0, 4).map((a) => (
              <div key={a.id} className="row between" style={{ padding: '5px 0', flexWrap: 'nowrap' }}>
                <span className="small" style={{ color: a.undone ? 'var(--faint)' : 'var(--text)', textDecoration: a.undone ? 'line-through' : 'none' }}>
                  {a.summary}{a.by === 'dan' ? <span className="faint"> · via Dan</span> : null}
                </span>
                {!a.undone && <button className="btn icon ghost" aria-label={`Undo: ${a.summary}`} title="Undo" onClick={() => undo(a)}><RotateCcw className="icon sm" /></button>}
              </div>
            ))}
          </div>
        </aside>
      </div>
      {open && <CourseDrawer courseKey={open} onClose={closeDrawer} />}
    </div>
  )
}
