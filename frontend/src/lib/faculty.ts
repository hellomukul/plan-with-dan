/* Faculty, built only from the course catalog: who teaches what this year (including courses that already ended),
   and the topics of those courses. No bios, titles, photos or ratings: just what SOM publishes in the catalog.
   Name search uses whole-word prefixes, the same rule as lib/courseSearch, so "nathan" never matches "Jonathan". */
import type { Section } from '../api'
import { norm } from './courseSearch'
import { PROFILE_BASE, PROFILE_SLUGS } from './facultyLinks'

export type CourseStatus = 'done' | 'now' | 'soon'

export interface FacultyCourse {
  key: string
  lead: Section
  secs: Section[] // only the sections this person teaches
  status: CourseStatus
  starts: string | null
  ends: string | null
  team: string[] // co-teachers' catalog names ("Last, First")
}

export interface Faculty {
  name: string // catalog spelling, "Yang, Kai Hao" (also the filter value)
  display: string // "Kai Hao Yang"
  last: string
  initials: string
  courses: FacultyCourse[] // one per offering, so a course taught in both terms appears twice (fall and spring)
  /** Distinct course numbers ("MGT 650" once even when taught in both terms): use this for "N courses". */
  numbers: string[]
  sections: number
  topics: string[]
  terms: string[]
}

export const today = () => new Date().toISOString().slice(0, 10)

/** "Yang, Kai Hao" -> "Kai Hao Yang". */
export function displayName(raw: string): string {
  const [last, first] = raw.split(',').map((s) => s.trim())
  return first ? `${first} ${last}` : raw.trim()
}

function initialsOf(raw: string): string {
  const [last, first] = raw.split(',').map((s) => s.trim())
  const letter = (s = '') => (s.match(/\p{L}/u)?.[0] ?? '').toUpperCase()
  return first ? letter(first) + letter(last) : raw.trim().split(/\s+/).map((w) => letter(w)).slice(0, 2).join('')
}

const minOf = (xs: (string | null)[]) => xs.filter(Boolean).sort()[0] ?? null
const maxOf = (xs: (string | null)[]) => xs.filter(Boolean).sort().pop() ?? null

/** Everyone who teaches a visible SOM section this year, keyed by catalog name, sorted by last name. */
export function buildFaculty(sections: Section[], on = today()): Faculty[] {
  const byName = new Map<string, Map<string, Section[]>>()
  for (const s of sections) {
    for (const f of new Set(s.faculty)) {
      if (!f.trim()) continue
      let offs = byName.get(f)
      if (!offs) byName.set(f, (offs = new Map()))
      const list = offs.get(s.key)
      if (list) list.push(s); else offs.set(s.key, [s])
    }
  }
  const out: Faculty[] = []
  for (const [name, offs] of byName) {
    const courses: FacultyCourse[] = [...offs].map(([key, secs]) => {
      const starts = minOf(secs.map((s) => s.starts))
      const ends = maxOf(secs.map((s) => s.ends))
      const status: CourseStatus = ends && ends < on ? 'done' : starts && starts <= on ? 'now' : 'soon'
      const team = [...new Set(secs.flatMap((s) => s.faculty))].filter((f) => f !== name)
      return { key, lead: secs[0], secs, status, starts, ends, team }
    })
    courses.sort((a, b) => a.lead.term.localeCompare(b.lead.term) || (a.starts ?? '').localeCompare(b.starts ?? '')
      || a.lead.number.localeCompare(b.lead.number, undefined, { numeric: true }))
    const counts = new Map<string, number>()
    for (const c of courses) for (const t of c.lead.topics) counts.set(t, (counts.get(t) ?? 0) + 1)
    // Course topics come from keyword rules on each description, so one course's tags can be loose (an economics
    // course tagged "Accounting"). On a person's card we only show a theme that recurs in two or more of their
    // courses; each course's own tags still show on its course card. Most shared first; ties keep course order.
    const topics = [...counts].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).map(([t]) => t)
    out.push({
      name, display: displayName(name), last: name.split(',')[0].trim(), initials: initialsOf(name), courses,
      numbers: [...new Set(courses.map((c) => c.lead.number))],
      sections: courses.reduce((n, c) => n + c.secs.length, 0), topics,
      terms: [...new Set(courses.map((c) => c.lead.term))].sort(),
    })
  }
  return out.sort((a, b) => norm(a.last).localeCompare(norm(b.last)) || norm(a.display).localeCompare(norm(b.display)))
}

