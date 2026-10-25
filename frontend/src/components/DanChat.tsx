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
import { useApp } from '../state'
import './dan-chat.css'

const STARTERS = {
  member: ['What should I take next spring for my goal?', 'Do I have any clashes?', 'How should I split my bid points?'],
  visitor: ['What does the MAM program require?', 'Find a spring course on healthcare strategy', 'What’s the biggest AI news this week?'],
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
          <div key={i} className="dan-chat-bot">
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
        ))}
      {busy && (
        <div className="dan-chat-bot">
          {!compact && <span className="dan-chat-avatar sm"><DanAvatar size={18} /></span>}
          <div className="bubble bot dan-chat-typing">{step ? `${step} is on it` : 'Dan is checking SOM’s course data and the Bulletin'}<span className="dots"><i /><i /><i /></span></div>
        </div>
      )}
    </>
  )
}

export default function DanChat({ onSignup, hideLauncher = false }: { onSignup?: () => void; hideLauncher?: boolean }) {
  const { user, go, route } = useApp()
  const member = Boolean(user)
  const chat = useDanChat()
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const bottom = useRef<HTMLDivElement>(null)

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
        <section className="dan-chat" role="dialog" aria-label="Chat with Dan">
          <header className="dan-chat-head">
            <span className="dan-chat-avatar"><DanAvatar size={28} /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="dan-chat-name">Dan</div>
              <div className="dan-chat-sub">{member ? 'Your SOM chief of staff' : 'Ask about SOM courses, programs or AI'}</div>
            </div>
            {member && <button className="btn icon ghost" title="Open full chat" aria-label="Open full chat" onClick={() => { setOpen(false); go('chat') }}><Maximize2 className="icon sm" /></button>}
            <button className="btn icon ghost" aria-label="Close chat" onClick={() => setOpen(false)}><X className="icon sm" /></button>
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
          {!member && <div className="dan-chat-fine">Visitors: nothing you type is saved to an account. Don’t share personal details.</div>}
        </section>
      )}
      {!(hideLauncher && !open) && (
        <button className={`dan-launcher ${open ? 'open' : ''}`} onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label={open ? 'Close chat with Dan' : 'Chat with Dan'}>
          <span className="dan-launcher-face"><DanAvatar size={34} /></span>
          <span className="dan-launcher-label">{open ? 'Close' : 'Ask Dan'}</span>
        </button>
      )}
    </>
  )
}
