/* Pure time helpers for Dan's Desk. Everything takes `now` so the today strip, the week view and the
   auction countdown can be checked for any moment (weekday, weekend, in class, no classes). Times are the
   browser's local clock, which for a student on campus is New Haven time. Self-contained on purpose. */

export interface Meeting { date: string; start_min: number; end_min: number; title: string; room: string; course_id: string; status?: string }

export const WEEKDAY_CODES = ['Su', 'M', 'T', 'W', 'Th', 'F', 'Sa'] as const

/** "2026-10-26" -> local Date at midnight. */
export function dayStart(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** Local ISO date of a Date (not UTC, so late-evening students don't jump a day). */
export function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function at(iso: string, minutes: number): Date {
  const d = dayStart(iso)
  d.setMinutes(minutes)
  return d
}

/** Whole calendar days from `now`'s date to `iso` (0 = today, 1 = tomorrow). */
export function dayDiff(iso: string, now: Date): number {
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((dayStart(iso).getTime() - a.getTime()) / 86_400_000)
}

/** Compact live countdown: "35m", "2h 10m", "3d 4h". Under a minute reads "<1m". */
export function countdown(ms: number): string {
  if (ms <= 0) return 'now'
  const mins = Math.floor(ms / 60_000)
  if (mins < 1) return '<1m'
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  if (h < 24) return `${h}h ${String(mins % 60).padStart(2, '0')}m`
  const d = Math.floor(h / 24)
  return `${d}d ${h % 24}h`
}

/** "8:30 a.m." / "12:00 noon" / "5 p.m." -> minutes after midnight (null when unreadable). */
export function parseClock(text: string): number | null {
  const m = /(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?|noon)?/i.exec(text || '')
  if (!m) return null
  let h = Number(m[1]) % 12
  const min = Number(m[2] || 0)
  const suffix = (m[3] || '').toLowerCase()
  if (suffix.startsWith('p') || (suffix === 'noon')) h += 12
  if (suffix === 'noon' && Number(m[1]) === 12) h = 12
  return h * 60 + min
}

/** "Today", "Tomorrow", or "Mon, Oct 26". */
export function dayName(iso: string, now: Date): string {
  const n = dayDiff(iso, now)
  if (n === 0) return 'Today'
  if (n === 1) return 'Tomorrow'
  if (n === -1) return 'Yesterday'
  return dayStart(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

export function clockText(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

export interface TodayState {
  /** the class happening right now, if any */
  current: Meeting | null
  /** the next class to start after now (today or a later day) */
  next: Meeting | null
  /** classes still to start today after `next` (not counting current/next) */
  laterToday: number
  /** classes on today's date in total */
  todayTotal: number
  weekend: boolean
}

/** What the today strip shows at `now`: the class in progress, the next one, and how much of today is left. */
export function todayState(classes: Meeting[], now: Date): TodayState {
  const today = isoDay(now)
  const t = now.getTime()
  const sorted = [...classes].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.start_min - b.start_min))
  let current: Meeting | null = null
  let next: Meeting | null = null
  for (const c of sorted) {
    if (c.date < today) continue
    const s = at(c.date, c.start_min).getTime()
    const e = at(c.date, c.end_min).getTime()
    if (s <= t && t < e) { if (!current) current = c; continue }
    if (s > t) { next = c; break }
  }
  const todays = sorted.filter((c) => c.date === today)
  const startedOrNext = new Set([current, next].filter(Boolean))
  const laterToday = todays.filter((c) => at(c.date, c.start_min).getTime() > t && !startedOrNext.has(c)).length
  const dow = now.getDay()
  return { current, next, laterToday, todayTotal: todays.length, weekend: dow === 0 || dow === 6 }
}

/** The Mon–Fri week to show: this week on a weekday, next week on Saturday or Sunday. */
export function shownWeek(now: Date): string[] {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const dow = d.getDay()
  const toMonday = dow === 0 ? 1 : dow === 6 ? 2 : 1 - dow
  d.setDate(d.getDate() + toMonday)
  return Array.from({ length: 5 }, (_, i) => {
    const x = new Date(d)
    x.setDate(d.getDate() + i)
    return isoDay(x)
  })
}

export interface Auction { opens: string; opens_time: string; closes: string; closes_time: string }
export type AuctionPhase =
  | { phase: 'before'; target: Date; label: string; when: string }
  | { phase: 'open'; target: Date; label: string; when: string }
  | { phase: 'after' }

/** Before the opening, count down to it; while it's open, count down to the close; afterwards, nothing. */
export function auctionPhase(a: Auction, now: Date): AuctionPhase {
  const opens = at(a.opens, parseClock(a.opens_time) ?? 0)
  const closes = at(a.closes, parseClock(a.closes_time) ?? 0)
  const fmt = (iso: string, time: string) =>
    `${dayStart(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · ${time}`
  if (now < opens) return { phase: 'before', target: opens, label: 'Course auction opens in', when: fmt(a.opens, a.opens_time) }
  if (now < closes) return { phase: 'open', target: closes, label: 'Course auction closes in', when: fmt(a.closes, a.closes_time) }
  return { phase: 'after' }
}

/** Milliseconds until the next whole minute, so a per-minute tick lands on the minute. */
export function msToNextMinute(now: Date): number {
  return 60_000 - (now.getSeconds() * 1000 + now.getMilliseconds()) + 50
}
