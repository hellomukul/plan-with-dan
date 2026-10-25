/* Cost & safety: a transparency page with real token/dollar logs, a scale estimator and the safety log. */
import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, Ban, Check, Coins, DoorOpen, Eraser, Fence, Gauge, Inbox, KeyRound, ListChecks, Mail, Newspaper,
  Receipt, RefreshCw, Repeat, ScanSearch, ShieldAlert, ShieldCheck, Timer, Trash2, Info,
  type LucideIcon,
} from 'lucide-react'
import { api, type SafetyEvent, type UsageResponse } from '../api'
import { Bar, Empty, Spinner } from '../components/ui'
import { tokens, usd } from '../lib/format'
import './pages-b.css'
import './usage.css'

type Health = Awaited<ReturnType<typeof api.health>>
type ByFeature = Awaited<ReturnType<typeof api.usageAll>>['by_feature']

const FEATURES: Record<string, string> = {
  chat: 'Ask Dan',
  news: 'AI news',
  recommend: 'Elihu (find courses)',
  desk: "Dan's Desk brief",
}
const featureLabel = (f: string) => FEATURES[f] ?? f

const EVENT_LABELS: Record<string, { label: string; icon: LucideIcon; tone: string }> = {
  input_blocked: { label: 'Prompt blocked before the AI saw it (text not stored)', icon: Ban, tone: 'red' },
  output_checked: { label: 'Answer cleaned up by the output check', icon: Eraser, tone: 'amber' },
  recommendation_dropped: { label: 'Recommendation dropped by the validator', icon: Trash2, tone: 'amber' },
  news_without_sources: { label: 'News answer without sources (warned)', icon: Newspaper, tone: 'amber' },
  budget_stop: { label: 'Stopped: spend cap reached', icon: Coins, tone: 'red' },
  over_run_budget: { label: 'Turn went over its per-turn budget', icon: Timer, tone: 'amber' },
  usage_limit_hit: { label: 'Loop or token limit hit', icon: Repeat, tone: 'amber' },
  provider_content_filter: { label: "Provider's content filter stepped in", icon: ShieldAlert, tone: 'amber' },
  login_failed: { label: 'Failed sign-in attempt', icon: KeyRound, tone: 'red' },
  signup_existing_email: { label: 'Sign-up with an existing email', icon: Mail, tone: 'gray' },
  agent_error: { label: 'An agent hit an error', icon: AlertTriangle, tone: 'gray' },
}

const STUDENT_PRESETS = [
  { n: 1, label: 'Just me' },
  { n: 100, label: '100' },
  { n: 700, label: '700 SOM MBAs' },
  { n: 10000, label: '10,000' },
]

