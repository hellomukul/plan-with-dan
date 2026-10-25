/* Small shared building blocks. */
import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
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

/* ---------------------------------------------------------------- dialogs: focus in, Tab trapped, focus back */

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), '
  + 'textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'
// Open dialogs, innermost last: only the top one handles Tab and Escape.
const trapStack: HTMLElement[] = []

/** While `active`: move focus into `ref` (an element marked data-autofocus, else the box itself), keep Tab and
    Shift+Tab inside it, close on Escape, and hand focus back to whatever opened it when it closes. */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean, onEscape?: () => void) {
  const escRef = useRef(onEscape)
  escRef.current = onEscape
  useEffect(() => {
    const box = ref.current
    if (!active || !box) return
    const opener = document.activeElement as HTMLElement | null
    trapStack.push(box)
    const first = box.querySelector<HTMLElement>('[data-autofocus]')
    if (!box.hasAttribute('tabindex')) box.setAttribute('tabindex', '-1')
    ;(first ?? box).focus({ preventScroll: true })
    const items = () => [...box.querySelectorAll<HTMLElement>(FOCUSABLE)]
      .filter((el) => el.getClientRects().length > 0 && !el.closest('[inert]'))
    const onKey = (e: KeyboardEvent) => {
      if (trapStack[trapStack.length - 1] !== box) return
      if (e.key === 'Escape' && escRef.current) { e.stopPropagation(); escRef.current(); return }
      if (e.key !== 'Tab') return
      const list = items()
      if (!list.length) { e.preventDefault(); box.focus({ preventScroll: true }); return }
      const at = document.activeElement as HTMLElement | null
      const inside = at !== null && box.contains(at)
      if (e.shiftKey && (!inside || at === list[0] || at === box)) { e.preventDefault(); list[list.length - 1].focus() }
      else if (!e.shiftKey && (!inside || at === list[list.length - 1])) { e.preventDefault(); list[0].focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      const i = trapStack.lastIndexOf(box)
      if (i >= 0) trapStack.splice(i, 1)
      if (opener && opener.isConnected && opener !== document.body) opener.focus({ preventScroll: true })
    }
  }, [ref, active])
}

export function Overlay({ onClose, children, center = false, label }: {
  onClose: () => void; children: ReactNode; center?: boolean; label?: string
}) {
  const box = useRef<HTMLDivElement>(null)
  const [name, setName] = useState(label)
  useFocusTrap(box, true, onClose)
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])
  // No label given: name the dialog after its first heading, so screen readers announce what opened.
  useEffect(() => {
    if (!label) setName(box.current?.querySelector('h1, h2, h3')?.textContent?.trim() || undefined)
  }, [label])
  return (
    <div className={`overlay ${center ? 'center' : ''}`} onClick={onClose}>
      <div ref={box} className={center ? 'modal' : 'drawer'} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true"
        aria-label={label ?? name} tabIndex={-1} style={{ outline: 'none' }}>
        {children}
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- in-app confirm (never window.confirm: webviews block it) */

export interface ConfirmOptions { title: string; body?: ReactNode; confirmLabel: string; danger?: boolean }

/** `const [ask, confirmUi] = useConfirm()`, render `{confirmUi}`, then `if (!(await ask({...}))) return`.
    A small centred dialog: focus starts on Cancel, Escape or a click outside cancels, focus goes back to the button. */
export function useConfirm(): [(o: ConfirmOptions) => Promise<boolean>, ReactNode] {
  const [req, setReq] = useState<{ o: ConfirmOptions; resolve: (ok: boolean) => void } | null>(null)
  const ask = useCallback((o: ConfirmOptions) => new Promise<boolean>((resolve) => setReq({ o, resolve })), [])
  const done = (ok: boolean) => { req?.resolve(ok); setReq(null) }
  const ui = req ? (
    <Overlay center onClose={() => done(false)} label={req.o.title}>
      <div className="confirm-dialog">
        <h3 style={{ margin: 0 }}>{req.o.title}</h3>
        {req.o.body && <p className="muted small" style={{ margin: '8px 0 0' }}>{req.o.body}</p>}
        <div className="row end confirm-actions">
          <button type="button" className="btn ghost" data-autofocus onClick={() => done(false)}>Cancel</button>
          <button type="button" className={`btn ${req.o.danger ? 'danger' : 'primary'}`} onClick={() => done(true)}>{req.o.confirmLabel}</button>
        </div>
      </div>
    </Overlay>
  ) : null
  return [ask, ui]
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
    <span className="badge gray mono cost-chip" title={`run ${usage.run_id} · ${usage.model}`}>
      {t.requests} {t.requests === 1 ? 'call' : 'calls'} · {tokens(t.input_tokens)} in ({cachedPct}% cached) · {tokens(t.output_tokens)} out
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
