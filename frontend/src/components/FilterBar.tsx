import { useEffect, useMemo, useRef, useState } from 'react'
import { EMPTY_SELECTION, FACETS, selectionCount } from '../facets'
import type { FacetKey, Selection } from '../facets'

interface Props {
  /** Available values per facet, with the count of courses each would show. */
  options: Record<FacetKey, [string, number][]>
  total: number
  shown: number
  selection: Selection
  onChange: (next: Selection) => void
}

/**
 * Faceted filter: a pill per active value and one "+ Filter" menu that groups
 * every facet under a single search box. Values within a facet are OR'd,
 * facets are AND'd.
 */
export function FilterBar({ options, total, shown, selection, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [needle, setNeedle] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const close = () => {
    setOpen(false)
    setNeedle('')
  }

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  const toggle = (key: FacetKey, value: string) => {
    const picked = selection[key]
    onChange({
      ...selection,
      [key]: picked.includes(value)
        ? picked.filter((v) => v !== value)
        : [...picked, value],
    })
  }

  // Facet groups, filtered by the search box.
  const groups = useMemo(() => {
    const q = needle.trim().toLowerCase()
    return FACETS.map((f) => ({
      ...f,
      values: (options[f.key] ?? []).filter(
        ([name]) => !q || name.toLowerCase().includes(q) || f.label.toLowerCase().includes(q),
      ),
    })).filter((g) => g.values.length > 0)
  }, [options, needle])

  const active = selectionCount(selection)

  return (
    <div className="filterbar" ref={rootRef}>
      <span className="filterbar__label">Showing</span>

      {active === 0 ? (
        <span className="pill pill--all">
          All courses <b>{total}</b>
        </span>
      ) : (
        FACETS.flatMap((f) =>
          selection[f.key].map((value) => (
            <span key={`${f.key}:${value}`} className={`pill pill--${f.key}`}>
              <i>{f.label}</i>
              {value}
              <button
                type="button"
                aria-label={`Remove ${f.label} ${value}`}
                onClick={() => toggle(f.key, value)}
              >
                ×
              </button>
            </span>
          )),
        )
      )}

      <button
        type="button"
        className={`filterbar__add${open ? ' is-open' : ''}`}
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <span aria-hidden="true">+</span> Filter
      </button>

      {active > 0 && (
        <>
          <button
            type="button"
            className="filterbar__reset"
            onClick={() =>
              onChange(EMPTY_SELECTION)
            }
          >
            Clear all
          </button>
          <span className="filterbar__sum">
            {shown} {shown === 1 ? 'course' : 'courses'}
          </span>
        </>
      )}

      {open && (
        <div className="fmenu" role="dialog" aria-label="Filter courses">
          <input
            ref={inputRef}
            className="fmenu__search"
            type="text"
            value={needle}
            placeholder="Search filters — finance, EMBA, core…"
            aria-label="Search filters"
            onChange={(e) => setNeedle(e.target.value)}
          />

          <div className="fmenu__scroll">
            {groups.length === 0 && (
              <p className="fmenu__empty">Nothing matches “{needle}”.</p>
            )}

            {groups.map((g) => (
              <section key={g.key} className="fmenu__group">
                <header>
                  <h4>{g.label}</h4>
                  <span>{g.hint}</span>
                </header>
                <ul>
                  {g.values.map(([value, n]) => {
                    const on = selection[g.key].includes(value)
                    return (
                      <li key={value}>
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={on}
                          className={`fmenu__item${on ? ' is-on' : ''}`}
                          onClick={() => toggle(g.key, value)}
                        >
                          <span className="fmenu__box" aria-hidden="true">
                            {on ? '✓' : ''}
                          </span>
                          <span className="fmenu__name">{value}</span>
                          <b>{n}</b>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}
          </div>

          <div className="fmenu__foot">
            <span>
              {active === 0 ? 'No filters — showing everything' : `${active} active`}
            </span>
            <button type="button" onClick={close}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
