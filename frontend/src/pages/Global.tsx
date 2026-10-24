/* Global studies: plan the Global Studies Requirement (GSR) against the 10-day GSA budget, plus the LDR. */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, type GlobalChoice, type GsrOption, type RequirementsResponse } from '../api'
import CourseDrawer from '../components/CourseDrawer'
import { Empty, Spinner } from '../components/ui'
import { daysUntil, prettyDate, relDays } from '../lib/format'
import { useApp } from '../state'
import './pages-b.css'

const OPTION_EMOJI: Record<string, string> = {
  ie: '✈️', gnw: '🌐', snoc: '💻', gse_india: '🪷', gse_spring: '🌱', exchange: '🎒',
}
/** Options where SOM covers lodging/meals but the student books their own flights (docs/research.md §2). */
const PAY_AIRFARE = new Set(['ie', 'gse_india', 'gse_spring'])
const STATUSES: { value: GlobalChoice['status'] | ''; label: string }[] = [
  { value: '', label: 'Not tracking' },
  { value: 'considering', label: '🤔 Considering' },
  { value: 'applied', label: '📝 Applied' },
  { value: 'done', label: '✅ Done' },
]
const TARGET_TERMS = ['Spring 2027', 'Fall 2027', 'Spring 2028']

type FitKey = 'travel' | 'fullTerm' | 'tight'
const FIT_QUESTIONS: { key: FitKey; label: string }[] = [
  { key: 'travel', label: '🧳 I want to travel' },
  { key: 'fullTerm', label: '🗺️ I want a full term abroad' },
  { key: 'tight', label: '💸 My budget is tight' },
]

/** Pure client logic: which options to spotlight for the toggles, with a one-line why. Uses only facts from rules.py. */
function recommend(fit: Record<FitKey, boolean>, options: GsrOption[]): Record<string, string> {
  const out: Record<string, string> = {}
  if (fit.fullTerm) out.exchange = 'A whole term at a partner school in your second year.'
  if (fit.travel && !fit.tight) {
    out.ie = 'The deepest trip: half a term in class, then a ~10-day trip.'
    out.gse_spring = 'One week of fieldwork in March on a social-enterprise project.'
  }
  if (fit.travel) out.gnw = fit.tight ? 'The shortest trip (about a week), so fewer days to fund.' : 'About a week at a Global Network school, twice a year.'
  if (fit.tight || (!fit.travel && !fit.fullTerm)) out.snoc = 'Online with Global Network classmates: zero travel cost. A seat is not guaranteed, so keep a backup.'
  // Never spotlight something the GSA rules already rule out (e.g. IE after any day is used).
  for (const o of options) if (out[o.key] && !o.budget_check.ok) delete out[o.key]
  return out
}

