import { useEffect, useMemo, useRef, useState } from 'react'
import { INLINE_COUNT } from '../quickViews'
import type { QuickView } from '../quickViews'

interface Props {
  views: QuickView[]
  activeId: string | null
  onPick: (view: QuickView) => void
  onClear: () => void
}

/**
 * Five chips wrapped onto two lines and pushed the search box down. Now the
 * first few sit inline and the rest live behind "More", grouped, so the row
 * stays one line however many views exist.
 */
export function QuickViews({ views, activeId, onPick, onClear }: Props) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const inline = views.slice(0, INLINE_COUNT)
  const rest = views.slice(INLINE_COUNT)

  const grouped = useMemo(() => {
    const map = new Map<string, QuickView[]>()
    for (const v of rest) map.set(v.group, [...(map.get(v.group) ?? []), v])
    return [...map.entries()]
  }, [rest])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const activeInRest = rest.find((v) => v.id === activeId)

  return (
    <div className="quick" ref={rootRef}>
      <span className="quick__lead">Quick views</span>

      {inline.map((v) => (
        <button
          key={v.id}
          type="button"
          className={`quick__chip${activeId === v.id ? ' is-on' : ''}`}
          title={v.hint}
          onClick={() => onPick(v)}
        >
          {v.label}
        </button>
      ))}

      {/* If the active view lives in the menu, surface it so it is not hidden. */}
      {activeInRest && (
        <button
          type="button"
          className="quick__chip is-on"
          title={activeInRest.hint}
          onClick={() => onPick(activeInRest)}
        >
          {activeInRest.label}
        </button>
      )}

      {rest.length > 0 && (
        <button
          type="button"
          className={`quick__more${open ? ' is-open' : ''}`}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? 'Fewer' : 'More'} <span aria-hidden="true">{open ? '▴' : '▾'}</span>
        </button>
      )}

      {activeId && (
        <button type="button" className="quick__clear" onClick={onClear}>
          clear
        </button>
      )}

      {open && (
        <div className="quickpanel">
          {grouped.map(([group, items]) => (
            <section key={group}>
              <h4>{group}</h4>
              <div>
                {items.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    className={activeId === v.id ? 'is-on' : ''}
                    onClick={() => {
                      onPick(v)
                      setOpen(false)
                    }}
                  >
                    <strong>{v.label}</strong>
                    <span>{v.hint}</span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
