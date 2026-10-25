/* Shortlist and compare. Star courses anywhere (search, catalog, best fits, Dan's suggestions), then
   compare up to 6 side by side on what actually decides a pick: does it fit my week, does it count toward
   my requirements, does it match my goals, how hard is it to get into. Every cell is computed in code. */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertTriangle, ArrowDown, ArrowUp, Check, ExternalLink, MessageCircle, Plus, Search, Sparkles, Star, Trash2, X,
} from 'lucide-react'
import { api, type ShortlistCol } from '../api'
import { Empty, Spinner } from '../components/ui'
import { useApp } from '../state'
import './shortlist.css'

const COMPARE_MAX = 6

function score(c: ShortlistCol): number {
  if (c.missing || c.fit.status === 'not_open' || c.completed) return -10
  return (c.fit.status === 'fits' ? 3 : 0) + (c.goal.level === 'Strong' ? 3 : c.goal.level === 'Some' ? 1 : 0) + c.counts.length * 2
    - (/competitive|high/i.test(c.demand.level) ? 1 : 0)
}

export default function Shortlist() {
  const { addCourse, go, refreshShortlist, toast, plannedIds, shortlist } = useApp()
  const [cols, setCols] = useState<ShortlistCol[] | null>(null)
  const [max, setMax] = useState(12)
  const [notes, setNotes] = useState<Record<number, string>>({})
  // One change at a time (add, remove, reorder): repeat clicks while a request is in flight are ignored.
  const pending = useRef(false)
  const [busy, setBusy] = useState<string | null>(null)
  const once = useCallback(async (tag: string, work: () => Promise<unknown>) => {
    if (pending.current) return
    pending.current = true
    setBusy(tag)
    try { await work() } catch (e) { toast((e as Error).message || 'That didn’t save. Try again.', 'bad') } finally { pending.current = false; setBusy(null) }
  }, [toast])

  const load = useCallback(async () => {
    try {
      const r = await api.shortlist()
      setCols(r.items)
      setMax(r.max)
      setNotes(Object.fromEntries(r.items.map((i) => [i.id, i.note])))
    } catch (e) { toast((e as Error).message, 'bad'); setCols([]) }
  }, [toast])
  useEffect(() => { void load() }, [load, plannedIds])

  if (!cols) {
    // Shaped like the loaded page: the app already knows how many courses are starred.
    const n = shortlist.size
    return (
      <div aria-busy="true">
        <div className="page-head"><div><h1>Shortlist</h1><p>Star courses anywhere, then compare your top {COMPARE_MAX} side by side and add the winner.</p></div></div>
        <span className="sr-only"><Spinner label="Loading your shortlist…" /></span>
        {n === 0 ? <span className="skeleton sl-skel" style={{ height: 300 }} aria-hidden="true" /> : (
          <>
            <span className="skeleton sl-skel" style={{ height: 66 + n * 44 }} aria-hidden="true" />
            <span className="skeleton sl-skel mt" style={{ height: 760 }} aria-hidden="true" />
          </>
        )}
      </div>
    )
  }

  const shown = cols.slice(0, COMPARE_MAX)
  const best = shown.length > 1 ? shown.reduce((a, b) => (score(b) > score(a) ? b : a)) : null
  const move = (i: number, dir: -1 | 1) => once(`move-${cols[i].id}`, async () => {
    const order = cols.map((c) => c.id)
    const j = i + dir
    if (j < 0 || j >= order.length) return
    ;[order[i], order[j]] = [order[j], order[i]]
    const before = cols
    setCols(order.map((id) => cols.find((c) => c.id === id)!))
    try { await api.shortlistOrder(order) } catch (e) { setCols(before); throw e }
  })
  const remove = (c: ShortlistCol) => once(`remove-${c.id}`, async () => {
    await api.shortlistRemove(c.id)
    await Promise.all([load(), refreshShortlist()])
    toast(`Removed ${c.number} from your shortlist`)
  })
  const add = (c: ShortlistCol) => once(`add-${c.id}`, async () => { if (c.fit.section_id) await addCourse(c.fit.section_id) })
  const saveNote = async (c: ShortlistCol) => {
    if ((notes[c.id] ?? '') === c.note) return
    await api.shortlistNote(c.id, notes[c.id] ?? '')
    setCols((prev) => prev?.map((x) => (x.id === c.id ? { ...x, note: notes[c.id] ?? '' } : x)) ?? prev)
    toast('Note saved', 'good')
  }
  const askDan = () => {
    const list = shown.filter((c) => !c.missing).map((c) => `${c.number} ${c.title}`).join(', ')
    window.dispatchEvent(new CustomEvent('dan:ask', { detail: `Compare these electives for my goals and my week: ${list}. Which should I rank first, and why?` }))
  }

  return (
    <div>
      <div className="page-head sl-head">
        <div>
          <h1>Shortlist</h1>
          <p>Star courses anywhere, then compare your top {COMPARE_MAX} side by side and add the winner. {cols.length}/{max} saved.</p>
        </div>
        <div className="row">
          <button className="btn" onClick={() => go('explore')}><Search className="icon sm" />Course explorer</button>
          {shown.length >= 2 && <button className="btn primary" onClick={askDan}><MessageCircle className="icon sm" />Ask Dan to compare</button>}
        </div>
      </div>

      {cols.length === 0 && (
        <div className="card">
          <Empty icon={<Star className="icon lg faint" />} title="Nothing shortlisted yet">
            <p style={{ margin: 0, maxWidth: 460 }}>Star any course in the Course explorer or Course picks to save it here. Compare up to {COMPARE_MAX} at once: time clashes, requirements, goal match and how hard each is to get into.</p>
            <div className="row" style={{ justifyContent: 'center' }}>
              <button className="btn primary" onClick={() => go('explore')}><Search className="icon sm" />Open the course explorer</button>
              <button className="btn" onClick={() => go('find')}><Sparkles className="icon sm" />Get course picks</button>
            </div>
          </Empty>
        </div>
      )}

      {cols.length > 0 && (
        <>
          <div className="card sl-rank">
            <div className="section-label"><span>Your order of preference</span><span className="faint small">Top {COMPARE_MAX} are compared below</span></div>
            <ol>
              {cols.map((c, i) => (
                <li key={c.id} className={i >= COMPARE_MAX ? 'faint' : ''}>
                  <span className="sl-rank-n">{i + 1}</span>
                  <span className="sl-rank-name"><span className="course-num">{c.number}</span> {c.title}</span>
                  {i === COMPARE_MAX && <span className="faint small sl-rank-out">not in the comparison</span>}
                  <span className="row" style={{ gap: 2, marginLeft: 'auto' }}>
                    <button className="btn icon ghost" aria-label={`Move ${c.number} up`} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="icon sm" /></button>
                    <button className="btn icon ghost" aria-label={`Move ${c.number} down`} disabled={i === cols.length - 1} onClick={() => move(i, 1)}><ArrowDown className="icon sm" /></button>
                    <button className="btn icon ghost" aria-label={`Remove ${c.number}`} disabled={busy != null} onClick={() => remove(c)}><Trash2 className="icon sm" /></button>
                  </span>
                </li>
              ))}
            </ol>
          </div>

          <div className="sl-scroll">
            <table className="sl-table" style={{ ['--cols' as string]: shown.length }}>
              <thead>
                <tr>
                  <th scope="col" className="sl-label" />
                  {shown.map((c) => (
                    <th key={c.id} scope="col" className={best?.id === c.id ? 'best' : ''}>
                      {best?.id === c.id && <span className="sl-best" title="Highest on fit, requirements and goal match combined, computed in code">Best on paper</span>}
                      <span className="course-num">{c.number}</span>
                      <span className="sl-title" title={c.title}>{c.title}</span>
                      <span className="faint small">{c.missing ? '' : `${c.term_name}${c.session ? ` · ${c.session}` : ''}`}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <Row label="Fits your week">{shown.map((c) => (
                  <td key={c.id} className={`fit-${c.fit?.status}`}>
                    {c.missing ? '–' : c.fit.status === 'fits' ? <><Check className="icon sm" />{c.fit.text.replace('Fits your week: ', '')}</>
                      : c.fit.status === 'clash' ? <><AlertTriangle className="icon sm" />{c.fit.text}</> : <><X className="icon sm" />{c.fit.text}</>}
                  </td>
                ))}</Row>
                <Row label="Counts toward">{shown.map((c) => <td key={c.id}>{c.missing ? '–' : c.counts.length ? c.counts.join(' · ') : <span className="faint">Elective units</span>}</td>)}</Row>
                <Row label="Your goals">{shown.map((c) => (
                  <td key={c.id}>{c.missing ? '–' : <><b className={`goal-${c.goal.level.split(' ')[0].toLowerCase()}`}>{c.goal.level}</b>
                    {(c.goal.matched.length || c.goal.topics.length) ? <span className="faint small"> · {[...c.goal.matched, ...c.goal.topics].slice(0, 3).join(', ')}</span> : null}</>}</td>
                ))}</Row>
                <Row label="Getting in">{shown.map((c) => (
                  <td key={c.id}>{c.missing ? '–' : <>{c.enrollment ? c.enrollment[0].toUpperCase() + c.enrollment.slice(1) : '–'}
                    <span className="faint small"> · {c.demand.level}{c.demand.seats ? `, ${c.demand.seats} seats` : ''}{c.demand.median_winning_bid != null ? `, median win ${c.demand.median_winning_bid} pts` : ''}</span></>}</td>
                ))}</Row>
                {shown.some((c) => !c.missing && c.taught_with?.length) && (
                  <Row label="Taught with">{shown.map((c) => <td key={c.id} className="small">{!c.missing && c.taught_with?.length ? <>{c.taught_with.join(', ')}{c.partner_calendar ? <span className="faint"> · their calendar</span> : null}</> : <span className="faint">SOM only</span>}</td>)}</Row>
                )}
                <Row label="Units">{shown.map((c) => <td key={c.id} className="mono">{c.missing ? '–' : c.units}</td>)}</Row>
                <Row label="Faculty">{shown.map((c) => <td key={c.id}>{c.missing ? '–' : c.faculty.join(', ') || 'TBA'}</td>)}</Row>
                <Row label="Your note">{shown.map((c) => (
                  <td key={c.id}>
                    <textarea className="sl-note" rows={2} aria-label={`Your note on ${c.number}`} maxLength={500} placeholder="e.g. heard it’s case-heavy"
                      value={notes[c.id] ?? ''} onChange={(e) => setNotes((n) => ({ ...n, [c.id]: e.target.value }))} onBlur={() => saveNote(c)} />
                  </td>
                ))}</Row>
                <Row label="What it covers">{shown.map((c) => <td key={c.id} className="small muted"><div className="sl-desc">{c.missing ? '–' : c.description || '–'}</div></td>)}</Row>
                <Row label="">{shown.map((c) => (
                  <td key={c.id}><div className="sl-actions">
                    {c.missing ? <button className="btn sm" disabled={busy != null} onClick={() => remove(c)}>Remove</button>
                      : c.completed ? <span className="faint small">Already completed</span>
                        : c.in_plan ? <span className="pa-ok small"><Check className="icon sm" /> In your plan</span>
                          : c.fit.status === 'not_open' ? <span className="faint small">Can’t be added</span>
                            : <button className="btn sm primary" disabled={busy != null} aria-busy={busy === `add-${c.id}` || undefined} onClick={() => add(c)}><Plus className="icon sm" />Add to plan</button>}
                    {c.syllabus && <a className="small" href={c.syllabus} target="_blank" rel="noreferrer">Syllabus<ExternalLink className="icon sm" /></a>}
                  </div></td>
                ))}</Row>
              </tbody>
            </table>
          </div>
          <p className="faint small">“Best on paper” adds up what code can check: fits your week, counts toward a requirement, matches your goals, and isn’t very competitive. Workload and teaching quality aren’t in SOM’s public data, so ask classmates or Dan.</p>
        </>
      )}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <tr><th scope="row" className="sl-label">{label}</th>{children}</tr>
}