export default function Global() {
  const { profile, refreshProfile, addCourse, plannedIds, toast } = useApp()
  const [data, setData] = useState<RequirementsResponse | null>(null)
  const [error, setError] = useState('')
  const [drawerKey, setDrawerKey] = useState<string | null>(null)
  const [daysDraft, setDaysDraft] = useState<string | null>(null)
  const [savingDays, setSavingDays] = useState(false)
  const [busyOption, setBusyOption] = useState<string | null>(null)
  const [fit, setFit] = useState<Record<FitKey, boolean>>({ travel: false, fullTerm: false, tight: false })
  const [showAllLdr, setShowAllLdr] = useState(false)

  const load = useCallback(() => api.requirements().then(
    (r) => { setData(r); setError('') },
    (e: Error) => setError(e.message || 'Could not load your requirements.'),
  ), [])

  useEffect(() => { void load() }, [load])

  const choices = useMemo(() => {
    const m = new Map<string, GlobalChoice>()
    for (const c of data?.progress.gsr.choices ?? []) m.set(c.option_key, c)
    return m
  }, [data])

  const recs = useMemo(() => (data ? recommend(fit, data.gsr.options) : {}), [fit, data])
  const anyFit = fit.travel || fit.fullTerm || fit.tight

  if (error && !data) {
    return (
      <>
        <PageHead />
        <div className="card">
          <Empty icon="😵‍💫" title="Couldn't load Global Studies">
            <p className="error-text" style={{ margin: 0 }}>{error}</p>
            <button className="btn primary" onClick={() => void load()}>Try again</button>
          </Empty>
        </div>
      </>
    )
  }
  if (!data) {
    return (
      <>
        <PageHead />
        <div className="card"><Spinner label="Loading your global options…" /></div>
      </>
    )
  }

  const { gsr, ldr, progress, sources } = data
  const left = Math.max(0, gsr.gsa_days - gsr.gsa_used)
  const draftNum = daysDraft === null ? gsr.gsa_used : Number(daysDraft)
  const draftValid = Number.isInteger(draftNum) && draftNum >= 0 && draftNum <= gsr.gsa_days
  const draftChanged = draftValid && draftNum !== gsr.gsa_used

  const saveDays = async () => {
    if (!profile) { toast('Your profile is still loading. Try again in a sec.', 'bad'); return }
    if (!draftValid) { toast(`Pick a whole number from 0 to ${gsr.gsa_days}.`, 'bad'); return }
    setSavingDays(true)
    try {
      await api.saveProfile({ ...profile, gsa_days_used: draftNum })
      await Promise.all([refreshProfile(), load()])
      setDaysDraft(null)
      toast('GSA days updated ✨', 'good')
    } catch (e) {
      toast((e as Error).message, 'bad')
    } finally {
      setSavingDays(false)
    }
  }

  const track = async (opt: GsrOption, patch: { status?: GlobalChoice['status'] | ''; target_term?: string }) => {
    const prev = choices.get(opt.key)
    setBusyOption(opt.key)
    try {
      if (patch.status === '') {
        await api.removeGlobal(opt.key)
        toast(`Stopped tracking ${opt.name}.`)
      } else {
        await api.saveGlobal({
          option_key: opt.key,
          target_term: patch.target_term ?? prev?.target_term ?? '',
          status: patch.status ?? prev?.status ?? 'considering',
          note: prev?.note ?? '',
        })
        if (patch.status === 'done') toast('Global Studies: done! 🌍🎉', 'good')
        else if (patch.status) toast(`${opt.name}: ${patch.status} ✓`, 'good')
      }
      await load()
    } catch (e) {
      toast((e as Error).message, 'bad')
    } finally {
      setBusyOption(null)
    }
  }

  const ldrShown = showAllLdr ? ldr.courses : ldr.courses.slice(0, 9)

  return (
    <>
      <PageHead />

      {/* ------------------------------------------------ hero: GSA budget + status */}
      <div className="card glow pad-lg pb-hero">
        <div>
          <div className="pb-kicker">Global Studies Account (GSA)</div>
          <div className="pb-big mt" aria-live="polite">
            {left} <small>of {gsr.gsa_days} funded days left</small>
          </div>
          <div className="pb-days" role="img" aria-label={`${left} of ${gsr.gsa_days} GSA days left, ${gsr.gsa_used} used`}>
            {Array.from({ length: gsr.gsa_days }, (_, i) => (
              <span key={i} className={`pb-day ${i < left ? 'left' : ''}`}>{i < left ? i + 1 : '·'}</span>
            ))}
          </div>
          <p className="small muted" style={{ marginTop: 8 }}>
            Every student starts with 10 funded days. They're never topped up, and unused days are forfeited, so spend them on purpose 🎯
          </p>

          <div className="row mt" style={{ gap: 8 }}>
            <label htmlFor="gsa-used" className="small muted">Days I've already used</label>
            <input
              id="gsa-used"
              className="pb-inline-num"
              type="number"
              min={0}
              max={gsr.gsa_days}
              step={1}
              inputMode="numeric"
              value={daysDraft ?? String(gsr.gsa_used)}
              onChange={(e) => setDaysDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && draftChanged) void saveDays() }}
              aria-invalid={!draftValid}
            />
            <button className="btn sm primary" onClick={() => void saveDays()} disabled={!draftChanged || savingDays}>
              {savingDays ? 'Saving…' : 'Save'}
            </button>
          </div>
          {!draftValid && <div className="error-text mt">Enter a whole number from 0 to {gsr.gsa_days}.</div>}
        </div>

        <div className="stack">
          <div className="pb-kicker">Your GSR status</div>
          {progress.gsr.met
            ? <div><span className="sticker">GSR complete ✅</span></div>
            : <div className="row" style={{ gap: 8 }}><span className="badge amber">Not done yet</span><span className="small muted">Complete one option before you graduate.</span></div>}
          <div className="pb-callout">
            <b>In your plan:</b>{' '}
            {progress.gsr.in_plan.length ? progress.gsr.in_plan.join(' · ') : 'no Global Studies course yet.'}
          </div>
          <div className="pb-callout">
            <b>Tracking:</b>{' '}
            {choices.size
              ? [...choices.values()].map((c) => {
                const name = gsr.options.find((o) => o.key === c.option_key)?.name ?? c.option_key
                return `${name} (${c.status}${c.target_term ? `, ${c.target_term}` : ''})`
              }).join(' · ')
              : 'nothing yet. Pick a status on any option below 👇'}
          </div>
        </div>
      </div>

      {/* ------------------------------------------------ helper + dates */}
      <div className="grid two mt-lg">
        <div className="card">
          <div className="card-title">🔮 Which one fits me?</div>
          <p className="small muted">Flip what's true for you and we'll spotlight the options that match. Simple rules, no AI.</p>
          <div className="pb-toggles">
            {FIT_QUESTIONS.map((q) => (
              <button
                key={q.key}
                type="button"
                role="switch"
                aria-checked={fit[q.key]}
                className="pb-switch"
                onClick={() => setFit((f) => ({ ...f, [q.key]: !f[q.key] }))}
              >
                <span>{q.label}</span>
                <span className="pb-knob" aria-hidden="true" />
              </button>
            ))}
          </div>
          {anyFit && (
            <div className="mt" aria-live="polite">
              {Object.keys(recs).length ? (
                <ul className="pb-list small">
                  {gsr.options.filter((o) => recs[o.key]).map((o) => (
                    <li key={o.key}><b>{OPTION_EMOJI[o.key]} {o.name}</b> <span className="muted">· {recs[o.key]}</span></li>
                  ))}
                </ul>
              ) : (
                <p className="small muted" style={{ margin: 0 }}>Nothing matches that combo with your current GSA days. Try loosening a toggle.</p>
              )}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-title">📅 Key dates</div>
          <ol className="pb-timeline">
            {gsr.weeks.map((w) => {
              const d = daysUntil(w.start)
              const past = daysUntil(w.end) < 0
              return (
                <li key={`${w.name}-${w.start}`} className={past ? 'past' : ''}>
                  <span className="pb-dot" aria-hidden="true" />
                  <div className="row between" style={{ gap: 6 }}>
                    <b>{w.name}</b>
                    <span className={`badge ${past ? 'gray' : d <= 60 ? 'amber' : 'sky'}`}>{past ? 'done' : relDays(d)}</span>
                  </div>
                  <div className="small muted">{prettyDate(w.start)} → {prettyDate(w.end)}, {w.start.slice(0, 4)}</div>
                </li>
              )
            })}
          </ol>
          <p className="small faint mt" style={{ marginBottom: 0 }}>
            No SOM classes Mar 8–19, 2027 while IE and GNW travel. Spring auction dates aren't published publicly.
          </p>
        </div>
      </div>

      {/* ------------------------------------------------ options */}
      <div className="pb-section-head mt-lg">
        <div>
          <h2>Your 6 ways to finish the GSR</h2>
          <p>Pick one. Each card checks it against your GSA days and lists the real matching courses from SOM's public catalog.</p>
        </div>
      </div>
      <div className="grid two">
        {gsr.options.map((opt) => {
          const choice = choices.get(opt.key)
          const highlighted = anyFit && Boolean(recs[opt.key])
          const dim = anyFit && !highlighted
          const bc = opt.budget_check
          const fitsTone = !bc.ok ? 'red' : /out of pocket/i.test(bc.reason) ? 'amber' : 'lime'
          return (
            <article key={opt.key} className={`card pb-opt ${highlighted ? 'glow' : ''} ${dim ? 'dim' : ''}`} aria-labelledby={`opt-${opt.key}`}>
              {highlighted && <span className="sticker pb-fit">Good fit ✨</span>}
              <div className="row top" style={{ gap: 12, flexWrap: 'nowrap' }}>
                <span className="pb-opt-emoji" aria-hidden="true">{OPTION_EMOJI[opt.key] ?? '🌍'}</span>
                <div style={{ minWidth: 0 }}>
                  <h3 id={`opt-${opt.key}`} style={{ marginBottom: 6 }}>{opt.name}</h3>
                  <div className="row" style={{ gap: 6 }}>
                    <span className="badge gray">{opt.units != null ? `${opt.units} units` : 'Units vary'}</span>
                    <span className="badge sky">{opt.gsa_days ? `~${opt.gsa_days} GSA days` : '0 GSA days'}</span>
                    {PAY_AIRFARE.has(opt.key) && <span className="badge amber">✈️ You pay airfare</span>}
                    {opt.requires_full_gsa && <span className="badge pink">Needs all 10 days</span>}
                  </div>
                </div>
              </div>
              {highlighted && <div className="pb-why">→ {recs[opt.key]}</div>}

              <div className={`badge ${fitsTone}`} style={{ whiteSpace: 'normal', alignSelf: 'flex-start', padding: '4px 10px' }}>
                {bc.ok ? (fitsTone === 'lime' ? '✓ ' : '⚠️ ') : '✕ '}{bc.reason}
              </div>

              <dl className="pb-kv">
                <dt>When</dt><dd>{opt.timing}</dd>
                <dt>Enrol</dt><dd>{opt.enrol}</dd>
                <dt>Cost</dt><dd>{opt.cost}</dd>
              </dl>

              <div className="stack tight">
                <div className="small faint" style={{ fontWeight: 700 }}>MATCHING COURSES</div>
                {opt.courses.length ? opt.courses.map((c) => {
                  const inPlan = c.section_ids.some((id) => plannedIds.has(id))
                  return (
                    <div key={c.key} className="pb-course">
                      <div className="pb-course-main">
                        <div className="course-num">{c.number}</div>
                        <div className="pb-course-title">{c.title}</div>
                        <div className="small muted">
                          {c.term_name ?? 'Term TBA'} · {c.time || 'Time TBA'}{c.seats ? ` · ${c.seats} seats` : ''}
                        </div>
                      </div>
                      <div className="row" style={{ gap: 6 }}>
                        <button className="btn sm ghost" onClick={() => setDrawerKey(c.key)} aria-label={`Details for ${c.number} ${c.title}`}>Details</button>
                        {inPlan
                          ? <span className="badge lime">✓ in plan</span>
                          : (
                            <button
                              className="btn sm primary"
                              disabled={!c.section_ids.length}
                              onClick={() => c.section_ids[0] && void addCourse(c.section_ids[0]).then(load)}
                              aria-label={`Add ${c.number} to my plan`}
                            >+ Add</button>
                          )}
                      </div>
                    </div>
                  )
                }) : (
                  <p className="small muted" style={{ margin: 0 }}>
                    {opt.key === 'exchange'
                      ? "Not a catalog course: you apply through Academic Affairs & Student Life."
                      : 'No matching course in the public Fall 2026 / Spring 2027 feed yet. Check back when the next term posts.'}
                  </p>
                )}
              </div>

              <div className="pb-track" aria-busy={busyOption === opt.key}>
                <span className="small muted" id={`track-${opt.key}`}>My status</span>
                <div className="tabs" role="radiogroup" aria-labelledby={`track-${opt.key}`}>
                  {STATUSES.map((s) => {
                    const on = (choice?.status ?? '') === s.value
                    return (
                      <button
                        key={s.value || 'none'}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        className={on ? 'on' : ''}
                        disabled={busyOption === opt.key || (on && s.value === '')}
                        onClick={() => !on && void track(opt, { status: s.value })}
                      >{s.label}</button>
                    )
                  })}
                </div>
                {choice && (
                  <select
                    aria-label={`Target term for ${opt.name}`}
                    value={choice.target_term}
                    disabled={busyOption === opt.key}
                    onChange={(e) => void track(opt, { target_term: e.target.value })}
                  >
                    <option value="">Target term…</option>
                    {[...new Set([...TARGET_TERMS, choice.target_term].filter(Boolean))].map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                )}
                {busyOption === opt.key && <Spinner />}
              </div>
            </article>
          )
        })}
      </div>

      <div className="pb-sources mt">
        <span>📚 Sources:</span>
        {sources.gsr && <a href={sources.gsr} target="_blank" rel="noreferrer">SOM Global Studies Requirement ↗</a>}
        {sources.gsr_funding && <a href={sources.gsr_funding} target="_blank" rel="noreferrer">GSA funding rules (Bulletin) ↗</a>}
        {sources.gnw && <a href={sources.gnw} target="_blank" rel="noreferrer">Global Network Weeks ↗</a>}
      </div>

      {/* ------------------------------------------------ LDR */}
      <div className="card mt-lg">
        <div className="row between top">
          <div className="card-title" style={{ marginBottom: 4 }}>🧭 Leadership Distribution Requirement (LDR)</div>
          {progress.ldr.met
            ? <span className="badge lime">✓ Covered in your plan</span>
            : <span className="badge amber">Not covered yet</span>}
        </div>
        <p className="muted">{ldr.summary}</p>
        <div className="pb-callout mb">
          <b>Heads up:</b> {ldr.how_flagged} {ldr.petition}
        </div>
        {ldr.courses.length ? (
          <>
            <div className="pb-ldr-list">
              {ldrShown.map((c) => (
                <div key={`${c.number}-${c.term_name}`} className="pb-ldr-item">
                  <div className="course-num">{c.number} <span className="faint" style={{ fontWeight: 500 }}>· {c.term_name || 'Term TBA'}</span></div>
                  <div>{c.title}</div>
                </div>
              ))}
            </div>
            {ldr.courses.length > 9 && (
              <button className="btn sm ghost mt" onClick={() => setShowAllLdr((v) => !v)} aria-expanded={showAllLdr}>
                {showAllLdr ? 'Show fewer' : `Show all ${ldr.courses.length} flagged courses`}
              </button>
            )}
          </>
        ) : (
          <p className="small muted">No LDR-flagged MBA courses in the public feed right now.</p>
        )}
        {ldr.source && (
          <div className="pb-sources mt"><span>📚 Source:</span><a href={ldr.source} target="_blank" rel="noreferrer">MBA curriculum (Bulletin) ↗</a></div>
        )}
      </div>

      {drawerKey && <CourseDrawer courseKey={drawerKey} onClose={() => { setDrawerKey(null); void load() }} />}
    </>
  )
}

function PageHead() {
  return (
    <div className="page-head">
      <div>
        <h1>Global studies 🌍</h1>
        <p>Plan your Global Studies Requirement around your 10 funded GSA days, and keep an eye on the Leadership requirement too.</p>
      </div>
    </div>
  )
}
