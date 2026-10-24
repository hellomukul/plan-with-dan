import type { Course } from './api'
import { topicsOf } from './topics'

/**
 * The catalog's "Course Category" field mixes two unrelated ideas: which
 * programme a course belongs to (Core, EMBA, PhD, MMS AM…) and what it is
 * about (Finance, Marketing, AI…). "Course Type" separately encodes whether a
 * course is core or elective, as a comma-separated list.
 *
 * This module untangles that into facets a student actually browses by.
 */

export type FacetKey =
  | 'semester'
  | 'program'
  | 'requirement'
  | 'subject'
  | 'topic'
  | 'term'

export interface FacetDef {
  key: FacetKey
  label: string
  /** Shown under the facet name in the menu. */
  hint: string
}

export const FACETS: FacetDef[] = [
  { key: 'semester', label: 'Semester', hint: 'Which half of the year' },
  { key: 'program', label: 'Programme', hint: 'Who the course is for' },
  { key: 'requirement', label: 'Requirement', hint: 'Core or elective' },
  { key: 'subject', label: 'Subject', hint: "The catalog's own category" },
  {
    key: 'topic',
    label: 'Topic',
    hint: 'Read from titles and descriptions — not official',
  },
  { key: 'term', label: 'Term', hint: 'When it runs' },
]

/** Category values that name a programme rather than a subject area. */
const PROGRAM_CATEGORIES: Record<string, string> = {
  Core: 'MBA',
  EMBA: 'EMBA',
  PhD: 'PhD',
  MAM: 'MAM',
  GNAM: 'Global Network',
  GNW: 'Global Network',
  'MMS GBS': 'MMS',
  'MMS AM': 'MMS',
  'MMS SR': 'MMS',
}

/** Two spellings of the same area appear in the data. */
const SUBJECT_ALIASES: Record<string, string> = {
  'Business and the Law': 'Business & the Law',
}

const TERM_LABELS: Record<string, string> = {
  fall: 'Fall (full term)',
  'fall-1': 'Fall 1',
  'fall-2': 'Fall 2',
  spring: 'Spring (full term)',
  'spring-1': 'Spring 1',
  'spring-2': 'Spring 2',
}

/** TermCode -> the academic term a course belongs to. */
export const SEMESTERS: Record<string, string> = {
  '202603': 'Fall 2026',
  '202701': 'Spring 2027',
}

export function semesterOf(course: Course): string {
  return SEMESTERS[(course.TermCode ?? '').trim()] ?? 'Other'
}

