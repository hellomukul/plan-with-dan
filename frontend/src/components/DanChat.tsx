/* Dan, everywhere: a floating chat in the corner of every page.
   Signed in: the same Dan as the Ask Dan page (memory, plan-aware, add-to-plan buttons).
   Visitors: no account needed, nothing stored on the server, a few questions a day. */
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ArrowUp, Maximize2, Plus, X } from 'lucide-react'
import { api, streamChat, type Proposal } from '../api'
import HandsomeDan from '../mascots/HandsomeDan'
import { useApp } from '../state'
import './dan-chat.css'

interface Msg { role: 'user' | 'assistant'; content: string; agent?: string | null; proposals?: Proposal[] }

const VISITOR_KEY = 'pwd-visitor-chat'
const STARTERS = {
  member: ['What should I take next spring for my goal?', 'Do I have any clashes?', 'How should I split my bid points?'],
  visitor: ['What does the MAM program require?', 'Find a spring course on healthcare strategy', 'What’s the biggest AI news this week?'],
}

const Avatar = ({ size = 22 }: { size?: number }) => <HandsomeDan size={size} furColor="#f4b183" bandanaColor="#00356b" />

export default function DanChat({ onSignup }: { onSignup?: () => void }) {
  const { user, addCourse, plannedIds, go, route } = useApp()
  const member = Boolean(user)
  const [open, setOpen] = useState(false)
  const [msgs, setMsgs] = useState<Msg[]>(() => {
    if (member) return []
    try { return JSON.parse(sessionStorage.getItem(VISITOR_KEY) || '[]') } catch { return [] }
  })
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [step, setStep] = useState('')
  const [remaining, setRemaining] = useState<number | null>(null)
  const [limited, setLimited] = useState(false)
  const bottom = useRef<HTMLDivElement>(null)
  const loaded = useRef(false)
  const [pending, setPending] = useState('')

  // Other parts of the page (the home page "Ask Dan anything" bar) hand Dan a question with this event.
  useEffect(() => {
    const onAsk = (e: Event) => { const text = (e as CustomEvent<string>).detail; setOpen(true); if (text) setPending(text) }
    window.addEventListener('dan:ask', onAsk)
    return () => window.removeEventListener('dan:ask', onAsk)
  }, [])

  // Members pick up where they left off (same conversation as the Ask Dan page).
  useEffect(() => {
    if (!open || !member || loaded.current) return
    loaded.current = true
    api.chatHistory('dan').then((r) => setMsgs(r.messages.slice(-20).map((m) => ({ role: m.role, content: m.content,
      agent: (m.meta?.agent as string) ?? null })))).catch(() => undefined)
  }, [open, member])
  useEffect(() => { if (!member) sessionStorage.setItem(VISITOR_KEY, JSON.stringify(msgs.slice(-12))) }, [msgs, member])
  useEffect(() => { bottom.current?.scrollIntoView({ block: 'end' }) }, [msgs, busy, open])

  useEffect(() => {
    if (pending && !busy) { const text = pending; setPending(''); void send(text) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, busy])

  if (member && route === 'chat') return null  // the full Ask Dan page is already open

  const send = async (text: string) => {
    const msg = text.trim()
    if (!msg || busy || limited) return
    setInput('')
    setBusy(true)
    setStep('')
    const history = msgs.slice(-8).map(({ role, content }) => ({ role, content }))
    setMsgs((m) => [...m, { role: 'user', content: msg }])
    try {
      if (member) {
        const r = await streamChat(msg, 'dan', (s) => { if (s.kind === 'route' || s.kind === 'agent_start') setStep(String(s.agent ?? s.specialist ?? '')) })
        setMsgs((m) => [...m, { role: 'assistant', content: r.answer, agent: r.agent, proposals: r.proposals }])
      } else {
        const r = await api.publicChat(msg, history)
        setMsgs((m) => [...m, { role: 'assistant', content: r.answer, agent: r.agent }])
        if (typeof r.remaining_today === 'number') setRemaining(r.remaining_today)
        if (r.limited) setLimited(true)
      }
    } catch (e) {
      setMsgs((m) => [...m, { role: 'assistant', content: `Something went wrong: ${(e as Error).message}` }])
    } finally {
      setBusy(false)
      setStep('')
    }
  }
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) }
  }

  return (
    <>
      {open && (
        <section className="dan-chat" role="dialog" aria-label="Chat with Dan">
          <header className="dan-chat-head">
            <span className="dan-chat-avatar"><Avatar size={28} /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="dan-chat-name">Dan</div>
              <div className="dan-chat-sub">{member ? 'Your SOM chief of staff' : 'Ask about SOM courses, programs or AI'}</div>
            </div>
            {member && <button className="btn icon ghost" title="Open full chat" aria-label="Open full chat" onClick={() => { setOpen(false); go('chat') }}><Maximize2 className="icon sm" /></button>}
            <button className="btn icon ghost" aria-label="Close chat" onClick={() => setOpen(false)}><X className="icon sm" /></button>
          </header>

          <div className="dan-chat-body">
            {msgs.length === 0 && (
              <div className="dan-chat-empty">
                <p>Hi, I’m Dan. {member ? 'I know your plan and goals, so ask away.' : 'I answer from real SOM course data and the Yale Bulletin, and I’ll tell you when I don’t know.'}</p>
                <div className="dan-chat-starters">
                  {STARTERS[member ? 'member' : 'visitor'].map((s) => <button key={s} className="chip" onClick={() => send(s)}>{s}</button>)}
                </div>
              </div>
            )}
            {msgs.map((m, i) => m.role === 'user'
              ? <div key={i} className="bubble user">{m.content}</div>
              : (
                <div key={i} className="dan-chat-bot">
                  <span className="dan-chat-avatar sm"><Avatar size={18} /></span>
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
            {busy && <div className="dan-chat-bot"><span className="dan-chat-avatar sm"><Avatar size={18} /></span><div className="bubble bot dan-chat-typing">{step ? `${step} is on it` : 'Dan is thinking'}<span className="dots"><i /><i /><i /></span></div></div>}
            <div ref={bottom} />
          </div>

          {!member && (limited || (remaining !== null && remaining <= 3)) && (
            <div className="dan-chat-note">
              {limited ? 'You’ve reached today’s visitor limit.' : `${remaining} visitor question${remaining === 1 ? '' : 's'} left today.`}
              {onSignup && <button className="link-btn small" onClick={onSignup}>Create a free account</button>}
            </div>
          )}
          <div className="dan-chat-input">
            <textarea rows={1} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKey} maxLength={2000}
              placeholder={limited ? 'Sign up to keep chatting' : 'Ask Dan…'} aria-label="Message Dan" disabled={limited} />
            <button className="btn primary icon" onClick={() => send(input)} disabled={busy || !input.trim() || limited} aria-label="Send"><ArrowUp className="icon sm" /></button>
          </div>
          {!member && <div className="dan-chat-fine">Visitors: nothing you type is saved to an account. Don’t share personal details.</div>}
        </section>
      )}
      <button className={`dan-launcher ${open ? 'open' : ''}`} onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label={open ? 'Close chat with Dan' : 'Chat with Dan'}>
        <span className="dan-launcher-face"><Avatar size={34} /></span>
        <span className="dan-launcher-label">{open ? 'Close' : 'Ask Dan'}</span>
      </button>
    </>
  )
}
