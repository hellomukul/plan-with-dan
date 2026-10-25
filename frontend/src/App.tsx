import { useCallback, useEffect, useRef, useState } from 'react'
import { ChartLine, Compass, Ellipsis, LogOut, Search, Shield, UserRound } from 'lucide-react'
import { api } from './api'
import CommandPalette from './components/CommandPalette'
import CourseDrawer from './components/CourseDrawer'
import DanChat from './components/DanChat'
import HandsomeDan from './mascots/HandsomeDan'
import { NAV } from './nav'
import Bids from './pages/Bids'
import Calendar from './pages/Calendar'
import Chat from './pages/Chat'
import Explore from './pages/Explore'
import Faculty from './pages/Faculty'
import Find from './pages/Find'
import Global from './pages/Global'
import Home from './pages/Home'
import Landing from './pages/Landing'
import Onboarding from './pages/Onboarding'
import Plan from './pages/Plan'
import Privacy from './pages/Privacy'
import Shortlist from './pages/Shortlist'
import Help from './pages/Help'
import Usage from './pages/Usage'
import Owner from './pages/Owner'
import { useFocusTrap } from './components/ui'
import { AppProvider, isRoute, useApp, type Route } from './state'

function Page({ route }: { route: Route }) {
  switch (route) {
    case 'find': return <Find />
    case 'chat': return <Chat />
    case 'explore': return <Explore />
    case 'faculty': return <Faculty />
    case 'plan': return <Plan />
    case 'shortlist': return <Shortlist />
    case 'help': return <Help />
    case 'calendar': return <Calendar />
    case 'global': return <Global />
    case 'bids': return <Bids />
    case 'usage': return <Usage />
    case 'owner': return <Owner />
    case 'privacy': return <Privacy />
    case 'profile': return <Onboarding editing />
    case 'home': return <Home />
    default: return <NotFound signedIn />
  }
}

/** Any hash that isn't a page: say so, with a way home, instead of quietly showing something else. */
function NotFound({ signedIn }: { signedIn: boolean }) {
  return (
    <div className="empty not-found" style={{ minHeight: signedIn ? '60vh' : '100vh', justifyContent: 'center' }}>
      <Compass className="icon lg" aria-hidden="true" />
      <h1 style={{ fontSize: 22, margin: 0, color: 'var(--text)' }}>That page doesn’t exist</h1>
      <p className="muted" style={{ margin: 0 }}>The link may be old or mistyped.</p>
      <a className="btn primary" href={signedIn ? '#/home' : '#/'}>{signedIn ? 'Go to Dan’s Desk' : 'Go to the home page'}</a>
    </div>
  )
}

