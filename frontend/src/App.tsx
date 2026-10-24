import { useCallback, useEffect, useState } from 'react'
import { LogOut, Search, Shield, UserRound } from 'lucide-react'
import { api } from './api'
import CommandPalette from './components/CommandPalette'
import CourseDrawer from './components/CourseDrawer'
import HandsomeDan from './mascots/HandsomeDan'
import { NAV } from './nav'
import Bids from './pages/Bids'
import Calendar from './pages/Calendar'
import Chat from './pages/Chat'
import Explore from './pages/Explore'
import Find from './pages/Find'
import Global from './pages/Global'
import Home from './pages/Home'
import Landing from './pages/Landing'
import Onboarding from './pages/Onboarding'
import Plan from './pages/Plan'
import Privacy from './pages/Privacy'
import Usage from './pages/Usage'
import { AppProvider, useApp, type Route } from './state'

function Page({ route }: { route: Route }) {
  switch (route) {
    case 'find': return <Find />
    case 'chat': return <Chat />
    case 'explore': return <Explore />
    case 'plan': return <Plan />
    case 'calendar': return <Calendar />
    case 'global': return <Global />
    case 'bids': return <Bids />
    case 'usage': return <Usage />
    case 'privacy': return <Privacy />
    case 'profile': return <Onboarding editing />
    default: return <Home />
  }
}

function Shell() {
  const { user, setUser, profile, route, go, plan } = useApp()
  const [checked, setChecked] = useState(false)
  const [cmdk, setCmdk] = useState(false)
  const [drawerKey, setDrawerKey] = useState<string | null>(null)
  const closeDrawer = useCallback(() => setDrawerKey(null), [])

  useEffect(() => {
    api.me().then((r) => setUser(r.user)).catch(() => setUser(null)).finally(() => setChecked(true))
  }, [setUser])

  // ⌘K / Ctrl+K anywhere, plus "g then letter" shortcuts when not typing.
  useEffect(() => {
    let pendingG = false
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setCmdk((v) => !v); return }
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.metaKey || e.ctrlKey) return
      if (e.key === 'g') { pendingG = true; setTimeout(() => { pendingG = false }, 900); return }
      if (pendingG) {
        const hit = NAV.find((n) => n.keys?.split(' ')[1]?.toLowerCase() === e.key.toLowerCase())
        if (hit) go(hit.route)
        pendingG = false
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go])

  if (!checked) {
    return <div className="empty" style={{ minHeight: '100vh', justifyContent: 'center' }}><span className="spinner" /></div>
  }
  if (!user) return <>{route === 'privacy' ? <div className="main" style={{ margin: '0 auto' }}><Privacy /></div> : <Landing />}<Toasts /></>
  if (profile && !profile.onboarded && route !== 'explore' && route !== 'privacy') return <><Onboarding /><Toasts /></>

  const clashCount = Object.values(plan?.terms ?? {}).reduce((n, t) => n + t.conflicts.length, 0)
  const logout = async () => {
    await api.logout().catch(() => undefined)
    setUser(null)
    go('home')
  }

  let lastSection: string | undefined = 'none'
  return (
    <div className="shell">
      <aside className="sidebar" aria-label="Main navigation">
        <div className="brand">
          <HandsomeDan size={28} furColor="#f4b183" bandanaColor="#00356b" />
          <div>
            <div className="brand-name">Plan with Dan</div>
            <div className="brand-sub">Your SOM chief of staff</div>
          </div>
        </div>
        <button className="search-trigger" onClick={() => setCmdk(true)}><Search className="icon sm" /> Search <kbd>⌘K</kbd></button>
        {NAV.map((n) => {
          const header = n.section && n.section !== lastSection ? <div className="nav-section" key={`s-${n.section}`}>{n.section}</div> : null
          lastSection = n.section
          return (
            <div key={n.route}>
              {header}
              <a href={`#/${n.route}`} className={`nav-item ${route === n.route ? 'active' : ''}`}>
                <n.icon className="icon" />
                <span>{n.label}</span>
                {n.route === 'plan' && clashCount > 0 && <span className="badge red" style={{ marginLeft: 'auto' }}>{clashCount}</span>}
              </a>
            </div>
          )
        })}
        <div className="nav-spacer" />
        <a href="#/profile" className={`nav-item ${route === 'profile' ? 'active' : ''}`}><UserRound className="icon" /><span>Profile and goals</span></a>
        <a href="#/privacy" className={`nav-item ${route === 'privacy' ? 'active' : ''}`}><Shield className="icon" /><span>Privacy and data</span></a>
        <button className="nav-item" onClick={logout}><LogOut className="icon" /><span>Sign out</span></button>
        <div className="faint small" style={{ padding: '8px 10px' }}>{user.email}</div>
      </aside>
      <main className="main">
        <Page route={route} />
      </main>
      <nav className="bottom-nav" aria-label="Main navigation">
        {NAV.filter((n) => n.mobile).map((n) => (
          <button key={n.route} className={route === n.route ? 'active' : ''} onClick={() => go(n.route)}>
            <n.icon className="icon" />{n.mobile}
          </button>
        ))}
      </nav>
      <CommandPalette open={cmdk} onClose={() => setCmdk(false)} onOpenCourse={setDrawerKey} />
      {drawerKey && <CourseDrawer courseKey={drawerKey} onClose={closeDrawer} />}
      <Celebration />
      <Toasts />
    </div>
  )
}

function Celebration() {
  const { celebration } = useApp()
  if (!celebration) return null
  return (
    <div className="celebrate" role="status">
      <span className="wiggle" style={{ display: 'inline-flex' }}><HandsomeDan size={44} furColor="#f4b183" bandanaColor="#00356b" /></span>
      <span style={{ fontWeight: 500 }}>{celebration}</span>
    </div>
  )
}

function Toasts() {
  const { toasts, dismissToast } = useApp()
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.tone ?? ''}`}>
          <span className="dot" />
          <span>{t.text}</span>
          {t.action && <button className="btn sm" onClick={() => { dismissToast(t.id); t.action!.run() }}>{t.action.label}</button>}
        </div>
      ))}
    </div>
  )
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  )
}
