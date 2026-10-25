/** Typed client for the Plan with Dan API. Same origin, cookie session. */

export interface User { id: number; email: string; name: string; providers?: OAuthProvider[]; has_password?: boolean; owner?: boolean }
export type OAuthProvider = 'google' | 'microsoft'

/** Owner dashboard: live counts (no emails or names). */
export interface OwnerStats {
  generated_at: string
  timezone: string
  window_days: number
  totals: { users: number; onboarded: number; new_today: number; new_7d: number; active_now: number; active_today: number; active_7d: number; active_30d: number }
  funnel: { key: string; label: string; count: number }[]
  methods: Record<'email' | 'google' | 'microsoft', number>
  programs: { key: string; label: string; count: number }[]
  years: { key: string; label: string; count: number }[]
  features: { key: string; label: string; count: number; users: number | null }[]
  spend: Record<'today' | 'd7' | 'd30' | 'all', { usd: number; runs: number }> & { daily_cap_per_student_usd: number }
  daily: { date: string; signups: number; active: number; questions: number; cost_usd: number }[]
  recent: { label: string; email: string; you: boolean; joined: string; method: string; program: string; year: string; onboarded: boolean; last_active: string | null; active_days: number; plan_items: number; questions: number }[]
}
/** Full-page link that starts "Continue with Google / Microsoft" (a redirect, not a fetch). */
export const oauthStartUrl = (p: OAuthProvider, intent: 'signup' | 'login' | 'calendar' | 'link') => `/api/auth/oauth/${p}/start?intent=${intent}`

export interface Section {
  id: string
  key: string
  number: string
  title: string
  term: string
  term_name: string
  session: string
  session_name: string
  /** "Fall-2 2026", "Spring full term 2027": SOM terms have two quarters (sessions); full-term courses span both */
  quarter?: string
  /** an expected 2027-28 offering copied from this year's (times, room and dates not published yet) */
  projected?: boolean
  /** other Yale schools this course is cross-listed with, from SOM's description */
  taught_with?: string[]
  /** it follows the partner school's academic calendar */
  partner_calendar?: boolean
  starts: string | null
  ends: string | null
  days: string[]
  start_min: number | null
  end_min: number | null
  time: string
  room: string
  units: number
  section: string
  faculty: string[]
  emails: string[]
  category: string
  enrollment: string
  limit: number | null
  ldr: boolean
  gsr: boolean
  core: boolean
  prerequisite: string
  description: string
  syllabus: string
  bio: string
  new: boolean
  topics: string[]
  programs: string[]
  tracks?: string[]
  audiences?: string[]  // program codes whose students can plan this section
  cohort?: string  // MBA core: the cohort this section is for
  exam?: string  // MBA core: the scheduled final exam, e.g. "Wednesday, March 3, 2027 8:00-12:00 noon"
}

export interface Prefs { no_before?: number; fridays_free?: boolean; avoid_days?: string[]; max_units?: number; workload?: string }

export interface Profile {
  program: string
  year: string
  cohort: string
  class_year: string
  background: string
  interests: string[]
  goal_short: string
  goal_long: string
  completed: string[]
  prefs: Prefs
  gsa_days_used: number
  onboarded: boolean
}

export interface Clash { a: string; b: string; a_id: string; b_id: string; day: string; window: string; term: string }
export interface Note { kind: 'good' | 'warn' | 'info'; text: string }

export interface PlanItem {
  id: number
  status: 'planned' | 'bidding' | 'enrolled' | 'completed'
  bid_points: number | null
  added_by: string
  section: Section
  other_sections: Section[]
  google_link: string | null
  /** set for a course planned for 2027-28 ("202703" Fall 2027, "202801" Spring 2028): expected, times TBA */
  target_term?: string | null
  expected?: boolean
}

export interface QuarterInfo { key: string; label: string; units: number; courses: string[] }
export interface PlanTermInfo {
  name: string; units: number; elective_units: number; core_units: number; core_times_known: boolean
  /** units of courses taken outside SOM this term: shown apart, not in SOM's totals */
  outside_units?: number
  conflicts: Clash[]; review: { days_on_campus: string[]; notes: Note[] }
  /** the term's two quarters (half-term courses) and the full-term courses that run through both */
  quarters?: QuarterInfo[]; full_term?: { units: number; courses: string[] }
  /** 2027-28: built from this year's offerings, times not published */
  expected?: boolean; plannable?: boolean
}

