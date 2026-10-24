import { useEffect, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { sendChat } from '../api'

interface Message {
  role: 'user' | 'assistant'
  text: string
  tools?: string[]
  error?: boolean
}

interface Prompt {
  label: string
  ask: string
}

/**
 * The old three were all "list me some courses", which the catalog answers
 * faster than a model can. These lean on what the agent is actually better
 * at: judgement across a description, and the web when the catalog runs out.
 */
const GENERAL: Prompt[] = [
  {
    label: 'Compare two courses',
    ask: 'Compare MGT 402 Basics of Accounting and MGT 403 Probability Modeling & Statistics — what is each one actually about, and who would pick which?',
  },
  {
    label: 'No-maths electives',
    ask: 'Which electives are light on quantitative work? Judge it from the descriptions, not the titles.',
  },
  {
    label: 'Global Studies options',
    ask: 'Which courses in this catalog would satisfy the Global Studies Requirement, and how do they differ in time commitment?',
  },
  {
    label: 'Recruiting-friendly',
    ask: 'I am recruiting for consulting. Which electives build the most relevant skills, and which term should I take them in?',
  },
  {
    label: 'About a professor',
    ask: 'What is Barbara Biasi known for, and what does she teach here? Use the web for her research.',
  },
]

/** Sharpened once we know who is asking. */
function promptsFor(profile: { programme: string; year: string }): Prompt[] {
  const out: Prompt[] = []
  if (profile.programme === 'MBA' && profile.year === '1') {
    out.push(
      {
        label: 'My core, explained',
        ask: 'I am an MBA first year. Walk me through the core courses I take this year and what each one is for.',
      },
      {
        label: 'First elective?',
        ask: 'I am a first year who can add an elective from Session 2. Which ones pair well with the core and are not overwhelming?',
      },
    )
  } else if (profile.programme === 'MBA' && profile.year === '2') {
    out.push(
      {
        label: 'Build a term',
        ask: 'I am a second-year MBA. Suggest a balanced spring term of electives — mix of quantitative and qualitative, no timetable clashes.',
      },
      {
        label: 'Depth vs breadth',
        ask: 'Is it better to go deep in one subject area or spread across several in the second year? Answer using what this catalog offers.',
      },
    )
  } else if (profile.programme) {
    out.push({
      label: `${profile.programme} courses`,
      ask: `I am in the ${profile.programme} programme. Which courses are open to me and which are the strongest starting points?`,
    })
  }
  return [...out, ...GENERAL].slice(0, 5)
}

const TOOL_LABELS: Record<string, string> = {
  search_courses: 'Course search',
  web_search: 'Web search',
}

interface Props {
  profile?: { programme: string; year: string }
}

export default function ChatPanel({ profile }: Props) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, busy, open])

  async function submit(text: string) {
    const message = text.trim()
    if (!message || busy) return
    setInput('')
    setMessages((m) => [...m, { role: 'user', text: message }])
    setBusy(true)
    try {
      const res = await sendChat(message)
      setMessages((m) => [...m, { role: 'assistant', text: res.reply, tools: res.tools_used }])
    } catch {
      setMessages((m) => [
        ...m,
        { role: 'assistant', text: 'Could not reach the course agent. Is the backend running on port 8000?', error: true },
      ])
    } finally {
      setBusy(false)
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    void submit(input)
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void submit(input)
    }
  }

  if (!open) {
    return (
      <button type="button" className="chat-launcher" onClick={() => setOpen(true)} aria-label="Open course assistant">
        <span className="chat-launcher__icon" aria-hidden>💬</span>
        Ask the course assistant
      </button>
    )
  }

  return (
    <section className="chat" aria-label="Course assistant">
      <header className="chat__head">
        <div>
          <strong>Course assistant</strong>
          <span>Ask about any Yale SOM course</span>
        </div>
        <button type="button" onClick={() => setOpen(false)} aria-label="Close chat">
          ✕
        </button>
      </header>

      <div className="chat__body">
        {messages.length === 0 ? (
          <div className="chat__empty">
            <p>Hi! I search the Yale SOM course list and the web to answer your questions.</p>
            <div className="chat__suggestions">
              {promptsFor(profile ?? { programme: '', year: '' }).map((p) => (
                <button
                  key={p.label}
                  type="button"
                  title={p.ask}
                  onClick={() => void submit(p.ask)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {messages.map((m, i) => (
          <div key={i} className={`msg msg--${m.role} ${m.error ? 'msg--error' : ''}`}>
            <div className="msg__bubble">
              {m.role === 'assistant' ? (
                // remark-gfm is what turns the model's pipe tables into real
                // tables; without it they render as raw text.
                <Markdown remarkPlugins={[remarkGfm]}>{m.text}</Markdown>
              ) : (
                m.text
              )}
            </div>
            {m.tools && m.tools.length > 0 ? (
              <div className="msg__tools">
                <span>Used</span>
                {m.tools.map((t) => (
                  <code key={t} title={t}>
                    {TOOL_LABELS[t] ?? t}
                  </code>
                ))}
              </div>
            ) : null}
          </div>
        ))}

        {busy ? (
          <div className="msg msg--assistant" role="status" aria-live="polite">
            <div className="msg__bubble msg__bubble--busy">
              <span className="spinner" aria-hidden />
              Searching courses…
            </div>
          </div>
        ) : null}
        <div ref={endRef} />
      </div>

      <form className="chat__form" onSubmit={onSubmit}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Ask about a course…"
          rows={1}
          disabled={busy}
        />
        <button type="submit" disabled={busy || !input.trim()}>
          Send
        </button>
      </form>
    </section>
  )
}
