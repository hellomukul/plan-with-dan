/* Dan, everywhere: a floating chat in the corner of every page.
   Signed in: the same Dan as the Ask Dan page (memory, plan-aware, add-to-plan buttons).
   Visitors: no account needed, nothing stored on the server, a few questions a day.
   The conversation itself lives in lib/danChat, shared with the home page hero chat. */
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ArrowUp, Maximize2, Plus, X } from 'lucide-react'
import HandsomeDan from '../mascots/HandsomeDan'
import { loadHistory, sendToDan, setMember, useDanChat, type Msg } from '../lib/danChat'
import { ArrowRight } from 'lucide-react'
import { playChime } from '../lib/chime'
import TokenMeter from './TokenMeter'
import SupportCard from './SupportCard'
import { useApp } from '../state'
import { useFocusTrap } from './ui'
import './dan-chat.css'

const STARTERS = {
  member: ['What should I take next spring for my goal?', 'Do I have any clashes?', 'How should I split my bid points?'],
  // Program-neutral: Dan gets the visitor's program, year and cohort from the home page picker with every question
  // (lib/danChat context). Same wording as the hero chat's starters, so repeat answers come from the server's cache.
  visitor: ['What does my program require, and what’s left for spring?', 'Find two spring electives on healthcare or AI that fit together', 'What’s the biggest AI news this week?'],
}

export const DanAvatar = ({ size = 22 }: { size?: number }) => <HandsomeDan size={size} furColor="#f4b183" bandanaColor="#00356b" />

/** The message list, shared by the floating panel and the hero chat. */
export function DanMessages({ msgs, busy, step, compact = false }: { msgs: Msg[]; busy: boolean; step: string; compact?: boolean }) {
  const { addCourse, plannedIds } = useApp()
  return (
    <>
      {msgs.map((m, i) => m.role === 'user'
        ? <div key={i} className="bubble user">{m.content}</div>
        : (
          <div key={i} className="dan-chat-bot-wrap">
          <div className="dan-chat-bot">
            {!compact && <span className="dan-chat-avatar sm"><DanAvatar size={18} /></span>}
            <div className="bubble bot md">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: (p) => <a {...p} target="_blank" rel="noreferrer" /> }}>{m.content}</ReactMarkdown>
              {(m.proposals ?? []).map((p) => (
                <div key={p.course_id} className="dan-chat-proposal">
                  <span><span className="course-num">{p.number}</span> {p.title}<span className="faint small"> · {p.time}</span></span>
                  {plannedIds.has(p.course_id)
                    ? <span className="faint small">In plan</span>
                    : <button className="btn sm" onClick={() => addCourse(p.course_id, 'dan')}><Plus className="icon sm" />Add</button>}
                </div>
              ))}
            </div>
          </div>
          {m.support && <SupportCard flush={compact} />}
          </div>
        ))}
      {!busy && <FollowUps msgs={msgs} />}
      {busy && (
        <div className="dan-chat-bot">
          {!compact && <span className="dan-chat-avatar sm"><DanAvatar size={18} /></span>}
          <div className="bubble bot dan-chat-typing">{step ? `${step} is on it` : 'Dan is checking SOM’s course data and the Bulletin'}<span className="dots"><i /><i /><i /></span></div>
        </div>
      )}
    </>
  )
}

/** Tappable "what next?" questions under Dan's latest answer, written in the student's own voice. */
export function FollowUps({ msgs }: { msgs: Msg[] }) {
  const last = msgs[msgs.length - 1]
  if (!last || last.role !== 'assistant' || !last.followups?.length) return null
  return (
    <div className="dan-followups" aria-label="Suggested follow-up questions">
      <span className="dan-followups-label">Curious? Tap one</span>
      {last.followups.map((q) => (
        <button key={q} type="button" className="dan-followup" onClick={() => void sendToDan(q)}>{q}<ArrowRight className="icon sm" /></button>
      ))}
    </div>
  )
}

const INTERACTIVE = 'button, a[href], input, select, textarea, summary, label, [role="button"], [role="tab"], [role="radio"], [role="link"], [tabindex]:not([tabindex="-1"])'

/** The floating launcher never sits on top of something you can click or type in: when it would, it steps aside
    (fades out, can't be clicked) until you scroll it over plain content again. Checked when scrolling stops, on
    resize, and a few times a second for sheets and drawers that open under it. Never while the chat is open.
    Hysteresis, so it never blinks at the edge of a control: it doesn't move when it hides, once hidden it tests a
    slightly larger box (MARGIN px all round), and it only comes back after the spot has stayed clear for SETTLE ms. */
const DODGE_MARGIN = 8
const DODGE_SETTLE = 600
function useLauncherDodge(ref: React.RefObject<HTMLButtonElement | null>, open: boolean): boolean {
  const [dodge, setDodge] = useState(false)
  useEffect(() => {
    if (open) { setDodge(false); return }
    let idle = 0
    let settle = 0
    let hidden = false
    let clearSince = 0
    const covered = (el: HTMLElement) => {
      const r = el.getBoundingClientRect()
      if (!r.width) return null
      const m = hidden ? DODGE_MARGIN : 0
      const xs = [r.left - m + 1, r.left + r.width / 2, r.right + m - 1]
      const ys = [r.top - m + 1, r.top + r.height / 2, r.bottom + m - 1]
      for (const x of xs) for (const y of ys) {
        const under = document.elementsFromPoint(x, y).find((n) => !el.contains(n))
        if (under?.closest(INTERACTIVE) && !under.closest('.dan-chat')) return true
      }
      return false
    }
    const check = () => {
      const el = ref.current
      if (!el) return
      const covers = covered(el)
      if (covers === null) return
      if (covers) { clearSince = 0; clearTimeout(settle); if (!hidden) { hidden = true; setDodge(true) } return }
      if (!hidden) return
      const now = performance.now()
      if (!clearSince) clearSince = now
      if (now - clearSince >= DODGE_SETTLE) { hidden = false; clearSince = 0; setDodge(false) }
      else { clearTimeout(settle); settle = window.setTimeout(check, DODGE_SETTLE - (now - clearSince) + 20) }
    }
    const onScroll = () => { clearTimeout(idle); idle = window.setTimeout(check, 120) }
    const tick = window.setInterval(check, 700)
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    check()
    return () => { clearTimeout(idle); clearTimeout(settle); clearInterval(tick); window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll) }
  }, [ref, open])
  return dodge
}

