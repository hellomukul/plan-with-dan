import {
  CalendarDays, ChartNoAxesColumn, Compass, Globe, Home, MessageCircle, Search, Sparkles, Target,
  type LucideIcon,
} from 'lucide-react'
import type { Route } from './state'

export interface NavItem { route: Route; label: string; icon: LucideIcon; mobile?: string; keys?: string; section?: string }

/** One source of truth for the sidebar, the mobile tab bar and ⌘K. */
export const NAV: NavItem[] = [
  { route: 'home', label: "Dan's Desk", icon: Home, mobile: 'Desk', keys: 'G D' },
  { route: 'find', label: 'Find my courses', icon: Sparkles, mobile: 'Find', keys: 'G F' },
  { route: 'chat', label: 'Ask Dan', icon: MessageCircle, mobile: 'Ask', keys: 'G A' },
  { route: 'explore', label: 'Catalog', icon: Search, keys: 'G C', section: 'Plan' },
  { route: 'plan', label: 'My plan', icon: Compass, mobile: 'Plan', keys: 'G P', section: 'Plan' },
  { route: 'calendar', label: 'Calendar', icon: CalendarDays, keys: 'G K', section: 'Plan' },
  { route: 'global', label: 'Global studies', icon: Globe, keys: 'G G', section: 'Plan' },
  { route: 'bids', label: 'Bid coach', icon: Target, keys: 'G B', section: 'Plan' },
  { route: 'usage', label: 'Cost and safety', icon: ChartNoAxesColumn, keys: 'G S', section: 'Trust' },
]
