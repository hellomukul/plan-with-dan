/* The home page's live week builder: pick program, year and cohort, see what SOM already schedules for you
   (where official data exists), then add electives and watch for clashes. No account, nothing stored. */
import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarRange, CalendarSync, Check, Download, Info, Lock, Plus, TriangleAlert, X } from 'lucide-react'
import { api, type ProgramInfo, type Section } from '../api'
import CourseExplorer from './CourseExplorer'
import HandsomeDan from '../mascots/HandsomeDan'
import Timetable, { sectionsClash } from './Timetable'
import { QUARTER_SHORT, TERM_NAMES, prettyDate, quartersOf, shortExam } from '../lib/format'
import { MAX_WEEK, saveTryout, type Tryout } from '../lib/tryout'
import { useApp } from '../state'
import './week-builder.css'

const COHORTS = ['Gold', 'Silver', 'Blue', 'Green', 'Red']
const TWO_YEAR = new Set(['MBA', 'MBA-JOINT', 'EMBA'])
const today = () => new Date().toISOString().slice(0, 10)
const fmt = (n: number) => String(Math.round(n * 10) / 10)  // 17.5, never 17.499999

type Plan = { kind: 'done' | 'need' | 'over' | 'info'; head: string; detail: string }

interface Props {
  t: Tryout
  setT: (f: (t: Tryout) => Tryout) => void
  programs: ProgramInfo[]
  dataAsOf?: string
  onSave: () => void
  showWho?: boolean // false when a sentence picker above already asks program / year / cohort
  wide?: boolean // grid left, list right (the My plan tab); otherwise one stacked column
}

type TermMeta = { note: string; example: boolean; untimed: number; done: number }
type Quarter = 'all' | '1' | '2'
const NO_META: TermMeta = { note: '', example: false, untimed: 0, done: 0 }