export default function DanChat({ onSignup, hideLauncher = false }: { onSignup?: () => void; hideLauncher?: boolean }) {
  const { user, go, route } = useApp()
  const member = Boolean(user)
  const chat = useDanChat()
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const bottom = useRef<HTMLDivElement>(null)
  const launcher = useRef<HTMLButtonElement>(null)
  const dodging = useLauncherDodge(launcher, open)
  const panel = useRef<HTMLElement>(null)
  // Escape closes the panel; closing it (Escape or the X) puts focus back on the launcher.
  const close = () => { setOpen(false); requestAnimationFrame(() => launcher.current?.focus({ preventScroll: true })) }
  useFocusTrap(panel, open, close)

  useEffect(() => { setMember(member) }, [member])
  useEffect(() => { if (open) void loadHistory() }, [open, member])
  useEffect(() => { if (open) bottom.current?.scrollIntoView({ block: 'end' }) }, [chat.msgs, chat.busy, open])

  // Other parts of the page hand Dan a question (or just open the panel) with this event.
  useEffect(() => {
    const onAsk = (e: Event) => { const text = (e as CustomEvent<string>).detail; setOpen(true); if (text) void sendToDan(text) }
    window.addEventListener('dan:ask', onAsk)
    return () => window.removeEventListener('dan:ask', onAsk)
  }, [])

  if (member && route === 'chat') return null  // the full Ask Dan page is already open

  const send = (text: string) => { setInput(''); void sendToDan(text) }
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) }
  }

  return (
    <>
      {open && (
        <section ref={panel} className="dan-chat" role="dialog" aria-label="Chat with Dan">
          <header className="dan-chat-head">
            <span className="dan-chat-avatar"><DanAvatar size={28} /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="dan-chat-name">Dan</div>
              <div className="dan-chat-sub">{member ? 'Your SOM chief of staff' : 'Ask about SOM courses, programs or AI'}</div>
            </div>
            {member && <button className="btn icon ghost" title="Open full chat" aria-label="Open full chat" onClick={() => { setOpen(false); go('chat') }}><Maximize2 className="icon sm" /></button>}
            <button className="btn icon ghost" aria-label="Close chat" data-autofocus onClick={close}><X className="icon sm" /></button>
          </header>

          <div className="dan-chat-body">
            {chat.msgs.length === 0 && (
              <div className="dan-chat-empty">
                <p>Hi, I’m Dan. {member ? 'I know your plan and goals, so ask away.' : 'I answer from real SOM course data and the Yale Bulletin, and I’ll tell you when I don’t know.'}</p>
                <div className="dan-chat-starters">
                  {STARTERS[member ? 'member' : 'visitor'].map((s) => <button key={s} className="chip" onClick={() => send(s)}>{s}</button>)}
                </div>
              </div>
            )}
            <DanMessages msgs={chat.msgs} busy={chat.busy} step={chat.step} />
            <div ref={bottom} />
          </div>

          {!member && (chat.limited || (chat.remaining !== null && chat.remaining <= 3)) && (
            <div className="dan-chat-note">
              {chat.limited ? 'You’ve reached today’s visitor limit.' : `${chat.remaining} visitor question${chat.remaining === 1 ? '' : 's'} left today.`}
              {onSignup && <button className="link-btn small" onClick={onSignup}>Create a free account</button>}
            </div>
          )}
          <div className="dan-chat-input">
            <textarea rows={1} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKey} maxLength={2000}
              placeholder={chat.limited ? 'Sign up to keep chatting' : 'Ask Dan…'} aria-label="Message Dan" disabled={chat.limited} />
            <button className="btn primary icon" onClick={() => send(input)} disabled={chat.busy || !input.trim() || chat.limited} aria-label="Send"><ArrowUp className="icon sm" /></button>
          </div>
          <div className="dan-chat-fine row between" style={{ gap: 8 }}>
            <span>{member ? 'Answers use your plan and goals.' : 'Visitors: nothing you type is saved to an account. Don’t share personal details.'}</span>
            <TokenMeter msgs={chat.msgs} onMore={member ? () => { setOpen(false); go('usage') } : undefined} />
          </div>
        </section>
      )}
      {!(hideLauncher && !open) && (
        <button ref={launcher} className={`dan-launcher ${open ? 'open' : ''} ${dodging ? 'dodge' : ''}`} onClick={() => { if (!open) playChime(); setOpen((v) => !v) }} aria-expanded={open} aria-label={open ? 'Close chat with Dan' : 'Chat with Dan'}>
          <span className="dan-launcher-face"><DanAvatar size={34} /></span>
          <span className="dan-launcher-label">{open ? 'Close' : 'Ask Dan'}</span>
        </button>
      )}
    </>
  )
}
