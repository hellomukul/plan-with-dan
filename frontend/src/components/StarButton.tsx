/* Shortlist star, used on course cards, the course drawer, best fits and the home page explorer.
   Signed out, it asks the visitor to create a free account (shortlists need one).
   One request at a time: repeat clicks while a save is in flight are ignored, so a double-click never
   shortlists the same course twice. */
import { useRef, useState } from 'react'
import { Star } from 'lucide-react'
import { useApp } from '../state'

export default function StarButton({ courseKey, title, label = false }: { courseKey: string; title: string; label?: boolean }) {
  const { user, shortlist, toggleShortlist } = useApp()
  const on = shortlist.has(courseKey)
  const pending = useRef(false)
  const [busy, setBusy] = useState(false)
  const click = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!user) { window.dispatchEvent(new CustomEvent('pwd:signup', { detail: 'Create a free account to shortlist and compare courses.' })); return }
    if (pending.current) return
    pending.current = true
    setBusy(true)
    try { await toggleShortlist(courseKey, title) } finally { pending.current = false; setBusy(false) }
  }
  return (
    <button type="button" className={`btn ${label ? 'sm' : 'icon'} ghost star-btn ${on ? 'on' : ''}`} onClick={click}
      aria-pressed={on} aria-busy={busy || undefined} aria-disabled={busy || undefined}
      aria-label={on ? `Remove ${title} from shortlist` : `Shortlist ${title}`} title={on ? 'In your shortlist' : 'Shortlist to compare'}>
      <Star className="icon sm" />{label && (on ? 'Shortlisted' : 'Shortlist')}
    </button>
  )
}
