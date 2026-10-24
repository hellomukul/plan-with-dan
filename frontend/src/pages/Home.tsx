import { useEffect, useState } from 'react'
import { api, type CalendarEvents } from '../api'
import HandsomeDan from '../mascots/HandsomeDan'
import Labubu from '../mascots/Labubu'
import { daysUntil, PLANNING_TERM, prettyDate, relDays } from '../lib/format'
import { useApp, type Route } from '../state'
import { Ring } from '../components/ui'

const ACTIONS: { route: Route; emoji: string; title: string; text: string }[] = [
  { route: 'find', emoji: '✨', title: 'Find my courses', text: 'A clash-free shortlist for your goals' },
  { route: 'chat', emoji: '🐶', title: 'Ask Dan', text: 'Courses, requirements, careers, AI news' },
  { route: 'plan', emoji: '🗓️', title: 'My timetable', text: 'Clashes, units, week check' },
  { route: 'calendar', emoji: '📆', title: 'Sync calendar', text: 'Google · Outlook · Apple' },
  { route: 'global', emoji: '🌍', title: 'Global studies', text: 'IE, GNW, SNOC, exchange' },
  { route: 'bids', emoji: '🎯', title: 'Bid coach', text: 'Split your points smartly' },
]

function greeting(): string {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Hey' : 'Evening'
}

export default function Home() {
  const { user, profile, plan, go } = useApp()
  const [cal, setCal] = useState<CalendarEvents | null>(null)

  useEffect(() => { api.calendarEvents().then(setCal).catch(() => setCal(null)) }, [])

  const today = cal?.today ?? new Date().toISOString().slice(0, 10)
  const upcoming = (cal?.deadlines ?? []).filter((d) => d.date >= today).slice(0, 4)
  const spring = plan?.terms[PLANNING_TERM]
  const clashes = Object.values(plan?.terms ?? {}).reduce((n, t) => n + t.conflicts.length, 0)
  const prog = plan?.progress
  const electivePct = prog ? (100 * prog.electives.planned) / prog.electives.target : 0
  const totalPct = prog ? (100 * prog.planned_total) / prog.total_target : 0

  const nextStep = !plan?.items.length
    ? { text: 'Your plan is empty. Want me to pick a Spring 2027 shortlist for your goals?', route: 'find' as Route, cta: 'Find my courses ✨' }
    : clashes
      ? { text: `You’ve got ${clashes} clash${clashes > 1 ? 'es' : ''} in your plan. Let’s fix that before bidding.`, route: 'plan' as Route, cta: 'Fix clashes' }
      : !prog?.gsr.met && !prog?.gsr.in_plan.length
        ? { text: 'No Global Studies option yet. Your 10 GSA days are use-it-or-lose-it.', route: 'global' as Route, cta: 'Plan global' }
        : { text: 'Plan looks clean! Sync it to your calendar so you never miss a class.', route: 'calendar' as Route, cta: 'Sync calendar' }

  return (
    <div>
      <div className="card glow pad-lg row" style={{ gap: 20, alignItems: 'center' }}>
        <div className="float hide-mobile"><HandsomeDan size={110} furColor="#f4b183" /></div>
        <div className="stack" style={{ flex: 1, minWidth: 240, gap: 8 }}>
          <h1 style={{ margin: 0 }}>{greeting()}, {user?.name || 'friend'} 👋</h1>
          <p className="muted" style={{ margin: 0 }}>
            {profile?.program} {profile?.year ? `· year ${profile.year}` : ''} {profile?.cohort ? `· ${profile.cohort} cohort` : ''}
            {profile?.goal_short ? ` · aiming for ${profile.goal_short}` : ''}
          </p>
          <div className="bubble bot" style={{ maxWidth: '100%' }}>🐶 {nextStep.text}</div>
          <div><button className="btn primary" onClick={() => go(nextStep.route)}>{nextStep.cta}</button></div>
        </div>
        <Labubu size={100} fur="#b98cff" holding="coffee" className="float slow hide-mobile" />
      </div>

      <div className="grid four mt">
        <div className="card row" style={{ gap: 14 }}>
          <Ring pct={totalPct} label={`${prog?.planned_total ?? 0}`} sub="of 72 units" />
          <div className="stat"><span className="label">Degree</span><span className="muted small">core counted + electives planned</span></div>
        </div>
        <div className="card row" style={{ gap: 14 }}>
          <Ring pct={electivePct} label={`${prog?.electives.planned ?? 0}`} sub="of 41.5" color="var(--lilac)" />
          <div className="stat"><span className="label">Electives</span><span className="muted small">planned so far</span></div>
        </div>
        <div className="card stack" style={{ gap: 8 }}>
          <span className="label stat"><span className="label">Requirements</span></span>
          <span className={`badge ${prog?.ldr.met ? 'lime' : 'amber'}`}>{prog?.ldr.met ? '✓' : '○'} Leadership (LDR)</span>
          <span className={`badge ${prog?.gsr.met || prog?.gsr.in_plan.length ? 'lime' : 'amber'}`}>
            {prog?.gsr.met ? '✓ Global Studies done' : prog?.gsr.in_plan.length ? '◐ Global course planned' : '○ Global Studies'}
          </span>
        </div>
        <div className="card stack" style={{ gap: 6 }}>
          <span className="stat"><span className="label">Spring 2027</span><span className="value">{spring?.units ?? 0} units</span></span>
          <span className={`badge ${clashes ? 'red' : 'lime'}`}>{clashes ? `${clashes} clash${clashes > 1 ? 'es' : ''}` : 'No clashes'}</span>
          {spring && spring.units < 16 && <span className="badge amber">Below 16-unit minimum</span>}
        </div>
      </div>

      <div className="grid two mt" style={{ alignItems: 'start' }}>
        <div className="card">
          <div className="card-title">⏳ Coming up</div>
          <div className="stack tight">
            {upcoming.length === 0 && <span className="muted small">Loading dates…</span>}
            {upcoming.map((d) => {
              const n = daysUntil(d.date, new Date(today + 'T00:00:00'))
              return (
                <div key={d.date + d.title} className="row between" style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{d.title}</div>
                    <div className="faint small">{prettyDate(d.date)}</div>
                  </div>
                  <span className={`badge ${n <= 7 ? 'pink' : n <= 30 ? 'amber' : 'gray'}`}>{relDays(n)}</span>
                </div>
              )
            })}
          </div>
          <button className="link-btn small mt" onClick={() => go('calendar')}>See full calendar →</button>
        </div>
        <div className="grid two">
          {ACTIONS.map((a) => (
            <button key={a.route} className="card hoverable" style={{ textAlign: 'left', color: 'inherit', font: 'inherit' }} onClick={() => go(a.route)}>
              <div style={{ fontSize: 26 }}>{a.emoji}</div>
              <h4 style={{ margin: '6px 0 2px' }}>{a.title}</h4>
              <div className="muted small">{a.text}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
