import type { Course } from './api'

/**
 * The catalog's structured timing columns are blank on 209 of 234 rows, so the
 * only reliable source is the free-text "Daytimes" field:
 *   "M  W 10:05 AM-11:25 AM"   "T  Th 1:00 PM-2:20 PM"
 * Parsing it here gives day chips, a weekly grid and clash detection.
 */

export const DAYS = ['M', 'T', 'W', 'Th', 'F'] as const
export type Day = (typeof DAYS)[number]

export const DAY_NAMES: Record<Day, string> = {
  M: 'Monday',
  T: 'Tuesday',
  W: 'Wednesday',
  Th: 'Thursday',
  F: 'Friday',
}

export interface Meeting {
  days: Day[]
  /** Minutes from midnight, so ranges can be compared numerically. */
  start: number
  end: number
  label: string
}

const TIME_RE = /(\d{1,2}):(\d{2})\s*([AP])M/gi

function toMinutes(h: number, m: number, meridiem: string): number {
  let hour = h % 12
  if (meridiem.toUpperCase() === 'P') hour += 12
  return hour * 60 + m
}

export function parseMeeting(raw: string | undefined): Meeting | null {
  const text = (raw ?? '').replace(/\s+/g, ' ').trim()
  if (!text) return null

  TIME_RE.lastIndex = 0
  const times = [...text.matchAll(TIME_RE)]
  if (times.length < 2) return null

  const start = toMinutes(Number(times[0][1]), Number(times[0][2]), times[0][3])
  const end = toMinutes(Number(times[1][1]), Number(times[1][2]), times[1][3])

  // Everything before the first time is the day list.
  const dayPart = text.slice(0, times[0].index).trim()
  const days: Day[] = []
  // Longest tokens first so "Th" is not read as "T" + "h".
  for (const token of dayPart.split(/\s+/)) {
    if (token === 'Th') days.push('Th')
    else if ((DAYS as readonly string[]).includes(token)) days.push(token as Day)
  }

  if (days.length === 0) return null
  return { days, start, end, label: formatRange(start, end) }
}

export function formatClock(minutes: number): string {
  const h24 = Math.floor(minutes / 60)
  const m = minutes % 60
  const suffix = h24 >= 12 ? 'PM' : 'AM'
  const h = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h}:${String(m).padStart(2, '0')} ${suffix}`
}

export function formatRange(start: number, end: number): string {
  return `${formatClock(start)} – ${formatClock(end)}`
}

/** fall-1 and fall-2 never collide; a full-term course overlaps both halves. */
export function termsOverlap(a: string, b: string): boolean {
  const x = (a ?? '').trim().toLowerCase()
  const y = (b ?? '').trim().toLowerCase()
  if (!x || !y) return true
  if (x === y) return true
  return x === 'fall' || y === 'fall'
}

export interface Clash {
  day: Day
  label: string
}

/** Where two course rows would put a student in two rooms at once. */
export function findClash(a: Course, b: Course): Clash | null {
  if (!termsOverlap(a['Course Session'], b['Course Session'])) return null
  const ma = parseMeeting(a.Daytimes)
  const mb = parseMeeting(b.Daytimes)
  if (!ma || !mb) return null
  if (ma.start >= mb.end || mb.start >= ma.end) return null

  const day = ma.days.find((d) => mb.days.includes(d))
  if (!day) return null

  return {
    day,
    label: `${formatRange(Math.max(ma.start, mb.start), Math.min(ma.end, mb.end))}`,
  }
}

/** True when every section of a course meets at the same time. */
export function sectionsShareSlot(sections: Course[]): boolean {
  if (sections.length < 2) return false
  const first = (sections[0].Daytimes ?? '').replace(/\s+/g, ' ').trim()
  return sections.every(
    (s) => (s.Daytimes ?? '').replace(/\s+/g, ' ').trim() === first,
  )
}

export interface CourseLike {
  key: string
  course: Course
  sections: Course[]
}

export interface PlanClash {
  a: string
  b: string
  kind: 'hard' | 'soft'
  detail: string
}

/**
 * Clashes across a shortlist. A clash is "hard" only when every combination of
 * sections collides; if some combinations are free it is a section-choice
 * problem. Shared so the tab badge and the panel never disagree.
 */
export function planClashes(chosen: CourseLike[]): PlanClash[] {
  const out: PlanClash[] = []
  for (let i = 0; i < chosen.length; i += 1) {
    for (let j = i + 1; j < chosen.length; j += 1) {
      const A = chosen[i]
      const B = chosen[j]
      if (!termsOverlap(A.course['Course Session'], B.course['Course Session'])) continue

      let combos = 0
      let collisions = 0
      let sample = ''
      for (const sa of A.sections) {
        for (const sb of B.sections) {
          if (!parseMeeting(sa.Daytimes) || !parseMeeting(sb.Daytimes)) continue
          combos += 1
          const clash = findClash(sa, sb)
          if (clash) {
            collisions += 1
            if (!sample) sample = `${clash.day} ${clash.label}`
          }
        }
      }
      if (combos === 0 || collisions === 0) continue
      out.push({
        a: A.course['Course Number'],
        b: B.course['Course Number'],
        kind: collisions === combos ? 'hard' : 'soft',
        detail: sample,
      })
    }
  }
  return out
}

/**
 * Whether a candidate course can be fitted alongside everything already in the
 * plan. "Impossible" means every section of the candidate collides with every
 * section of something you have picked — if any combination is free, it still
 * fits and only the section choice matters.
 */
export function fitsAlongside(candidate: CourseLike, chosen: CourseLike[]): boolean {
  for (const other of chosen) {
    if (other.key === candidate.key) continue
    if (!termsOverlap(candidate.course['Course Session'], other.course['Course Session'])) {
      continue
    }
    let combos = 0
    let collisions = 0
    for (const a of candidate.sections) {
      for (const b of other.sections) {
        if (!parseMeeting(a.Daytimes) || !parseMeeting(b.Daytimes)) continue
        combos += 1
        if (findClash(a, b)) collisions += 1
      }
    }
    if (combos > 0 && collisions === combos) return false
  }
  return true
}

/** Does any section of this course meet on the given day? */
export function meetsOn(group: CourseLike, day: Day): boolean {
  return (group.sections.length ? group.sections : [group.course]).some((s) => {
    const m = parseMeeting(s.Daytimes)
    return m ? m.days.includes(day) : false
  })
}

/** Is there a section starting no earlier than `minute`? */
export function hasSectionStartingAfter(group: CourseLike, minute: number): boolean {
  const rows = group.sections.length ? group.sections : [group.course]
  const timed = rows.map((s) => parseMeeting(s.Daytimes)).filter(Boolean)
  // Courses with no published time are not excluded by a time filter.
  if (timed.length === 0) return true
  return timed.some((m) => m!.start >= minute)
}

/** Is there a section that ends by `minute`? */
export function hasSectionEndingBy(group: CourseLike, minute: number): boolean {
  const rows = group.sections.length ? group.sections : [group.course]
  const timed = rows.map((s) => parseMeeting(s.Daytimes)).filter(Boolean)
  if (timed.length === 0) return true
  return timed.some((m) => m!.end <= minute)
}

/** Every section falls on days outside `days` — e.g. nothing on a Friday. */
export function avoidsDays(group: CourseLike, days: Day[]): boolean {
  const rows = group.sections.length ? group.sections : [group.course]
  const timed = rows.map((s) => parseMeeting(s.Daytimes)).filter(Boolean)
  if (timed.length === 0) return true
  return timed.some((m) => !m!.days.some((d) => days.includes(d)))
}
