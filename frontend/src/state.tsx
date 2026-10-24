/* App-wide state: who is signed in, their profile, the catalog, their plan, toasts and navigation. */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, type PlanResponse, type Profile, type Section, type User } from './api'

export type Route =
  | 'home' | 'find' | 'explore' | 'plan' | 'global' | 'bids' | 'calendar' | 'chat' | 'usage' | 'profile' | 'privacy'

export interface Toast { id: number; text: string; tone?: 'good' | 'bad'; action?: { label: string; run: () => void } }

interface AppState {
  user: User | null
  profile: Profile | null
  sections: Section[]
  topics: string[]
  plan: PlanResponse | null
  route: Route
  go: (r: Route) => void
  setUser: (u: User | null) => void
  refreshProfile: () => Promise<void>
  refreshPlan: () => Promise<void>
  addCourse: (courseId: string, by?: 'student' | 'dan') => Promise<void>
  toast: (text: string, tone?: 'good' | 'bad', action?: Toast['action']) => void
  undoToast: (text: string, actionId?: number) => void
  dismissToast: (id: number) => void
  toasts: Toast[]
  celebration: string | null
  celebrate: (text: string) => void
  sectionById: Map<string, Section>
  plannedIds: Set<string>
}

const Ctx = createContext<AppState | null>(null)

export const EMPTY_PROFILE: Profile = {
  program: 'MBA', year: '', cohort: '', class_year: '', background: '', interests: [], goal_short: '', goal_long: '',
  completed: [], prefs: {}, gsa_days_used: 0, onboarded: false,
}

function readRoute(): Route {
  const r = window.location.hash.replace(/^#\/?/, '') as Route
  return r || 'home'
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [sections, setSections] = useState<Section[]>([])
  const [topics, setTopics] = useState<string[]>([])
  const [plan, setPlan] = useState<PlanResponse | null>(null)
  const [route, setRoute] = useState<Route>(readRoute)
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    const onHash = () => setRoute(readRoute())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const go = useCallback((r: Route) => {
    window.location.hash = `/${r}`
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const [celebration, setCelebration] = useState<string | null>(null)

  const dismissToast = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), [])

  const toast = useCallback((text: string, tone?: 'good' | 'bad', action?: Toast['action']) => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, text, tone, action }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), action ? 7000 : 4200)
  }, [])

  const celebrate = useCallback((text: string) => {
    setCelebration(text)
    setTimeout(() => setCelebration(null), 3200)
  }, [])

  useEffect(() => {
    api.catalog().then((c) => { setSections(c.sections); setTopics(c.topics) }).catch(() => toast('Could not load the course catalog.', 'bad'))
  }, [toast])

  const refreshProfile = useCallback(async () => {
    try { setProfile((await api.profile()).profile) } catch { setProfile(null) }
  }, [])
  const refreshPlan = useCallback(async () => {
    try { setPlan(await api.plan()) } catch { setPlan(null) }
  }, [])

  useEffect(() => {
    if (user) { refreshProfile(); refreshPlan() } else { setProfile(null); setPlan(null) }
  }, [user, refreshProfile, refreshPlan])

  const undoToast = useCallback((text: string, actionId?: number) => {
    toast(text, 'good', actionId ? {
      label: 'Undo',
      run: async () => {
        await api.undo(actionId)
        await refreshPlan()
        toast('Undone')
      },
    } : undefined)
  }, [toast, refreshPlan])

  const addCourse = useCallback(async (courseId: string, by: 'student' | 'dan' = 'student') => {
    try {
      const r = await api.addToPlan(courseId, by)
      await refreshPlan()
      if (r.clashes && r.clashes.length) {
        toast(`Added, but it clashes with ${r.clashes.map((c) => (c.a_id === courseId ? c.b : c.a)).join(', ')}`, 'bad',
          r.action_id ? { label: 'Undo', run: async () => { await api.undo(r.action_id!); await refreshPlan() } } : undefined)
      } else undoToast(r.switched ? 'Switched to that section' : 'Added to your plan', r.action_id)
    } catch (e) {
      toast((e as Error).message, 'bad')
    }
  }, [refreshPlan, toast, undoToast])

  const sectionById = useMemo(() => new Map(sections.map((s) => [s.id, s])), [sections])
  const plannedIds = useMemo(() => new Set((plan?.items ?? []).map((i) => i.section.id)), [plan])

  const value: AppState = {
    user, profile, sections, topics, plan, route, go, setUser, refreshProfile, refreshPlan, addCourse, toast, toasts,
    undoToast, dismissToast, celebration, celebrate, sectionById, plannedIds,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useApp(): AppState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useApp outside AppProvider')
  return v
}
