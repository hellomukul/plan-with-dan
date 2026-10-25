/* App-wide state: who is signed in, their profile, the catalog, their plan, toasts and navigation. */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { api, type PlanResponse, type Profile, type Section, type User } from './api'
import { forgetVisitorChat } from './lib/danChat'

export type Route =
  | 'home' | 'find' | 'explore' | 'faculty' | 'plan' | 'shortlist' | 'help' | 'global' | 'bids' | 'calendar' | 'chat' | 'usage' | 'profile' | 'privacy'

export const ROUTES: readonly Route[] = ['home', 'find', 'explore', 'faculty', 'plan', 'shortlist', 'help', 'global', 'bids', 'calendar', 'chat', 'usage', 'profile', 'privacy']
export const isRoute = (r: string): r is Route => (ROUTES as readonly string[]).includes(r)

export interface Toast { id: number; text: string; tone?: 'good' | 'bad'; action?: { label: string; run: () => void } }

interface AppState {
  user: User | null
  profile: Profile | null
  /** When the profile (goals included) was last saved, ISO; null if never saved or unknown. */
  profileSavedAt: string | null
  sections: Section[]
  topics: string[]
  plan: PlanResponse | null
  route: Route
  /** Optional deep-link argument after the route, e.g. #/faculty/Yang%2C%20Kai%20Hao -> "Yang, Kai Hao". */
  routeArg: string
  go: (r: Route, arg?: string) => void
  setUser: (u: User | null) => void
  /** False while a signed-in user's profile is still loading (so we don't flash the Desk before onboarding). */
  profileReady: boolean
  /** Sign this browser out locally: forget per-user browser state, then drop the user.
      'expired' also opens Log in with a short note, and keeps the page they were on for after they log in. */
  endSession: (how: 'logout' | 'deleted' | 'expired') => void
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
  shortlist: Map<string, number> // offering key -> shortlist item id
  toggleShortlist: (key: string, title?: string) => Promise<void>
  refreshShortlist: () => Promise<void>
}

const Ctx = createContext<AppState | null>(null)

export const EMPTY_PROFILE: Profile = {
  program: 'MBA', year: '', cohort: '', class_year: '', background: '', interests: [], goal_short: '', goal_long: '',
  completed: [], prefs: {}, gsa_days_used: 0, onboarded: false,
}

/* ---------------------------------------------------------------- per-user browser state */

// Keys that belong to whoever is signed in in this tab. Cleared on log-out, account deletion, an expired session,
// and when a different account signs in here, so the next person on a shared computer never sees them.
const USER_SESSION_KEYS = ['pwd-elihu-context', 'pwd-ask']
// Hand-offs that only make sense for the current sign-in: "take me to my calendar" and a not-yet-imported try-out week.
const USER_LOCAL_KEYS = ['pwd-next', 'pwd-tryout']
const UID_KEY = 'pwd-uid'
let expiredAt = 0

function forgetUserState(full: boolean, userId?: number) {
  try {
    USER_SESSION_KEYS.forEach((k) => sessionStorage.removeItem(k))
    if (full) {
      USER_LOCAL_KEYS.forEach((k) => localStorage.removeItem(k))
      sessionStorage.removeItem('pwd-saved-week')
      sessionStorage.removeItem(UID_KEY)
      if (userId !== undefined) localStorage.removeItem(`pwd-goals-nudge:${userId}`)
    }
  } catch { /* storage off: nothing to forget */ }
  forgetVisitorChat()
}

// A queued "open Log in" for the home page (it mounts after the user is dropped). Read by AuthDialog.listenForSignup.
let queuedAuth: { notice: string; at: number } | null = null
export function takeQueuedLogin(): string | null {
  const q = queuedAuth
  queuedAuth = null
  return q && Date.now() - q.at < 120_000 ? q.notice : null
}

