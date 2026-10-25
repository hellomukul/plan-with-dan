/* The 2027-28 disclaimer, shown wherever next year's courses are recommended or planned (Course picks, My plan's
   2027-28 terms, a course's "Plan for 2027-28" action). SOM hasn't published 2027-28 courses yet: its course feed
   returns none for Fall 2027 or Spring 2028, so these are expected courses from this year's offering. */
import { Info } from 'lucide-react'

export const NEXT_YEAR_DISCLAIMER = 'This is based on the current year’s course offerings. New courses will be updated as Yale publishes them.'

export default function NextYearNote({ compact = false }: { compact?: boolean }) {
  return (
    <p className={`ny-note${compact ? ' compact' : ''}`} role="note">
      <Info className="icon sm" aria-hidden="true" />
      <span><b>2027–28 is a forecast.</b> {NEXT_YEAR_DISCLAIMER}{compact ? '' : ' Times, rooms and instructors may change.'}</span>
    </p>
  )
}
