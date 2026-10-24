/**
 * Degree requirements are not in the course catalog, so they are transcribed
 * here from Yale's official bulletin. Every number carries the page it came
 * from — check the links before trusting these for advising.
 *
 * Source: Yale University Catalog, M.B.A. Degree Requirements
 * https://catalog.yale.edu/management/full-time-mba/mba-degree-requirements/
 */

export const REQUIREMENTS_SOURCE =
  'https://catalog.yale.edu/management/full-time-mba/mba-degree-requirements/'

export const CURRICULUM_SOURCE = 'https://som.yale.edu/programs/mba/curriculum'

export const ELECTIVES_SOURCE =
  'https://som.yale.edu/programs/mba/curriculum/year-2-electives'

export interface RequirementLine {
  label: string
  value: string
  note?: string
}

export const MBA_REQUIREMENTS: RequirementLine[] = [
  {
    label: 'To graduate',
    value: '72 units',
    note: 'Pass or higher. Joint-degree students: 52 units.',
  },
  {
    label: 'First-year core',
    value: '30.5 units',
    note: '16 core courses, normally taken in year one.',
  },
  {
    label: 'Electives',
    value: '41.5 units minimum',
    note: 'SOM courses plus approved courses elsewhere at Yale.',
  },
  {
    label: 'Per-term load',
    value: '16 units minimum',
    note: 'Required in each of the first three terms.',
  },
]

export const MBA_DISTRIBUTIONS = [
  'Leadership Distribution Requirement',
  'Global Studies Requirement',
]

/**
 * Yale SOM's first year is the integrated core; electives begin in year two,
 * once first-year core grades are in. That is the whole of the year mapping
 * the catalog can support — there is no year field on a course.
 */
export const YEAR_MAP: Record<
  string,
  { requirement: string; label: string; blurb: string }
> = {
  '1': {
    requirement: 'Core',
    label: 'First year',
    blurb:
      'First years spend the majority of their time on the core — 16 set courses, 30.5 units, taken with your cohort — but electives open up from Session 2, so you can take both.',
  },
  '2': {
    requirement: 'Elective',
    label: 'Second year',
    blurb:
      'Second year is where you choose: at least 41.5 units of electives, at SOM or elsewhere at Yale. The core is behind you.',
  },
}

/** The 16 core courses span the full first year; this catalog is one term. */
export const CORE_COURSES_FULL_YEAR = 16

/** Programmes whose year-to-requirement mapping we can honestly claim. */
export const YEAR_AWARE_PROGRAMMES = ['MBA']

/* ---------------- Global Studies Requirement ---------------- */

export const GSR_SOURCE = 'https://som.yale.edu/global-studies-requirement'

export interface GsrOption {
  name: string
  detail: string
  /**
   * How to recognise the courses in the catalog. Free-text search was wrong —
   * searching "international experience" matched four courses that merely used
   * those words in a description, and none of them was an IE.
   */
  titleStartsWith?: string
  titleIncludes?: string
  /** Set when the option is never a catalog course. */
  notACourse?: boolean
}

/**
 * Every MBA must complete the Global Studies Requirement before graduating by
 * doing at least one of these. Transcribed from som.yale.edu/global-studies-requirement.
 */
export const GSR_OPTIONS: GsrOption[] = [
  {
    name: 'International Experience (IE)',
    detail:
      'Faculty-led course worth 4 units: half a term in the classroom, then a 10-day trip meeting business and political leaders.',
    titleStartsWith: 'IE:',
  },
  {
    name: 'Global Network Week',
    detail:
      'A week at — or virtually with — another Global Network school, on a team with students there.',
    titleStartsWith: 'GNW',
  },
  {
    name: 'Global Social Entrepreneurship',
    detail:
      'Consulting for a mission-driven entrepreneur in a developing country, with travel.',
    titleIncludes: 'global social entrepreneurship',
  },
  {
    name: 'International Exchange',
    detail: 'A full term of your second year at an approved school abroad.',
    notACourse: true,
  },
]

/* ---------------- the 16 first-year core courses ---------------- */

export const YEAR1_SOURCE = 'https://som.yale.edu/programs/mba/curriculum/year-1-core'

/**
 * Yale's Year 1 page lists the core in two blocks and mentions no electives
 * at all — the first year is core only. That is what makes "year 1 = core" a
 * fair mapping rather than a guess.
 */
export const CORE_CURRICULUM: { block: string; courses: string[] }[] = [
  {
    block: 'Orientation to Management',
    courses: [
      'Managing Groups and Teams',
      'Basics of Accounting',
      'Probability Modeling and Statistics',
      'Basics of Economics',
      'Introduction to Negotiation',
      'Global Virtual Teams',
    ],
  },
  {
    block: 'Organizational Perspectives',
    courses: [
      'Competitor',
      'Customer',
      'Investor',
      'Sourcing and Managing Funds',
      'State and Society',
      'Workforce',
      'Innovator',
      'Operations Engine',
      'The Global Macroeconomy',
      'The Executive',
    ],
  },
]

/* ---------------- Leadership Distribution Requirement ---------------- */

export const LDR_SOURCE = 'https://som.yale.edu/programs/mba/curriculum/leadership-teams'

export const LDR = {
  summary:
    'At least one elective focused on leadership in an industry, or on the ethical and societal challenges leaders face.',
  detail:
    'Met at any time before graduation, from an approved list kept on the SOM internal site. To have another course counted, ask the dean of students to start a review by the director of core curriculum.',
  examples: ['Interpersonal Dynamics', 'Strategic Leadership across Sectors'],
}

/* ---------------- grading ---------------- */

export const GRADING_SOURCE =
  'https://groups.som.yale.edu/aasl/grading-policies-%7Bdraft%7D/'

export interface GradeBand {
  grade: string
  share: string
  transcript: boolean
}

/** Yale SOM grades on a forced distribution; only the top two appear on a transcript. */
export const GRADE_BANDS: GradeBand[] = [
  { grade: 'High Honors', share: 'top 10% maximum', transcript: true },
  { grade: 'Honors', share: 'next 25%', transcript: true },
  { grade: 'Proficient', share: 'next 55%', transcript: false },
  { grade: 'Pass', share: 'lowest 10% in core, ~5% in electives', transcript: false },
  { grade: 'Fail', share: 'absolute standard, no minimum', transcript: false },
]

/* ---------------- first-year cohorts ---------------- */

export const COHORT_SOURCE =
  'https://som.yale.edu/blog/cohort-life-the-fundamental-som-experience'

/**
 * First-year core sections correspond to cohorts, which Yale names by colour.
 * The catalog numbers sections 01–05 and does not say which number is which
 * colour, so this is context, not a mapping.
 */
export const COHORT_COLOURS = ['Blue', 'Green', 'Gold', 'Silver', 'Red']
