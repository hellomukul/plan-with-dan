/* "What did this chat cost?" A button in the chat footer that adds up every answer's real token counts and
   dollars (from the server's usage log), with a per-answer breakdown and the prices behind them. */
import { useState } from 'react'
import { Coins, X } from 'lucide-react'
import type { Msg } from '../lib/danChat'
import { usd } from '../lib/format'

const k = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n))

export default function TokenMeter({ msgs, onMore }: { msgs: Msg[]; onMore?: () => void }) {
  const [open, setOpen] = useState(false)
  const answers = msgs.map((m, i) => ({ m, q: msgs[i - 1]?.role === 'user' ? msgs[i - 1].content : '' }))
    .filter(({ m }) => m.role === 'assistant' && (m.usage || m.cached))
  if (!answers.length) return null
  const sum = answers.reduce((t, { m }) => {
    const u = m.usage?.total
    return {
      input: t.input + (u?.input_tokens ?? 0), cached: t.cached + (u?.cached_tokens ?? 0),
      output: t.output + (u?.output_tokens ?? 0), web: t.web + (u?.web_searches ?? 0), cost: t.cost + (u?.cost_usd ?? 0),
    }
  }, { input: 0, cached: 0, output: 0, web: 0, cost: 0 })
  return (
    <span className="tm">
      <button type="button" className="tm-btn" onClick={() => setOpen((v) => !v)} aria-expanded={open} title="What this chat has cost">
        <Coins className="icon sm" />{usd(sum.cost)} · {k(sum.input + sum.output)} tokens
      </button>
      {open && (
        <div className="tm-panel" role="dialog" aria-label="Chat tokenomics">
          <div className="row between" style={{ flexWrap: 'nowrap' }}>
            <b>This chat’s tokenomics</b>
            <button type="button" className="btn icon ghost" aria-label="Close" onClick={() => setOpen(false)}><X className="icon sm" /></button>
          </div>
          <div className="tm-grid">
            <span>Input</span><span className="mono">{sum.input.toLocaleString()}</span>
            <span>of which cached</span><span className="mono">{sum.cached.toLocaleString()}</span>
            <span>Output</span><span className="mono">{sum.output.toLocaleString()}</span>
            {sum.web > 0 && <><span>Web searches</span><span className="mono">{sum.web}</span></>}
            <span><b>Total</b></span><span className="mono"><b>{usd(sum.cost)}</b></span>
          </div>
          <ol className="tm-list">
            {answers.map(({ m, q }, i) => (
              <li key={i}>
                <span className="tm-q">{q ? `“${q.slice(0, 48)}${q.length > 48 ? '…' : ''}”` : 'Answer'}</span>
                <span className="faint small">
                  {m.cached ? 'instant from cache · $0'
                    : `${(m.usage?.agents ?? []).map((a) => a.agent).join(' → ') || m.agent || 'Dan'} · ${k((m.usage?.total.input_tokens ?? 0) + (m.usage?.total.output_tokens ?? 0))} tokens · ${usd(m.usage?.total.cost_usd ?? 0)}`}
                </span>
              </li>
            ))}
          </ol>
          <p className="faint small" style={{ margin: 0 }}>
            gpt-6-luna prices: $0.10 per 1M input tokens, $0.01 cached, $0.50 output; web search about $0.01 each.
            {onMore && <> <button type="button" className="link-btn small" onClick={onMore}>See all your spending</button></>}
          </p>
        </div>
      )}
    </span>
  )
}
