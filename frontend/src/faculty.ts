import type { Course } from './api'
import { cleanBio, semesterOf, subjectsOf } from './facets'
import { topicsOf } from './topics'
import { FACULTY_SLUGS } from './facultyLinks'

export interface Group {
  key: string
  course: Course
  sections: Course[]
}

export interface Faculty {
  /** "Nakhmurina, Anya" — how the catalog writes it. */
  raw: string
  /** "Anya Nakhmurina" — how a person writes it. */
  name: string
  initials: string
  email: string
  bio: string
  /** Courses they teach, newest term first. */
  courses: Group[]
  sections: number
  subjects: string[]
  /** Inferred from titles and descriptions, so core courses count too. */
  topics: string[]
  semesters: string[]
  /** Stable colour from the name, so a face is recognisable without a photo. */
  hue: number
  /** Yale's own directory page, when Yale published the slug. */
  profile: string | null
}

const DIRECTORY = 'https://som.yale.edu/faculty-research/faculty-directory'

/**
 * Yale's portraits sit behind rotating Drupal tokens
 * (…_DSC5830_0.jpg.webp?h=…&itok=…) — not derivable from a name, and a
 * hotlink breaks when the token rotates. A stable colour per person at least
 * makes the list scannable.
 */
function hueFor(raw: string): number {
  let hash = 0
  for (let i = 0; i < raw.length; i += 1) hash = (hash * 31 + raw.charCodeAt(i)) >>> 0
  return hash % 360
}

export function displayName(raw: string): string {
  const [last, first] = raw.split(',').map((s) => s.trim())
  return first ? `${first} ${last}` : raw
}

export function initialsOf(raw: string): string {
  const [last = '', first = ''] = raw.split(',').map((s) => s.trim())
  return `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase() || '?'
}

/**
 * Yale's directory page for someone, but only when Yale published the slug.
 * A name-derived guess 404s for about a third of the faculty, so the rest get
 * the directory itself rather than a broken link.
 */
export function profileUrl(raw: string): string | null {
  const slug = FACULTY_SLUGS[raw.trim()]
  return slug ? `${DIRECTORY}/${slug}` : null
}

/** A LinkedIn people search, not a guessed profile URL. */
export function linkedinSearch(raw: string): string {
  const q = encodeURIComponent(`${displayName(raw)} Yale School of Management`)
  return `https://www.linkedin.com/search/results/people/?keywords=${q}`
}

export function directorySearch(raw: string): string {
  return `${DIRECTORY}?search=${encodeURIComponent(displayName(raw))}`
}

/** Everyone who teaches something, with what they teach. */
export function buildFaculty(groups: Group[]): Faculty[] {
  const byName = new Map<string, Group[]>()
  for (const g of groups) {
    for (const s of g.sections.length ? g.sections : [g.course]) {
      const raw = (s['Faculty 1'] ?? '').trim()
      if (!raw) continue
      const list = byName.get(raw) ?? []
      if (!list.some((x) => x.key === g.key)) list.push(g)
      byName.set(raw, list)
    }
  }

  return [...byName.entries()]
    .map(([raw, courses]) => {
      const sections = courses.reduce(
        (n, g) =>
          n +
          (g.sections.length ? g.sections : [g.course]).filter(
            (s) => (s['Faculty 1'] ?? '').trim() === raw,
          ).length,
        0,
      )
      const bio =
        courses.map((g) => cleanBio(g.course.faculty_bio)).find(Boolean) ?? ''
      const email =
        courses
          .flatMap((g) => (g.sections.length ? g.sections : [g.course]))
          .map((s) => (s['Faculty 1 Email'] ?? '').trim())
          .find(Boolean) ?? ''

      return {
        raw,
        name: displayName(raw),
        initials: initialsOf(raw),
        email,
        bio,
        courses: [...courses].sort((a, b) =>
          a.course['Course Number'].localeCompare(b.course['Course Number']),
        ),
        sections,
        subjects: [...new Set(courses.flatMap((g) => subjectsOf(g.course)))],
        topics: [...new Set(courses.flatMap((g) => topicsOf(g.course)))],
        hue: hueFor(raw),
        semesters: [...new Set(courses.map((g) => semesterOf(g.course)))].sort(),
        profile: profileUrl(raw),
      }
    })
    .sort((a, b) => a.raw.localeCompare(b.raw))
}
