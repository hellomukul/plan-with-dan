/* Owner dashboard: who signed up, who finished setup, who is active, what they use and what the AI costs.
   Live from the database, refreshed every minute while the page is open. Counts and anonymous rows only. */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Compass, RefreshCw, Table2, ChartColumn } from 'lucide-react'
import { ApiError, api, type OwnerStats } from '../api'
import { Bar, Empty, Spinner } from '../components/ui'
import { usd } from '../lib/format'
import './pages-b.css'
import './owner.css'

const REFRESH_MS = 60_000
const METHOD_LABELS: Record<string, string> = { email: 'Email and password', google: 'Google', microsoft: 'Microsoft' }

type Metric = 'active' | 'signups' | 'questions' | 'cost_usd'
const METRICS: { key: Metric; label: string; unit: (v: number) => string }[] = [
  { key: 'active', label: 'Active students', unit: (v) => `${v} active` },
  { key: 'signups', label: 'Sign-ups', unit: (v) => `${v} sign-up${v === 1 ? '' : 's'}` },
  { key: 'questions', label: 'Questions to Dan', unit: (v) => `${v} question${v === 1 ? '' : 's'}` },
  { key: 'cost_usd', label: 'AI spend', unit: (v) => usd(v) },
]

const dayLabel = (iso: string, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', opts)
const clockTime = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

function ago(iso: string | null): string {
  if (!iso) return 'never'
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (mins < 2) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs} h ago`
  const days = Math.round(hrs / 24)
  return days === 1 ? 'yesterday' : `${days} days ago`
}

const pct = (n: number, of: number) => (of ? Math.round((100 * n) / of) : 0)

export default function Owner() {
  const [data, setData] = useState<OwnerStats | null>(null)
  const [error, setError] = useState<{ status: number; message: string } | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    setRefreshing(true)
    try {
      setData(await api.ownerStats())
      setError(null)
    } catch (e) {
      const err = e as ApiError
      setError({ status: err.status ?? 0, message: err.message })
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const id = window.setInterval(() => { if (document.visibilityState === 'visible') void load() }, REFRESH_MS)
    const onVisible = () => { if (document.visibilityState === 'visible') void load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', onVisible) }
  }, [load])

  if (error?.status === 404 && !data) {
    return (
      <div className="empty not-found" style={{ minHeight: '60vh', justifyContent: 'center' }}>
        <Compass className="icon lg" aria-hidden="true" />
        <h1 style={{ fontSize: 22, margin: 0, color: 'var(--text)' }}>That page doesn’t exist</h1>
        <p className="muted" style={{ margin: 0 }}>The link may be old or mistyped.</p>
        <a className="btn primary" href="#/home">Go to Dan’s Desk</a>
      </div>
    )
  }

  const head = (
    <div className="page-head ow-head">
      <div>
        <h1>Owner dashboard</h1>
        <p>Live from the database: sign-ups, setup, active students, what they use and what the AI costs. Only you can see this page. No emails or names are shown.</p>
      </div>
      <div className="ow-refresh">
        <span className="small faint" aria-live="polite">{data ? `Updated ${clockTime(data.generated_at)} · every minute` : ''}</span>
        <button className="btn sm ghost" onClick={() => void load()} disabled={refreshing}>
          <RefreshCw className="icon sm" aria-hidden="true" />{refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
    </div>
  )

  if (!data) {
    return (
      <div aria-busy={!error}>
        {head}
        {error ? (
          <div className="card">
            <Empty icon={<AlertTriangle className="icon lg" style={{ color: 'var(--amber)' }} />} title="Couldn't load the dashboard">
              <p className="error-text" style={{ margin: 0 }}>{error.message}</p>
              <button className="btn primary" onClick={() => void load()}>Try again</button>
            </Empty>
          </div>
        ) : (
          <>
            <span className="sr-only"><Spinner label="Counting students…" /></span>
            <div aria-hidden="true">
              <span className="skeleton ow-skel ow-skel-tiles" />
              <span className="skeleton ow-skel ow-skel-chart mt-lg" />
              <div className="ow-grid mt-lg"><span className="skeleton ow-skel ow-skel-card" /><span className="skeleton ow-skel ow-skel-card" /></div>
            </div>
          </>
        )}
      </div>
    )
  }

  const t = data.totals
  return (
    <>
      {head}
      {error && (
        <div className="pb-callout warn mb" role="status"><AlertTriangle className="icon sm" aria-hidden="true" /><span>The last refresh failed ({error.message}). Showing the numbers from {clockTime(data.generated_at)}.</span></div>
      )}

      <div className="pb-stats ow-tiles">
        <div className="stat">
          <span className="label">Registered</span>
          <span className="value">{t.users}</span>
          <span className="pb-stat-sub">+{t.new_today} today · +{t.new_7d} this week</span>
        </div>
        <div className="stat">
          <span className="label">Finished setup</span>
          <span className="value">{t.onboarded}</span>
          <span className="pb-stat-sub">{pct(t.onboarded, t.users)}% of sign-ups</span>
        </div>
        <div className="stat">
          <span className="label">Active today</span>
          <span className="value">{t.active_today}</span>
          <span className="pb-stat-sub">{t.active_now} in the last 15 min</span>
        </div>
        <div className="stat">
          <span className="label">Active this week</span>
          <span className="value">{t.active_7d}</span>
          <span className="pb-stat-sub">{t.active_30d} in the last 30 days</span>
        </div>
      </div>

      <DailyChart daily={data.daily} />

      <div className="ow-grid mt-lg">
        <section className="card" aria-labelledby="ow-funnel-h">
          <div className="section-label" id="ow-funnel-h"><span>From sign-up to habit</span><span className="faint">all time</span></div>
          <ol className="ow-funnel">
            {data.funnel.map((f) => (
              <li key={f.key}>
                <div className="row between"><span className="small">{f.label}</span><span className="ow-num">{f.count} <span className="faint">· {pct(f.count, t.users)}%</span></span></div>
                <Bar pct={pct(f.count, t.users)} />
              </li>
            ))}
          </ol>
        </section>

        <section className="card" aria-labelledby="ow-who-h">
          <div className="section-label" id="ow-who-h"><span>Who signed up</span></div>
          <div className="ow-sub">How they signed up</div>
          <ul className="ow-list">
            {Object.entries(data.methods).map(([k, v]) => (
              <li key={k}><span>{METHOD_LABELS[k] ?? k}</span><span className="ow-num">{v}</span></li>
            ))}
          </ul>
          <div className="ow-sub mt">Program (finished setup)</div>
          {data.programs.length === 0 ? <p className="small faint" style={{ margin: 0 }}>Nobody has finished setup yet.</p> : (
            <ul className="ow-list">
              {data.programs.map((p) => <li key={p.key}><span>{p.label}</span><span className="ow-num">{p.count}</span></li>)}
            </ul>
          )}
          {data.years.length > 0 && (
            <>
              <div className="ow-sub mt">Year</div>
              <ul className="ow-list">
                {data.years.map((y) => <li key={y.key}><span>{y.label}</span><span className="ow-num">{y.count}</span></li>)}
              </ul>
            </>
          )}
        </section>
      </div>

      <div className="ow-grid mt-lg">
        <section className="card" aria-labelledby="ow-feat-h">
          <div className="section-label" id="ow-feat-h"><span>What they use</span><span className="faint">all time</span></div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th scope="col">Feature</th><th scope="col" className="pb-right">Total</th><th scope="col" className="pb-right">Students</th></tr></thead>
              <tbody>
                {data.features.map((f) => (
                  <tr key={f.key}>
                    <td>{f.label}</td>
                    <td className="pb-right ow-num">{f.count}</td>
                    <td className="pb-right ow-num">{f.users ?? <span className="faint">anonymous</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card" aria-labelledby="ow-spend-h">
          <div className="section-label" id="ow-spend-h"><span>AI spend</span><span className="faint">students + visitors</span></div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th scope="col">Period</th><th scope="col" className="pb-right">AI runs</th><th scope="col" className="pb-right">Cost</th></tr></thead>
              <tbody>
                {([['today', 'Today'], ['d7', 'Last 7 days'], ['d30', 'Last 30 days'], ['all', 'All time']] as const).map(([k, label]) => (
                  <tr key={k}>
                    <td>{label}</td>
                    <td className="pb-right ow-num">{data.spend[k].runs}</td>
                    <td className="pb-right ow-num">{usd(data.spend[k].usd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small faint" style={{ marginBottom: 0 }}>
            Each student is capped at {usd(data.spend.daily_cap_per_student_usd, 2)} a day, so a bug or a bot can’t run up the bill.
            {data.spend.all.runs > 0 && <> Average so far: {usd(data.spend.all.usd / data.spend.all.runs)} per run.</>}
          </p>
        </section>
      </div>

      <section className="card mt-lg" aria-labelledby="ow-recent-h">
        <div className="section-label" id="ow-recent-h"><span>Newest accounts</span><span className="faint">last {Math.min(25, data.recent.length)}, no names or emails</span></div>
        {data.recent.length === 0 ? (
          <Empty title="No accounts yet">When someone signs up, they show up here.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="table ow-recent">
              <thead>
                <tr>
                  <th scope="col">Student</th>
                  <th scope="col">Joined</th>
                  <th scope="col">Signed up with</th>
                  <th scope="col">Program</th>
                  <th scope="col">Setup</th>
                  <th scope="col">Last active</th>
                  <th scope="col" className="pb-right">Active days</th>
                  <th scope="col" className="pb-right">Courses</th>
                  <th scope="col" className="pb-right">Questions</th>
                </tr>
              </thead>
              <tbody>
                {data.recent.map((r) => (
                  <tr key={r.label}>
                    <td style={{ whiteSpace: 'nowrap' }}>{r.label}{r.you && <span className="badge gray" style={{ marginLeft: 6 }}>you</span>}</td>
                    <td className="ow-num muted" style={{ whiteSpace: 'nowrap' }}>{new Date(r.joined).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</td>
                    <td>{r.method === 'email' ? 'Email' : METHOD_LABELS[r.method] ?? r.method}</td>
                    <td>{r.program ? <>{r.program}{r.year && <span className="faint"> · {r.year}</span>}</> : <span className="faint">not set</span>}</td>
                    <td>{r.onboarded ? <span className="badge green">Done</span> : <span className="badge gray">Not yet</span>}</td>
                    <td className="ow-num" style={{ whiteSpace: 'nowrap' }}>{ago(r.last_active)}</td>
                    <td className="pb-right ow-num">{r.active_days}</td>
                    <td className="pb-right ow-num">{r.plan_items}</td>
                    <td className="pb-right ow-num">{r.questions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="small faint" style={{ marginBottom: 0 }}>
          “Active” means signed in and using the app that day (New York time). Days before this dashboard existed are rebuilt from sign-ins, plan changes, chats and searches.
        </p>
      </section>
    </>
  )
}

/* ------------------------------------------------------------------ 30-day chart (one metric at a time, one axis) */
function DailyChart({ daily }: { daily: OwnerStats['daily'] }) {
  const [metric, setMetric] = useState<Metric>('active')
  const [asTable, setAsTable] = useState(false)
  const [hover, setHover] = useState<number | null>(null)
  const m = METRICS.find((x) => x.key === metric)!
  const values = daily.map((d) => d[metric])
  const max = Math.max(...values, 0)
  // A tidy axis top: whole numbers for counts, cents for dollars.
  const top = useMemo(() => {
    if (metric === 'cost_usd') return max > 0 ? Math.ceil(max * 100) / 100 : 0.01
    return Math.max(2, Math.ceil(max / 2) * 2)
  }, [max, metric])
  const total = values.reduce((a, b) => a + b, 0)
  const summary = metric === 'active'
    ? `Busiest day: ${max} active`
    : `${m.unit(metric === 'cost_usd' ? Math.round(total * 1e6) / 1e6 : total)} in 30 days`
  const fmtAxis = (v: number) => (metric === 'cost_usd' ? `$${v.toFixed(top < 0.1 ? 3 : 2)}` : String(v))

  return (
    <section className="card mt-lg pad-lg" aria-labelledby="ow-chart-h">
      <div className="ow-chart-head">
        <div>
          <div className="section-label" id="ow-chart-h"><span>{m.label} per day</span><span className="faint">last 30 days</span></div>
          <div className="small muted">{summary}</div>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <div className="tabs" role="radiogroup" aria-label="What to chart">
            {METRICS.map((x) => (
              <button key={x.key} type="button" role="radio" aria-checked={metric === x.key} className={metric === x.key ? 'on' : ''} onClick={() => setMetric(x.key)}>{x.label}</button>
            ))}
          </div>
          <button type="button" className="btn sm ghost" onClick={() => setAsTable((v) => !v)} aria-pressed={asTable}>
            {asTable ? <><ChartColumn className="icon sm" aria-hidden="true" />Chart</> : <><Table2 className="icon sm" aria-hidden="true" />Table</>}
          </button>
        </div>
      </div>

      {asTable ? (
        <div className="table-wrap ow-chart-box ow-chart-table">
          <table className="table">
            <thead><tr><th scope="col">Day</th><th scope="col" className="pb-right">{m.label}</th></tr></thead>
            <tbody>
              {[...daily].reverse().map((d) => (
                <tr key={d.date}><td>{dayLabel(d.date, { weekday: 'short', month: 'short', day: 'numeric' })}</td><td className="pb-right ow-num">{metric === 'cost_usd' ? usd(d[metric]) : d[metric]}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="ow-chart-box">
          <div className="ow-plot" role="img" aria-label={`${m.label} per day for the last 30 days. ${summary}. Use the Table button for every value.`}>
            {[1, 0.5, 0].map((f) => (
              <div key={f} className="ow-grid-line" style={{ bottom: `${f * 100}%` }}><span>{fmtAxis(top * f)}</span></div>
            ))}
            <div className="ow-bars" onMouseLeave={() => setHover(null)}>
              {daily.map((d, i) => {
                const v = d[metric]
                const h = top ? (100 * v) / top : 0
                return (
                  <div key={d.date} className={`ow-col ${hover === i ? 'hover' : ''}`} onMouseEnter={() => setHover(i)}>
                    <span className="ow-bar" style={{ height: v > 0 ? `max(${h}%, 3px)` : 0 }} />
                    {hover === i && (
                      <span className={`ow-tip ${i > daily.length - 6 ? 'left' : ''}`} role="status">
                        <b>{dayLabel(d.date, { weekday: 'short', month: 'short', day: 'numeric' })}</b>
                        <span>{m.unit(v)}</span>
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
          <div className="ow-x" aria-hidden="true">
            {daily.map((d, i) => <span key={d.date}>{i % 7 === 2 || i === daily.length - 1 ? (i === daily.length - 1 ? 'Today' : dayLabel(d.date)) : ''}</span>)}
          </div>
        </div>
      )}
    </section>
  )
}