export default function WeekBuilder({ t, setT, programs, dataAsOf, onSave, showWho = true, wide = false }: Props) {
  const { sections, user, toast } = useApp()
  // What the official data says about each term: the note above the grid, and units that count but aren't on it.
  const [meta, setMeta] = useState<Record<string, TermMeta>>({})
  const lastWho = useRef('')
  const listRef = useRef<HTMLUListElement>(null)
  const [justAdded, setJustAdded] = useState('')  // the row to bring into view (inside the list's own scroll) and mark
  // Each term has two quarters (Fall-1 + Fall-2, Spring-1 + Spring-2). The grid can show one of them, or both.
  const [quarter, setQuarter] = useState<Quarter>('all')
  useEffect(() => { saveTryout(t) }, [t])

  const prog = programs.find((p) => p.code === t.program)
  const isMba = t.program === 'MBA' || t.program === 'MBA-JOINT'
  const needsCohort = isMba && (t.year === '1' || t.year === 'admit')
  const term = t.year === 'admit' ? '202603' : t.term
  const season = term === '202603' ? 'fall' : 'spring'
  useEffect(() => { setQuarter('all') }, [term])
  const { note, example, untimed, done: doneUnits } = meta[term] ?? NO_META

  // Whenever the "who are you" answers change (and on every visit, so a restored week gets its notes and Fall-1
  // credit back), fill in what SOM schedules for you in BOTH terms, keeping the electives you added. One week, two
  // terms: the grid shows one term at a time, but the calendar file, Dates tab and sign-up all use the whole week.
  const emptyWeek = !t.ids.length && !t.auto.length  // after "reset": refill even if the answers didn't change
  useEffect(() => {
    const whoKey = [t.program, t.year, t.cohort].join('|')
    if (whoKey === lastWho.current && !emptyWeek) return
    lastWho.current = whoKey
    let alive = true, finished = false
    const terms = t.year === 'admit' ? ['202603'] : ['202603', '202701']
    Promise.all(terms.map((code) => api.starterWeek({ program: t.program, year: t.year, cohort: t.cohort, term: code }))).then((rs) => {
      if (!alive) return
      finished = true
      setMeta(Object.fromEntries(rs.map((r, i) => [terms[i], { note: r.notes[0] ?? '', example: Boolean(r.example),
        untimed: r.untimed_units ?? 0, done: r.done_units ?? 0 }])))
      const auto = [...new Set(rs.flatMap((r) => r.ids))]
      // Switching program (e.g. MBA → EMBA): electives that aren't open to the new program leave the week, and we say so.
      const notOpen = (id: string) => { const x = sections.find((y) => y.id === id); return Boolean(x && !(x.audiences ?? x.programs).includes(t.program)) }
      const gone = t.ids.filter((id) => !t.auto.includes(id) && !auto.includes(id) && notOpen(id))
      if (gone.length) {
        const names = [...new Set(gone.map((id) => sections.find((y) => y.id === id)?.number).filter(Boolean))]
        toast(`Removed ${names.join(', ')}: not open to ${t.program} students.`)
      }
      setT((v) => {
        const mine = v.ids.filter((id) => !v.auto.includes(id) && !auto.includes(id) && !gone.includes(id))
        return { ...v, auto, ids: [...auto.filter((id) => !v.dropped.includes(id)), ...mine].slice(0, MAX_WEEK) }
      })
    }).catch(() => { if (alive) { finished = true; setMeta({}); lastWho.current = '' } })
    // cancelled before it answered (a newer pick, or React's double effect run in dev): let the next run fetch
    return () => { alive = false; if (!finished) lastWho.current = '' }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t.program, t.year, t.cohort, emptyWeek])

  const byId = useMemo(() => new Map(sections.map((s) => [s.id, s])), [sections])
  const open = (s: Section) => (s.audiences ?? s.programs).includes(t.program) && (!s.ends || s.ends >= today())
  const week = t.ids.map((id) => byId.get(id)).filter((x): x is Section => Boolean(x))  // both terms
  const picked = week.filter((s) => s.term === term)

  const clashIds = new Set<string>()
  const clashes: string[] = []
  picked.forEach((a, i) => picked.slice(i + 1).forEach((b) => {
    if (sectionsClash(a, b)) { clashIds.add(a.id); clashIds.add(b.id); clashes.push(`${a.number} and ${b.number}`) }
  }))
  const units = picked.reduce((n, s) => n + s.units, 0) + untimed + doneUnits
  const tba = picked.filter((s) => s.start_min == null || !s.days.length)
  // Quarters: the grid shows the one picked (full-term courses run through both); the list groups by quarter.
  const inQuarter = (s: Section, q: Quarter = quarter) => q === 'all' || quartersOf(s.session).includes(`${season}-${q}`)
  const shown = picked.filter((s) => inQuarter(s))
  const quarterOver = (q: '1' | '2') => {
    const all = sections.filter((s) => s.term === term && s.session === `${season}-${q}`)
    return all.length > 0 && all.every((s) => s.ends && s.ends < today())
  }
  const groupKeys = [`${season}-1`, `${season}-2`, season]
  const groups = [...groupKeys, ''].map((key) => {
    const items = picked.filter((s) => (key ? s.session === key : !groupKeys.includes(s.session)))
    return { key, label: key === season ? 'Full term' : QUARTER_SHORT[key] ?? 'Other', items, units: items.reduce((n, s) => n + s.units, 0) }
  }).filter((g) => g.items.length || (g.key === `${season}-1` && doneUnits && quarterOver('1')))
  // A term already under way hides its finished courses. MBA first years get those counted back (doneUnits);
  // for anyone else the count is partial, so don't check it against the minimum.
  const underway = (code: string) => sections.some((s) => s.term === code && s.ends && s.ends < today())
  const minimum = prog?.min_units && !(underway(term) && !doneUnits) && !(isMba && t.year === '2' && term === '202701') ? prog.min_units : null
  const termLabel = (code: string) => (code === '202603' && underway(code) ? 'Fall-2 2026' : TERM_NAMES[code])
  const maximum = prog?.max_units ?? null

  // The term check under the course list, from the program's published rules only (never an invented minimum).
  // Electives are mostly 2 units (half term) or 4 (full term), so a unit gap of g means about ceil(g/4) to ceil(g/2) courses.
  const plan: Plan = (() => {
    if (maximum && units > maximum) {
      return { kind: 'over', head: `Over ${maximum} units: needs approval`,
        detail: `More than ${maximum} in one term needs approval. Drop ${fmt(units - maximum)} unit${units - maximum === 1 ? '' : 's'} or ask first.` }
    }
    // admits see an example week (the current fall), not their own term: show the rule, not a verdict
    if (t.year === 'admit') return { kind: 'info', head: `${fmt(units)} units in this example`, detail: `Your first three terms need ${prog?.min_units ?? 16}+ units each.${maximum ? ` Over ${maximum} needs approval.` : ''}` }
    if (minimum && units >= minimum && clashes.length) {
      return { kind: 'over', head: `Units done, ${clashes.length === 1 ? 'one clash' : `${clashes.length} clashes`} to fix`,
        detail: `You meet the ${minimum}-unit minimum, but ${clashes[0]} meet at the same time. Pick another section to finish ${termLabel(term)}.` }
    }
    if (minimum && units >= minimum) {
      return { kind: 'done', head: `You're done for ${termLabel(term)}!`,
        detail: `You meet the ${minimum}-unit minimum.${maximum ? ` You can go up to ${maximum} without approval.` : ''}` }
    }
    if (minimum) {
      const gap = Math.round((minimum - units) * 10) / 10
      const lo = Math.ceil(gap / 4 - 1e-9), hi = Math.ceil(gap / 2 - 1e-9)
      return { kind: 'need', head: lo === hi ? `About ${lo} course${lo > 1 ? 's' : ''} to go` : `About ${lo} to ${hi} courses to go`,
        detail: `${units ? `${fmt(gap)} units short of ${minimum}.` : `The minimum is ${minimum} units.`} Most electives are 2 units (half term) or 4 (full term).` }
    }
    const head = `${fmt(units)} units planned`
    if (needsCohort && !t.cohort && prog?.min_units) return { kind: 'info', head, detail: `Pick your cohort to count your finished core and check the ${prog.min_units}-unit minimum.` }
    if (!prog?.min_units) return { kind: 'info', head, detail: `No published per-term minimum for this program.${maximum ? ` More than ${maximum} needs approval.` : ''}` }
    if (isMba && t.year === '2' && term === '202701') return { kind: 'info', head, detail: `No term minimum in your last MBA term.${prog.total_units ? ` You need ${prog.total_units} units overall.` : ''}` }
    return { kind: 'info', head, detail: `Courses already finished aren't listed, so we skip the ${prog.min_units}-unit check.` }
  })()
  const scale = maximum ? Math.max(maximum, units) : minimum ? Math.max(minimum * 1.5, units) : 0  // the meter's full width
  // what the unit count includes beyond the grid: short for the meter caption, spelled out on hover
  const counted = [doneUnits ? [`${fmt(doneUnits)} in Fall-1`, `${fmt(doneUnits)} done in Fall-1`] : null,
    untimed ? [`${fmt(untimed)} core TBA`, `${fmt(untimed)} units of core with no published times yet`] : null].filter((x): x is string[] => Boolean(x))
  const sectionsOf = (key: string) => sections.filter((s) => s.key === key && open(s))

  // The section the course card said fits is the one that gets added (one section per course).
  const add = (s: Section) => {
    if (t.ids.includes(s.id)) { toast(`${s.number} section ${s.section} is already in your week.`); return }
    const replaces = t.ids.some((id) => byId.get(id)?.key === s.key)
    if (!replaces && t.ids.length >= MAX_WEEK) {
      toast(`Your week is full (${MAX_WEEK} courses across both terms). Remove one to add ${s.number}.`, 'bad')
      return
    }
    setJustAdded(s.id)
    setT((v) => {
      const old = v.ids.filter((id) => byId.get(id)?.key === s.key)
      // swapping an assigned section for another one: remember it, so the next refill doesn't add it back
      return { ...v, ids: [...v.ids.filter((id) => !old.includes(id)), s.id],
        dropped: [...v.dropped.filter((id) => id !== s.id), ...old.filter((id) => v.auto.includes(id) && !v.dropped.includes(id))] }
    })
  }
  const swap = (oldId: string, newId: string) => setT((v) => ({ ...v, ids: v.ids.map((id) => (id === oldId ? newId : id)) }))
  // Remove, with Undo in the toast. Assigned core can come off the grid too (say, a waiver), but we say it's still assigned.
  const remove = (s: Section) => {
    const core = t.auto.includes(s.id)
    const before = { ids: t.ids, dropped: t.dropped }
    setT((v) => ({ ...v, ids: v.ids.filter((x) => x !== s.id), dropped: core && !v.dropped.includes(s.id) ? [...v.dropped, s.id] : v.dropped }))
    toast(core ? `Removed ${s.number}. It's assigned core, so SOM still has you in it.` : `Removed ${s.number}`, undefined,
      { label: 'Undo', run: () => setT((v) => ({ ...v, ...before })) })
  }
  // Calendar sync lives in the account (a private feed for Apple, Google or Outlook). Visitors get the one-step
  // "Link your calendar" sheet (components/AuthDialog), which says it creates their free account; signed in, go sync.
  const linkCalendar = () => {
    if (user) { window.location.hash = '/calendar'; return }
    window.dispatchEvent(new CustomEvent('pwd:signup', { detail: { intent: 'calendar' } }))
  }
  // First-year MBAs can plan their second year (Fall 2027, Spring 2028) as expected courses, which needs an account.
  const nextYear = isMba && t.year === '1'
  const planNextYear = () => {
    if (user) { window.location.hash = '/plan'; return }
    window.dispatchEvent(new CustomEvent('pwd:signup', { detail: 'Create a free account to plan your second year (Fall 2027 and Spring 2028).' }))
  }
  // The whole week, both terms (not just the term on screen), so the file matches the Dates tab.
  const download = async () => {
    const res = await fetch('/api/ics/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ course_ids: week.map((s) => s.id) }) }).catch(() => null)
    if (!res?.ok) { toast('Couldn’t make the calendar file. Try again in a minute.', 'bad'); return }
    const url = URL.createObjectURL(await res.blob())
    const a = Object.assign(document.createElement('a'), { href: url, download: 'my-som-week.ics' })
    a.click()
    URL.revokeObjectURL(url)
  }

  // Picking a quarter scrolls "Your courses" (inside its own box, never the page) to that quarter's first course.
  useEffect(() => {
    const ul = listRef.current
    if (!ul) return
    const first = quarter === 'all' ? null : ul.querySelector<HTMLElement>('li.wb-group:not(.dim)')
    ul.scrollTop = first ? first.getBoundingClientRect().top - ul.getBoundingClientRect().top + ul.scrollTop : 0
  }, [quarter, term])

  // A new course lands at the end of "Your courses", which scrolls on its own: scroll that list (never the page)
  // so the row shows, and mark it for a moment.
  useEffect(() => {
    if (!justAdded) return
    const ul = listRef.current, li = ul?.querySelector<HTMLElement>(`[data-id="${justAdded}"]`)
    if (ul && li) {
      const a = ul.getBoundingClientRect(), b = li.getBoundingClientRect()
      if (b.bottom > a.bottom) ul.scrollTop += b.bottom - a.bottom + 4
      else if (b.top < a.top) ul.scrollTop -= a.top - b.top + 4
    }
    const id = setTimeout(() => setJustAdded(''), 2500)
    return () => clearTimeout(id)
  }, [justAdded, picked.length, term])

  return (
    <>
    <div className={`card wb ${wide ? 'wide' : ''}`} aria-label="Build your week">
      {showWho && <div className="wb-who">
        <label className="sr-only" htmlFor="wb-program">Program</label>
        <select id="wb-program" className="lp-select" value={t.program}
          onChange={(e) => setT((v) => ({ ...v, program: e.target.value, year: TWO_YEAR.has(e.target.value) ? v.year : '', cohort: '' }))}>
          {(programs.length ? programs : [{ code: 'MBA', label: 'Full-time MBA' } as ProgramInfo])
            .filter((p) => p.code !== 'MMS-PEM').map((p) => <option key={p.code} value={p.code}>{p.label}</option>)}
        </select>
        {TWO_YEAR.has(t.program) && (
          <div className="tabs wb-tabs" role="radiogroup" aria-label="Year">
            {[['1', '1st year'], ['2', '2nd year'], ...(isMba ? [['admit', 'Admitted']] : [])].map(([v, l]) => (
              <button key={v} type="button" role="radio" aria-checked={t.year === v} className={t.year === v ? 'on' : ''}
                onClick={() => setT((x) => ({ ...x, year: v }))}>{l}</button>
            ))}
          </div>
        )}
        {needsCohort && (
          <>
            <label className="sr-only" htmlFor="wb-cohort">Cohort</label>
            <select id="wb-cohort" className="lp-select" value={t.cohort} onChange={(e) => setT((v) => ({ ...v, cohort: e.target.value }))}>
              <option value="">{t.year === 'admit' ? 'Example cohort' : 'Your cohort'}</option>
              {COHORTS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </>
        )}
      </div>}

      <div className="wb-top"><div>
      <div className="row between wb-term">
        {t.year === 'admit'
          ? <span className="small faint wb-example">Example week · Fall 2026</span>
          : (
            <div className="tabs wb-tabs" role="radiogroup" aria-label="Term">
              {(['202603', '202701'] as const).map((code) => (
                <button key={code} type="button" role="radio" aria-checked={t.term === code} className={t.term === code ? 'on' : ''} onClick={() => setT((v) => ({ ...v, term: code }))}>{termLabel(code)}</button>
              ))}
            </div>
          )}
        <div className="tabs wb-qtabs" role="radiogroup" aria-label="Quarter">
          {(['all', '1', '2'] as const).map((q) => {
            const over = q !== 'all' && quarterOver(q) && !picked.some((s) => s.session === `${season}-${q}`)
            const name = q === 'all' ? 'Both quarters' : QUARTER_SHORT[`${season}-${q}`]
            return (
              <button key={q} type="button" role="radio" aria-checked={quarter === q} className={quarter === q ? 'on' : ''} disabled={over}
                title={over ? `${name} is over${q === '1' && doneUnits ? `; its ${fmt(doneUnits)} units count toward this term` : ''}` : q === 'all' ? 'Both quarters on one grid (half-term courses in different quarters never clash)' : `Only ${name} (and full-term courses)`}
                onClick={() => setQuarter(q)}>{name}</button>
            )
          })}
        </div>
      </div>
      <p className={`small wb-note ${example ? 'example' : ''}`}>{note || '\u00a0'}</p>
      </div></div>

      <div className="wb-main"><div className="wb-left">
      <Timetable sections={shown} clashIds={clashIds} compact={!wide} />
      </div><div className="wb-right">

      <div className="section-label wb-list-head"><span>Your courses · {termLabel(term)}</span><span className="faint small" title="Courses in the term on screen, and in your whole week (both terms)">{picked.length}{week.length > picked.length ? ` · ${week.length} in all` : ''}</span></div>
      {/* Always rendered (even empty) so the first add or last remove never changes the layout. */}
      {(
        <ul className="wb-picked" ref={listRef}>
          {picked.length === 0 && <li className="wb-empty small faint">Nothing here yet. Use the Course explorer below to add a course.</li>}
          {groups.flatMap((g) => [
            <li key={`q-${g.key}`} className={`wb-group ${g.items.length && !g.items.some((s) => inQuarter(s)) ? 'dim' : ''}`}>
              <span className="wb-group-name">{g.label}</span>
              <span className="wb-group-meta">{g.items.length
                ? `${g.items.length} course${g.items.length === 1 ? '' : 's'} · ${fmt(g.units)} units`
                : `done · ${fmt(doneUnits)} units count`}</span>
            </li>,
            ...g.items.map((s) => {
            const options = sectionsOf(s.key)
            const auto = t.auto.includes(s.id)
            return (
              <li key={s.id} data-id={s.id} className={[clashIds.has(s.id) ? 'clash' : '', s.id === justAdded ? 'new' : '', inQuarter(s) ? '' : 'dim'].join(' ').trim() || undefined}>
                <div className="wb-row">
                  <span className="course-num">{s.number}</span>
                  <span className="wb-row-title" title={s.title}>{s.title}</span>
                  {auto && <span className="wb-tag">{isMba || t.program === 'EMBA' ? 'core' : 'required'}</span>}
                  <button type="button" className="btn icon ghost" aria-label={`Remove ${s.number}`} onClick={() => remove(s)}><X className="icon sm" /></button>
                </div>
                <div className="wb-row-meta faint small">
                  {[s.time || 'Time TBA', s.room.trim(), shortExam(s.exam)].filter(Boolean).join(' · ')}
                </div>
                {!auto && options.length > 1 && (
                  <select className="lp-select sm wb-row-section" value={s.id} onChange={(e) => swap(s.id, e.target.value)} aria-label={`Section of ${s.number}`}>
                    {options.map((o) => <option key={o.id} value={o.id}>Section {o.section} · {o.time || 'TBA'}{picked.some((p) => p.key !== o.key && sectionsClash(p, o)) ? ' · clashes' : ''}</option>)}
                  </select>
                )}
              </li>
            )
          })])}
        </ul>
      )}

      {/* Two fixed lines: the clash check, then courses with no published time. Each ends in "…" (full text on hover). */}
      <div className="wb-check small">
        {clashes.length
          ? <p className="lp-clash" title={clashes.join('\n')}><TriangleAlert className="icon sm" />{clashes[0]} clash{clashes.length > 1 ? ` (+${clashes.length - 1} more)` : ''}. Try another section.</p>
          : picked.length > 0 ? <p className="pa-ok"><Check className="icon sm" />No time clashes</p>
            : <p className="faint">{untimed ? 'Your core counts already. Add an elective below.' : 'Add a course from the Course explorer below.'}</p>}
        <p className="faint" title={tba.map((s) => `${s.number} ${s.title}`).join('\n') || undefined}>
          {tba.length > 0 ? `No published time yet (${tba.length}): ${tba.map((s) => s.number).join(', ')}` : '\u00a0'}
        </p>
      </div>
      {/* Fixed size in every state (one-line head, two-line detail, meter), so the page never moves as courses change. */}
      <div className={`wb-plan ${plan.kind}`}>
        <span className="wb-plan-face" aria-hidden="true">
          {plan.kind === 'done' ? <span className="wiggle"><HandsomeDan size={44} furColor="#f4b183" bandanaColor="#00356b" /></span>
            : plan.kind === 'need' ? <Plus className="icon" /> : plan.kind === 'over' ? <TriangleAlert className="icon" /> : <Info className="icon" />}
        </span>
        <div className="wb-plan-text" aria-live="polite">
          <p className="wb-plan-head" title={plan.head}>{plan.head}</p>
          <p className="wb-plan-detail">{plan.detail}</p>
        </div>
        <div className="wb-meter">
          <div className="wb-meter-bar" style={{ visibility: scale ? 'visible' : 'hidden' }}>
            <span className="wb-meter-fill" style={{ width: `${scale ? Math.min(100, (units / scale) * 100) : 0}%` }} />
            {minimum && scale ? <span className="wb-meter-tick" style={{ left: `${(minimum / scale) * 100}%` }} title={`Minimum ${minimum}`} /> : null}
          </div>
          <div className="wb-meter-cap">
            <span title={`${fmt(units)} units${counted.length ? `, incl. ${counted.map((c) => c[1]).join(' and ')}` : ''}`}>{[`${fmt(units)} units`, ...counted.map((c) => c[0])].join(', ')}</span>
            <span>{[minimum ? `min ${minimum}` : '', maximum ? `max ${maximum}` : ''].filter(Boolean).join(' · ')}</span>
          </div>
        </div>
      </div>
      <div className="wb-actions">
        <button type="button" className="btn primary sm" onClick={onSave} disabled={!week.length}>Save to a free plan</button>
        <button type="button" className="btn ghost sm" onClick={download} disabled={!week.length} title="Both terms: your core and the courses you added"><Download className="icon sm" />Calendar file</button>
        <div className="wb-row2">
          <span className="wb-link">
            <button type="button" className="btn ghost sm" onClick={linkCalendar} aria-describedby="wb-link-hint">
              <CalendarSync className="icon sm" />Link your calendar<Lock className="icon sm wb-link-lock" />
            </button>
            <span role="tooltip" id="wb-link-hint" className="wb-hint">Creates your free Dan account (Google, Microsoft or email), then one click keeps your classes in sync with Apple, Google or Outlook.</span>
          </span>
          {/* first-year MBAs: the second year, on the same row as Link your calendar (no extra height) */}
          {nextYear && (
            <span className="wb-link wb-next">
              <button type="button" className="btn ghost sm" onClick={planNextYear} aria-label="Plan your second year (2027–28)" aria-describedby="wb-next-hint">
                <CalendarRange className="icon sm" /><span className="wb-next-long">Plan year 2 (2027–28)</span><span className="wb-next-short">Plan 2027–28</span><Lock className="icon sm wb-link-lock" />
              </button>
              <span role="tooltip" id="wb-next-hint" className="wb-hint">Fall 2027 and Spring 2028 aren’t published yet. A free account lets you plan them with expected courses, based on this year’s (times TBA).</span>
            </span>
          )}
        </div>
      </div>
      <p className="faint wb-fine">Course data from SOM’s public directory{dataAsOf ? `, as of ${prettyDate(dataAsOf)}` : ''}. Nothing is stored until you sign up.</p>
      </div></div>
    </div>
    <CourseExplorer who={{ program: t.program, year: t.year, cohort: t.cohort }} week={week} autoIds={t.auto}
      onAdd={(sec) => {
        if (sec.term !== term && t.year !== 'admit') setT((v) => ({ ...v, term: sec.term }))  // show the term it was added to
        else if (!inQuarter(sec)) setQuarter('all')  // and the quarter: never add a course the grid then hides
        add(sec)
      }} />
    </>
  )
}