const escape = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const HONORIFIC = /^(prof|professor|dr|mr|mrs|ms)\.?$/

/** Score a person against a name query. 0 = no match. Every word must start a word of their name. */
export function scoreFaculty(f: Faculty, query: string): number {
  const words = norm(query).replace(/[^a-z0-9'\s-]/g, ' ').split(/\s+/).filter((w) => w && !HONORIFIC.test(w))
  if (!words.length) return 0
  const name = norm(f.display)
  const parts = name.split(/[\s-]+/)
  if (!words.every((w) => new RegExp(`(^|[\\s-])${escape(w)}`).test(name))) return 0
  if (words.join(' ') === name) return 100
  const whole = words.filter((w) => parts.includes(w)).length
  return 50 + whole * 10 + (norm(f.last).startsWith(words[words.length - 1]) ? 2 : 0)
}

/** A link argument to a person: the catalog name ("Novemsky, Nathan") or the display name ("Nathan Novemsky"),
    any case or accents. Null when no one teaching this year matches exactly. */
export function resolveFaculty(all: Faculty[], arg: string): Faculty | null {
  const key = norm(arg.trim()).replace(/\s+/g, ' ')
  if (!key) return null
  return all.find((f) => f.name === arg) ?? all.find((f) => norm(f.name) === key || norm(f.display) === key) ?? null
}

/** "1 course" / "3 courses": distinct course numbers this year. */
export const courseCount = (f: Pick<Faculty, 'numbers'>) => `${f.numbers.length} course${f.numbers.length === 1 ? '' : 's'}`

/** People whose name matches the query, best first. */
export function searchFaculty(all: Faculty[], query: string, limit = 8): Faculty[] {
  return all.map((f) => ({ f, s: scoreFaculty(f, query) })).filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.f.last.localeCompare(b.f.last)).slice(0, limit).map((x) => x.f)
}

/** A deterministic daily spotlight: `n` people still teaching this year, rotating by date (no randomness). */
export function spotlight(all: Faculty[], n = 4, on = today()): Faculty[] {
  const pool = all.filter((f) => f.courses.some((c) => c.status !== 'done'))
  const list = pool.length >= n ? pool : all
  if (!list.length) return []
  const day = Math.floor(Date.parse(`${on}T00:00:00Z`) / 86_400_000)
  const start = (day * n) % list.length
  return Array.from({ length: Math.min(n, list.length) }, (_, i) => list[(start + i) % list.length])
}

/** SOM's faculty directory, searched by surname (verified: ?search_api_fulltext= filters the directory; the surname
    also finds people whose catalog first name is a nickname, e.g. "Jake" for Jacob). Visiting faculty may not be listed. */
export const directoryUrl = (f: Pick<Faculty, 'last'>) =>
  `https://som.yale.edu/faculty-research/faculty-directory?search_api_fulltext=${encodeURIComponent(f.last)}`

/** Where to learn more about someone: their official SOM profile when the catalog links one and that link was checked
    and resolves (lib/facultyLinks), otherwise the directory search by surname. */
export function profileLink(f: Pick<Faculty, 'name' | 'last'>): { url: string; official: boolean } {
  const slug = PROFILE_SLUGS[f.name]
  return slug ? { url: PROFILE_BASE + slug, official: true } : { url: directoryUrl(f), official: false }
}