export interface Progress {
  total_target: number
  core: { target: number; counted: number }
  electives: { target: number; planned: number }
  planned_total: number
  terms: { term: string; units: number; core_units: number; status: 'ok' | 'low' | 'needs_approval'; min_applies: boolean; min_units?: number | null; max_units?: number | null }[]
  ldr: { met: boolean; planned: boolean }
  gsr: { met: boolean; planned: boolean; in_plan: string[]; choices: GlobalChoice[] }
  gsa_used: number
  modelled: boolean
  mba_rules?: boolean
  program_label?: string
  checks?: { label: string; status: 'done' | 'planned' | 'missing' | 'info' | 'unconfirmed'; detail: string }[]
  sources?: string[]
  program: string
  notes: string[]
}

/** A course outside SOM the student added by hand (another Yale school). */
export interface OutsideCourse {
  id: number; school: string; number: string; title: string; units: number; term: string
  days: string[]; start_min: number | null; end_min: number | null; section: Section
}

export interface PlanResponse {
  items: PlanItem[]
  outside?: OutsideCourse[]
  terms: Record<string, PlanTermInfo>
  /** the terms this student can plan, in order (first-year MBAs: Fall 2026 → Spring 2028) */
  planning_terms?: { code: string; name: string; expected: boolean; can_add?: boolean }[]
  progress: Progress
}

export interface GlobalChoice { id?: number; option_key: string; target_term: string; status: 'considering' | 'applied' | 'done'; note: string }

export interface GsrOption {
  key: string
  name: string
  units: number | null
  gsa_days: number
  timing: string
  enrol: string
  cost: string
  requires_full_gsa?: boolean
  airfare?: boolean
  apply_by?: string
  courses: { key: string; number: string; title: string; term_name: string; section_ids: string[]; seats: number | null; time: string }[]
  budget_check: { ok: boolean; days_left?: number; reason: string }
}

export interface RequirementsResponse {
  degree: { total_units: number; core_units: number; elective_units: number; min_units_first_three_terms: number; approval_above_units: number }
  core: { title: string; units: number }[]
  ldr: { summary: string; how_flagged: string; petition: string; source: string; courses: { number: string; title: string; term_name: string }[] }
  gsr: { options: GsrOption[]; gsa_days: number; gsa_used: number; weeks: { name: string; start: string; end: string }[] }
  progress: Progress
  sources: Record<string, string>
}

export interface TraceStep {
  kind: string
  t_ms: number
  agent?: string
  tool?: string
  args?: Record<string, unknown>
  specialist?: string
  task?: string
  usage?: Meter
  run_total?: Totals
  check?: string
  [k: string]: unknown
}

export interface Totals { requests: number; input_tokens: number; cached_tokens: number; output_tokens: number; web_searches: number; cost_usd: number }
export interface Meter extends Totals { agent: string; seconds: number }
export interface Usage { run_id: string; model: string; agents: Meter[]; total: Totals; run_budget_usd: number; spent_today_usd: number; daily_budget_usd: number }

export interface Proposal { course_id: string; number: string; title: string; term_name: string; time: string; reason: string }

export interface ChatResult {
  answer: string
  agent: string | null
  proposals: Proposal[]
  followups?: string[]
  support?: Record<string, string> | null // set when the message sounded like distress: show the support card
  blocked: boolean
  safety: string[]
  run_id: string
  trace: TraceStep[]
  usage: Usage
}

export interface ChatMsg { role: 'user' | 'assistant'; content: string; meta: Record<string, unknown>; at?: string }

export interface Alternate { key: string; section_id: string; number: string; title: string; time: string; shared_topics: string[]; seats: number | null }

export interface RecPick {
  key: string
  why: string
  goal: 'short-term' | 'long-term' | 'interest'
  evidence: string
  evidence_note?: string
  priority: 1 | 2 | 3
  number: string
  title: string
  session: string
  units: number
  seats: number | null
  enrollment: string
  topics: string[]
  ldr: boolean
  gsr: boolean
  description: string
  faculty: string[]
  fits: boolean
  section_id: string
  section: string
  time: string
  clash_with?: string[]
  alternates: Alternate[]
}

