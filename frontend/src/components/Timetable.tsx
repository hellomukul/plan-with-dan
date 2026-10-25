/* Weekly Mon–Fri timetable, 8:00–20:00 by default, with absolutely positioned course blocks.
   Evening classes (some SOM electives run 6–9 PM) stretch the window to 9 or 10 PM; the grid keeps the same
   total height by drawing each hour a little shorter, so fixed-height layouts don't move.
   Calm style: every block looks the same; assigned core is outlined dashed; only a clash gets colour (red). */
import { TriangleAlert } from 'lucide-react'
import type { Section } from '../api'
import { clock, DAYS, DAY_NAMES } from '../lib/format'
import '../pages/pages-a.css'

const DEFAULT_START = 8 * 60
const DEFAULT_END = 20 * 60
const LATEST_END = 22 * 60
const EARLIEST_START = 7 * 60
const BASE_PX_PER_MIN = 0.8 // 48px per hour

/** True when two sections meet at the same time: same term, overlapping dates, a shared day, overlapping minutes. */
// eslint-disable-next-line react-refresh/only-export-components
export function sectionsClash(a: Section, b: Section): boolean {
  if (a.id === b.id || a.term !== b.term) return false
  if (a.start_min == null || a.end_min == null || b.start_min == null || b.end_min == null) return false
  if (a.starts && a.ends && b.starts && b.ends && !(a.starts <= b.ends && b.starts <= a.ends)) return false
  if (!a.days.some((d) => b.days.includes(d))) return false
  return Math.max(a.start_min, b.start_min) < Math.min(a.end_min, b.end_min)
}

interface Placed { s: Section; lane: number; lanes: number }

/** Side-by-side lanes for blocks that overlap on the same day, so nothing hides behind anything. */
function layoutDay(list: Section[]): Placed[] {
  const sorted = [...list].sort((a, b) => (a.start_min ?? 0) - (b.start_min ?? 0) || (b.end_min ?? 0) - (a.end_min ?? 0))
  const out: Placed[] = []
  let cluster: Placed[] = []
  let clusterEnd = -1
  const flush = () => {
    const lanes = Math.max(1, ...cluster.map((p) => p.lane + 1))
    cluster.forEach((p) => { p.lanes = lanes })
    out.push(...cluster)
    cluster = []
  }
  for (const s of sorted) {
    const start = s.start_min ?? 0
    if (cluster.length && start >= clusterEnd) { flush(); clusterEnd = -1 }
    const laneEnds: number[] = []
    cluster.forEach((p) => { laneEnds[p.lane] = Math.max(laneEnds[p.lane] ?? -1, p.s.end_min ?? 0) })
    let lane = laneEnds.findIndex((e) => e <= start)
    if (lane === -1) lane = laneEnds.length
    cluster.push({ s, lane, lanes: 1 })
    clusterEnd = Math.max(clusterEnd, s.end_min ?? 0)
  }
  if (cluster.length) flush()
  return out
}

interface Props {
  sections: Section[]
  clashIds?: Set<string>
  /** Sections SOM assigns (cohort core): drawn with a dashed outline and a "Core" tag. */
  coreIds?: Set<string>
  onOpen?: (s: Section) => void
  compact?: boolean  // short rows, no horizontal scroll: for the home page hero
  /** Optional visible window in minutes after midnight, e.g. [8 * 60, 17 * 60]. Default 8:00–20:00, stretched to fit
   *  classes that start before 8 AM or end after 8 PM (no earlier than 7 AM, no later than 10 PM). */
  hours?: [number, number]
  /** Optional column labels per day code (e.g. { M: 'Mon 26' }). Default Mon–Fri. */
  dayLabels?: Partial<Record<string, string>>
  /** Optional day code to mark as today. */
  today?: string
  /** Optional vertical scale override in px per minute (compact default 0.42, full 0.8). */
  pxPerMin?: number
}

const NONE = new Set<string>()

