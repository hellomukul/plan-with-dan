/* Public home page (v3). Founder's note + 3 reviewer agents (UX designer, growth lead, skeptical student):
   1. Header: name, three links, Log in / Sign up (a dialog; no form on the page).
   2. Hero: a plain promise on the left; Dan, inline, on the right (shared thread with the floating Dan).
   3. Workspace: "I'm an MBA first year in Blue" picker driving tabs: My plan · Dates · Tools · Requirements.
   4. The account pitch: Dan's 4 promises, one button.
   5. Straight answers.
   6. Footer: privacy, suggestions email, credit. */
import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowRight, CalendarDays, MessagesSquare, Scale, Target } from 'lucide-react'
import { api, type ProgramsInfo } from '../api'
import AuthDialog, { listenForSignup, type AuthOptions } from '../components/AuthDialog'
import DanChat from '../components/DanChat'
import HeroChat from '../components/HeroChat'
import Workspace, { whoLabel } from '../components/Workspace'
import HandsomeDan from '../mascots/HandsomeDan'
import { setChatContext } from '../lib/danChat'
import { playChime } from '../lib/chime'
import { scrollToEl } from '../lib/scroll'
import { loadTryout, saveTryout, type Tryout } from '../lib/tryout'
import './landing.css'

export const BRAND = { name: 'Plan with Dan', tagline: 'Your chief of staff at Yale SOM' }
const CREATOR = { name: 'Mukul Gupta', line: 'Yale SOM Class of 2028', url: 'https://www.linkedin.com/in/hellomukul/' }
const CONTACT = 'mukul.gupta@yale.edu'

const BENEFITS = [
  { icon: Target, title: 'Electives that fit your goals', text: 'Tell Dan your short- and long-term goals. It picks electives that fit and tells you why. Your best academic advisor.' },
  { icon: Scale, title: 'Shortlist and compare', text: 'Save your progress and come back anytime. Shortlist electives and compare them side by side.' },
  { icon: MessagesSquare, title: 'Ask anything about SOM', text: 'Rules, deadlines, bidding, requirements: Dan answers with sources. Think of Dan as your chief of staff.' },
  { icon: CalendarDays, title: 'Your calendar, built', text: 'Download your week as a calendar file, or link Google, Outlook or Apple so changes show up on their own.' },
]

const FAQ: [string, string][] = [
  ['Is this an official Yale tool?', 'No. It’s a free, independent student project. Rules come from the 2026–27 Yale Bulletin and courses from SOM’s public course directory, with sources linked. Always confirm on the SOM portal.'],
  ['Will it register me or change my courses?', 'Never. Registration and bidding happen only in SOM’s own systems. Dan suggests; every change to your plan in this app is yours, and every one can be undone.'],
  ['What do you store, and who sees it?', 'Visitors: nothing on our servers (your week lives in this browser). With an account: your email, a scrambled (hashed) password if you joined with email, your profile and plan, visible only to you. Export or delete it all from the Privacy page. Where Google or Microsoft sign-in is offered, they share only your name and email, never your calendar or mail.'],
  ['How does Dan answer?', 'AI suggests, software checks. Dan may only name real catalog courses, and code checks every course, quote, clash and unit rule. When the data doesn’t answer a question, Dan says so and links the official page.'],
  ['Why does Dan limit visitor questions?', 'Every answer costs real money to run, so visitors get 15 questions a day per device. Starter questions are often instant and don’t count. A free account gets its own daily budget.'],
]

/* ---------------------------------------------------------------- page */

