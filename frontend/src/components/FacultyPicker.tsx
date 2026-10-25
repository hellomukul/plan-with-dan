/* Faculty name filter: a searchable combobox over everyone teaching this year (lib/faculty). Shared by the home page
   Course Explorer and the signed-in Course explorer page, so both behave the same: start-of-word name matching
   ("nathan" never finds Jonathan), ↑ ↓ ↵ and Esc, and a fixed width so choosing or clearing never reflows the row. */
import { useMemo, useState, type KeyboardEvent } from 'react'
import { GraduationCap, X } from 'lucide-react'
import { searchFaculty, type Faculty } from '../lib/faculty'
import { Avatar } from './FacultyCard'

export default function FacultyPicker({ faculty, value, onChange, idPrefix = 'cx' }: {
  faculty: Faculty[]
  /** Catalog name ("Last, First") of the chosen person, or '' for anyone. */
  value: string
  onChange: (name: string) => void
  idPrefix?: string
}) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const options = useMemo(() => (q.trim() ? searchFaculty(faculty, q, 60) : faculty), [faculty, q])
  const chosen = value ? faculty.find((f) => f.name === value) : undefined
  const choose = (name: string) => { onChange(name); setQ(''); setOpen(false) }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, options.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter' && open && options[active]) { e.preventDefault(); choose(options[active].name) }
    else if (e.key === 'Escape') { setOpen(false); setQ('') }
  }
  const pop = `${idPrefix}-fpop`
  return (
    <div className={`cx-fpick ${chosen ? 'on' : ''}`}>
      <GraduationCap className="icon sm faint" aria-hidden />
      <input role="combobox" aria-expanded={open} aria-controls={pop} aria-autocomplete="list" aria-label="Faculty name"
        aria-activedescendant={open && options[active] ? `${idPrefix}-fopt-${active}` : undefined}
        value={open || !chosen ? q : chosen.display} placeholder={chosen && open ? chosen.display : 'Any faculty'}
        onFocus={() => { setOpen(true); setQ(''); setActive(0) }} onBlur={() => { setOpen(false); setQ('') }}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(0) }} onKeyDown={onKey} />
      {chosen && <button type="button" className="cx-fpick-x" aria-label="Clear faculty filter" onClick={() => onChange('')}><X className="icon sm" /></button>}
      {open && (
        <ul id={pop} className="cx-fpop" role="listbox" aria-label="Faculty">
          {options.length === 0 ? <li className="cx-fpop-empty small muted">No faculty named “{q.trim()}”</li> : options.map((f, i) => (
            <li key={f.name} id={`${idPrefix}-fopt-${i}`} role="option" aria-selected={f.name === value}
              className={`${i === active ? 'active' : ''} ${f.name === value ? 'chosen' : ''}`}
              onMouseDown={(e) => e.preventDefault()} onClick={() => choose(f.name)} onMouseEnter={() => setActive(i)}>
              <Avatar f={f} size="sm" />
              <span className="cx-fpop-name">{f.display}</span>
              <span className="faint small">{f.courses.length} course{f.courses.length === 1 ? '' : 's'}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
