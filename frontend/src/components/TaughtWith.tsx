/* "Taught with <school>": SOM courses cross-listed with another Yale school (read from SOM's own description). One
   badge everywhere a course appears, so they're recognisable in the explorer, Course picks, My plan and compare. */
import { Building2 } from 'lucide-react'

export function taughtWithLabel(schools?: string[]): string {
  if (!schools?.length) return ''
  return `Taught with ${schools.length === 1 ? `the ${schools[0]}`.replace('the Yale College', 'Yale College') : `${schools.slice(0, -1).join(', ')} and ${schools[schools.length - 1]}`}`
}

export default function TaughtWith({ schools, calendar, className = 'badge' }: { schools?: string[]; calendar?: boolean; className?: string }) {
  if (!schools?.length) return null
  const label = taughtWithLabel(schools)
  return (
    <span className={`${className} tw-badge`} title={`${label}. Cross-listed: open to SOM students under its MGT number${calendar ? '; it follows that school’s academic calendar' : ''}.`}>
      <Building2 className="icon xs" aria-hidden="true" />{label}
    </span>
  )
}
