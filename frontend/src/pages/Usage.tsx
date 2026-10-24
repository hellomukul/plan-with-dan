/* Cost & safety: a transparency page with real token/dollar logs, a scale estimator and the safety log. */
import { useEffect, useMemo, useState } from 'react'
import { api, type SafetyEvent, type UsageResponse } from '../api'
import { Bar, Empty, Spinner } from '../components/ui'
import { tokens, usd } from '../lib/format'
import './pages-b.css'

type Health = Awaited<ReturnType<typeof api.health>>
type ByFeature = Awaited<ReturnType<typeof api.usageAll>>['by_feature']

const FEATURES: Record<string, { label: string; emoji: string }> = {
  chat: { label: 'Ask Dan', emoji: '🐶' },
  news: { label: 'News scout', emoji: '📰' },
  recommend: { label: 'Find my courses', emoji: '✨' },
}
const featureLabel = (f: string) => FEATURES[f] ? `${FEATURES[f].emoji} ${FEATURES[f].label}` : f

const EVENT_LABELS: Record<string, { label: string; icon: string; tone: string }> = {
  input_blocked: { label: 'Prompt blocked before the AI saw it', icon: '🛑', tone: 'red' },
  output_checked: { label: 'Answer cleaned up by the output check', icon: '🧽', tone: 'amber' },
  recommendation_dropped: { label: 'Recommendation dropped by the validator', icon: '🗑️', tone: 'amber' },
  budget_stop: { label: 'Stopped: spend cap reached', icon: '💸', tone: 'red' },
  over_run_budget: { label: 'Turn went over its per-turn budget', icon: '⏱️', tone: 'amber' },
  usage_limit_hit: { label: 'Loop / token limit hit', icon: '🔁', tone: 'amber' },
  provider_content_filter: { label: "Provider's content filter stepped in", icon: '🧯', tone: 'amber' },
  login_failed: { label: 'Failed sign-in attempt', icon: '🔐', tone: 'red' },
  signup_existing_email: { label: 'Sign-up with an existing email', icon: '📧', tone: 'gray' },
  agent_error: { label: 'An agent hit an error', icon: '⚠️', tone: 'gray' },
}

const STUDENT_PRESETS = [
  { n: 1, label: 'Just me' },
  { n: 100, label: '100' },
  { n: 700, label: '700 SOM MBAs' },
  { n: 10000, label: '10,000' },
]

const DEFENSES = [
  { icon: '🚪', title: 'Input screen', text: "Every message is checked for prompt-injection tricks (\"ignore your instructions\", asking for keys or other students' data, fake control tags) and length before any model call. Blocked prompts cost $0." },
  { icon: '🧱', title: 'Untrusted-text fencing', text: 'Web results, course descriptions and your notes are wrapped as data, so the model treats them as information, never as instructions.' },
  { icon: '🔍', title: 'Output check', text: 'Answers are scanned for anything that looks like a secret (redacted) and for course numbers that aren\'t in the real SOM catalog (flagged).' },
  { icon: '✅', title: 'Recommendation validator', text: "Plain code drops any recommended course that doesn't exist, or whose quoted \"evidence\" isn't really in the course description." },
  { icon: '🧮', title: 'Spend caps + loop limits', text: 'Per-turn and per-student daily dollar caps use real token counts from the log, and each agent has a cap on model calls and tokens so it can\'t loop forever.' },
]