function typeTokens(course: Course): string[] {
  return (course['Course Type'] ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
}

/** Which programmes a course is open to. A course can belong to several. */
export function programsOf(course: Course): string[] {
  const out = new Set<string>()
  const tokens = typeTokens(course).map((t) => t.toLowerCase())

  const fromCategory = PROGRAM_CATEGORIES[course['Course Category']?.trim()]
  if (fromCategory) out.add(fromCategory)

  if (tokens.includes('emba')) out.add('EMBA')
  if (tokens.includes('phd')) out.add('PhD')
  if (tokens.includes('mam')) out.add('MAM')
  if (tokens.some((t) => t.startsWith('mms'))) out.add('MMS')

  // "core"/"elective" describe the MBA curriculum only when no *degree*
  // programme is named alongside them: "EMBA,Core" is an EMBA core course, not
  // an MBA one. Global Network and MMS are cross-listings on MBA courses, so
  // they do not suppress MBA.
  const ownedByOther = out.has('EMBA') || out.has('PhD') || out.has('MAM')
  if (!ownedByOther && tokens.some((t) => t === 'core' || t === 'elective')) {
    out.add('MBA')
  }

  // Anything with no programme signal is an MBA-facing course.
  if (out.size === 0) out.add('MBA')
  return [...out]
}

/** Priority order when a card can only show one programme. */
const PROGRAM_PRIORITY = ['EMBA', 'PhD', 'MAM', 'MBA', 'MMS', 'Global Network']

export function primaryProgram(course: Course): string {
  const mine = programsOf(course)
  return PROGRAM_PRIORITY.find((p) => mine.includes(p)) ?? mine[0]
}

/** Core vs elective, read from the Course Type tokens. */
export function requirementsOf(course: Course): string[] {
  const out = new Set<string>()
  for (const token of typeTokens(course)) {
    const t = token.toLowerCase()
    if (t === 'core') out.add('Core')
    else if (t === 'elective') out.add('Elective')
  }
  if (out.size === 0) {
    // PhD and MMS-only listings carry no core/elective marker.
    out.add('Elective')
  }
  return [...out]
}

/** The subject area, when the category names one rather than a programme. */
export function subjectsOf(course: Course): string[] {
  const raw = (course['Course Category'] ?? '').trim()
  if (!raw || PROGRAM_CATEGORIES[raw]) return []
  return [SUBJECT_ALIASES[raw] ?? raw]
}

/** "spring-1" -> "Spring 1". Used wherever a session is shown to a person. */
export function sessionLabel(raw: string | undefined): string {
  const key = (raw ?? '').trim().toLowerCase()
  return TERM_LABELS[key] ?? raw ?? ''
}

export function termOf(course: Course): string[] {
  const raw = (course['Course Session'] ?? '').trim().toLowerCase()
  return raw ? [TERM_LABELS[raw] ?? raw] : []
}

export function valuesFor(course: Course, key: FacetKey): string[] {
  if (key === 'semester') return [semesterOf(course)]
  if (key === 'program') return programsOf(course)
  if (key === 'requirement') return requirementsOf(course)
  if (key === 'subject') return subjectsOf(course)
  if (key === 'topic') return topicsOf(course)
  return termOf(course)
}

export type Selection = Record<FacetKey, string[]>

export const EMPTY_SELECTION: Selection = {
  semester: [],
  topic: [],
  program: [],
  requirement: [],
  subject: [],
  term: [],
}

export function selectionCount(sel: Selection): number {
  return FACETS.reduce((n, f) => n + sel[f.key].length, 0)
}

/**
 * A course matches when it satisfies every facet that has a selection.
 * Within a facet the values are OR'd; across facets they are AND'd — the
 * behaviour people expect from faceted search.
 */
export function matches(course: Course, sel: Selection): boolean {
  return FACETS.every((f) => {
    const picked = sel[f.key]
    if (picked.length === 0) return true
    const mine = valuesFor(course, f.key)
    return picked.some((p) => mine.includes(p))
  })
}

/* ---------------- Handsome Dan colours ---------------- */

/**
 * Each subject area owns a coat colour, so the dogs become a visual key to the
 * catalog rather than random decoration. Programme-only courses fall back to a
 * programme colour.
 */
export const SUBJECT_COLORS: Record<string, string> = {
  Finance: '#1d4ed8',
  Economics: '#0891b2',
  Marketing: '#db2777',
  Accounting: '#7c3aed',
  Operations: '#0d9488',
  'Organizational Behavior': '#ea580c',
  'Entrepreneurship & Private Equity': '#16a34a',
  Strategy: '#b91c1c',
  'Artificial Intelligence': '#4f46e5',
  'Technology Management': '#2563eb',
  'Healthcare Management': '#059669',
  'Business & the Environment': '#65a30d',
  'Business & the Law': '#92400e',
  International: '#c026d3',
  'Real Estate': '#a16207',
  'Asset Management': '#0369a1',
  Nonprofit: '#be123c',
  'Political Science': '#7e22ce',
}

export const PROGRAM_COLORS: Record<string, string> = {
  MBA: '#00356b',
  EMBA: '#8b5cf6',
  PhD: '#b45309',
  MAM: '#0f766e',
  MMS: '#c2410c',
  'Global Network': '#0e7490',
}

/** Core vs elective gets its own coat, so the second dog is never missing. */
export const REQUIREMENT_COLORS: Record<string, string> = {
  Core: '#b91c1c',
  Elective: '#0f766e',
}

export interface DanBadge {
  color: string
  label: string
  kind: 'programme' | 'requirement'
  title: string
}

/**
 * Exactly two dogs on every card: the left one is the programme it belongs to,
 * the right one is whether it is core or elective. Both facets exist for every
 * course, so a card never shows a lone dog. Subject is carried by the coloured
 * chip instead — it has 18 values, too many to read as a coat colour.
 */
export function dansFor(course: Course): DanBadge[] {
  const program = primaryProgram(course)
  const requirement = requirementsOf(course)[0] ?? 'Elective'

  return [
    {
      color: PROGRAM_COLORS[program] ?? '#00356b',
      label: program,
      kind: 'programme',
      title: `Programme: ${program}`,
    },
    {
      color: REQUIREMENT_COLORS[requirement] ?? '#0f766e',
      label: requirement,
      kind: 'requirement',
      title: `${requirement} course`,
    },
  ]
}

/** The colour a subject chip should use, so the chip carries the subject. */
export function subjectColor(course: Course): string | null {
  const [subject] = subjectsOf(course)
  return subject ? (SUBJECT_COLORS[subject] ?? null) : null
}

/**
 * "Bid Or Permission" repeats the category for core/EMBA/PhD listings, so only
 * surface it when it actually tells you how to enrol.
 */
export function enrollmentNote(course: Course): string | null {
  const raw = (course['Bid Or Permission'] ?? '').trim().toLowerCase()
  if (raw === 'bid') return 'Bid to enrol'
  if (raw === 'permission') return 'Instructor permission'
  if (raw.endsWith('required')) return course['Bid Or Permission'].trim()
  return null
}

/* ---------------- faculty bios ---------------- */

/**
 * Roughly a fifth of the bios in the catalog are the research agent's own
 * failure message ("I could not find a Yale School of Management faculty
 * member named …"). Those are not biography, so drop them rather than print
 * an apology on the card.
 */
const BIO_FAILURE =
  /\b(could not find|couldn['’]t find|was unable to|no (?:public |official |reliable )?(?:information|record|profile|bio)|does not appear to be)\b/i

export function cleanBio(raw: string | undefined): string {
  const text = (raw ?? '').trim()
  if (!text || BIO_FAILURE.test(text)) return ''
  // Strip the trailing ([site](url)) citations the agent appends.
  return text.replace(/\(\[[^\]]*\]\([^)]*\)\)/g, '').replace(/\s{2,}/g, ' ').trim()
}
