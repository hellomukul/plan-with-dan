import {
  CalendarDays, ChartNoAxesColumn, Compass, Glasses, Globe, GraduationCap, Home, LifeBuoy, MessageCircle, Search, Star, Target,
  type LucideIcon,
} from 'lucide-react'
import type { Route } from './state'

export interface NavItem { route: Route; label: string; icon: LucideIcon; mobile?: string; keys?: string; section?: string }

/** One source of truth for the sidebar, the mobile tab bar and ⌘K. */
export const NAV: NavItem[] = [
  { route: 'home', label: "Dan's Desk", icon: Home, mobile: 'Desk', keys: 'G D' },
  // Dan's course recommender carries Elihu's name (after Elihu Yale) and his spectacles, quietly.
  { route: 'find', label: 'Find courses with Elihu', icon: Glasses, mobile: 'Find', keys: 'G F' },
  { route: 'chat', label: 'Ask Dan', icon: MessageCircle, mobile: 'Ask', keys: 'G A' },
  { route: 'explore', label: 'Course explorer', icon: Search, keys: 'G C', section: 'Plan' },
  { route: 'faculty', label: 'Faculty', icon: GraduationCap, keys: 'G T', section: 'Plan' },
  { route: 'plan', label: 'My plan', icon: Compass, mobile: 'Plan', keys: 'G P', section: 'Plan' },
  { route: 'shortlist', label: 'Shortlist', icon: Star, keys: 'G L', section: 'Plan' },
  { route: 'calendar', label: 'Calendar', icon: CalendarDays, keys: 'G K', section: 'Plan' },
  { route: 'global', label: 'Global & Leadership', icon: Globe, keys: 'G G', section: 'Plan' },
  { route: 'bids', label: 'Bid coach', icon: Target, keys: 'G B', section: 'Plan' },
  { route: 'help', label: 'Get help', icon: LifeBuoy, keys: 'G H', section: 'Tools' },
  { route: 'usage', label: 'Cost and safety', icon: ChartNoAxesColumn, keys: 'G S', section: 'Trust' },
]