const DEFENSES: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: DoorOpen, title: 'Input screen', text: "Every message is checked for prompt-injection tricks (\"ignore your instructions\", asking for keys or other students' data, fake control tags) and length before any model call. Blocked prompts cost $0, and their text is never stored." },
  { icon: Fence, title: 'Untrusted-text fencing', text: 'Web results, course descriptions and your notes are wrapped as data, so the model treats them as information, never as instructions.' },
  { icon: ScanSearch, title: 'Output check', text: 'Answers are scanned for anything that looks like a secret (redacted) and for course numbers that aren\'t in the real SOM catalog (flagged).' },
  { icon: ListChecks, title: 'Recommendation validator', text: "Plain code drops any recommended course that doesn't exist, or whose quoted \"evidence\" isn't really in the course description." },
  { icon: Gauge, title: 'Spend caps and loop limits', text: 'Per-turn and per-student daily dollar caps use real token counts from the log, and each agent has a cap on model calls and tokens so it can\'t loop forever.' },
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
    <div className="page-head us-head">
      <div>
        <h1>Cost and safety</h1>
        <p>Every AI call is metered: tokens, dollars and the guardrails that fired. Only the scale calculator is an estimate.</p>
      </div>
      <button className="btn sm ghost" onClick={() => void load()} disabled={refreshing}><RefreshCw className="icon sm" aria-hidden="true" />{refreshing ? 'Refreshing…' : 'Refresh'}</button>
    </div>
  )

  if (!data) {
    // Shaped like the loaded page (spend, recent runs, all students, safety), so nothing jumps when it arrives.
    return (
      <div aria-busy="true">
        {head}
        <span className="sr-only"><Spinner label="Reading the meters…" /></span>
        <div aria-hidden="true">
          <span className="skeleton us-skel us-skel-hero" />
          <span className="skeleton us-skel us-skel-runs mt-lg" />
          <span className="skeleton us-skel us-skel-all mt-lg" />
          <div className="grid two mt-lg"><span className="skeleton us-skel us-skel-safety" /><span className="skeleton us-skel us-skel-safety" /></div>
        </div>
      </div>
    )
  }
  if (!data.usage && !data.all && !data.events) {
    return (
      <>
        {head}
        <div className="card">
          <Empty icon={<AlertTriangle className="icon lg" style={{ color: 'var(--amber)' }} />} title="Couldn't load usage">
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
        <div className="pb-callout warn mb" role="status"><AlertTriangle className="icon sm" aria-hidden="true" /><span>Some panels couldn't load ({data.errors.join('; ')}). The rest is up to date.</span></div>
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
      <div className="card pad-lg pb-hero">
        <div>
          <div className="section-label"><span>My AI spend · last 24 hours</span></div>
          <div className="pb-big">{usd(usage.today_usd)} <small>of {usd(usage.daily_budget_usd, 2)} daily cap</small></div>
          <div className="mt"><Bar pct={pct} tone={pct >= 80 ? 'amber' : 'lime'} /></div>
          <p className="small muted" style={{ marginTop: 8, marginBottom: 0 }}>
            {pct >= 100 ? "You've hit today's cap. AI features pause until older spend rolls off."
              : `${Math.round(pct)}% used. When you hit the cap, AI features pause instead of overspending.`}
          </p>
        </div>
        <div className="stack tight">
          <div className="section-label"><span>Limits</span></div>
          <div className="row between"><span className="muted small">Model</span><span className="badge gray mono">{health?.model ?? usage.model}</span></div>
          <div className="row between"><span className="muted small">Per-turn cap</span><span className="pb-num">{usd(perTurn, 2)}</span></div>
          <div className="row between"><span className="muted small">Daily cap per student</span><span className="pb-num">{usd(health?.budgets.per_day_usd ?? usage.daily_budget_usd, 2)}</span></div>
          {health && (
            <div className="row between">
              <span className="muted small">AI provider</span>
              {health.ai_connected ? <span className="badge green"><Check className="icon sm" />Connected</span> : <span className="badge gray">Offline</span>}
            </div>
          )}
        </div>
      </div>

      <div className="section-label mt-lg"><span>My totals</span><span className="faint">across your recent runs</span></div>
      <div className="pb-stats">
        <div className="stat">
          <span className="label">Input tokens</span>
          <span className="value">{tokens(t.input_tokens)}</span>
          <span className="pb-stat-sub">{tokens(t.cached_tokens)} cached ({cachedPct}%), billed cheaper</span>
        </div>
        <div className="stat">
          <span className="label">Output tokens</span>
          <span className="value">{tokens(t.output_tokens)}</span>
          <span className="pb-stat-sub">what the model wrote</span>
        </div>
        <div className="stat">
          <span className="label">Web searches</span>
          <span className="value">{t.web_searches}</span>
          <span className="pb-stat-sub">billed per search</span>
        </div>
        <div className="stat">
          <span className="label">Total cost</span>
          <span className="value">{usd(t.cost_usd)}</span>
          <span className="pb-stat-sub">real token prices, not estimates</span>
        </div>
      </div>
    </>
  )
}

