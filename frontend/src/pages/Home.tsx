/* Dan's Desk: the signed-in home. Built to be glanced at between classes, and to answer "what is this for, and
   what do I do next?" (student feedback, Oct 25):
   0. "Your next step": one card, one primary button, picked from the plan.
   1. "How Dan works": the three steps of a semester (choose courses → plan your terms → lock it in), each with
      where this student stands and the page that does it (components/DeskGuide).
   2. today strip (next class, room, live countdown) + a countdown tile (course auction or next deadline)
   3. this week (deadlines and decisions, each with one next action) + "Where to find it"
   The weekly timetable lives on My plan & timetable only (it used to be repeated here), and units, Leadership and
   Global Studies now show in the three steps instead of separate progress rings. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight, CalendarClock, CalendarDays, Check, CircleAlert, Gavel, Sparkles,
} from 'lucide-react'
import {
  api, auctionApplies, type CalendarEvents, type DeskCard, type DeskResponse, type ProgramsInfo,
} from '../api'
import CourseDrawer from '../components/CourseDrawer'
import { DeskSteps, DeskWhere } from '../components/DeskGuide'
import Elihu from '../mascots/Elihu'
import HandsomeDan from '../mascots/HandsomeDan'
import TodayStrip from '../components/TodayStrip'
import {
  auctionPhase, clockText, countdown, dayDiff, dayName, dayStart, isoDay, msToNextMinute, type Meeting,
} from '../lib/deskTime'
import { DAY_NAMES, termName } from '../lib/format'
import { useApp, type Route } from '../state'
import './desk.css'
import { PACKAGE_GOAL_KEY } from '../lib/elihu'

/* ------------------------------------------------------------------ clock */

/** Dev-only test hooks: sessionStorage 'pwd-desk-now' (ISO date-time) pins the Desk's clock;
    'pwd-desk-shift' (an ISO date-time) starts the clock there and lets it keep running. */
const shiftBase = Date.now()
function readNow(): Date {
  if (import.meta.env.DEV) {
    const pinned = sessionStorage.getItem('pwd-desk-now')
    if (pinned && !Number.isNaN(Date.parse(pinned))) return new Date(pinned)
    const shift = sessionStorage.getItem('pwd-desk-shift')
    if (shift && !Number.isNaN(Date.parse(shift))) return new Date(Date.parse(shift) + (Date.now() - shiftBase))
  }
  return new Date()
}

/** The current time, re-read on every minute boundary and when the tab comes back into view. */
function useNow(): Date {
  const [now, setNow] = useState(readNow)
  useEffect(() => {
    let timer = 0
    const tick = () => {
      const n = readNow()
      setNow(n)
      timer = window.setTimeout(tick, msToNextMinute(n))
    }
    timer = window.setTimeout(tick, msToNextMinute(readNow()))
    const onVis = () => { if (document.visibilityState === 'visible') { window.clearTimeout(timer); tick() } }
    document.addEventListener('visibilitychange', onVis)
    return () => { window.clearTimeout(timer); document.removeEventListener('visibilitychange', onVis) }
  }, [])
  return now
}

const fmtUnits = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))
const firstSentence = (t: string) => (/^[\s\S]*?[.!?](?=\s|$)/.exec(t.trim())?.[0] ?? t).trim()

/* ------------------------------------------------------------------ countdown tile */

/** The next SOM deadline (not a class day or break) that hasn't passed. */
function nextDeadline(cal: CalendarEvents | null, now: Date) {
  const today = isoDay(now)
  return cal?.deadlines.find((d) => (d.end ?? d.date) >= today && d.kind === 'deadline') ?? null
}
const isDropDeadline = (title: string) => /drop/i.test(title)

