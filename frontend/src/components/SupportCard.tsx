/* Shown under Dan's answer when a message sounds like the student is struggling (backend safety.support_signal).
   Dan still answers normally; this just puts the right people one tap away. Copy comes from lib/helpGuide. */
import { ArrowUpRight, Phone } from 'lucide-react'
import { URGENT, byId } from '../lib/helpGuide'

export default function SupportCard({ flush = false }: { flush?: boolean }) {
  const counselor = byId('som-counselor')
  return (
    <aside className={`dan-support ${flush ? 'flush' : ''}`} aria-label="Support">
      <p><Phone className="icon sm" aria-hidden />
        <span>{URGENT.text} <a href={URGENT.tel}>{URGENT.phone}</a>. In the US you can also call or text <a href={URGENT.crisisTel}>988</a>.</span>
      </p>
      <a className="dan-support-link" href={counselor.url} target="_blank" rel="noreferrer">Book SOM’s embedded counselor<ArrowUpRight className="icon sm" /></a>
    </aside>
  )
}