/** Course package: a goal in the student's words → courses ranked by usefulness, placed across every quarter left. */
/** Body-to-body swap planner: does the course you want fit if you give one up? */
export interface SwapCheck {
  give: { number: string; title: string; section: string; time: string; units: number; ldr: boolean; gsr: boolean }
  want: { number: string; title: string; units: number; ldr: boolean; gsr: boolean; seats: number | null }
  term: string; term_name: string; units_before: number; units_after: number; min_units: number | null
  sections: { id: string; section: string; time: string; quarter: string; fits: boolean; clash_with: string[] }[]
  form: { opens: string; where: string; url: string }
}

/** Pass/Fail budget: finished courses with the grades the student chose to log. */
export interface GradesResponse {
  program: string
  cap_units: number | null
  used_units: number
  left_units: number | null
  graded: number
  rows: { number: string; title: string; units: number | null; source: 'core' | 'taken' | 'plan'; grade: string }[]
  grades: Record<string, string>
  source: string
}

export interface PackageOption {
  term: string
  term_name: string
  session: string
  quarter: string
  expected: boolean
  course_id: string
  target_term: '202703' | '202801' | null
  section: string
  time: string
  fits: boolean
  clash_with: string[]
}
export interface PackageItem {
  rank: number
  key: string
  number: string
  title: string
  units: number
  tier: 'essential' | 'strong' | 'worth a look'
  why: string
  evidence: string
  evidence_note: string
  ldr: boolean
  gsr: boolean
  taught_with?: string[]
  topics: string[]
  faculty: string[]
  placement: PackageOption
  options: PackageOption[]
}
export interface PackageTerm { code: string; name: string; expected: boolean; base_units: number; core_units: number; min_units: number | null; max_units: number | null }
export interface PackageResult {
  run_id: string
  goal: string
  summary: string
  followups?: string[]
  blocked: boolean
  items: PackageItem[]
  terms: PackageTerm[]
  dropped: { key?: string; dropped_because: string }[]
  trace: TraceStep[]
  usage: Usage
}
export interface PackageApplied {
  added: { number: string; term: string; expected: boolean; action_id?: number }[]
  skipped: { number: string; reason: string }[]
  clashes: Clash[]
}

export interface RecResult {
  run_id: string
  term: string
  term_name: string
  summary: string
  picks: RecPick[]
  dropped: { key?: string; dropped_because: string }[]
  shortlist_size: number
  schedule?: { units_added: number; units_term_total: number; core_units?: number; notes: Note[]; days_on_campus: string[]; has_ldr: boolean; has_gsr: boolean }
  critique?: { verdict: string; watch_outs: string[] }
  followups?: string[]  // suggested next questions (the backend strips the FOLLOWUPS line from summary)
  trace: TraceStep[]
  usage: Usage
}

export interface BidCourse {
  course_number: string
  title: string
  seats: number | null
  reports: number
  sample_only?: boolean
  too_few?: boolean
  won?: number
  lost?: number
  lowest_winning_bid?: number | null
  median_winning_bid?: number | null
  highest_losing_bid?: number | null
  median_reported_clearing?: number | null
  terms?: string[]
}

export interface BidSplit { number: string; key?: string; title: string; term_name: string; priority: number; seats: number | null; median_winning_bid: number | null; sample_only: boolean; suggested_points: number; share: number }

export interface CalendarLinks { feed_url: string; webcal_url: string; google_subscribe: string; outlook_subscribe: string; outlook_yale_subscribe: string; is_local: boolean }
export interface CalendarEvents {
  classes: { date: string; start_min: number; end_min: number; title: string; room: string; course_id: string; status?: string }[]
  deadlines: { date: string; end?: string; title: string; kind: string }[]
  personal?: PersonalEvent[]
  today: string
  calendar_note?: string | null
}

export interface UsageResponse {
  model: string
  today_usd: number
  daily_budget_usd: number
  run_budget_usd: number
  totals: Omit<Totals, 'requests'>
  runs: { run_id: string; feature: string; at: string; agents: string[]; input_tokens: number; cached_tokens: number; output_tokens: number; web_searches: number; cost_usd: number }[]
}

export interface SafetyEvent { kind: string; detail: Record<string, unknown>; at: string; run_id: string }

export interface DeskCard {
  id: string
  kind: string
  title: string
  detail: string
  due: string | null
  days_left: number | null
  severity: 'high' | 'medium' | 'low'
  action: { type: 'go' | 'scroll'; route?: string; target?: string; label: string }
  source: string
  why: string
}

