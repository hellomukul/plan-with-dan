import type { Course } from './api'
import { semesterOf, subjectsOf } from './facets'
import { DAYS, DAY_NAMES, formatClock, parseMeeting } from './schedule'
import type { Day } from './schedule'

export interface Group {
  key: string
  course: Course
  sections: Course[]
}

export interface Insight {
  kind: 'good' | 'warn' | 'info'
  headline: string
  detail: string
}

interface Slot {
  key: string
  number: string
  title: string
  day: Day
  start: number
  end: number
}

const EARLY = 9 * 60 // anything starting before 9:00
const BACK_TO_BACK = 20 // minutes or less between classes
const LONG_GAP = 180 // three hours

/** The section you picked, or the first one if you have not picked. */
function slotsFor(
  chosen: Group[],
  sectionChoice: Record<string, string>,
  semester: string,
): Slot[] {
  const out: Slot[] = []
  for (const g of chosen) {
    if (semesterOf(g.course) !== semester) continue
    const rows = g.sections.length ? g.sections : [g.course]
    const picked = rows.find((s) => s.Section?.trim() === sectionChoice[g.key])
    const row = picked ?? rows[0]
    const meet = parseMeeting(row.Daytimes)
    if (!meet) continue
    for (const day of meet.days) {
      out.push({
        key: g.key,
        number: g.course['Course Number'],
        title: g.course['Course Title'].trim(),
        day,
        start: meet.start,
        end: meet.end,
      })
    }
  }
  return out
}

function hours(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

/** What your week is actually like, from the times you have chosen. */
export function rateMyWeek(
  chosen: Group[],
  sectionChoice: Record<string, string>,
  semester: string,
): Insight[] {
  const slots = slotsFor(chosen, sectionChoice, semester)
  if (slots.length === 0) return []

  const out: Insight[] = []
  const byDay = new Map<Day, Slot[]>()
  for (const s of slots) {
    byDay.set(s.day, [...(byDay.get(s.day) ?? []), s])
  }
  for (const [, list] of byDay) list.sort((a, b) => a.start - b.start)

  // Days off.
  const free = DAYS.filter((d) => !byDay.has(d))
  if (free.length > 0) {
    out.push({
      kind: 'good',
      headline: `${free.length} day${free.length === 1 ? '' : 's'} clear`,
      detail: `No classes on ${free.map((d) => DAY_NAMES[d]).join(', ')}.`,
    })
  }

  // Early starts.
  const early = [...byDay.entries()].filter(([, l]) => l[0].start < EARLY)
  if (early.length > 0) {
    out.push({
      kind: 'warn',
      headline: `${early.length} early start${early.length === 1 ? '' : 's'}`,
      detail: early
        .map(([d, l]) => `${DAY_NAMES[d]} at ${formatClock(l[0].start)}`)
        .join(', ') + '.',
    })
  }

  // Back-to-back and long gaps.
  const tight: string[] = []
  const gaps: string[] = []
  for (const [day, list] of byDay) {
    for (let i = 1; i < list.length; i += 1) {
      const gap = list[i].start - list[i - 1].end
      if (gap <= BACK_TO_BACK) {
        tight.push(`${list[i - 1].number}→${list[i].number} on ${DAY_NAMES[day]}`)
      } else if (gap >= LONG_GAP) {
        gaps.push(`${hours(gap)} on ${DAY_NAMES[day]}`)
      }
    }
  }
  if (tight.length > 0) {
    out.push({
      kind: 'warn',
      headline: `${tight.length} back-to-back`,
      detail: `${tight.join(', ')} — ${BACK_TO_BACK} minutes or less between them.`,
    })
  }
  if (gaps.length > 0) {
    out.push({
      kind: 'info',
      headline: 'Long gaps',
      detail: `${gaps.join(', ')}. Good for study blocks, bad for going home.`,
    })
  }

  // One-class days — the commute-for-80-minutes problem.
  const thin = [...byDay.entries()].filter(([, l]) => l.length === 1)
  if (thin.length > 0 && byDay.size > 1) {
    out.push({
      kind: 'info',
      headline: `${thin.length} single-class day${thin.length === 1 ? '' : 's'}`,
      detail: thin
        .map(([d, l]) => `${DAY_NAMES[d]} for ${l[0].number} only`)
        .join(', ') + '. Worth stacking if you commute.',
    })
  }

  // Longest day on campus.
  let longest: { day: Day; span: number } | null = null
  for (const [day, list] of byDay) {
    const span = list[list.length - 1].end - list[0].start
    if (!longest || span > longest.span) longest = { day, span }
  }
  if (longest && longest.span > 0) {
    out.push({
      kind: longest.span > 6 * 60 ? 'warn' : 'info',
      headline: `Longest day: ${hours(longest.span)}`,
      detail: `${DAY_NAMES[longest.day]}, first class to last.`,
    })
  }

  return out
}

/** Someone you are taking more than once. */
export function instructorOverlap(chosen: Group[]): Insight[] {
  const byName = new Map<string, Set<string>>()
  for (const g of chosen) {
    for (const s of g.sections.length ? g.sections : [g.course]) {
      const name = (s['Faculty 1'] ?? '').trim()
      if (!name) continue
      byName.set(name, (byName.get(name) ?? new Set()).add(g.key))
    }
  }

  return [...byName.entries()]
    .filter(([, keys]) => keys.size > 1)
    .map(([name, keys]) => {
      const [last, first] = name.split(',').map((s) => s.trim())
      const label = first ? `${first} ${last}` : name
      const numbers = chosen
        .filter((g) => keys.has(g.key))
        .map((g) => g.course['Course Number'])
      return {
        kind: 'info' as const,
        headline: `${label} twice`,
        detail: `You have them for ${numbers.join(' and ')}. Worth knowing before you commit to both.`,
      }
    })
}

export interface SubjectDepth {
  subject: string
  taken: number
  available: number
  remaining: Group[]
}

/** How deep you are in each area, and what else is there. */
export function subjectDepth(chosen: Group[], all: Group[]): SubjectDepth[] {
  const takenBy = new Map<string, number>()
  const chosenKeys = new Set(chosen.map((g) => g.key))
  for (const g of chosen) {
    for (const s of subjectsOf(g.course)) {
      takenBy.set(s, (takenBy.get(s) ?? 0) + 1)
    }
  }

  return [...takenBy.entries()]
    .map(([subject, taken]) => {
      const inSubject = all.filter((g) => subjectsOf(g.course).includes(subject))
      return {
        subject,
        taken,
        available: inSubject.length,
        remaining: inSubject.filter((g) => !chosenKeys.has(g.key)),
      }
    })
    .sort((a, b) => b.taken - a.taken)
}
