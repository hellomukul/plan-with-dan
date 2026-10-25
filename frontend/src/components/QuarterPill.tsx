/* The quarter a course runs in, as one small mono pill: "Fall-1", "Fall-2", "Spring-1", "Spring-2", or
   "Fall full term" (a full-term course runs through both quarters of its term). With `year`: "Fall-2 2026". */
import { quarterLabel, termName } from '../lib/format'
import './course-explorer.css'

export default function QuarterPill({ session, term, year = false }: { session: string; term: string; year?: boolean }) {
  const full = session === 'fall' || session === 'spring'
  const label = quarterLabel(session, year ? term : undefined)
  return (
    <span className={`q-pill ${full ? 'full' : ''}`}
      title={full ? `${termName(term)}, full term: runs through both quarters` : `${quarterLabel(session, term)}: one quarter (half a term)`}>
      {label}
    </span>
  )
}
