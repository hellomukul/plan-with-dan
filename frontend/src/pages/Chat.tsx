import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { api, streamChat, type ChatResult, type TraceStep } from '../api'
import AgentTrace from '../components/AgentTrace'
import { CostChip } from '../components/ui'
import HandsomeDan from '../mascots/HandsomeDan'
import { Check, MessageCircle, Newspaper, ShieldAlert } from 'lucide-react'
import { usd } from '../lib/format'
import { useApp } from '../state'

type Mode = 'dan' | 'news'

interface Turn {
  role: 'user' | 'assistant'
  content: string
  result?: ChatResult
  meta?: Record<string, unknown>
}

const PROMPTS: Record<Mode, string[]> = {
  dan: [
    'Find me a spring elective on healthcare strategy that fits my schedule',
    'Do I have any clashes, and am I on track for 16 units?',
    'Which Global Studies option suits me best?',
    'How should I split 300 bid points across my plan?',
    'I want to go into product management. Which courses build that?',
  ],
  news: [
    'What’s the biggest AI news this week?',
    'What are AI agents and why are companies excited?',
    'How is AI changing healthcare right now?',
    'Explain the latest AI regulation news in 5 bullets',
  ],
}

export default function Chat() {
  const { addCourse, plannedIds, toast } = useApp()
  const [mode, setMode] = useState<Mode>('dan')
  const [turns, setTurns] = useState<Turn[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [live, setLive] = useState<TraceStep[]>([])
  const bottom = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setTurns([])
    api.chatHistory(mode).then((r) => setTurns(r.messages.map((m) => ({ role: m.role, content: m.content, meta: m.meta })))).catch(() => undefined)
  }, [mode])

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth' }) }, [turns, live])

  // A question handed over from Dan's Desk ("Ask Dan about this") or the ⌘K menu.
  useEffect(() => {
    const handoff = sessionStorage.getItem('pwd-ask')
    if (handoff) { sessionStorage.removeItem('pwd-ask'); setInput(handoff) }
  }, [])

  const send = async (text: string) => {
    const msg = text.trim()
    if (!msg || busy) return
    setInput('')
    setBusy(true)
    setLive([])
    setTurns((t) => [...t, { role: 'user', content: msg }])
    try {
      const result = await streamChat(msg, mode, (s) => setLive((l) => [...l, s]))
      setTurns((t) => [...t, { role: 'assistant', content: result.answer, result }])
    } catch (e) {
      setTurns((t) => [...t, { role: 'assistant', content: `Something went wrong: ${(e as Error).message}` }])
    } finally {
      setBusy(false)
      setLive([])
    }
  }

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) }
  }

  const clear = async () => {
    await api.clearChat(mode)
    setTurns([])
    toast('Chat cleared')
  }

  return (
    <div style={{ maxWidth: 900 }}>
      <div className="page-head">
        <div>
          <h1>{mode === 'dan' ? 'Ask Dan' : 'AI news desk'}</h1>
          <p>{mode === 'dan'
            ? 'Courses, clashes, requirements, Global Studies, bids, careers. Dan routes your question to the right specialist, who checks real data.'
            : 'The latest AI news with sources, plus the SOM course where you can learn it.'}</p>
        </div>
        <div className="row">
          <div className="tabs">
            <button className={mode === 'dan' ? 'on' : ''} onClick={() => setMode('dan')}><MessageCircle className="icon sm" />Ask Dan</button>
            <button className={mode === 'news' ? 'on' : ''} onClick={() => setMode('news')}><Newspaper className="icon sm" />AI news</button>
          </div>
          {turns.length > 0 && <button className="btn sm ghost" onClick={clear}>Clear</button>}
        </div>
      </div>

      <div className="chat">
        {turns.length === 0 && !busy && (
          <div className="card stack" style={{ alignItems: 'center', textAlign: 'center' }}>
            <HandsomeDan size={56} furColor="#f4b183" bandanaColor="#00356b" />
            <h3 style={{ margin: 0 }}>{mode === 'dan' ? 'What are we planning?' : 'What’s happening in AI?'}</h3>
            <div className="row" style={{ justifyContent: 'center' }}>
              {PROMPTS[mode].map((p) => <button key={p} className="chip" onClick={() => send(p)}>{p}</button>)}
            </div>
          </div>
        )}

        {turns.map((t, i) => {
          if (t.role === 'user') return <div key={i} className="bubble user">{t.content}</div>
          const r = t.result
          const blocked = r?.blocked || Boolean(t.meta?.blocked)
          return (
            <div key={i} className="stack" style={{ gap: 8, alignItems: 'flex-start' }}>
              <div className={`bubble bot md ${blocked ? 'blocked' : ''}`}>
                {r?.agent && <div className="faint small row" style={{ marginBottom: 4, gap: 6 }}><span className="avatar"><HandsomeDan size={20} furColor="#f4b183" bandanaColor="#00356b" /></span>{r.agent === 'Dispatcher' ? 'Dan' : `Dan · via ${r.agent}`}</div>}
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: (p) => <a {...p} target="_blank" rel="noreferrer" /> }}>{t.content}</ReactMarkdown>
              </div>
              {r && r.proposals.length > 0 && (
                <div className="stack tight" style={{ width: '88%' }}>
                  {r.proposals.map((p) => (
                    <div key={p.course_id} className="card flat row between" style={{ padding: '10px 14px' }}>
                      <div>
                        <b>{p.number}</b> {p.title} <span className="faint small">· {p.term_name} · {p.time}</span>
                        <div className="muted small">{p.reason}</div>
                      </div>
                      {plannedIds.has(p.course_id) ? <span className="badge green"><Check className="icon sm" />Added</span>
                        : <button className="btn sm primary" onClick={() => addCourse(p.course_id, 'dan')}>+ Add</button>}
                    </div>
                  ))}
                </div>
              )}
              {r && (
                <details className="small" style={{ width: '88%' }}>
                  <summary className="faint" style={{ cursor: 'pointer' }}>
                    {blocked ? 'Blocked by the safety screen · $0' : <>How Dan answered · {usd(r.usage.total.cost_usd)}</>}
                  </summary>
                  <div className="card flat mt stack">
                    <AgentTrace steps={r.trace} compact />
                    <CostChip usage={r.usage} />
                    {r.safety.length > 0 && <div className="small row" style={{ color: 'var(--amber)', gap: 6 }}><ShieldAlert className="icon sm" />{r.safety.join(' · ')}</div>}
                  </div>
                </details>
              )}
              {!r && typeof t.meta?.cost_usd === 'number' && <span className="faint small">{usd(t.meta.cost_usd as number)}</span>}
            </div>
          )
        })}

        {busy && (
          <div className="bubble bot" style={{ minWidth: 260 }}>
            <div className="row" style={{ gap: 8, marginBottom: live.length ? 8 : 0 }}>
              <span className="spinner" /> <span className="muted">Dan’s crew is on it…</span>
            </div>
            {live.length > 0 && <AgentTrace steps={live} />}
          </div>
        )}
        <div ref={bottom} />
      </div>

      <div className="composer mt" style={{ position: 'sticky', bottom: 12 }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          placeholder={mode === 'dan' ? 'Ask about courses, your plan, bids, Global Studies…' : 'Ask about AI news…'}
          maxLength={2000}
          rows={1}
          aria-label="Message"
        />
        <button className="btn primary" onClick={() => send(input)} disabled={busy || !input.trim()}>Send ↑</button>
      </div>
      <p className="faint small" style={{ textAlign: 'center' }}>
        Dan uses real SOM data and tools, but double-check anything important on the SOM site. Each turn is capped in cost.
      </p>
    </div>
  )
}