export default function Landing() {
  const [auth, setAuth] = useState<null | 'signup' | 'login'>(null)
  const [info, setInfo] = useState<ProgramsInfo | null>(null)
  const [t, setTState] = useState<Tryout>(loadTryout)
  const setT = (f: (v: Tryout) => Tryout) => setTState(f)
  const [heroChatVisible, setHeroChatVisible] = useState(true)
  const heroRef = useRef<HTMLDivElement>(null)

  useEffect(() => { api.programs().then(setInfo).catch(() => undefined) }, [])
  // Shortlist stars, "Link your calendar" (and other account-only actions) ask visitors to sign up; a Google or
  // Microsoft sign-in that came back with a problem reopens the dialog with the reason.
  const [authOpts, setAuthOpts] = useState<AuthOptions>({})
  useEffect(() => listenForSignup((mode, opts) => { setAuthOpts(opts); setAuth(mode) }), [])
  useEffect(() => { saveTryout(t); setChatContext({ program: t.program, year: t.year, cohort: t.cohort }) }, [t])
  // One Dan at a time: hide the floating launcher while the hero chat is on screen.
  useEffect(() => {
    const el = heroRef.current
    if (!el || !('IntersectionObserver' in window)) return
    const io = new IntersectionObserver(([e]) => setHeroChatVisible(e.isIntersecting), { threshold: 0.25 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const who = whoLabel(t)
  const starters = [
    'What does my program require, and what’s left for spring?',
    'Find two spring electives on healthcare or AI that fit together',
    'How does bidding work, and when is add/drop?',
    'What’s the biggest AI news this week?',
  ]
  const scrollToId = (id: string) => scrollToEl(document.getElementById(id))
  const toPlan = () => scrollToId('plan')
  // "Ask Dan" in the header: bring the hero chat into view, put the cursor in it, and give it a little sparkle.
  const askDan = () => {
    playChime()
    scrollToEl(document.getElementById('ask'), 'center')
    const card = document.querySelector('.hc')
    card?.classList.remove('hc-glow')
    void (card as HTMLElement | null)?.offsetWidth  // restart the animation
    card?.classList.add('hc-glow')
    setTimeout(() => (document.querySelector('.hc-input textarea') as HTMLTextAreaElement | null)?.focus({ preventScroll: true }), 450)
  }

  return (
    <div className="lp">
      <header className="lp-header">
        <a className="brand" href="#/" style={{ padding: 0 }} aria-label={`${BRAND.name} home`}>
          <HandsomeDan size={30} furColor="#f4b183" bandanaColor="#00356b" />
          <span className="brand-name">{BRAND.name}</span>
        </a>
        <nav className="lp-nav hide-mobile" aria-label="Sections">
          <button type="button" onClick={askDan}>Ask Dan</button>
          <button type="button" onClick={toPlan}>My plan</button>
          <button type="button" onClick={() => scrollToId('why')}>Why sign up?</button>
        </nav>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn ghost sm" onClick={() => setAuth('login')}>Log in</button>
          <button className="btn primary sm" onClick={() => setAuth('signup')}>Sign up</button>
        </div>
      </header>

      <main className="lp-main">
        <section className="lp-hero v3" id="ask">
          <div className="lp-hero-copy">
            <div className="lp-meet">
              <span className="lp-meet-dog"><HandsomeDan size={52} furColor="#f4b183" bandanaColor="#00356b" /></span>
              <span className="lp-meet-text">
                <span className="lp-meet-name">Meet Dan</span>
                <span className="lp-meet-role">{BRAND.tagline}</span>
              </span>
            </div>
            <h1>Choose your electives, <span className="grad-text">hassle‑free.</span></h1>
            <p className="muted lp-lede">
              Dan picks electives that fit your goals, builds a clash-free week, and answers anything about SOM,
              with sources. Free for every SOM program.
            </p>
            <div className="row">
              <button className="btn primary lg" onClick={toPlan}>Build my week<ArrowDown className="icon" /></button>
              <button className="btn lg" onClick={() => setAuth('signup')}>Create a free account</button>
            </div>
            <ul className="lp-trust three">
              <li>Free, no card</li>
              <li>Never registers you for anything</li>
              <li>Independent, not official Yale</li>
            </ul>
          </div>
          <div ref={heroRef} className="lp-hero-chat">
            <HeroChat who={who} starters={starters} onChangeWho={toPlan} onSignup={() => setAuth('signup')} />
          </div>
        </section>

        <section id="plan" className="lp-band">
          <div className="lp-band-head">
            <h2>Build your week. No account needed.</h2>
            <p className="muted">Tell Dan who you are, and it fills in what SOM already schedules for you. Then add electives and watch for clashes.</p>
          </div>
          <Workspace t={t} setT={setT} info={info} onSave={() => setAuth('signup')} onSignup={() => setAuth('signup')} />
        </section>

        <figure className="lp-quote">
          <blockquote>“A great chief of staff doesn’t add to your to-do list. They take things off it, so you can spend
            your time at SOM on what you came here for.”</blockquote>
          <figcaption><span className="lp-quote-dog"><HandsomeDan size={26} furColor="#f4b183" bandanaColor="#00356b" /></span>Dan, your chief of staff</figcaption>
        </figure>

        <section id="why" className="lp-band lp-account">
          <div className="lp-account-head">
            <h2>Keep your plan. Let Dan watch the deadlines.</h2>
            <p className="muted">A free account takes a minute, and the week you built here comes with you.</p>
          </div>
          <div className="lp-benefits">
            {BENEFITS.map((b) => (
              <div key={b.title} className="card flat lp-benefit">
                <span className="lp-benefit-icon"><b.icon className="icon" /></span>
                <h4>{b.title}</h4>
                <p className="muted small">{b.text}</p>
              </div>
            ))}
          </div>
          <div className="lp-account-cta">
            <button className="btn primary lg" onClick={() => setAuth('signup')}>Create a free account<ArrowRight className="icon" /></button>
            <span className="faint small">Already have one? <button className="link-btn small" onClick={() => setAuth('login')}>Log in</button></span>
          </div>
        </section>
        <section id="answers" className="lp-band">
          <div className="lp-band-head"><h2>Straight answers</h2></div>
          <div className="lp-faq">
            {FAQ.map(([q, a]) => (
              <details key={q} className="card flat">
                <summary>{q}</summary>
                <p className="muted small">{a}</p>
              </details>
            ))}
          </div>
        </section>

      </main>

      <footer className="lp-footer">
        <a href="#/privacy">Privacy</a>
        <span>Suggestions? Email us at <a href={`mailto:${CONTACT}?subject=Plan%20with%20Dan%20suggestion`}>{CONTACT}</a></span>
        <span>Made by <a href={CREATOR.url} target="_blank" rel="noreferrer">{CREATOR.name}</a>, {CREATOR.line}</span>
        <span className="faint">Independent student project, not an official Yale tool.</span>
      </footer>

      <DanChat onSignup={() => setAuth('signup')} hideLauncher={heroChatVisible} />
      {auth && <AuthDialog initial={auth} {...authOpts} onClose={() => { setAuth(null); setAuthOpts({}) }} />}
    </div>
  )
}
