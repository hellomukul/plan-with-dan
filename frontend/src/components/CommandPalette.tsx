/* ⌘K: jump to any page or course, keyboard first (↑ ↓ to move, ↵ to open, esc to close). */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, ArrowRight, BookOpen, GraduationCap } from 'lucide-react'
import { useApp, type Route } from '../state'
import { NAV } from '../nav'
import { buildFaculty, courseCount, searchFaculty } from '../lib/faculty'
import { scoreOffering } from '../lib/courseSearch'
import { useFocusTrap } from './ui'

interface Item { id: string; group: string; label: string; hint?: string; run: () => void; icon?: React.ReactNode }

export default function CommandPalette({ open, onClose, onOpenCourse }: { open: boolean; onClose: () => void; onOpenCourse: (key: string) => void }) {
  const { go, sections, profile } = useApp()
  const program = profile?.program || 'MBA'
  const list = useRef<HTMLDivElement>(null)
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const box = useRef<HTMLDivElement>(null)
  // Focus starts in the search box, Tab stays inside, Escape closes, and focus goes back to whatever opened it.
  useFocusTrap(box, open, onClose)

  useEffect(() => { if (open) { setQ(''); setActive(0); setTimeout(() => input.current?.focus(), 10) } }, [open])

  // One entry per course offering (all its sections, so every professor is searchable), for this student's program.
  const offerings = useMemo(() => {
    const seen = new Map<string, (typeof sections)[number][]>()
    for (const s of sections) {
      if (!(s.audiences ?? s.programs).includes(program)) continue
      const list = seen.get(s.key)
      if (list) list.push(s); else seen.set(s.key, [s])
    }
    return [...seen.values()]
  }, [sections, program])

  const faculty = useMemo(() => buildFaculty(sections), [sections])

  const items: Item[] = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const pages: Item[] = NAV.filter((n) => !needle || n.label.toLowerCase().includes(needle)).map((n) => ({
      id: `p-${n.route}`, group: 'Go to', label: n.label, hint: n.keys, icon: <n.icon className="icon" />,
      run: () => go(n.route as Route),
    }))
    // The same search engine as the Course explorer: numbers in any form, titles, and names from the start of a
    // word only ("nathan" finds Nathan Novemsky, never Jonathan).
    const courses: Item[] = needle.length < 2 ? [] : offerings
      .map((secs) => ({ s: secs[0], score: scoreOffering(secs, q).score }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || a.s.number.localeCompare(b.s.number, undefined, { numeric: true }))
      .slice(0, 8)
      .map(({ s }) => ({ id: `c-${s.key}`, group: 'Courses', label: `${s.number} ${s.title}`, hint: s.term_name,
        icon: <BookOpen className="icon" />, run: () => onOpenCourse(s.key) }))
    // Faculty by name (start-of-word, so "nathan" never finds Jonathan): opens their Faculty page.
    const people: Item[] = needle.length < 2 ? [] : searchFaculty(faculty, q, 4).map((f) => ({
      id: `f-${f.name}`, group: 'Faculty', label: f.display, hint: courseCount(f),
      icon: <GraduationCap className="icon" />, run: () => go('faculty', f.name) }))
    const ask: Item[] = needle.length >= 3 ? [{ id: 'ask', group: 'Ask Dan', label: `Ask Dan: “${q.trim()}”`, icon: <ArrowRight className="icon" />,
      run: () => { sessionStorage.setItem('pwd-ask', q.trim()); go('chat') } }] : []
    return [...courses, ...people, ...pages, ...ask]
  }, [q, offerings, faculty, go, onOpenCourse])

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
  }

  let lastGroup = ''
  return (
    <div className="overlay center" onClick={onClose}>
      <div ref={box} className="cmdk" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Command menu">
        <div className="row" style={{ gap: 0, flexWrap: 'nowrap' }}>
          <Search className="icon" style={{ marginLeft: 16, color: 'var(--faint)' }} />
          <input ref={input} data-autofocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey}
            placeholder="Search courses, faculty, pages, or ask Dan…" aria-label="Search courses, faculty and pages"
            role="combobox" aria-expanded={items.length > 0} aria-controls="cmdk-list" aria-autocomplete="list"
            aria-activedescendant={items[active] ? `cmdk-${i2id(items[active].id)}` : undefined} />
        </div>
        <div className="cmdk-list" ref={list} id="cmdk-list" role="listbox" aria-label="Results">
          {items.length === 0 && <div className="empty small" role="presentation">No matches</div>}
          {items.map((it, i) => {
            const header = it.group !== lastGroup ? <div className="cmdk-group" key={`g-${it.group}`} role="presentation">{it.group}</div> : null
            lastGroup = it.group
            return (
              <div key={it.id} role="presentation">
                {header}
                <button type="button" id={`cmdk-${i2id(it.id)}`} role="option" aria-selected={i === active} tabIndex={-1}
                  className={`cmdk-item ${i === active ? 'active' : ''}`} onMouseEnter={() => setActive(i)} onClick={() => choose(it)}>
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

/** A DOM-safe id from an item id (course keys and names can contain spaces and commas). */
function i2id(id: string): string { return id.replace(/[^A-Za-z0-9_-]/g, '_') }