export interface DeskResponse {
  today: string
  brief: { text: string; cached: boolean; run_id: string; cost_usd: number }
  top: DeskCard[]
  later: DeskCard[]
  hidden: number
}

export interface Fit {
  key: string
  section_id: string
  number: string
  title: string
  session: string
  time: string
  units: number
  room: string
  faculty: string[]
  topics: string[]
  ldr: boolean
  gsr: boolean
  enrollment: string
  tier: 'Strong fit' | 'Good fit' | 'Worth a look'
  score: number
  chips: string[]
  trip: boolean
  why: { evidence: string; counter: string; factors: Record<string, number> }
  demand: { level: 'High' | 'Medium' | 'Low' | 'Unknown'; seats: number | null; reports: number; sample: boolean }
}

export interface BestFits { term: string; top: Fit[]; rows: { id: string; title: string; items: Fit[] }[]; swap_count: number; pref_misses?: number; term_units?: number; over_cap?: boolean; eligible: number; how: string }

export interface ActionEntry { id: number; action: string; summary: string; by: string; undone: boolean; at: string }

export interface ProgramInfo {
  code: string; label: string; base: string; summary: string
  total_units: number | null; min_units: number | null; max_units: number | null
  required: { number: string; title: string; term: string; units: number }[]
  global: string; calendar: string; sources: string[]; unconfirmed: string[]
}
export interface ReqCourse { key: string; number: string; title: string; term: string; units: number }
export interface MbaRules {
  ldr: { summary: string; focus: string; how_flagged: string; petition: string; examples: string[]; source: string; focus_source: string; courses: ReqCourse[] }
  gsr: { key: string; name: string; units: number | null; gsa_days: number; timing: string; enrol: string; cost: string; is_course: boolean; courses: ReqCourse[] }[]
  gsa_days: number; gsr_source: string; gsr_funding_source: string
  grading: { grade: string; share: string; transcript: boolean }[]
  pass_fail_cap: Record<string, number>; grading_source: string
}
export interface AuctionInfo {
  opens: string; opens_time: string; closes: string; closes_time: string
  rounds: string[]; global: string[]; add_drop: string; exchange: string
  sessions: { date: string; title: string; time: string; where: string }[]
  policies: string[]; audience: string; source: string
  dates: { date: string; end: string; title: string; kind: string }[]
}
/** The registrar's auction email went to first-year MBAs (Class of 2028) only. */
export const auctionApplies = (program?: string | null, year?: string | null) =>
  (program === 'MBA' || program === 'MBA-JOINT' || !program) && year === '1'
export interface ProgramsInfo {
  programs: ProgramInfo[]
  mba?: MbaRules
  upcoming: { date: string; end: string; title: string; kind: string }[]
  dates?: { date: string; end: string; title: string; kind: string }[]
  calendar?: { date: string; end: string; title: string; kind: string }[]  // the whole 2026-27 calendar, past dates too
  /** registrar's 2026-27 course auction (email to first-year MBAs): show to first-year MBA / joint-degree only */
  auction?: AuctionInfo
  today: string
  calendar_note: string
  data_as_of?: string
}

export interface ShortlistCol {
  id: number; key: string; note: string; rank: number; missing: boolean
  taught_with?: string[]; partner_calendar?: boolean
  number: string; title: string; term: string; term_name: string; session: string; units: number; faculty: string[]
  enrollment: string; sections: { id: string; section: string; time: string; room: string }[]
  fit: { status: 'fits' | 'clash' | 'not_open'; text: string; section_id?: string }
  counts: string[]
  goal: { matched: string[]; topics: string[]; level: 'Strong' | 'Some' | 'None found' }
  demand: { level: string; seats: number | null; median_winning_bid: number | null; reports: number }
  description: string; syllabus: string; in_plan: boolean; completed: boolean
}

export interface PersonalEvent { id: number; title: string; date: string; start_min: number; end_min: number; location: string; note: string }

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

const OFFLINE = 'Can’t reach Plan with Dan. Check your connection and try again.'

/** A plain-English fallback when the server's reply has no readable message (e.g. an HTML error page from a proxy). */
function fallbackMessage(status: number): string {
  if (status === 401) return 'Please log in again.'
  if (status === 403) return 'That isn’t allowed from here. Reload the page and try again.'
  if (status === 404) return 'We couldn’t find that. It may have been removed.'
  if (status === 413) return 'That’s too long to send. Shorten it and try again.'
  if (status === 429) return 'Too many requests. Wait a minute and try again.'
  if (status >= 500) return `Something went wrong on our side (${status}). Try again in a moment.`
  return `Something went wrong (${status}). Try again.`
}