function CountdownTile({ programs, cal, now, auctionFor, go, error, onRetry }: {
  programs: ProgramsInfo | null; cal: CalendarEvents | null; now: Date; auctionFor: boolean; go: (r: Route) => void
  error: boolean; onRetry: () => void
}) {
  if (error && !(auctionFor && programs)) {
    return (
      <section className="card dk-tile" aria-label="Key dates">
        <span className="dk-eyebrow"><CalendarDays className="icon sm" />Key dates</span>
        <span className="dk-tile-title">Couldn't load your dates</span>
        <span className="dk-tile-when">Check your connection and try again.</span>
        <button type="button" className="btn sm dk-tile-btn" onClick={onRetry}>Try again</button>
      </section>
    )
  }
  if (auctionFor && !programs) {
    return <section className="card dk-tile" aria-busy="true"><span className="skeleton" style={{ height: 96 }} /></section>
  }
  const a = programs?.auction
  const phase = a && auctionFor ? auctionPhase(a, now) : null
  if (!cal && !(phase && phase.phase !== 'after')) {
    return <section className="card dk-tile" aria-busy="true"><span className="skeleton" style={{ height: 96 }} /></section>
  }
  if (phase && phase.phase !== 'after') {
    return (
      <section className="card dk-tile" aria-label="Course auction countdown">
        <span className="dk-eyebrow"><Gavel className="icon sm" />Course auction</span>
        <div className="dk-tile-count">
          <span className="dk-tile-label">{phase.phase === 'before' ? 'opens in' : 'closes in'}</span>
          <span className="dk-tile-value">{countdown(phase.target.getTime() - now.getTime())}</span>
        </div>
        <span className="dk-tile-when">{phase.when}</span>
        {a && a.rounds.length > 0 && (
          <ul className="dk-tile-extra" aria-label="Auction rounds (registrar email)">
            {a.rounds.map((r) => <li key={r}>{r}</li>)}
          </ul>
        )}
        <button type="button" className="btn sm dk-tile-btn" onClick={() => go('bids')}>Plan your bids<ArrowRight className="icon sm" /></button>
      </section>
    )
  }
  if (!cal) return null
  if (cal.calendar_note) {
    return (
      <section className="card dk-tile" aria-label="Key dates">
        <span className="dk-eyebrow"><CalendarDays className="icon sm" />Key dates</span>
        <span className="dk-tile-title">Your program runs on its own calendar</span>
        <span className="dk-tile-when">Dan shows your classes; check your program office for dates.</span>
        <button type="button" className="btn sm dk-tile-btn" onClick={() => go('calendar')}>Calendar<ArrowRight className="icon sm" /></button>
      </section>
    )
  }
  const next = nextDeadline(cal, now)
  if (!next) {
    return (
      <section className="card dk-tile" aria-label="Key dates">
        <span className="dk-eyebrow"><CalendarDays className="icon sm" />Next deadline</span>
        <span className="dk-tile-title">No deadlines left this year</span>
        <span className="dk-tile-when">Enjoy it.</span>
        <button type="button" className="btn sm dk-tile-btn" onClick={() => go('calendar')}>Calendar<ArrowRight className="icon sm" /></button>
      </section>
    )
  }
  const n = dayDiff(next.date, now)
  const after = cal.deadlines.find((d) => d.date > next.date && d.kind === 'deadline')
  return (
    <section className="card dk-tile" aria-label="Next deadline">
      <span className="dk-eyebrow"><CalendarDays className="icon sm" />Next deadline</span>
      <div className="dk-tile-count">
        <span className="dk-tile-label">{n <= 0 ? 'due' : 'in'}</span>
        <span className="dk-tile-value">{n <= 0 ? 'Today' : n === 1 ? '1 day' : `${n} days`}</span>
      </div>
      <span className="dk-tile-when" title={next.title}>{dayName(next.date, now)} · {next.title.split(' (')[0]}</span>
      {after && (
        <ul className="dk-tile-extra"><li>Then {dayStart(after.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}: {after.title.split(' (')[0]}</li></ul>
      )}
      {isDropDeadline(next.title)
        ? <button type="button" className="btn sm dk-tile-btn" onClick={() => go('plan')}>Review my plan<ArrowRight className="icon sm" /></button>
        : <button type="button" className="btn sm dk-tile-btn" onClick={() => go('calendar')}>Calendar<ArrowRight className="icon sm" /></button>}
    </section>
  )
}

/* ------------------------------------------------------------------ this week */

interface WeekItem {
  id: string
  kind: 'Decision' | 'Deadline' | 'Appointment'
  title: string
  detail: string
  date: string | null
  sev: number
  label: string
  run: () => void
  card?: DeskCard
}

const SEV = { high: 0, medium: 1, low: 2 } as const

function buildWeek(desk: DeskResponse | null, cal: CalendarEvents | null, now: Date, act: (c: DeskCard) => void, go: (r: Route) => void,
  skip: (title: string, date: string | null) => boolean): WeekItem[] {
  const today = isoDay(now)
  const inWeek = (iso: string) => { const n = dayDiff(iso, now); return n >= 0 && n <= 6 }
  const cards = [...(desk?.top ?? []), ...(desk?.later ?? [])]
  let items: WeekItem[] = cards.map((c) => ({
    id: `card-${c.id}`, kind: c.kind === 'deadline' ? 'Deadline' : 'Decision', title: c.title, detail: c.detail,
    date: c.due, sev: SEV[c.severity], label: c.action.label, run: () => act(c), card: c,
  }))
  const taken = new Set(cards.filter((c) => c.due).map((c) => c.due))
  for (const d of cal?.deadlines ?? []) {
    if ((d.kind !== 'deadline' && d.kind !== 'exam') || !inWeek(d.date) || taken.has(d.date)) continue
    items.push({
      id: `cal-${d.date}-${d.title}`, kind: 'Deadline', title: d.title.split(' (')[0], detail: d.title.includes('(') ? d.title.slice(d.title.indexOf('(') + 1).replace(/\)$/, '') : 'SOM academic calendar',
      date: d.date, sev: 1, label: isDropDeadline(d.title) ? 'Review plan' : 'Calendar', run: () => go(isDropDeadline(d.title) ? 'plan' : 'calendar'),
    })
  }
  const nowMin = now.getHours() * 60 + now.getMinutes()
  for (const p of cal?.personal ?? []) {
    if (!inWeek(p.date) || (p.date === today && p.end_min <= nowMin)) continue
    items.push({
      id: `pe-${p.id}`, kind: 'Appointment', title: p.title,
      detail: `${clockText(p.start_min)}–${clockText(p.end_min)}${p.location ? ` · ${p.location}` : ''}`,
      date: p.date, sev: 1, label: 'Calendar', run: () => go('calendar'),
    })
  }
  // 0: urgent (a high-priority card that is undated, like a clash, or due within two weeks), 1: happening in the
  // next seven days, 2: everything else by date, undated last.
  const rank = (i: WeekItem) => (isUrgent(i, now) ? 0 : i.date != null && inWeek(i.date) ? 1 : 2)
  items = items.filter((i) => !skip(i.title, i.date))
  items.sort((a, b) => rank(a) - rank(b) || (a.date ?? '9999').localeCompare(b.date ?? '9999') || a.sev - b.sev)
  // Mix deadlines and decisions: if the first three hold no decision but one exists, it takes the third slot.
  const firstDecision = items.findIndex((i) => i.kind === 'Decision')
  if (firstDecision > 2 && !items.slice(0, 3).some((i) => i.kind === 'Decision')) {
    const [d] = items.splice(firstDecision, 1)
    items.splice(2, 0, d)
  }
  return items
}

