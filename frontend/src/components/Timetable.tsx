/* Weekly Mon–Fri timetable, 8:00–20:00, with absolutely positioned course blocks.
   Calm style: every block looks the same; only a clash gets colour (red). */
import { TriangleAlert } from 'lucide-react'
import type { Section } from '../api'
import { clock, DAYS, DAY_NAMES } from '../lib/format'
import '../pages/pages-a.css'

const START = 8 * 60
const END = 20 * 60
const PX_PER_MIN = 0.8 // 48px per hour
const HEIGHT = (END - START) * PX_PER_MIN

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
  onOpen?: (s: Section) => void
}

export default function Timetable({ sections, clashIds = new Set(), onOpen }: Props) {
  const timed = sections.filter((s) => s.start_min != null && s.end_min != null && s.days.length > 0)
  const hours = Array.from({ length: (END - START) / 60 }, (_, i) => START + i * 60)

  return (
    <div className="tt-scroll">
      <div className="timetable" role="group" aria-label="Weekly timetable">
        <div className="tt-head" aria-hidden="true" />
        {DAYS.map((d) => <div key={d} className="tt-head" aria-hidden="true">{DAY_NAMES[d]}</div>)}

        <div className="tt-hours" style={{ height: HEIGHT }} aria-hidden="true">
          {hours.map((h) => (
            <div key={h} className="tt-hour" style={{ top: (h - START) * PX_PER_MIN }}>{clock(h).replace(':00', '')}</div>
          ))}
        </div>
        {DAYS.map((d) => (
          <div key={d} className="tt-col" style={{ height: HEIGHT }} role="group" aria-label={DAY_NAMES[d]}>
            {hours.map((h) => <div key={h} className="tt-line" style={{ top: (h - START) * PX_PER_MIN }} />)}
            {layoutDay(timed.filter((s) => s.days.includes(d))).map(({ s, lane, lanes }) => {
              const top = Math.max(0, ((s.start_min ?? START) - START) * PX_PER_MIN)
              const bottom = Math.min(HEIGHT, ((s.end_min ?? END) - START) * PX_PER_MIN)
              const clash = clashIds.has(s.id)
              const w = 100 / lanes
              return (
                <button
                  key={s.id}
                  type="button"
                  className={`tt-block ${clash ? 'clash' : ''}`}
                  style={{ top, height: Math.max(22, bottom - top - 2), left: `calc(${lane * w}% + 3px)`, right: 'auto', width: `calc(${w}% - 6px)` }}
                  onClick={() => onOpen?.(s)}
                  title={`${s.number} §${s.section} ${s.title}\n${clock(s.start_min)}–${clock(s.end_min)}${s.room ? ` · ${s.room}` : ''}${clash ? '\nTime clash' : ''}`}
                >
                  <b>{clash && <TriangleAlert className="icon xs" aria-label="Time clash" />}{s.number}</b>
                  <span className="tt-time">{clock(s.start_min).replace(/ (AM|PM)$/, '')}–{clock(s.end_min)}</span>
                  {s.session.endsWith('-1') && <span className="tt-sess">S1</span>}
                  {s.session.endsWith('-2') && <span className="tt-sess">S2</span>}
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
