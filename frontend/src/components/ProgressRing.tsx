/* A small SVG progress ring with the value written in the middle and a text status under it, so the
   meaning never depends on colour alone. `tone` only tints the arc. */
import type { ReactNode } from 'react'

interface Props {
  /** 0..1 */
  value: number
  /** text in the middle of the ring, e.g. "38" */
  center: ReactNode
  /** small text under the centre value, e.g. "of 72" */
  sub?: string
  label: string
  status: string
  tone?: 'accent' | 'good' | 'warn' | 'muted'
  size?: number
  /** full accessible description, e.g. "Units: 38 of 72 planned" */
  description: string
}

export default function ProgressRing({ value, center, sub, label, status, tone = 'accent', size = 84, description }: Props) {
  const stroke = 6
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const v = Math.max(0, Math.min(1, value))
  return (
    <figure className={`pring tone-${tone}`} role="img" aria-label={description}>
      <div className="pring-dial" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
          <circle className="pring-track" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} fill="none" />
          {v > 0 && (
            <circle
              className="pring-arc" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} fill="none" strokeLinecap="round"
              strokeDasharray={`${c * v} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          )}
        </svg>
        <div className="pring-center" aria-hidden="true">
          <span className="pring-value">{center}</span>
          {sub && <span className="pring-sub">{sub}</span>}
        </div>
      </div>
      <figcaption aria-hidden="true">
        <span className="pring-label">{label}</span>
        <span className="pring-status">{status}</span>
      </figcaption>
    </figure>
  )
}
