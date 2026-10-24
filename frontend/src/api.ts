/** Typed client for the Plan with Dan API. Same origin, cookie session. */

export interface User { id: number; email: string; name: string }

export interface Section {
  id: string
  key: string
  number: string
  title: string
  term: string
  term_name: string
  session: string
  session_name: string
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

export interface PlanResponse {
  items: PlanItem[]
  terms: Record<string, { name: string; units: number; elective_units: number; core_units: number; core_times_known: boolean; conflicts: Clash[]; review: { days_on_campus: string[]; notes: Note[] } }>
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

export interface CalendarLinks { feed_url: string; webcal_url: string; google_subscribe: string; outlook_subscribe: string; is_local: boolean }
export interface CalendarEvents {
  classes: { date: string; start_min: number; end_min: number; title: string; room: string; course_id: string; status?: string }[]
  deadlines: { date: string; end?: string; title: string; kind: string }[]
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
export interface ProgramsInfo {
  programs: ProgramInfo[]
  upcoming: { date: string; end: string; title: string; kind: string }[]
  today: string
  calendar_note: string
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    let msg = res.statusText
    try {
      const j = await res.json()
      msg = typeof j.detail === 'string' ? j.detail : Array.isArray(j.detail) ? j.detail.map((d: { msg: string }) => d.msg).join('; ') : msg
    } catch { /* not json */ }
    throw new ApiError(res.status, msg)
  }
  return res.json() as Promise<T>
}

export const api = {
  health: () => request<{ ok: boolean; model: string; ai_connected: boolean; budgets: { per_turn_usd: number; per_day_usd: number } }>('GET', '/api/health'),
  me: () => request<{ user: User | null }>('GET', '/api/auth/me'),
  signup: (email: string, password: string, name: string) => request<{ user: User | null; message?: string }>('POST', '/api/auth/signup', { email, password, name }),
  login: (email: string, password: string) => request<{ user: User }>('POST', '/api/auth/login', { email, password }),
  logout: () => request<{ ok: boolean }>('POST', '/api/auth/logout', {}),

  catalog: () => request<{ terms: Record<string, string>; topics: string[]; sections: Section[] }>('GET', '/api/catalog'),

  profile: () => request<{ profile: Profile; user: User }>('GET', '/api/profile'),
  saveProfile: (p: Profile) => request<{ profile: Profile }>('PUT', '/api/profile', p),

  plan: () => request<PlanResponse>('GET', '/api/plan'),
  addToPlan: (course_id: string, added_by: 'student' | 'dan' = 'student') =>
    request<{ ok: boolean; id: number; clashes?: Clash[]; switched?: boolean; action_id?: number }>('POST', '/api/plan', { course_id, added_by }),
  updatePlan: (id: number, patch: { status?: PlanItem['status']; bid_points?: number; course_id?: string }) =>
    request<{ ok: boolean; action_id?: number }>('PATCH', `/api/plan/${id}`, patch),
  removeFromPlan: (id: number) => request<{ ok: boolean; action_id?: number }>('DELETE', `/api/plan/${id}`),
  actions: () => request<{ actions: ActionEntry[] }>('GET', '/api/actions'),
  undo: (actionId: number) => request<{ ok: boolean; detail?: string }>('POST', `/api/actions/${actionId}/undo`, {}),

  desk: () => request<DeskResponse>('GET', '/api/desk'),
  deskCard: (id: string, status: 'done' | 'snoozed' | 'dismissed' | 'active') => request<{ ok: boolean }>('POST', `/api/desk/${id}`, { status }),
  bestFits: (term = '202701') => request<BestFits>('GET', `/api/bestfits?term=${term}`),
  dismissFit: (key: string, reason = '') => request<{ ok: boolean }>('POST', '/api/bestfits/dismiss', { key, reason }),
  undismissFit: (key: string) => request<{ ok: boolean }>('DELETE', `/api/bestfits/dismiss?key=${encodeURIComponent(key)}`),
  deleteAccount: (password: string) => request<{ ok: boolean }>('POST', '/api/account/delete', { password }),

  requirements: () => request<RequirementsResponse>('GET', '/api/requirements'),
  saveGlobal: (c: GlobalChoice) => request<{ ok: boolean }>('POST', '/api/global', c),
  removeGlobal: (key: string) => request<{ ok: boolean }>('DELETE', `/api/global/${key}`),

  calendarEvents: () => request<CalendarEvents>('GET', '/api/calendar/events'),
  calendarLinks: () => request<CalendarLinks>('GET', '/api/calendar/links'),
  rotateCalendar: () => request<CalendarLinks>('POST', '/api/calendar/rotate', {}),

  bids: (course = '') => request<{ courses: BidCourse[]; mine: { id: number; course_number: string; term_code: string; points_bid: number; got_seat: boolean; clearing_points: number | null; source: string }[] }>('GET', `/api/bids${course ? `?course=${encodeURIComponent(course)}` : ''}`),
  reportBid: (b: { course_number: string; term_code: string; points_bid: number; got_seat: boolean; clearing_points: number | null }) => request<{ ok: boolean }>('POST', '/api/bids', b),
  suggestBids: (budget: number, priorities: Record<string, number>) => request<{ split: BidSplit[]; note: string; warnings?: string[] }>('POST', '/api/bids/suggest', { budget, priorities }),

  publicChat: (message: string, history: { role: 'user' | 'assistant'; content: string }[]) =>
    request<ChatResult & { remaining_today?: number; limited?: boolean }>('POST', '/api/chat/public', { message, history }),
  chatHistory: (mode: 'dan' | 'news') => request<{ messages: ChatMsg[] }>('GET', `/api/chat/history?mode=${mode}`),
  clearChat: (mode: 'dan' | 'news') => request<{ ok: boolean }>('DELETE', `/api/chat/history?mode=${mode}`),
  importPlan: (courseIds: string[]) => request<{ added: number }>('POST', '/api/plan/import', { course_ids: courseIds }),
  programs: () => request<ProgramsInfo>('GET', '/api/programs'),
  chatMemory: () => request<{ facts: string[]; summary: string; updated_at: string | null }>('GET', '/api/chat/memory'),
  forgetMemory: (fact?: string) => request<{ facts: string[] }>('POST', '/api/chat/memory/forget', { fact: fact ?? null }),
  recommend: (term = '202701') => request<RecResult>('POST', '/api/recommend', { term }),
  latestRecommendation: () => request<{ result: RecResult | null }>('GET', '/api/recommend/latest'),

  usage: () => request<UsageResponse>('GET', '/api/usage'),
  usageAll: () => request<{ by_feature: { feature: string; runs: number; input_tokens: number; cached_tokens: number; output_tokens: number; web_searches: number; cost_usd: number; avg_cost_per_run: number }[] }>('GET', '/api/usage/all'),
  safetyEvents: () => request<{ events: SafetyEvent[] }>('GET', '/api/safety/events'),
}

/** Stream a chat turn: onStep for each agent/tool step, resolves with the final result. */
export async function streamChat(message: string, mode: 'dan' | 'news', onStep: (s: TraceStep) => void): Promise<ChatResult> {
  const res = await fetch('/api/chat/stream', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, mode }),
  })
  if (!res.ok || !res.body) {
    let msg = res.statusText
    try { msg = (await res.json()).detail ?? msg } catch { /* ignore */ }
    throw new ApiError(res.status, msg)
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