// Field names in validation errors, in the words the forms use.
const FIELD_LABEL: Record<string, string> = {
  background: 'Background', goal_short: 'Short-term goal', goal_long: 'Long-term goal', completed: 'Courses taken',
  interests: 'Interests', gsa_days_used: 'Global Studies days', message: 'Message', title: 'Title', note: 'Note',
  email: 'Email', password: 'Password', name: 'First name', program: 'Program',
}

/** The server's message for a failed response, or a friendly fallback. Never empty. */
async function errorMessage(res: Response): Promise<string> {
  try {
    const j = await res.json()
    if (typeof j.detail === 'string' && j.detail.trim()) return j.detail
    if (Array.isArray(j.detail) && j.detail.length) {
      return j.detail.map((d: { msg?: string; loc?: (string | number)[] }) => {
        const field = [...(d.loc ?? [])].reverse().find((x) => typeof x === 'string' && x !== 'body') as string | undefined
        const msg = (d.msg ?? '').replace(/^Value error, /, '')
        return field ? `${FIELD_LABEL[field] ?? field.replace(/_/g, ' ')}: ${msg}` : msg
      }).filter(Boolean).join('; ') || fallbackMessage(res.status)
    }
  } catch { /* not json */ }
  return fallbackMessage(res.status)
}

// 401s from these are answers to what was typed (wrong password), not a lost session.
const AUTH_FORMS = ['/api/auth/login', '/api/auth/signup', '/api/auth/me', '/api/account/delete']
function noteUnauthorized(path: string, status: number) {
  if (status === 401 && !AUTH_FORMS.some((p) => path.startsWith(p))) window.dispatchEvent(new Event('pwd:unauthorized'))
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError(0, OFFLINE)
  }
  if (!res.ok) {
    noteUnauthorized(path, res.status)
    throw new ApiError(res.status, await errorMessage(res))
  }
  try {
    return (await res.json()) as T
  } catch {
    throw new ApiError(res.status, 'The server sent back something unexpected. Reload the page and try again.')
  }
}

