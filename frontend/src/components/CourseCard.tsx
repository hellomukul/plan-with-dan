import type { ReactNode } from 'react'
import { Check, Clock, UserRound, Armchair } from 'lucide-react'
import type { Section } from '../api'
import { enrollLabel } from '../lib/format'
import { useApp } from '../state'

interface Props {
  course: Section
  sectionCount?: number
  onOpen?: () => void
  footer?: ReactNode
  compact?: boolean
}

/** One course offering as a card. Click opens the detail drawer. */
export default function CourseCard({ course: c, sectionCount = 1, onOpen, footer, compact = false }: Props) {
  const { plannedIds } = useApp()
  const enrol = enrollLabel(c.enrollment)
  const inPlan = plannedIds.has(c.id)
  return (
    <article className="card hoverable course-card" onClick={onOpen} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpen?.()}>
      <div className="row between top">
        <div>
          <div className="course-num">{c.number} · {c.session_name}</div>
          <div className="course-title">{c.title}</div>
        </div>
        {inPlan && <span className="badge green"><Check className="icon sm" />In plan</span>}
      </div>
      <div className="meta">
        <span><Clock className="icon sm" />{c.time}{sectionCount > 1 ? ` (+${sectionCount - 1} more)` : ''}</span>
        <span>{c.units} units</span>
        {c.limit && <span><Armchair className="icon sm" />{c.limit} seats</span>}
        {c.faculty.length > 0 && <span><UserRound className="icon sm" />{c.faculty[0]}{c.faculty.length > 1 ? ' +' : ''}</span>}
      </div>
      {!compact && c.description && <p className="muted small clamp-3" style={{ margin: 0 }}>{c.description}</p>}
      <div className="row" style={{ gap: 6 }}>
        <span className={`badge ${enrol.tone}`}>{enrol.text}</span>
        {c.ldr && <span className="badge lilac" title="Leadership Distribution Requirement (inferred from SOM's feed)">LDR</span>}
        {c.gsr && <span className="badge sky" title="Counts toward the Global Studies Requirement (inferred)">Global</span>}
        {c.new && <span className="badge lime">New</span>}
        {c.topics.slice(0, compact ? 2 : 3).map((t) => (
          <span key={t} className="badge gray">{t}</span>
        ))}
      </div>
      {footer && <div onClick={(e) => e.stopPropagation()}>{footer}</div>}
    </article>
  )
}