function isUrgent(i: WeekItem, now: Date): boolean {
  if (i.sev !== 0) return false
  return i.date == null || dayDiff(i.date, now) <= 14
}

function WeekRow({ item, now, onDone }: { item: WeekItem; now: Date; onDone?: (c: DeskCard) => void }) {
  const d = item.date ? dayStart(item.date) : null
  const n = item.date ? dayDiff(item.date, now) : null
  const urgent = isUrgent(item, now)
  const when = n == null ? 'No fixed date' : n < 0 ? 'Overdue' : n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : n <= 6 ? `In ${n} days` : `Due ${d!.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
  return (
    <li className={`dk-item${urgent ? ' urgent' : ''}`}>
      <button type="button" className="dk-item-main" onClick={item.run}>
        <span className="dk-item-date" aria-hidden="true">
          {d && n != null && n <= 6 ? (<><span>{d.toLocaleDateString('en-US', { weekday: 'short' })}</span><b>{d.getDate()}</b></>)
            : item.kind === 'Decision' ? <CircleAlert className="icon" /> : <CalendarClock className="icon" />}
        </span>
        <span className="dk-item-body">
          <span className="dk-item-title">{item.title}</span>
          <span className="dk-item-meta">
            <span className={`dk-kind k-${item.kind.toLowerCase()}`}>{urgent ? 'Urgent' : item.kind}</span>
            <span className="dk-item-when">{when}</span>
            <span className={`dk-item-detail${item.kind === 'Appointment' ? ' keep' : ''}`}>{item.detail}</span>
          </span>
        </span>
        <span className="dk-item-action">{item.label}<ArrowRight className="icon sm" /></span>
      </button>
      {item.card && onDone && (
        <button type="button" className="btn icon ghost dk-done" title="Mark done" aria-label={`Mark done: ${item.title}`} onClick={() => onDone(item.card!)}>
          <Check className="icon sm" />
        </button>
      )}
    </li>
  )
}

/* ------------------------------------------------------------------ your next step */

/** Read and cleared by the course-package screen (#/find), which prefills its goal box with it. */
const readPendingGoal = () => { try { return sessionStorage.getItem(PACKAGE_GOAL_KEY)?.trim() ?? '' } catch { return '' } }
const sentence = (t: string) => (/[.!?]$/.test(t) ? t : `${t}.`)

interface NextStepPick { kind: 'package' | 'clash' | 'review'; title: string; detail: string; button: string; run: () => void }

/** One next step, simplest rule first:
    1. a goal typed on the home page that never reached the package screen, or no electives in the plan yet:
       build the course package (goal prefilled from that goal, else from the profile's goals);
    2. a clash in the plan: fix it on My plan;
    3. otherwise: review the plan. */
function NextStep({ go }: { go: (r: Route) => void }) {
  const { plan, profile } = useApp()
  const [pendingGoal] = useState(readPendingGoal)
  // If the plan can't load, don't hold a skeleton forever: the package is the right first step anyway.
  const [waited, setWaited] = useState(false)
  useEffect(() => {
    if (plan) return
    const t = window.setTimeout(() => setWaited(true), 2500)
    return () => window.clearTimeout(t)
  }, [plan])

  if (!plan && !waited) {
    return (
      <section className="card dk-next" aria-label="Your next step" aria-busy="true">
        <span className="skeleton dk-next-art" />
        <div className="dk-next-body">
          <span className="dk-next-eyebrow">Your next step</span>
          <span className="dk-next-title"><span className="skeleton dk-next-skel" /></span>
          <span className="dk-next-detail"><span className="skeleton dk-next-skel long" /></span>
        </div>
        <span className="skeleton dk-next-btn dk-next-btn-skel" />
      </section>
    )
  }

  const electives = (plan?.items ?? []).filter((i) => !i.section.core)
  const clashes = Object.values(plan?.terms ?? {}).flatMap((t) => t.conflicts)
  let pick: NextStepPick
  if (pendingGoal || !plan || electives.length === 0) {
    const profileGoal = [profile?.goal_short, profile?.goal_long].map((g) => g?.trim() ?? '').filter(Boolean).map(sentence).join(' ')
    const goal = pendingGoal || profileGoal
    pick = {
      kind: 'package', title: 'Get course picks for your goal', button: 'Get course picks',
      detail: goal ? `Elihu ranks courses across every quarter you have left, for your goal: “${goal}”`
        : 'Tell Elihu your goal in your own words. He ranks courses across every quarter you have left.',
      run: () => {
        try { if (goal) sessionStorage.setItem(PACKAGE_GOAL_KEY, goal) } catch { /* storage off: the package screen asks */ }
        go('find')
      },
    }
  } else if (clashes.length) {
    const c = clashes[0]
    const more = clashes.length - 1
    pick = {
      kind: 'clash', title: `${c.a} clashes with ${c.b}`, button: 'Fix the clash', run: () => go('plan'),
      detail: `${termName(c.term)}, ${DAY_NAMES[c.day] ?? c.day} ${c.window}.${more ? ` ${more} more ${more === 1 ? 'clash' : 'clashes'} after this.` : ''} Pick one, or switch a section.`,
    }
  } else {
    const p = plan.progress
    pick = {
      kind: 'review', title: 'Review your plan', button: 'Review my plan', run: () => go('plan'),
      detail: `${electives.length} ${electives.length === 1 ? 'elective' : 'electives'} planned, ${fmtUnits(p.planned_total)} of ${p.total_target || 72} units. Check sections, bids and requirements.`,
    }
  }
  return (
    <section className={`card dk-next is-${pick.kind}${pick.kind === 'package' ? ' elihu-host' : ''}`} aria-labelledby="dk-next-title">
      <span className="dk-next-art" aria-hidden="true">
        {pick.kind === 'package' ? <Elihu size={34} /> : pick.kind === 'clash' ? <CircleAlert className="icon lg" />
          : <HandsomeDan size={36} furColor="#f4b183" bandanaColor="#00356b" />}
      </span>
      <div className="dk-next-body">
        <span className="dk-next-eyebrow">Your next step</span>
        <h2 id="dk-next-title" className="dk-next-title" title={pick.title}>{pick.title}</h2>
        <p className="dk-next-detail" title={pick.detail}>{pick.detail}</p>
      </div>
      <button type="button" className="btn primary lg dk-next-btn" onClick={pick.run}>{pick.button}<ArrowRight className="icon" /></button>
    </section>
  )
}

/* ------------------------------------------------------------------ page */

export default function Home() {
  const { user, profile, plan, go, toast, sectionById } = useApp()
  const now = useNow()
  const [desk, setDesk] = useState<DeskResponse | null>(null)
  const [cal, setCal] = useState<CalendarEvents | null>(null)
  const [programs, setPrograms] = useState<ProgramsInfo | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [briefOpen, setBriefOpen] = useState(false)
  const listRef = useRef<HTMLUListElement>(null)
  const [listH, setListH] = useState<number | null>(null)
  const closeDrawer = useCallback(() => setOpen(null), [])

  const loadDesk = useCallback(() => api.desk().then(setDesk).catch(() => undefined), [])
  const [calError, setCalError] = useState(false)
  const loadCal = useCallback(() => api.calendarEvents().then((c) => { setCal(c); setCalError(false) }).catch(() => setCalError(true)), [])
  useEffect(() => { api.programs().then(setPrograms).catch(() => undefined) }, [])
  // The plan drives the desk cards and the class list, so (re)load both once the plan is in and whenever it
  // changes (add, remove, undo). Waiting for the plan avoids two concurrent /api/desk calls on first load,
  // which could each write a brief. If the plan can't load, fall back after a moment so the Desk still fills.
  useEffect(() => {
    if (plan) { loadDesk(); loadCal(); return }
    const t = window.setTimeout(() => { loadDesk(); loadCal() }, 2500)
    return () => window.clearTimeout(t)
  }, [plan, loadDesk, loadCal])

  const act = useCallback((c: DeskCard) => {
    if (c.action.type === 'scroll') go(c.action.target === 'fits' ? 'find' : 'plan')
    else if (c.action.route) go(c.action.route as Route)
  }, [go])
  const markDone = async (c: DeskCard) => {
    await api.deskCard(c.id, 'done')
    await loadDesk()
    toast('Marked done', 'good', { label: 'Undo', run: async () => { await api.deskCard(c.id, 'active'); loadDesk() } })
  }

  const auctionFor = auctionApplies(profile?.program, profile?.year)
  // Whatever the countdown tile shows (the auction, or the next deadline) is left out of "This week", so the
  // three slots go to other things.
  const tileShowsAuction = !!(auctionFor && programs?.auction && auctionPhase(programs.auction, now).phase !== 'after')
  const tileDeadline = tileShowsAuction || cal?.calendar_note ? null : nextDeadline(cal, now)
  const skip = useCallback((title: string, date: string | null) =>
    (tileShowsAuction && /^Course auction (opens|closes)/.test(title))
    || (!!tileDeadline && date === tileDeadline.date && tileDeadline.title.startsWith(title)), [tileShowsAuction, tileDeadline])
  const week = useMemo(() => buildWeek(desk, cal, now, act, go, skip), [desk, cal, now, act, go, skip])
  const top = week.slice(0, 3)
  const rest = week.slice(3)
  const h = now.getHours()
  const hello = h < 5 ? 'Up late' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
  const first = (user?.name || '').split(' ')[0]
  const hasPlan = (plan?.items.length ?? 0) > 0 || (cal?.classes.length ?? 0) > 0
  const mba = (profile?.program ?? 'MBA') === 'MBA' || profile?.program === 'MBA-JOINT'
  const needsCohort = mba && profile?.year === '1' && !profile?.cohort && !(cal?.classes.length)
  const brief = desk ? firstSentence(desk.brief.text) : ''
  const briefMore = desk ? desk.brief.text.trim().length > brief.length + 1 : false
  const sectionKey = (id: string) => plan?.items.find((i) => i.section.id === id)?.section.key

  return (
    <div className="dk">
      <header className="dk-top">
        <div className="dk-hello">
          <span className="dk-date">{now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</span>
          <h1>{hello}{first ? `, ${first}` : ''}</h1>
        </div>
      </header>

      <NextStep go={go} />

      <div className="dk-brief" aria-live="polite">
        <span className="dk-brief-dot" aria-hidden="true" />
        {desk ? (
          <span className="dk-brief-text" title={desk.brief.text}>{brief}</span>
        ) : <span className="skeleton dk-brief-skel" />}
        {briefMore && (
          <button type="button" className="link-btn small dk-brief-more" onClick={() => setBriefOpen((v) => !v)}
            aria-expanded={briefOpen} aria-controls="dk-brief-full">
            {briefOpen ? 'Less' : 'More'}
          </button>
        )}
        {/* The full brief opens over the page (not inline), so the cards below never move. */}
        {briefOpen && desk && (
          <div id="dk-brief-full" className="dk-brief-pop" role="region" aria-label="Dan's full brief"
            onKeyDown={(e) => { if (e.key === 'Escape') setBriefOpen(false) }}>
            <p>{desk.brief.text}</p>
            <button type="button" className="link-btn small" onClick={() => setBriefOpen(false)}>Close</button>
          </div>
        )}
      </div>

      <DeskSteps programs={programs} now={now} go={go} />

      <div className="dk-grid">
        <TodayStrip
          classes={cal ? cal.classes as Meeting[] : null} now={now} hasPlan={hasPlan} needsCohort={needsCohort}
          error={calError && !cal} onRetry={loadCal}
          onOpenCourse={(id) => { const k = sectionById.get(id)?.key ?? sectionKey(id); if (k) setOpen(k) }}
          go={go}
        />
        <CountdownTile programs={programs} cal={cal} now={now} auctionFor={auctionFor} go={go} error={calError && !cal} onRetry={loadCal} />

        <section className="card dk-week" aria-label="This week">
          <div className="dk-head">
            <h2>Coming up</h2>
            {rest.length > 0 && (
              <button type="button" className="link-btn small" aria-expanded={showAll} aria-controls="dk-week-list"
                onClick={() => { if (!showAll) setListH(listRef.current?.offsetHeight ?? null); setShowAll((v) => !v) }}>
                {showAll ? 'Show less' : `${rest.length} more`}
              </button>
            )}
          </div>
          {!desk || (!cal && !calError) ? (
            <ul className="dk-list">{[0, 1, 2].map((i) => <li key={i} className="dk-item"><span className="skeleton dk-item-skel" /></li>)}</ul>
          ) : top.length === 0 ? (
            <div className="dk-clear">
              <Sparkles className="icon lg" />
              <b>Nothing due this week</b>
              <span className="muted small">No clashes, deadlines or open decisions. Dan will flag the next one here.</span>
            </div>
          ) : (
            <>
              {/* "N more" scrolls the full list inside the same box instead of adding a card below. */}
              <ul className={`dk-list${showAll ? ' dk-list-all' : ''}`} id="dk-week-list" ref={listRef}
                style={showAll && listH ? { height: listH } : undefined} tabIndex={showAll ? 0 : undefined}
                aria-label={showAll ? `All ${week.length} items this week` : undefined}>
                {(showAll ? week : top).map((i) => <WeekRow key={i.id} item={i} now={now} onDone={markDone} />)}
              </ul>
              {top.length < 3 && <p className="dk-week-end">That's everything for now. Dan flags new things here.</p>}
            </>
          )}
        </section>
        <DeskWhere go={go} />
      </div>

      {open && <CourseDrawer courseKey={open} onClose={closeDrawer} />}
    </div>
  )
}
