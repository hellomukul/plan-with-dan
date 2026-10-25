import {
  CalendarDays, ChartNoAxesColumn, Compass, Gavel, Glasses, GraduationCap, Home, LifeBuoy, ListChecks, MessageCircle, Search, Star,
  type LucideIcon,
} from 'lucide-react'
import type { Route } from './state'

/** The product map: every signed-in page answers one student question, and sits in the step of the semester where
    that question comes up. One source of truth for the sidebar, the mobile tab bar, ⌘K and the Desk's guide.
    See docs/product_map.md for the reasoning. */
export interface NavItem {
  route: Route
  label: string
  icon: LucideIcon
  /** What you get there, in a few words (sidebar tooltip, ⌘K, the Desk's guide). */
  hint: string
  mobile?: string
  keys?: string
  section?: string
  /** Shown with Profile and Privacy at the bottom of the sidebar, not in the main list. */
  account?: boolean
}

export const STEP_CHOOSE = '1 · Choose courses'
export const STEP_PLAN = '2 · Plan your terms'
export const STEP_LOCK = '3 · Lock it in'

export const NAV: NavItem[] = [
  { route: 'home', label: "Dan's Desk", icon: Home, mobile: 'Desk', keys: 'G D', hint: 'Today, this week, and your next step' },
  { route: 'chat', label: 'Ask Dan', icon: MessageCircle, mobile: 'Ask', keys: 'G A', hint: 'Any SOM question, answered with sources' },
  // Dan's course recommender carries Elihu's name (after Elihu Yale) and his spectacles, quietly.
  { route: 'find', label: 'Course picks', icon: Glasses, mobile: 'Picks', keys: 'G F', section: STEP_CHOOSE, hint: 'Courses ranked for your goal, every quarter left' },
  { route: 'explore', label: 'Course explorer', icon: Search, keys: 'G C', section: STEP_CHOOSE, hint: 'Search and filter every SOM course' },
  { route: 'faculty', label: 'Faculty', icon: GraduationCap, keys: 'G T', section: STEP_CHOOSE, hint: 'Who teaches what, and their courses' },
  { route: 'shortlist', label: 'Shortlist', icon: Star, keys: 'G L', section: STEP_CHOOSE, hint: 'Courses you starred, side by side' },
  { route: 'plan', label: 'My plan & timetable', icon: Compass, mobile: 'Plan', keys: 'G P', section: STEP_PLAN, hint: 'Your weekly timetable and every term to 2028' },
  { route: 'calendar', label: 'Calendar & deadlines', icon: CalendarDays, keys: 'G K', section: STEP_PLAN, hint: 'Dates, deadlines, and sync to Google or Outlook' },
  { route: 'global', label: 'Requirements', icon: ListChecks, keys: 'G G', section: STEP_LOCK, hint: 'Global Studies and Leadership, tracked' },
  { route: 'bids', label: 'Bidding', icon: Gavel, keys: 'G B', section: STEP_LOCK, hint: 'Auction dates and how to split your points' },
  { route: 'help', label: 'Get help', icon: LifeBuoy, keys: 'G H', section: 'Support', hint: 'Who to see at SOM: career, academics, wellbeing' },
  { route: 'usage', label: 'Cost and safety', icon: ChartNoAxesColumn, keys: 'G S', account: true, hint: 'What each AI answer costs, and the guardrails' },
]

export const navFor = (route: Route) => NAV.find((n) => n.route === route)
