import type { ReactNode } from 'react'
import type { TraceStep } from '../api'
import { tokens, usd } from '../lib/format'

const CODE_STEPS = new Set(['retrieve', 'validate', 'assemble'])

function describe(s: TraceStep): { cls: string; text: ReactNode } | null {
  switch (s.kind) {
    case 'agent_start':
      return { cls: 'agent', text: <><b>{s.agent}</b> is thinking…</> }
    case 'agent_done': {
      const u = s.usage
      return {
        cls: 'agent',
        text: <><b>{s.agent}</b> done{u ? ` · ${tokens(u.input_tokens)} in / ${tokens(u.output_tokens)} out · ${usd(u.cost_usd)}` : ''}</>,
      }
    }
    case 'route':
      return { cls: 'agent', text: <>Dispatcher → <b>{String(s.specialist).replace('_', ' ')}</b></> }
    case 'tool': {
      const args = s.args && Object.keys(s.args).length ? Object.values(s.args).map(String).join(', ') : ''
      return { cls: 'tool', text: <>🔧 <b>{s.tool}</b>{args ? <span className="faint"> ({args.slice(0, 60)})</span> : ''}{s.allowed === false ? ' · loop guard stopped it' : ''}</> }
    }
    case 'retrieve':
      return { cls: 'code', text: <><b>Retriever</b> (code): {String(s.eligible)} eligible → {String(s.shortlist)} shortlisted · ~{tokens(Number(s.approx_tokens_saved))} tokens saved</> }
    case 'validate': {
      const dropped = (s.dropped as unknown[]) ?? []
      return { cls: 'code', text: <><b>Validator</b> (code): kept {String(s.kept)}, dropped {dropped.length}{Number(s.quotes_removed) ? `, removed ${String(s.quotes_removed)} unverified quote(s)` : ''}</> }
    }
    case 'assemble':
      return { cls: 'code', text: <><b>Scheduler</b> (code): {String(s.fitted)} fit clash-free{(s.not_fitting as string[])?.length ? `, ${(s.not_fitting as string[]).join(', ')} clash` : ''}</> }
    case 'safety':
      return { cls: 'safety', text: <>🛡️ <b>{String(s.check).replaceAll('_', ' ')}</b></> }
    default:
      return null
  }
}

export default function AgentTrace({ steps, compact = false }: { steps: TraceStep[]; compact?: boolean }) {
  const shown = steps.filter((s) => !(compact && s.kind === 'agent_start'))
  return (
    <div className="trace">
      {shown.map((s, i) => {
        const d = describe(s)
        if (!d) return null
        return (
          <div key={i} className={`trace-step ${CODE_STEPS.has(s.kind) ? 'code' : d.cls}`}>
            <span className="dot" />
            <span>{d.text} <span className="faint mono">{(s.t_ms / 1000).toFixed(1)}s</span></span>
          </div>
        )
      })}
    </div>
  )
}