function readRoute(): Route {
  const r = window.location.hash.replace(/^#\/?/, '').split('/')[0] as Route
  return r || 'home'
}

function readArg(): string {
  const rest = window.location.hash.replace(/^#\/?/, '').split('/').slice(1).join('/')
  try { return decodeURIComponent(rest) } catch { return '' }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [profileSavedAt, setProfileSavedAt] = useState<string | null>(null)
  const [sections, setSections] = useState<Section[]>([])
  const [topics, setTopics] = useState<string[]>([])
  const [plan, setPlan] = useState<PlanResponse | null>(null)
  const [route, setRoute] = useState<Route>(readRoute)
  const [routeArg, setRouteArg] = useState<string>(readArg)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [shortlist, setShortlist] = useState<Map<string, number>>(new Map())
  const [profileReady, setProfileReady] = useState(false)

  useEffect(() => {
    const onHash = () => { setRoute(readRoute()); setRouteArg(readArg()) }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const go = useCallback((r: Route, arg?: string) => {
    window.location.hash = arg ? `/${r}/${encodeURIComponent(arg)}` : `/${r}`
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const [celebration, setCelebration] = useState<string | null>(null)

  const dismissToast = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), [])

  const toast = useCallback((text: string, tone?: 'good' | 'bad', action?: Toast['action']) => {
    // Right after a session expires, the failed calls' "Please sign in" errors would only repeat the Log in note.
    if (tone === 'bad' && Date.now() - expiredAt < 4000) return
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
    try {
      const r = await api.profile()
      setProfile(r.profile); setProfileSavedAt(r.updated_at ?? null)
    } catch { setProfile(null); setProfileSavedAt(null) }
  }, [])
  const refreshPlan = useCallback(async () => {
    try { setPlan(await api.plan()) } catch { setPlan(null) }
  }, [])

  const refreshShortlist = useCallback(async () => {
    try { setShortlist(new Map((await api.shortlist()).items.map((i) => [i.key, i.id]))) } catch { setShortlist(new Map()) }
  }, [])

  // Keyed on the account id, not the user object, so re-reading the same user (e.g. after unlinking Google) doesn't reload.
  const uid = user?.id
  useEffect(() => {
    if (uid === undefined) { setProfile(null); setPlan(null); setShortlist(new Map()); setProfileReady(false); return }
    // A different account signed in in this tab: drop the previous one's hand-offs (Elihu's courses, chat transcript).
    try {
      const prev = sessionStorage.getItem(UID_KEY)
      if (prev && prev !== String(uid)) forgetUserState(false)
      sessionStorage.setItem(UID_KEY, String(uid))
    } catch { /* storage off */ }
    let alive = true
    setProfileReady(false)
    refreshProfile().finally(() => { if (alive) setProfileReady(true) })
    refreshPlan(); refreshShortlist()
    return () => { alive = false }
  }, [uid, refreshProfile, refreshPlan, refreshShortlist])

  const endSession = useCallback((how: 'logout' | 'deleted' | 'expired') => {
    forgetUserState(true, how === 'deleted' ? uid : undefined)
    if (how === 'expired') {
      expiredAt = Date.now()
      queuedAuth = { notice: 'Your session ended. Log in again to pick up where you left off.', at: Date.now() }
    }
    setUser(null)
    if (how !== 'expired') go('home')
  }, [uid, go])

  // Any API call that comes back 401 (outside the sign-in forms) means the session is gone: back to Log in.
  useEffect(() => {
    if (uid === undefined) return
    const onExpired = () => endSession('expired')
    window.addEventListener('pwd:unauthorized', onExpired)
    return () => window.removeEventListener('pwd:unauthorized', onExpired)
  }, [uid, endSession])

  const undoToast = useCallback((text: string, actionId?: number) => {
    toast(text, 'good', actionId ? {
      label: 'Undo',
      run: async () => {
        try {
          const r = await api.undo(actionId)
          await refreshPlan()
          toast(r.ok ? 'Undone' : r.detail || 'Nothing to undo', r.ok ? undefined : 'bad')
        } catch (e) {
          toast((e as Error).message, 'bad')
        }
      },
    } : undefined)
  }, [toast, refreshPlan])

  // Requests already on their way, so a double click (or two buttons for the same course) sends one, toasts once.
  const inFlight = useRef(new Set<string>())
  const addCourse = useCallback(async (courseId: string, by: 'student' | 'dan' = 'student') => {
    const key = `add:${courseId}`
    if (inFlight.current.has(key)) return
    inFlight.current.add(key)
    try {
      const r = await api.addToPlan(courseId, by)
      await refreshPlan()
      if (r.clashes && r.clashes.length) {
        toast(`Added, but it clashes with ${r.clashes.map((c) => (c.a_id === courseId ? c.b : c.a)).join(', ')}`, 'bad',
          r.action_id ? { label: 'Undo', run: async () => { await api.undo(r.action_id!); await refreshPlan() } } : undefined)
      } else undoToast(r.switched ? 'Switched to that section' : 'Added to your plan', r.action_id)
    } catch (e) {
      toast((e as Error).message, 'bad')
    } finally {
      inFlight.current.delete(key)
    }
  }, [refreshPlan, toast, undoToast])

  const toggleShortlist = useCallback(async (key: string, title?: string) => {
    const id = shortlist.get(key)
    const flight = `star:${key}`
    if (inFlight.current.has(flight)) return
    inFlight.current.add(flight)
    try {
      if (id) { await api.shortlistRemove(id); toast(`Removed${title ? ` ${title}` : ''} from your shortlist`) }
      else {
        const r = await api.shortlistAdd(key)
        toast(`Shortlisted${title ? ` ${title}` : ''} (${r.count})`, 'good', { label: 'Compare', run: () => go('shortlist') })
      }
      await refreshShortlist()
    } catch (e) { toast((e as Error).message, 'bad') }
    finally { inFlight.current.delete(flight) }
  }, [shortlist, toast, go, refreshShortlist])

  const sectionById = useMemo(() => new Map(sections.map((s) => [s.id, s])), [sections])
  const plannedIds = useMemo(() => new Set((plan?.items ?? []).map((i) => i.section.id)), [plan])

  const value: AppState = {
    user, profile, profileSavedAt, sections, topics, plan, route, routeArg, go, setUser, profileReady, endSession, refreshProfile, refreshPlan, addCourse, toast, toasts,
    undoToast, dismissToast, celebration, celebrate, sectionById, plannedIds, shortlist, toggleShortlist, refreshShortlist,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useApp(): AppState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useApp outside AppProvider')
  return v
}
