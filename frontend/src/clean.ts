import type { Course } from './api'

/**
 * The SOM export carries a handful of data-entry faults. They are small but
 * they surface badly: a stray space in a room makes "EVANS " look wrong, a
 * duplicated email makes a mailto link dead, and a nickname splits one
 * professor into two people with half their courses each.
 *
 * Everything here is cleaned once, at the point the API response is parsed,
 * so no component has to remember to do it.
 */

/** Trim, and collapse runs of whitespace — "M  W" becomes "M W". */
export function cleanText(value: string | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim()
}

/**
 * One row reads "tauhid.zaman@yale.edubtauhid.zaman@yale.edu" — the address
 * repeated, joined by a stray letter. Take the first well-formed address and
 * drop anything that is not one.
 */
const TLD = String.raw`(?:edu|com|org|net|gov|io|ac\.uk)`

export function cleanEmail(value: string | undefined): string {
  let raw = (value ?? '').trim().toLowerCase()
  if (!raw) return ''

  // A duplicated address has a second '@'; nothing valid lives past it.
  const at = raw.indexOf('@')
  if (at !== -1) {
    const rest = raw.slice(at + 1)
    const second = rest.indexOf('@')
    if (second !== -1) raw = raw.slice(0, at + 1) + rest.slice(0, second)
  }

  // Trim the domain back to the first real TLD, so "yale.edubtauhid.zaman"
  // becomes "yale.edu" rather than being thrown away.
  const match = new RegExp(
    String.raw`^([a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*?\.` + TLD + `)`,
  ).exec(raw)
  return match ? match[1] : ''
}

/**
 * Yale writes some people two ways — "Thomas, Jake" and "Thomas, Jacob" — and
 * each spelling gets its own instructor entry with half the courses. The email
 * settles it: same address, same person. Derived from the data rather than a
 * hardcoded list, so it keeps working when the roster changes.
 *
 * Longest spelling wins, which is the formal one in every case here.
 */
export function buildNameAliases(rows: Course[]): Map<string, string> {
  const byEmail = new Map<string, Set<string>>()
  for (const r of rows) {
    const name = cleanText(r['Faculty 1'])
    const email = cleanEmail(r['Faculty 1 Email'])
    if (!name || !email) continue
    byEmail.set(email, (byEmail.get(email) ?? new Set()).add(name))
  }

  const aliases = new Map<string, string>()
  for (const names of byEmail.values()) {
    if (names.size < 2) continue
    const canonical = [...names].sort((a, b) => b.length - a.length)[0]
    for (const n of names) if (n !== canonical) aliases.set(n, canonical)
  }
  return aliases
}

/** Clean every row, then fold nickname spellings into one person. */
export function cleanCourses(rows: Course[]): Course[] {
  const tidied = rows.map((r) => ({
    ...r,
    'Course Title': cleanText(r['Course Title']),
    'Course Number': cleanText(r['Course Number']),
    Section: cleanText(r.Section),
    Room: cleanText(r.Room),
    Daytimes: cleanText(r.Daytimes),
    Units: cleanText(r.Units),
    'Faculty 1': cleanText(r['Faculty 1']),
    'Faculty 1 Email': cleanEmail(r['Faculty 1 Email']),
    'Course Category': cleanText(r['Course Category']),
    'Course Session': cleanText(r['Course Session']),
    Syllabus: cleanText(r.Syllabus),
    'Old Syllabus': cleanText(r['Old Syllabus']),
  }))

  const aliases = buildNameAliases(tidied)
  if (aliases.size === 0) return tidied

  return tidied.map((r) => {
    const canonical = aliases.get(r['Faculty 1'])
    return canonical ? { ...r, 'Faculty 1': canonical } : r
  })
}