function Shell() {
  const { user, setUser, profile, profileReady, endSession, route, plan, shortlist, go } = useApp()
  const [checked, setChecked] = useState(false)
  const [cmdk, setCmdk] = useState(false)
  const [drawerKey, setDrawerKey] = useState<string | null>(null)
  const [moreOpen, setMoreOpen] = useState(false)
  const moreRef = useRef<HTMLDivElement>(null)
  useFocusTrap(moreRef, moreOpen, () => setMoreOpen(false))
  useEffect(() => { setMoreOpen(false) }, [route])
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
      if (pendingG) {  // checked first, so "g g" reaches Global studies
        pendingG = false
        const hit = NAV.find((n) => n.keys?.split(' ')[1]?.toLowerCase() === e.key.toLowerCase())
        if (hit) go(hit.route)
        return
      }
      if (e.key === 'g') { pendingG = true; setTimeout(() => { pendingG = false }, 900) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go])

  if (!checked) {
    return <div className="empty" style={{ minHeight: '100vh', justifyContent: 'center' }}><span className="spinner" /></div>
  }
  if (!user) {
    const page = route === 'privacy' ? <div className="main" style={{ margin: '0 auto' }}><Privacy /></div>
      : isRoute(route) ? <Landing /> : <main><NotFound signedIn={false} /></main>
    return <>{page}<Toasts /></>
  }
  // Wait for the profile, so a brand-new account goes straight to onboarding (no flash of the Desk, no brief).
  if (!profileReady) {
    return <><div className="empty" style={{ minHeight: '100vh', justifyContent: 'center' }}><span className="spinner" /></div><Toasts /></>
  }
  if (profile && !profile.onboarded && route !== 'explore' && route !== 'faculty' && route !== 'privacy') return <><Onboarding /><Toasts /></>

  const clashCount = Object.values(plan?.terms ?? {}).reduce((n, t) => n + t.conflicts.length, 0)
  const logout = async () => {
    await api.logout().catch(() => undefined)
    endSession('logout')
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
        {NAV.filter((n) => !n.account).map((n) => {
          const header = n.section && n.section !== lastSection ? <div className="nav-section" key={`s-${n.section}`}>{n.section}</div> : null
          lastSection = n.section
          return (
            <div key={n.route}>
              {header}
              <a href={`#/${n.route}`} title={n.hint} className={`nav-item ${route === n.route ? 'active' : ''}`} aria-current={route === n.route ? 'page' : undefined}>
                <n.icon className="icon" />
                <span>{n.label}</span>
                {n.route === 'plan' && clashCount > 0 && <span className="badge red" style={{ marginLeft: 'auto' }}>{clashCount}</span>}
                {n.route === 'shortlist' && shortlist.size > 0 && <span className="badge gray" style={{ marginLeft: 'auto' }}>{shortlist.size}</span>}
              </a>
            </div>
          )
        })}
        <div className="nav-spacer" />
        <a href="#/profile" className={`nav-item ${route === 'profile' ? 'active' : ''}`} aria-current={route === 'profile' ? 'page' : undefined}><UserRound className="icon" /><span>Profile and goals</span></a>
        <a href="#/privacy" className={`nav-item ${route === 'privacy' ? 'active' : ''}`} aria-current={route === 'privacy' ? 'page' : undefined}><Shield className="icon" /><span>Privacy and data</span></a>
        {NAV.filter((n) => n.account).map((n) => (
          <a key={n.route} href={`#/${n.route}`} title={n.hint} className={`nav-item ${route === n.route ? 'active' : ''}`} aria-current={route === n.route ? 'page' : undefined}><n.icon className="icon" /><span>{n.label}</span></a>
        ))}
        {user.owner && <a href="#/owner" className={`nav-item ${route === 'owner' ? 'active' : ''}`} aria-current={route === 'owner' ? 'page' : undefined}><ChartLine className="icon" /><span>Owner dashboard</span></a>}
        <button className="nav-item" onClick={logout}><LogOut className="icon" /><span>Sign out</span></button>
        <div className="faint small" style={{ padding: '8px 10px' }}>{user.email}</div>
      </aside>
      <main className="main">
        <Page route={route} />
      </main>
      <nav className="bottom-nav" aria-label="Main navigation">
        {NAV.filter((n) => n.mobile).map((n) => (
          <button key={n.route} className={route === n.route ? 'active' : ''} aria-current={route === n.route ? 'page' : undefined} onClick={() => go(n.route)}>
            <n.icon className="icon" />{n.mobile}
          </button>
        ))}
        <button className={moreOpen || !NAV.some((n) => n.mobile && n.route === route) ? 'active' : ''}
          onClick={() => setMoreOpen((v) => !v)} aria-expanded={moreOpen} aria-controls="more-sheet">
          <Ellipsis className="icon" />More
        </button>
      </nav>
      {moreOpen && (
        <div className="overlay more-overlay" onClick={() => setMoreOpen(false)}>
          <div className="more-sheet" id="more-sheet" ref={moreRef} role="dialog" aria-modal="true" aria-label="More pages" tabIndex={-1} style={{ outline: 'none' }} onClick={(e) => e.stopPropagation()}>
            {NAV.filter((n) => !n.mobile).map((n, i, list) => (
              <div key={n.route}>
                {n.section && n.section !== list[i - 1]?.section && <div className="nav-section">{n.section}</div>}
                <a href={`#/${n.route}`} className={`nav-item more-item ${route === n.route ? 'active' : ''}`} aria-current={route === n.route ? 'page' : undefined}>
                  <n.icon className="icon" /><span className="more-text"><span>{n.label}</span><span className="more-hint">{n.hint}</span></span>
                </a>
              </div>
            ))}
            <a href="#/profile" className="nav-item"><UserRound className="icon" /><span>Profile and goals</span></a>
            <a href="#/privacy" className="nav-item"><Shield className="icon" /><span>Privacy and data</span></a>
            {user.owner && <a href="#/owner" className="nav-item"><ChartLine className="icon" /><span>Owner dashboard</span></a>}
            <button className="nav-item" onClick={logout}><LogOut className="icon" /><span>Sign out</span></button>
          </div>
        </div>
      )}
      <CommandPalette open={cmdk} onClose={() => setCmdk(false)} onOpenCourse={setDrawerKey} />
      {drawerKey && <CourseDrawer courseKey={drawerKey} onClose={closeDrawer} />}
      <DanChat />
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
