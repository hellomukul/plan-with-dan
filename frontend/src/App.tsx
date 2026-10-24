import { useEffect, useState } from 'react'
import { api } from './api'
import HandsomeDan from './mascots/HandsomeDan'
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
import Usage from './pages/Usage'
import { AppProvider, useApp, type Route } from './state'

const NAV: { route: Route; label: string; emoji: string; mobile?: string }[] = [
  { route: 'home', label: 'Home', emoji: '🏠', mobile: 'Home' },
  { route: 'find', label: 'Find my courses', emoji: '✨', mobile: 'Find' },
  { route: 'chat', label: 'Ask Dan', emoji: '🐶', mobile: 'Ask Dan' },
  { route: 'explore', label: 'Explore catalog', emoji: '🔎' },
  { route: 'plan', label: 'My plan', emoji: '🗓️', mobile: 'Plan' },
  { route: 'calendar', label: 'Calendar', emoji: '📆', mobile: 'Calendar' },
  { route: 'global', label: 'Global studies', emoji: '🌍' },
  { route: 'bids', label: 'Bid coach', emoji: '🎯' },
  { route: 'usage', label: 'Cost & safety', emoji: '🧾' },
]

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
    case 'profile': return <Onboarding editing />
    default: return <Home />
  }
}

function Shell() {
  const { user, setUser, profile, route, go, plan } = useApp()
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    api.me().then((r) => setUser(r.user)).catch(() => setUser(null)).finally(() => setChecked(true))
  }, [setUser])

  if (!checked) {
    return <div className="empty" style={{ minHeight: '100vh', justifyContent: 'center' }}><HandsomeDan size={90} /><span className="spinner" /></div>
  }
  if (!user) return <><Landing /><Toasts /></>
  if (profile && !profile.onboarded && route !== 'explore') return <><Onboarding /><Toasts /></>

  const clashCount = Object.values(plan?.terms ?? {}).reduce((n, t) => n + t.conflicts.length, 0)

  const logout = async () => {
    await api.logout().catch(() => undefined)
    setUser(null)
    go('home')
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <HandsomeDan size={44} furColor="#ff8cc6" bandanaColor="#00356b" />
          <div>
            <div className="brand-name">Plan with <span className="grad-text">Dan</span></div>
            <div className="brand-sub">Yale SOM planner</div>
          </div>
        </div>
        {NAV.map((n) => (
          <a key={n.route} href={`#/${n.route}`} className={`nav-item ${route === n.route ? 'active' : ''}`}>
            <span className="emoji">{n.emoji}</span>
            <span>{n.label}</span>
            {n.route === 'plan' && clashCount > 0 && <span className="badge red" style={{ marginLeft: 'auto' }}>{clashCount}</span>}
          </a>
        ))}
        <div className="nav-spacer" />
        <a href="#/profile" className={`nav-item ${route === 'profile' ? 'active' : ''}`}><span className="emoji">🎒</span><span>My profile</span></a>
        <button className="nav-item" onClick={logout}><span className="emoji">👋</span><span>Sign out</span></button>
        <div className="faint small" style={{ padding: '8px 12px' }}>{user.email}</div>
      </aside>
      <main className="main">
        <Page route={route} />
      </main>
      <nav className="bottom-nav">
        {NAV.filter((n) => n.mobile).map((n) => (
          <button key={n.route} className={route === n.route ? 'active' : ''} onClick={() => go(n.route)}>
            <span className="emoji">{n.emoji}</span>{n.mobile}
          </button>
        ))}
      </nav>
      <Toasts />
    </div>
  )
}

function Toasts() {
  const { toasts } = useApp()
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => <div key={t.id} className={`toast ${t.tone ?? ''}`}>{t.text}</div>)}
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