/** Server timestamps are UTC; older rows may lack an offset. */
function parseTs(iso: string): Date {
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`)
}
function when(iso: string): string {
  const d = parseTs(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}
function summarise(detail: Record<string, unknown>): string {
  return Object.entries(detail)
    .filter(([, v]) => v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0))
    .map(([k, v]) => {
      const val = Array.isArray(v) ? v.map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join(', ')
        : typeof v === 'object' ? JSON.stringify(v) : String(v)
      return `${k.replace(/_/g, ' ')}: ${val.length > 160 ? `${val.slice(0, 160)}…` : val}`
    })
    .join(' · ')
}
const money = (v: number) => (v >= 1000 ? `$${Math.round(v).toLocaleString('en-US')}` : v >= 1 ? `$${v.toFixed(2)}` : usd(v))

interface Loaded {
  usage: UsageResponse | null
  all: ByFeature | null
  events: SafetyEvent[] | null
  health: Health | null
  errors: string[]
}

async function fetchAll(): Promise<Loaded> {
  const [u, a, e, h] = await Promise.allSettled([api.usage(), api.usageAll(), api.safetyEvents(), api.health()])
  const errors = [u, a, e, h]
    .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    .map((r) => (r.reason as Error)?.message ?? 'Request failed')
  return {
    usage: u.status === 'fulfilled' ? u.value : null,
    all: a.status === 'fulfilled' ? a.value.by_feature : null,
    events: e.status === 'fulfilled' ? e.value.events : null,
    health: h.status === 'fulfilled' ? h.value : null,
    errors,
  }
}

export default function Usage() {
  const [data, setData] = useState<Loaded | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    let alive = true
    void fetchAll().then((d) => { if (alive) setData(d) })
    return () => { alive = false }
  }, [])

  const load = async () => {
    setRefreshing(true)
    setData(await fetchAll())
    setRefreshing(false)
  }

  const head = (
    <div className="page-head">
      <div>
        <h1>Cost & safety 🧾</h1>
        <p>Every AI call is metered: tokens, dollars and the guardrails that fired. Nothing here is estimated except the scale calculator.</p>
      </div>
      <button className="btn sm ghost" onClick={() => void load()} disabled={refreshing}>{refreshing ? 'Refreshing…' : '↻ Refresh'}</button>
    </div>
  )

  if (!data) return <>{head}<div className="card"><Spinner label="Reading the meters…" /></div></>
  if (!data.usage && !data.all && !data.events) {
    return (
      <>
        {head}
        <div className="card">
          <Empty icon="😵‍💫" title="Couldn't load usage">
            <p className="error-text" style={{ margin: 0 }}>{data.errors[0]}</p>
            <button className="btn primary" onClick={() => void load()}>Try again</button>
          </Empty>
        </div>
      </>
    )
  }

  return (
    <>
      {head}
      {data.errors.length > 0 && (
        <div className="pb-callout mb" role="status">⚠️ Some panels couldn't load ({data.errors.join('; ')}). The rest is up to date.</div>
      )}
      {data.usage && <MySpend usage={data.usage} health={data.health} />}
      {data.usage && <RecentRuns runs={data.usage.runs} />}
      {data.all && <AcrossStudents rows={data.all} />}
      <SafetyLog events={data.events} />
    </>
  )
}

/* ------------------------------------------------------------------ my spend */
function MySpend({ usage, health }: { usage: UsageResponse; health: Health | null }) {
  const pct = usage.daily_budget_usd ? (100 * usage.today_usd) / usage.daily_budget_usd : 0
  const t = usage.totals
  const cachedPct = t.input_tokens ? Math.round((100 * t.cached_tokens) / t.input_tokens) : 0
  const perTurn = health?.budgets.per_turn_usd ?? usage.run_budget_usd
  return (
    <>
      <div className="card glow pad-lg pb-hero">
        <div>
          <div className="pb-kicker">My AI spend · last 24 hours</div>
          <div className="pb-big mt">{usd(usage.today_usd)} <small>of {usd(usage.daily_budget_usd, 2)} daily cap</small></div>
          <div className="mt"><Bar pct={pct} tone={pct >= 80 ? 'amber' : 'lime'} /></div>
          <p className="small muted" style={{ marginTop: 8, marginBottom: 0 }}>
            {pct >= 100 ? "You've hit today's cap. AI features pause until older spend rolls off 💤"
              : `${Math.round(pct)}% used. When you hit the cap, AI features pause instead of overspending.`}
          </p>
        </div>
        <div className="stack tight">
          <div className="row between"><span className="muted small">Model</span><span className="badge pink mono">{health?.model ?? usage.model}</span></div>
          <div className="row between"><span className="muted small">Per-turn cap</span><b>{usd(perTurn, 2)}</b></div>
          <div className="row between"><span className="muted small">Daily cap per student</span><b>{usd(health?.budgets.per_day_usd ?? usage.daily_budget_usd, 2)}</b></div>
          {health && (
            <div className="row between">
              <span className="muted small">AI provider</span>
              {health.ai_connected ? <span className="badge lime">● connected</span> : <span className="badge gray">offline</span>}
            </div>
          )}
        </div>
      </div>

      <div className="grid four mt">
        <div className="card stat">
          <span className="label">Input tokens</span>
          <span className="value">{tokens(t.input_tokens)}</span>
          <span className="pb-stat-sub">{tokens(t.cached_tokens)} cached ({cachedPct}%), billed cheaper</span>
        </div>
        <div className="card stat">
          <span className="label">Output tokens</span>
          <span className="value">{tokens(t.output_tokens)}</span>
          <span className="pb-stat-sub">what the model wrote</span>
        </div>
        <div className="card stat">
          <span className="label">Web searches</span>
          <span className="value">{t.web_searches}</span>
          <span className="pb-stat-sub">billed per search</span>
        </div>
        <div className="card stat">
          <span className="label">Total cost</span>
          <span className="value" style={{ color: 'var(--lime)' }}>{usd(t.cost_usd)}</span>
          <span className="pb-stat-sub">across your recent runs</span>
        </div>
      </div>
    </>
  )
}

/* ------------------------------------------------------------------ recent runs */
function RecentRuns({ runs }: { runs: UsageResponse['runs'] }) {
  return (
    <section className="card mt-lg" aria-labelledby="runs-h">
      <div className="card-title" id="runs-h">🧾 My recent runs</div>
      {runs.length === 0 ? (
        <Empty icon="🫥" title="No AI runs yet">Ask Dan something or hit “Find my courses”, and each run's receipt lands here.</Empty>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Feature</th>
                <th scope="col">When</th>
                <th scope="col">Agents</th>
                <th scope="col" className="pb-right">In</th>
                <th scope="col" className="pb-right">Cached</th>
                <th scope="col" className="pb-right">Out</th>
                <th scope="col" className="pb-right">Web</th>
                <th scope="col" className="pb-right">Cost</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.run_id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{featureLabel(r.feature)}</td>
                  <td className="small muted" style={{ whiteSpace: 'nowrap' }}>{when(r.at)}</td>
                  <td><div className="pb-agents">{[...new Set(r.agents)].map((a) => <span key={a} className="badge lilac">{a}</span>)}</div></td>
                  <td className="pb-right pb-num">{tokens(r.input_tokens)}</td>
                  <td className="pb-right pb-num muted">{tokens(r.cached_tokens)}</td>
                  <td className="pb-right pb-num">{tokens(r.output_tokens)}</td>
                  <td className="pb-right pb-num">{r.web_searches}</td>
                  <td className="pb-right pb-num"><b>{usd(r.cost_usd)}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

/* ------------------------------------------------------------------ across all students + estimator */
function AcrossStudents({ rows }: { rows: ByFeature }) {
  const [feature, setFeature] = useState<string>('all')
  const [runsPerMonth, setRunsPerMonth] = useState(20)
  const [students, setStudents] = useState(700)

  const totals = useMemo(() => {
    const runs = rows.reduce((n, r) => n + r.runs, 0)
    const cost = rows.reduce((n, r) => n + r.cost_usd, 0)
    return { runs, cost, avg: runs ? cost / runs : 0 }
  }, [rows])

  const avg = feature === 'all' ? totals.avg : rows.find((r) => r.feature === feature)?.avg_cost_per_run ?? 0
  const perStudent = avg * runsPerMonth
  const monthly = perStudent * students

  return (
    <section className="card mt-lg pad-lg" aria-labelledby="all-h">
      <div className="card-title" id="all-h">🌐 Across all students</div>
      <p className="small muted">Anonymous totals by feature from every logged run in this app. No names, no individual data.</p>
      {rows.length === 0 ? (
        <Empty icon="📭" title="No runs logged yet">Once anyone uses an AI feature, real averages show up here.</Empty>
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Feature</th>
                  <th scope="col" className="pb-right">Runs</th>
                  <th scope="col" className="pb-right">Avg cost / run</th>
                  <th scope="col" className="pb-right">Input (cached)</th>
                  <th scope="col" className="pb-right">Output</th>
                  <th scope="col" className="pb-right">Web</th>
                  <th scope="col" className="pb-right">Total cost</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.feature}>
                    <td style={{ whiteSpace: 'nowrap' }}>{featureLabel(r.feature)}</td>
                    <td className="pb-right pb-num">{r.runs.toLocaleString('en-US')}</td>
                    <td className="pb-right pb-num"><b>{usd(r.avg_cost_per_run)}</b></td>
                    <td className="pb-right pb-num">
                      {tokens(r.input_tokens)} <span className="faint">({r.input_tokens ? Math.round((100 * r.cached_tokens) / r.input_tokens) : 0}%)</span>
                    </td>
                    <td className="pb-right pb-num">{tokens(r.output_tokens)}</td>
                    <td className="pb-right pb-num">{r.web_searches}</td>
                    <td className="pb-right pb-num">{usd(r.cost_usd)}</td>
                  </tr>
                ))}
                <tr>
                  <td><b>All features</b></td>
                  <td className="pb-right pb-num"><b>{totals.runs.toLocaleString('en-US')}</b></td>
                  <td className="pb-right pb-num"><b>{usd(totals.avg)}</b></td>
                  <td colSpan={3} />
                  <td className="pb-right pb-num"><b>{usd(totals.cost)}</b></td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="divider" />
          <h3>📈 What would this cost at scale?</h3>
          <div className="pb-est mt">
            <div className="stack">
              <div>
                <div className="small muted mb" style={{ marginBottom: 6 }} id="est-feature">Cost per run based on</div>
                <div className="tabs" role="radiogroup" aria-labelledby="est-feature">
                  {['all', ...rows.map((r) => r.feature)].map((f) => (
                    <button key={f} type="button" role="radio" aria-checked={feature === f} className={feature === f ? 'on' : ''} onClick={() => setFeature(f)}>
                      {f === 'all' ? 'Blended' : featureLabel(f)}
                    </button>
                  ))}
                </div>
              </div>
              <label className="field">
                <span>Runs per student per month: <b style={{ color: 'var(--text)' }}>{runsPerMonth}</b></span>
                <input type="range" min={1} max={100} step={1} value={runsPerMonth} onChange={(e) => setRunsPerMonth(Number(e.target.value))} />
              </label>
              <div>
                <div className="small muted" style={{ marginBottom: 6 }} id="est-students">Students</div>
                <div className="row" style={{ gap: 6 }} role="radiogroup" aria-labelledby="est-students">
                  {STUDENT_PRESETS.map((p) => (
                    <button key={p.n} type="button" role="radio" aria-checked={students === p.n} className={`chip ${students === p.n ? 'on' : ''}`} onClick={() => setStudents(p.n)}>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="pb-est-out" aria-live="polite">
              <div className="pb-kicker">Estimated cost per month</div>
              <div className="pb-big mt">{money(monthly)}</div>
              <p className="small muted" style={{ marginTop: 10, marginBottom: 0 }}>
                {usd(avg)} per run × {runsPerMonth} runs × {students.toLocaleString('en-US')} student{students === 1 ? '' : 's'}
                {' '}= <b style={{ color: 'var(--text)' }}>{money(perStudent)}</b> per student per month.
              </p>
              <p className="small faint" style={{ marginTop: 8, marginBottom: 0 }}>
                The per-run cost comes from real logged runs ({totals.runs.toLocaleString('en-US')} so far), not a price sheet.
                The daily per-student cap still applies on top.
              </p>
            </div>
          </div>
        </>
      )}
    </section>
  )
}

/* ------------------------------------------------------------------ safety */
function SafetyLog({ events }: { events: SafetyEvent[] | null }) {
  return (
    <div className="grid two mt-lg" style={{ alignItems: 'start' }}>
      <section className="card" aria-labelledby="safety-h">
        <div className="card-title" id="safety-h">🛡️ My safety log</div>
        <p className="small muted">The last 50 times a guardrail fired on your account.</p>
        {events === null ? (
          <p className="small error-text">Couldn't load the safety log.</p>
        ) : events.length === 0 ? (
          <Empty icon="😇" title="All quiet">No guardrail has needed to step in for you yet.</Empty>
        ) : (
          <ul className="pb-events">
            {events.map((ev, i) => {
              const meta = EVENT_LABELS[ev.kind] ?? { label: ev.kind.replace(/_/g, ' '), icon: '•', tone: 'gray' }
              const detail = summarise(ev.detail)
              return (
                <li key={`${ev.at}-${i}`} className="pb-event">
                  <span className="pb-event-icon" aria-hidden="true">{meta.icon}</span>
                  <div style={{ minWidth: 0 }}>
                    <div className="row between" style={{ gap: 6 }}>
                      <b className="small">{meta.label}</b>
                      <span className="small faint">{when(ev.at)}</span>
                    </div>
                    <span className={`badge ${meta.tone} mono`} style={{ marginTop: 4 }}>{ev.kind}</span>
                    {detail && <div className="pb-event-detail">{detail}</div>}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="card" aria-labelledby="def-h">
        <div className="card-title" id="def-h">🔒 The 5 defenses, in plain words</div>
        <div className="stack">
          {DEFENSES.map((d, i) => (
            <div key={d.title} className="pb-defense">
              <span className="pb-step" aria-hidden="true">{i + 1}</span>
              <div>
                <h4>{d.icon} {d.title}</h4>
                <p>{d.text}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="pb-callout mt">
          <b>Blocked prompts cost $0.</b> The input screen is plain code that runs before any model call, so a blocked message never spends a single token.
        </div>
      </section>
    </div>
  )
}
