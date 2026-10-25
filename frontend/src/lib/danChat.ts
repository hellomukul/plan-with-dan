/* One conversation with Dan, shared by every place that shows it (the home page hero chat and the
   floating Dan panel), so a question asked in one shows up in the other. */
import { useSyncExternalStore } from 'react'
import { api, streamChat, type Proposal, type Usage } from '../api'

export interface Msg { role: 'user' | 'assistant'; content: string; agent?: string | null; proposals?: Proposal[]; followups?: string[]; support?: boolean; usage?: Usage | null; cached?: boolean }

interface State {
  member: boolean
  msgs: Msg[]
  busy: boolean
  step: string
  remaining: number | null
  limited: boolean
  loaded: boolean
}

const VISITOR_KEY = 'pwd-visitor-chat'

function visitorMsgs(): Msg[] {
  try { return JSON.parse(sessionStorage.getItem(VISITOR_KEY) || '[]') } catch { return [] }
}

// Who the visitor said they are (the home page picker), so Dan's first answer fits their program.
let context = { program: '', year: '', cohort: '' }
export function setChatContext(c: { program: string; year: string; cohort: string }) { context = c }

let state: State = { member: false, msgs: visitorMsgs(), busy: false, step: '', remaining: null, limited: false, loaded: false }
const listeners = new Set<() => void>()

function set(patch: Partial<State>) {
  state = { ...state, ...patch }
  if (!state.member) sessionStorage.setItem(VISITOR_KEY, JSON.stringify(state.msgs.slice(-12)))
  listeners.forEach((l) => l())
}

export function useDanChat(): State {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l) }, () => state)
}

/** Switch between visitor and signed-in mode (called when the user signs in or out). */
export function setMember(member: boolean) {
  if (member === state.member) return
  set({ member, msgs: member ? [] : visitorMsgs(), loaded: false, remaining: null, limited: false })
}

/** Forget the visitor transcript kept in this tab (on log-out, account deletion, or a different account signing in),
    so the next person at a shared computer doesn't see it. */
export function forgetVisitorChat() {
  try { sessionStorage.removeItem(VISITOR_KEY) } catch { /* storage off */ }
  if (!state.member) set({ msgs: [], remaining: null, limited: false })
}

/** Members pick up their saved conversation the first time Dan is opened. */
export async function loadHistory() {
  if (!state.member || state.loaded) return
  set({ loaded: true })
  try {
    const r = await api.chatHistory('dan')
    set({ msgs: r.messages.slice(-20).map((m) => ({ role: m.role, content: m.content, agent: (m.meta?.agent as string) ?? null, support: Boolean(m.meta?.support) })) })
  } catch { /* the chat still works without history */ }
}

export async function sendToDan(text: string) {
  const msg = text.trim()
  if (!msg || state.busy || state.limited) return
  const history = state.msgs.slice(-8).map(({ role, content }) => ({ role, content }))
  set({ busy: true, step: '', msgs: [...state.msgs, { role: 'user', content: msg }] })
  try {
    if (state.member) {
      const r = await streamChat(msg, 'dan', (s) => {
        if (s.kind === 'route' || s.kind === 'agent_start') set({ step: String(s.agent ?? s.specialist ?? '') })
      })
      set({ msgs: [...state.msgs, { role: 'assistant', content: r.answer, agent: r.agent, proposals: r.proposals, followups: r.followups, support: Boolean(r.support), usage: r.usage }] })
    } else {
      const r = await api.publicChat(msg, history, context)
      set({
        msgs: [...state.msgs, { role: 'assistant', content: r.answer, agent: r.agent, followups: r.followups, support: Boolean(r.support), usage: r.usage ?? null, cached: Boolean(r.cached) }],
        remaining: typeof r.remaining_today === 'number' ? r.remaining_today : state.remaining,
        limited: Boolean(r.limited),
      })
    }
  } catch (e) {
    set({ msgs: [...state.msgs, { role: 'assistant', content: `Something went wrong: ${(e as Error).message}` }] })
  } finally {
    set({ busy: false, step: '' })
  }
}
