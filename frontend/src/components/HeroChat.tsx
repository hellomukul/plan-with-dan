/* The home page hero: Dan, inline. Same conversation as the floating Dan (lib/danChat).
   Before the first question: a greeting, the "answering for" context, and program-aware starter questions
   (repeat starters are served instantly from the server's cache). While Dan works: a status line with
   elapsed seconds, never a bare spinner. At the visitor cap: a calm "resting" state with what still works. */
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { ArrowUp } from 'lucide-react'
import { DanAvatar, DanMessages } from './DanChat'
import TokenMeter from './TokenMeter'
import { sendToDan, useDanChat } from '../lib/danChat'

interface Props {
  who: string // e.g. "MBA · 1st year · Blue"
  starters: string[]
  onChangeWho: () => void
  onSignup: () => void
}

export default function HeroChat({ who, starters, onChangeWho, onSignup }: Props) {
  const chat = useDanChat()
  const [input, setInput] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const body = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!chat.busy) { setElapsed(0); return }
    const t0 = Date.now()
    const id = setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 500)
    return () => clearInterval(id)
  }, [chat.busy])
  useEffect(() => { const el = body.current; if (el) el.scrollTop = el.scrollHeight }, [chat.msgs, chat.busy])

  const send = (text: string) => { setInput(''); void sendToDan(text) }
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) }
  }
  const empty = chat.msgs.length === 0
  const status = elapsed < 4 ? 'Reading your question' : elapsed < 9 ? 'Checking SOM’s course data and the Yale Bulletin' : 'Still working: some answers take up to 15 seconds'

  return (
    <section className={`card hc ${empty ? 'is-empty' : 'is-active'}`} aria-label="Ask Dan">
      <header className="hc-head">
        <span className="dan-chat-avatar"><DanAvatar size={28} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="dan-chat-name">Dan</div>
          <div className="dan-chat-sub">Your AI chief of staff · free, no sign-up</div>
        </div>
      </header>

      <div className="hc-body" ref={body}>
        {empty && (
          <div className="hc-empty">
            <p>Hi, I’m Dan. Ask about courses, your program’s rules or deadlines. I link my sources and say when I don’t know.</p>
            <button type="button" className="hc-who" onClick={onChangeWho} title="Change who Dan is answering for">
              Answering for: <b>{who}</b> <span className="link-btn small">change</span>
            </button>
            <div className="hc-starters">
              {starters.map((s) => <button key={s} type="button" className="hc-starter" onClick={() => send(s)}>{s}</button>)}
            </div>
          </div>
        )}
        {!empty && <DanMessages msgs={chat.msgs} busy={false} step="" />}
        {chat.busy && <div className="hc-status" role="status"><span className="dots"><i /><i /><i /></span>{status} · {elapsed}s</div>}
      </div>

      {chat.limited ? (
        <div className="hc-rest">
          <b>Dan’s resting for today.</b> The week builder, dates and requirements below have no limit.
          <button type="button" className="btn primary sm" onClick={onSignup}>Get your own daily budget, free</button>
        </div>
      ) : (
        <div className="hc-input">
          <textarea rows={1} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKey} maxLength={2000}
            placeholder="Ask Dan anything…" aria-label="Ask Dan a question" />
          <button className="btn primary icon" onClick={() => send(input)} disabled={chat.busy || !input.trim()} aria-label="Send"><ArrowUp className="icon sm" /></button>
        </div>
      )}
      <div className="hc-fine">
        <span>AI answers can be wrong; check the linked source.</span>
        <TokenMeter msgs={chat.msgs} />
        {chat.remaining !== null && !chat.limited && <span>{chat.remaining} free question{chat.remaining === 1 ? '' : 's'} left today</span>}
      </div>
    </section>
  )
}