export const api = {
  health: () => request<{ ok: boolean; model: string; ai_connected: boolean; budgets: { per_turn_usd: number; per_day_usd: number } }>('GET', '/api/health'),
  me: () => request<{ user: User | null }>('GET', '/api/auth/me'),
  signup: (email: string, password: string, name: string) => request<{ user: User | null; message?: string }>('POST', '/api/auth/signup', { email, password, name }),
  login: (email: string, password: string) => request<{ user: User }>('POST', '/api/auth/login', { email, password }),
  logout: () => request<{ ok: boolean }>('POST', '/api/auth/logout', {}),
  logoutAll: () => request<{ ok: boolean }>('POST', '/api/auth/logout-all', {}),
  providers: () => request<Record<OAuthProvider, boolean>>('GET', '/api/auth/providers'),
  unlinkProvider: (p: OAuthProvider) => request<{ ok: boolean }>('POST', `/api/auth/oauth/${p}/unlink`, {}),

  catalog: () => request<{ terms: Record<string, string>; topics: string[]; sections: Section[] }>('GET', '/api/catalog'),

  profile: () => request<{ profile: Profile; user: User; updated_at?: string | null }>('GET', '/api/profile'),
  saveProfile: (p: Profile) => request<{ profile: Profile }>('PUT', '/api/profile', p),

  plan: () => request<PlanResponse>('GET', '/api/plan'),
  addToPlan: (course_id: string, added_by: 'student' | 'dan' = 'student', status?: 'planned' | 'bidding' | 'enrolled' | 'completed') =>
    request<{ ok: boolean; id: number; clashes?: Clash[]; switched?: boolean; action_id?: number }>('POST', '/api/plan', { course_id, added_by, ...(status ? { status } : {}) }),
  /** Plan a course for 2027-28 from this year's offering in the same quarter (expected, times TBA). */
  planNextYear: (course_id: string, target_term: '202703' | '202801', added_by: 'student' | 'dan' = 'student') =>
    request<{ ok: boolean; id: number; action_id?: number; expected?: boolean; unchanged?: boolean }>('POST', '/api/plan', { course_id, added_by, target_term }),
  updatePlan: (id: number, patch: { status?: PlanItem['status']; bid_points?: number; course_id?: string }) =>
    request<{ ok: boolean; action_id?: number }>('PATCH', `/api/plan/${id}`, patch),
  addOutside: (c: { school: string; number: string; title: string; units: number; term: string; days: string[]; start_min: number | null; end_min: number | null }) =>
    request<{ ok: boolean; course: OutsideCourse; clashes: Clash[] }>('POST', '/api/outside', c),
  removeOutside: (id: number) => request<{ ok: boolean }>('DELETE', `/api/outside/${id}`),
  grades: () => request<GradesResponse>('GET', '/api/grades'),
  swapCheck: (giveItemId: number, want: string) => request<SwapCheck>('POST', '/api/swap/check', { give_item_id: giveItemId, want }),
  readCourses: (image: string) => request<{ courses: { number: string; title: string; grade: string; known: boolean; already: boolean }[]; note: string; usage: Usage; run_id: string }>('POST', '/api/profile/read-courses', { image }),
  importCourses: (courses: { number: string; grade: string }[]) => request<{ ok: boolean; added: string[]; completed: string[] }>('POST', '/api/profile/import-courses', { courses }),
  saveGrades: (grades: Record<string, string>) => request<GradesResponse>('PUT', '/api/grades', { grades }),
  movePlanItem: (id: number, toTerm: string) => request<{ ok: boolean; unchanged?: boolean; action_id?: number; term?: string }>('POST', `/api/plan/${id}/move`, { to_term: toTerm }),
  removeFromPlan: (id: number) => request<{ ok: boolean; action_id?: number }>('DELETE', `/api/plan/${id}`),
  actions: () => request<{ actions: ActionEntry[] }>('GET', '/api/actions'),
  undo: (actionId: number) => request<{ ok: boolean; detail?: string }>('POST', `/api/actions/${actionId}/undo`, {}),

  desk: () => request<DeskResponse>('GET', '/api/desk'),
  deskCard: (id: string, status: 'done' | 'snoozed' | 'dismissed' | 'active') => request<{ ok: boolean }>('POST', `/api/desk/${id}`, { status }),
  bestFits: (term = '202701') => request<BestFits>('GET', `/api/bestfits?term=${term}`),
  dismissFit: (key: string, reason = '') => request<{ ok: boolean }>('POST', '/api/bestfits/dismiss', { key, reason }),
  undismissFit: (key: string) => request<{ ok: boolean }>('DELETE', `/api/bestfits/dismiss?key=${encodeURIComponent(key)}`),
  deleteAccount: (password: string, confirm = '') => request<{ ok: boolean }>('POST', '/api/account/delete', { password, confirm }),

  requirements: () => request<RequirementsResponse>('GET', '/api/requirements'),
  saveGlobal: (c: GlobalChoice) => request<{ ok: boolean }>('POST', '/api/global', c),
  removeGlobal: (key: string) => request<{ ok: boolean }>('DELETE', `/api/global/${key}`),

  calendarEvents: () => request<CalendarEvents>('GET', '/api/calendar/events'),
  calendarLinks: () => request<CalendarLinks>('GET', '/api/calendar/links'),
  rotateCalendar: () => request<CalendarLinks>('POST', '/api/calendar/rotate', {}),

  bids: (course = '') => request<{ courses: BidCourse[]; mine: { id: number; course_number: string; term_code: string; points_bid: number; got_seat: boolean; clearing_points: number | null; source: string }[] }>('GET', `/api/bids${course ? `?course=${encodeURIComponent(course)}` : ''}`),
  reportBid: (b: { course_number: string; term_code: string; points_bid: number; got_seat: boolean; clearing_points: number | null }) => request<{ ok: boolean }>('POST', '/api/bids', b),
  suggestBids: (budget: number, priorities: Record<string, number>) => request<{ split: BidSplit[]; note: string; warnings?: string[] }>('POST', '/api/bids/suggest', { budget, priorities }),

  publicChat: (message: string, history: { role: 'user' | 'assistant'; content: string }[], context?: { program: string; year: string; cohort: string }) =>
    request<ChatResult & { remaining_today?: number | null; limited?: boolean; cached?: boolean }>('POST', '/api/chat/public', { message, history, context }),
  chatHistory: (mode: 'dan' | 'news') => request<{ messages: ChatMsg[] }>('GET', `/api/chat/history?mode=${mode}`),
  clearChat: (mode: 'dan' | 'news') => request<{ ok: boolean }>('DELETE', `/api/chat/history?mode=${mode}`),
  personalEvents: () => request<{ events: PersonalEvent[] }>('GET', '/api/personal-events'),
  personalEventAdd: (e: Omit<PersonalEvent, 'id'>) => request<{ event: PersonalEvent; clashes: string[]; action_id?: number }>('POST', '/api/personal-events', e),
  personalEventRemove: (id: number) => request<{ ok: boolean; action_id?: number }>('DELETE', `/api/personal-events/${id}`),
  shortlist: () => request<{ items: ShortlistCol[]; max: number }>('GET', '/api/shortlist'),
  shortlistAdd: (key: string) => request<{ ok: boolean; already?: boolean; count: number }>('POST', '/api/shortlist', { key }),
  shortlistRemove: (id: number) => request<{ ok: boolean }>('DELETE', `/api/shortlist/${id}`),
  shortlistNote: (id: number, note: string) => request<{ ok: boolean }>('PATCH', `/api/shortlist/${id}`, { note }),
  shortlistOrder: (order: number[]) => request<{ ok: boolean }>('PATCH', '/api/shortlist', { order }),
  importPlan: (courseIds: string[]) => request<{ added: number }>('POST', '/api/plan/import', { course_ids: courseIds }),
  programs: () => request<ProgramsInfo>('GET', '/api/programs'),
  calendarPreview: (course_ids: string[]) => request<{ classes: CalendarEvents['classes'] }>('POST', '/api/calendar/preview', { course_ids }),
  starterWeek: (q: { program: string; year: string; cohort: string; term: string }) =>
    request<{ program: string; term: string; ids: string[]; notes: string[]; example?: boolean; untimed_units?: number;
      done_units?: number; done?: { number: string; title: string; units: number }[] }>('GET',
      `/api/starter-week?${new URLSearchParams(q).toString()}`),
  chatMemory: () => request<{ facts: string[]; summary: string; updated_at: string | null }>('GET', '/api/chat/memory'),
  forgetMemory: (fact?: string) => request<{ facts: string[] }>('POST', '/api/chat/memory/forget', { fact: fact ?? null }),
  recommend: (term = '202701') => request<RecResult>('POST', '/api/recommend', { term }),
  buildPackage: (goal: string) => request<PackageResult>('POST', '/api/package', { goal }),
  latestPackage: () => request<{ result: PackageResult | null }>('GET', '/api/package/latest'),
  applyPackage: (items: { course_id: string; target_term: string | null }[]) => request<PackageApplied>('POST', '/api/package/apply', { items }),
  latestRecommendation: () => request<{ result: RecResult | null }>('GET', '/api/recommend/latest'),

  usage: () => request<UsageResponse>('GET', '/api/usage'),
  ownerStats: () => request<OwnerStats>('GET', '/api/owner/stats'),
  usageAll: () => request<{ by_feature: { feature: string; runs: number; input_tokens: number; cached_tokens: number; output_tokens: number; web_searches: number; cost_usd: number; avg_cost_per_run: number }[] }>('GET', '/api/usage/all'),
  safetyEvents: () => request<{ events: SafetyEvent[] }>('GET', '/api/safety/events'),
}

/** Stream a chat turn: onStep for each agent/tool step, resolves with the final result. */
export async function streamChat(message: string, mode: 'dan' | 'news', onStep: (s: TraceStep) => void): Promise<ChatResult> {
  let res: Response
  try {
    res = await fetch('/api/chat/stream', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, mode }),
    })
  } catch {
    throw new ApiError(0, OFFLINE)
  }
  if (!res.ok || !res.body) {
    noteUnauthorized('/api/chat/stream', res.status)
    throw new ApiError(res.status, await errorMessage(res))
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let final: ChatResult | null = null
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let idx
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const chunk = buffer.slice(0, idx)
      buffer = buffer.slice(idx + 2)
      const ev = /^event: (.*)$/m.exec(chunk)?.[1]
      const data = /^data: (.*)$/m.exec(chunk)?.[1]
      if (!ev || !data) continue
      const parsed = JSON.parse(data)
      if (ev === 'step') onStep(parsed as TraceStep)
      else if (ev === 'final' || ev === 'error') final = parsed as ChatResult
    }
  }
  if (!final) throw new ApiError(500, 'The stream ended without an answer.')
  return final
}
