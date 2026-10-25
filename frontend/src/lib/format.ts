export const DAYS = ['M', 'T', 'W', 'Th', 'F'] as const
export const DAY_NAMES: Record<string, string> = { M: 'Mon', T: 'Tue', W: 'Wed', Th: 'Thu', F: 'Fri' }
export const TERM_NAMES: Record<string, string> = { '202603': 'Fall 2026', '202701': 'Spring 2027' }
export const PLANNING_TERM = '202701'

/** Terms a student can plan. 2027-28 isn't published yet: those plans are expected courses (times TBA). */
export const PLAN_TERMS: Record<string, string> = { ...TERM_NAMES, '202703': 'Fall 2027', '202801': 'Spring 2028' }
/** a published term → the same season one year later */
export const NEXT_YEAR: Record<string, '202703' | '202801'> = { '202603': '202703', '202701': '202801' }
export const termName = (code: string) => PLAN_TERMS[code] ?? code

/** SOM terms have two quarters (sessions): Fall-1 + Fall-2 and Spring-1 + Spring-2; full-term courses span both. */
export const QUARTER_SHORT: Record<string, string> = {
  'fall-1': 'Fall-1', 'fall-2': 'Fall-2', fall: 'Fall full term',
  'spring-1': 'Spring-1', 'spring-2': 'Spring-2', spring: 'Spring full term',
}
/** "Fall-2" (short badge) or "Fall-2 2027" (with the calendar year) */
export function quarterLabel(session: string, term?: string): string {
  const q = QUARTER_SHORT[session] ?? session
  return term ? `${q} ${termName(term).split(' ').pop()}` : q
}
/** the quarters a section occupies (a full-term course counts in both of its term's quarters) */
export function quartersOf(session: string): string[] {
  return session === 'fall' ? ['fall-1', 'fall-2'] : session === 'spring' ? ['spring-1', 'spring-2'] : [session]
}

/** When each half-term quarter's classes run this year, read from the catalog (the most common first and last class
    date of its sections, so one odd section can't move it): { 'spring-1': { starts: '2027-01-19', ends: '2027-03-02' } }.
    Full-term sessions and expected 2027-28 courses (no dates yet) are left out. */
export function quarterDates(sections: { session: string; starts: string | null; ends: string | null; projected?: boolean }[]): Record<string, { starts: string; ends: string }> {
  const tally: Record<string, [Map<string, number>, Map<string, number>]> = {}
  for (const x of sections) {
    if (x.projected || !/-[12]$/.test(x.session) || !x.starts || !x.ends) continue
    const [a, b] = (tally[x.session] ??= [new Map(), new Map()])
    a.set(x.starts, (a.get(x.starts) ?? 0) + 1)
    b.set(x.ends, (b.get(x.ends) ?? 0) + 1)
  }
  const mode = (m: Map<string, number>) => [...m].sort((p, q) => q[1] - p[1] || p[0].localeCompare(q[0]))[0][0]
  return Object.fromEntries(Object.entries(tally).map(([k, [a, b]]) => [k, { starts: mode(a), ends: mode(b) }]))
}

/** "Wednesday, March 3, 2027 8:00-12:00 noon" -> "Final Wed, Mar 3". Empty when there's no exam slot. */
export function shortExam(exam?: string): string {
  const m = exam?.match(/^(\w{3})\w*,\s+(\w{3})\w*\s+(\d{1,2})/)
  return m ? `Final ${m[1]}, ${m[2]} ${m[3]}` : ''
}

export function clock(min: number | null | undefined): string {
  if (min == null) return 'TBA'
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

export function usd(v: number | null | undefined, digits = 4): string {
  if (v == null) return '–'
  if (v === 0) return '$0'
  if (v < 0.0001) return '<$0.0001'
  return `$${v.toFixed(v >= 1 ? 2 : digits)}`
}

export function tokens(n: number | null | undefined): string {
  if (n == null) return '–'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

export function daysUntil(iso: string, today = new Date()): number {
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const [y, m, d] = iso.split('-').map(Number)
  return Math.round((new Date(y, m - 1, d).getTime() - t.getTime()) / 86_400_000)
}

export function relDays(n: number): string {
  if (n === 0) return 'today'
  if (n === 1) return 'tomorrow'
  if (n === -1) return 'yesterday'
  return n > 0 ? `in ${n} days` : `${-n} days ago`
}

export function prettyDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'short' })
}

export function enrollLabel(e: string): { text: string; tone: string } {
  const x = (e || '').toLowerCase()
  if (x === 'bid') return { text: 'Bid', tone: 'pink' }
  if (x === 'permission') return { text: 'Permission', tone: 'amber' }
  if (x === 'core') return { text: 'Core', tone: 'sky' }
  return { text: e || '—', tone: 'gray' }
}

/** Topics are shown as plain text in the Quiet Yale design; kept as an empty map for compatibility. */
export const TOPIC_EMOJI: Record<string, string> = {}
