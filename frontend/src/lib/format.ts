export const DAYS = ['M', 'T', 'W', 'Th', 'F'] as const
export const DAY_NAMES: Record<string, string> = { M: 'Mon', T: 'Tue', W: 'Wed', Th: 'Thu', F: 'Fri' }
export const TERM_NAMES: Record<string, string> = { '202603': 'Fall 2026', '202701': 'Spring 2027' }
export const PLANNING_TERM = '202701'

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
