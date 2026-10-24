/**
 * Which section each first-year cohort sits in.
 *
 * Yale publishes the cohort names but not the pairing, and it is not a single
 * mapping: Silver is section 01 of Accounting and section 04 of Statistics.
 * These pairings were supplied for the Class of 2027 and every one of them was
 * checked against the catalog — each cohort's days and start time match exactly
 * one section of that course.
 */

export const COHORTS = ['Gold', 'Silver', 'Blue', 'Green', 'Red'] as const
export type Cohort = (typeof COHORTS)[number]

export const COHORT_DOT: Record<Cohort, string> = {
  Gold: '#c9a13b',
  Silver: '#8a8f96',
  Blue: '#2f5d8a',
  Green: '#3c6e71',
  Red: '#a13c3c',
}

/**
 * TO ADD SPRING (or a new class year):
 *
 *   1. Get the core schedule that lists each cohort's meeting time per course
 *      — the orientation pack or the registrar both carry it.
 *   2. For each course, find which catalog section has those days and that
 *      start time. `npm run check:cohorts` does this for you and refuses any
 *      pairing that does not match exactly one section.
 *   3. Add the course number here with its cohort -> section map.
 *
 * Nothing else needs changing: the core schedule derives its session tabs from
 * whatever appears in this object, and the sections table picks up the names.
 */
/** courseNumber -> cohort -> section id. */
export const COHORT_SECTIONS: Record<string, Partial<Record<Cohort, string>>> = {
  'MGT 402': { Silver: '01', Red: '02', Green: '03', Gold: '04', Blue: '05' },
  'MGT 403': { Red: '01', Gold: '02', Blue: '03', Silver: '04', Green: '05' },
  'MGT 404': { Gold: '01', Green: '02', Silver: '03', Red: '04', Blue: '05' },
  'MGT 409': { Gold: '01', Green: '02', Red: '03', Silver: '04', Blue: '05' },
  'MGT 410': { Green: '01', Blue: '02', Gold: '03', Red: '04', Silver: '05' },
  'MGT 411': { Blue: '01', Gold: '02', Red: '03', Silver: '04', Green: '05' },
  'MGT 412': { Green: '01', Blue: '02', Red: '03', Silver: '04', Gold: '05' },
  'MGT 413': { Red: '01', Silver: '02', Green: '03', Blue: '04', Gold: '05' },
}

/** The cohort that sits in a given section, when we know it. */
export function cohortForSection(
  courseNumber: string,
  section: string | undefined,
): Cohort | null {
  const map = COHORT_SECTIONS[courseNumber?.trim()]
  if (!map || !section) return null
  const id = section.trim()
  const found = (Object.entries(map) as [Cohort, string][]).find(
    ([, sec]) => sec === id,
  )
  return found ? found[0] : null
}

export function hasCohortMap(courseNumber: string): boolean {
  return Boolean(COHORT_SECTIONS[courseNumber?.trim()])
}

/** A colour per core course, so a cohort's week reads as four distinct blocks. */
export const CORE_COURSE_COLORS: Record<string, { fg: string; bg: string }> = {
  'MGT 402': { fg: '#3c6e71', bg: '#e3edec' },
  'MGT 403': { fg: '#a15c2e', bg: '#f2e5da' },
  'MGT 404': { fg: '#6a4c93', bg: '#eae3f2' },
  'MGT 409': { fg: '#2f5d8a', bg: '#e2eaf2' },
  'MGT 410': { fg: '#3c6e71', bg: '#e3edec' },
  'MGT 411': { fg: '#a15c2e', bg: '#f2e5da' },
  'MGT 412': { fg: '#6a4c93', bg: '#eae3f2' },
  'MGT 413': { fg: '#2f5d8a', bg: '#e2eaf2' },
}
