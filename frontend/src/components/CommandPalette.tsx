/* ⌘K: jump to any page or course, keyboard first (↑ ↓ to move, ↵ to open, esc to close). */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, ArrowRight, BookOpen } from 'lucide-react'
import { useApp, type Route } from '../state'
import { NAV } from '../nav'

interface Item { id: string; group: string; label: string; hint?: string; run: () => void; icon?: React.ReactNode }

export default function CommandPalette({ open, onClose, onOpenCourse }: { open: boolean; onClose: () => void; onOpenCourse: (key: string) => void }) {
  const { go, sections, profile } = useApp()
  const program = profile?.program || 'MBA'
  const list = useRef<HTMLDivElement>(null)
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => { if (open) { setQ(''); setActive(0); setTimeout(() => input.current?.focus(), 10) } }, [open])

  const offerings = useMemo(() => {
    const seen = new Map<string, (typeof sections)[number]>()
    for (const s of sections) if (!seen.has(s.key) && (s.audiences ?? s.programs).includes(program)) seen.set(s.key, s)
    return [...seen.values()]
  }, [sections, program])

  const items: Item[] = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const pages: Item[] = NAV.filter((n) => !needle || n.label.toLowerCase().includes(needle)).map((n) => ({
      id: `p-${n.route}`, group: 'Go to', label: n.label, hint: n.keys, icon: <n.icon className="icon" />,
      run: () => go(n.route as Route),
    }))
    const courses: Item[] = needle.length < 2 ? [] : offerings
      .filter((s) => `${s.number} ${s.title} ${s.faculty.join(' ')}`.toLowerCase().includes(needle))
      .slice(0, 8)
      .map((s) => ({ id: `c-${s.key}`, group: 'Courses', label: `${s.number} ${s.title}`, hint: s.term_name,
        icon: <BookOpen className="icon" />, run: () => onOpenCourse(s.key) }))
    const ask: Item[] = needle.length >= 3 ? [{ id: 'ask', group: 'Ask Dan', label: `Ask Dan: “${q.trim()}”`, icon: <ArrowRight className="icon" />,
      run: () => { sessionStorage.setItem('pwd-ask', q.trim()); go('chat') } }] : []
    return [...courses, ...pages, ...ask]
  }, [q, offerings, go, onOpenCourse])

  useEffect(() => { setActive(0) }, [q])
  useEffect(() => {
    list.current?.querySelector('.cmdk-item.active')?.scrollIntoView({ block: 'nearest' })
  }, [active])

  if (!open) return null
  const choose = (i: Item) => { onClose(); i.run() }
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter' && items[active]) { e.preventDefault(); choose(items[active]) }
    else if (e.key === 'Escape') onClose()
  }

  let lastGroup = ''
  return (
    <div className="overlay center" onClick={onClose}>
      <div className="cmdk" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Command menu">
        <div className="row" style={{ gap: 0, flexWrap: 'nowrap' }}>
          <Search className="icon" style={{ marginLeft: 16, color: 'var(--faint)' }} />
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey}
            placeholder="Search courses, pages, or ask Dan…" aria-label="Search" />
        </div>
        <div className="cmdk-list" ref={list}>
          {items.length === 0 && <div className="empty small">No matches</div>}
          {items.map((it, i) => {
            const header = it.group !== lastGroup ? <div className="cmdk-group" key={`g-${it.group}`}>{it.group}</div> : null
            lastGroup = it.group
            return (
              <div key={it.id}>
                {header}
                <button className={`cmdk-item ${i === active ? 'active' : ''}`} onMouseEnter={() => setActive(i)} onClick={() => choose(it)}>
                  <span style={{ color: 'var(--faint)', display: 'inline-flex' }}>{it.icon}</span>
                  <span>{it.label}</span>
                  {it.hint && <span className="hint">{it.hint}</span>}
                </button>
              </div>
            )
          })}
        </div>
        <div className="cmdk-foot"><span><kbd>↑</kbd> <kbd>↓</kbd> move</span><span><kbd>↵</kbd> open</span><span><kbd>esc</kbd> close</span></div>
      </div>
    </div>
  )
}