export default function Timetable({ sections, clashIds = NONE, coreIds = NONE, onOpen, compact = false, hours: range, dayLabels, today, pxPerMin }: Props) {
  const timed = sections.filter((s) => s.start_min != null && s.end_min != null && s.days.length > 0)
  const first = Math.min(...timed.map((s) => s.start_min!))
  const last = Math.max(...timed.map((s) => s.end_min!))
  const START = range?.[0] ?? Math.max(EARLIEST_START, Math.min(DEFAULT_START, Math.floor(first / 60) * 60))
  const END = range?.[1] ?? Math.min(LATEST_END, Math.max(DEFAULT_END, Math.ceil(last / 60) * 60))
  const hours = Array.from({ length: Math.ceil((END - START) / 60) }, (_, i) => START + i * 60)
  const basePx = pxPerMin ?? (compact ? 0.42 : BASE_PX_PER_MIN)
  // A stretched default window keeps the default window's total height (hours just get a bit shorter).
  const PX_PER_MIN = range || pxPerMin ? basePx : (basePx * (DEFAULT_END - DEFAULT_START)) / (END - START)
  const HEIGHT = (END - START) * PX_PER_MIN

  return (
    <div className={`tt-scroll ${compact ? 'compact' : ''}`}>
      <div className="timetable" role="group" aria-label="Weekly timetable">
        <div className="tt-head" aria-hidden="true" />
        {DAYS.map((d) => <div key={d} className={`tt-head${today === d ? ' tt-today' : ''}`} aria-hidden="true">{dayLabels?.[d] ?? DAY_NAMES[d]}</div>)}

        <div className="tt-hours" style={{ height: HEIGHT }} aria-hidden="true">
          {hours.map((h) => (
            <div key={h} className="tt-hour" style={{ top: (h - START) * PX_PER_MIN }}>{clock(h).replace(':00', '')}</div>
          ))}
        </div>
        {DAYS.map((d) => (
          <div key={d} className={`tt-col${today === d ? ' tt-today' : ''}`} style={{ height: HEIGHT }} role="group" aria-label={dayLabels?.[d] ?? DAY_NAMES[d]}>
            {hours.map((h) => <div key={h} className="tt-line" style={{ top: (h - START) * PX_PER_MIN }} />)}
            {layoutDay(timed.filter((s) => s.days.includes(d))).map(({ s, lane, lanes }) => {
              const top = Math.max(0, ((s.start_min ?? START) - START) * PX_PER_MIN)
              const bottom = Math.min(HEIGHT, ((s.end_min ?? END) - START) * PX_PER_MIN)
              const clash = clashIds.has(s.id)
              const core = coreIds.has(s.id)
              const half = s.session.endsWith('-1') ? 'S1' : s.session.endsWith('-2') ? 'S2' : ''
              const w = 100 / lanes
              return (
                <button
                  key={s.id}
                  type="button"
                  className={`tt-block ${clash ? 'clash' : ''} ${core ? 'core' : ''}`}
                  style={{ top, height: Math.max(compact ? 16 : 22, bottom - top - 2), left: `calc(${lane * w}% + 3px)`, right: 'auto', width: `calc(${w}% - 6px)` }}
                  onClick={() => onOpen?.(s)}
                  aria-label={`${s.number} ${s.title}${core ? ', your core' : ''}, ${clock(s.start_min)} to ${clock(s.end_min)}${clash ? ', time clash' : ''}`}
                  title={`${s.number} §${s.section} ${s.title}${core ? ' (your core)' : ''}\n${clock(s.start_min)}–${clock(s.end_min)}${s.room ? ` · ${s.room}` : ''}${s.exam ? `\nFinal exam: ${s.exam}` : ''}${clash ? '\nTime clash' : ''}`}
                >
                  <b>{clash && <TriangleAlert className="icon xs" aria-label="Time clash" />}{s.number}</b>
                  <span className="tt-time">{clock(s.start_min).replace(/ (AM|PM)$/, '')}–{clock(s.end_min)}</span>
                  {(core || half) && <span className="tt-sess">{[core ? 'Core' : '', half].filter(Boolean).join(' · ')}</span>}
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