/* ------------------------------------------------------------------ recent runs */
function RecentRuns({ runs }: { runs: UsageResponse['runs'] }) {
  return (
    <section className="card mt-lg" aria-labelledby="runs-h">
      <div className="section-label" id="runs-h"><span className="pb-label-icon"><Receipt className="icon sm" aria-hidden="true" />My recent runs</span></div>
      {runs.length === 0 ? (
        <Empty icon={<Inbox className="icon lg" style={{ color: 'var(--faint)' }} />} title="No AI runs yet">Ask Dan something or ask Elihu to find courses, and each run's receipt lands here.</Empty>
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
                  <td className="pb-num muted">{when(r.at)}</td>
                  <td><div className="pb-agents">{[...new Set(r.agents)].map((a) => <span key={a} className="badge gray">{a}</span>)}</div></td>
                  <td className="pb-right pb-num">{tokens(r.input_tokens)}</td>
                  <td className="pb-right pb-num muted">{tokens(r.cached_tokens)}</td>
                  <td className="pb-right pb-num">{tokens(r.output_tokens)}</td>
                  <td className="pb-right pb-num">{r.web_searches}</td>
                  <td className="pb-right pb-num" style={{ color: 'var(--text)', fontWeight: 500 }}>{usd(r.cost_usd)}</td>
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
      <div className="section-label" id="all-h"><span>Across all students</span></div>
      <p className="small muted">Anonymous totals by feature from every logged run in this app. No names, no individual data.</p>
      {rows.length === 0 ? (
        <Empty icon={<Inbox className="icon lg" style={{ color: 'var(--faint)' }} />} title="No runs logged yet">Once anyone uses an AI feature, real averages show up here.</Empty>
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
          <h3>What would this cost at scale?</h3>
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
                <span>Runs per student per month: <span className="mono" style={{ color: 'var(--text)' }}>{runsPerMonth}</span></span>
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
              <div className="section-label"><span>Estimated cost per month</span></div>
              <div className="pb-big">{money(monthly)}</div>
              <p className="small muted" style={{ marginTop: 10, marginBottom: 0 }}>
                <span className="mono">{usd(avg)}</span> per run × <span className="mono">{runsPerMonth}</span> runs × <span className="mono">{students.toLocaleString('en-US')}</span> student{students === 1 ? '' : 's'}
                {' '}= <span className="mono" style={{ color: 'var(--text)' }}>{money(perStudent)}</span> per student per month.
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
    <div className="grid two mt-lg us-safety-row">
      <section className="card us-safety" aria-labelledby="safety-h">
        <div className="section-label" id="safety-h"><span className="pb-label-icon"><ShieldCheck className="icon sm" aria-hidden="true" />My safety log</span></div>
        <p className="small muted">The last 50 times a guardrail fired on your account. Blocked prompts are logged with the reason and length only, never the text you typed.</p>
        {events === null ? (
          <p className="small error-text">Couldn't load the safety log.</p>
        ) : events.length === 0 ? (
          <div className="us-safety-body"><Empty icon={<ShieldCheck className="icon lg" style={{ color: 'var(--green)' }} />} title="All quiet">No guardrail has needed to step in for you yet.</Empty></div>
        ) : (
          <ul className="pb-events us-safety-body" tabIndex={0} aria-label="Safety events">
            {events.map((ev, i) => {
              const meta = EVENT_LABELS[ev.kind] ?? { label: ev.kind.replace(/_/g, ' '), icon: Info, tone: 'gray' }
              const Icon = meta.icon
              const detail = summarise(ev.detail)
              return (
                <li key={`${ev.at}-${i}`} className="pb-event">
                  <span className={`pb-event-icon ${meta.tone}`} aria-hidden="true"><Icon className="icon" /></span>
                  <div style={{ minWidth: 0 }}>
                    <div className="row between" style={{ gap: 6 }}>
                      <b className="small">{meta.label}</b>
                      <span className="pb-num faint">{when(ev.at)}</span>
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
        <div className="section-label" id="def-h"><span>The 5 defenses, in plain words</span></div>
        <div className="stack">
          {DEFENSES.map((d, i) => (
            <div key={d.title} className="pb-defense">
              <span className="pb-step" aria-hidden="true">{i + 1}</span>
              <div>
                <h4><d.icon className="icon sm" aria-hidden="true" />{d.title}</h4>
                <p>{d.text}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="pb-callout mt">
          <span><b>Blocked prompts cost $0 and leave no text behind.</b> The input screen is plain code that runs before any model call, so a blocked message never spends a token. The log keeps only why it was blocked and how long it was.</span>
        </div>
      </section>
    </div>
  )
}
