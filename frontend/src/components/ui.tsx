/* Small shared building blocks. */
import { useEffect, useRef, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { usd, tokens } from '../lib/format'
import type { Usage } from '../api'

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="row" style={{ gap: 8 }}>
      <span className="spinner" />
      {label && <span className="muted small">{label}</span>}
    </span>
  )
}

export function Empty({ icon = null, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      {icon && <div style={{ color: 'var(--faint)' }}>{icon}</div>}
      <h3 style={{ color: 'var(--text)', margin: 0 }}>{title}</h3>
      {children}
    </div>
  )
}

export function Overlay({ onClose, children, center = false }: { onClose: () => void; children: ReactNode; center?: boolean }) {
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current()
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [])
  return (
    <div className={`overlay ${center ? 'center' : ''}`} onClick={onClose}>
      <div className={center ? 'modal' : 'drawer'} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        {children}
      </div>
    </div>
  )
}

export function Ring({ pct, label, sub, color = 'var(--pink)' }: { pct: number; label: ReactNode; sub?: string; color?: string }) {
  const p = Math.max(0, Math.min(100, pct))
  return (
    <div className="ring" style={{ ['--p' as string]: p, ['--c' as string]: color }}>
      <div>{label}{sub && <small>{sub}</small>}</div>
    </div>
  )
}

export function Bar({ pct, tone = '' }: { pct: number; tone?: '' | 'lime' | 'amber' | 'gray' }) {
  return <div className={`bar ${tone}`}><span style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} /></div>
}

/** A compact receipt for one AI run: model calls, tokens and dollars. */
export function CostChip({ usage }: { usage?: Usage | null }) {
  if (!usage) return null
  const t = usage.total
  const cachedPct = t.input_tokens ? Math.round((100 * t.cached_tokens) / t.input_tokens) : 0
  return (
    <span className="badge gray mono" title={`run ${usage.run_id} · ${usage.model}`}>
      {t.requests} calls · {tokens(t.input_tokens)} in ({cachedPct}% cached) · {tokens(t.output_tokens)} out
      {t.web_searches ? ` · ${t.web_searches} web` : ''} · {usd(t.cost_usd)}
    </span>
  )
}

export function SampleBanner({ children }: { children?: ReactNode }) {
  return (
    <div className="sample-banner">
      <AlertTriangle className="icon sm" />
      {children ?? 'SAMPLE data: illustrative numbers, not real SOM bid results. Real history comes from students reporting outcomes below.'}
    </div>
  )
}

export function Section({ title, right, children }: { title: ReactNode; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-lg">
      <div className="row between mb"><h3 style={{ margin: 0 }}>{title}</h3>{right}</div>
      {children}
    </section>
  )
}
