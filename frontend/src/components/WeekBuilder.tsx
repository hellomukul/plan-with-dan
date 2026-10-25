/* The home page's live week builder: pick program, year and cohort, see what SOM already schedules for you
   (where official data exists), then add electives and watch for clashes. No account, nothing stored. */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Download, Plus, Search, TriangleAlert, X } from 'lucide-react'
import { api, type ProgramInfo, type Section } from '../api'
import Timetable, { sectionsClash } from './Timetable'
import { TERM_NAMES, prettyDate, shortExam } from '../lib/format'
import { saveTryout, type Tryout } from '../lib/tryout'
import { useApp } from '../state'

const COHORTS = ['Gold', 'Silver', 'Blue', 'Green', 'Red']
const TWO_YEAR = new Set(['MBA', 'MBA-JOINT', 'EMBA'])
const today = () => new Date().toISOString().slice(0, 10)

interface Props {
  t: Tryout
  setT: (f: (t: Tryout) => Tryout) => void
  programs: ProgramInfo[]
  dataAsOf?: string
  onSave: () => void
  showWho?: boolean // false when a sentence picker above already asks program / year / cohort
  wide?: boolean // grid left, list right (the My plan tab); otherwise one stacked column
}

export default function WeekBuilder({ t, setT, programs, dataAsOf, onSave, showWho = true, wide = false }: Props) {
  const { sections } = useApp()
  const [q, setQ] = useState('')
  const [note, setNote] = useState('')
  const [example, setExample] = useState(false)
  const [untimed, setUntimed] = useState(0)  // assigned core with no published times (MBA spring)
  const [doneUnits, setDoneUnits] = useState(0)  // core already finished this term (MBA Fall-1), still counts
  const first = useRef(true)
  useEffect(() => { saveTryout(t) }, [t])

  const prog = programs.find((p) => p.code === t.program)
  const isMba = t.program === 'MBA' || t.program === 'MBA-JOINT'
  const needsCohort = isMba && (t.year === '1' || t.year === 'admit')
  const term = t.year === 'admit' ? '202603' : t.term

  // Whenever the "who are you" answers change, refill what SOM schedules for you, keeping the electives you added.
  useEffect(() => {
    if (first.current && t.ids.length) { first.current = false; return }  // keep a week restored from this browser
    first.current = false
    let alive = true
    api.starterWeek({ program: t.program, year: t.year, cohort: t.cohort, term }).then((r) => {
      if (!alive) return
      setNote(r.notes[0] ?? '')
      setExample(Boolean(r.example))
      setUntimed(r.untimed_units ?? 0)
      setDoneUnits(r.done_units ?? 0)
      setT((v) => {
        const mine = v.ids.filter((id) => !v.auto.includes(id))
        return { ...v, auto: r.ids, ids: [...r.ids, ...mine.filter((id) => !r.ids.includes(id))].slice(0, 20) }
      })
    }).catch(() => setNote(''))
    return () => { alive = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t.program, t.year, t.cohort, term])

  const byId = useMemo(() => new Map(sections.map((s) => [s.id, s])), [sections])
  const open = (s: Section) => (s.audiences ?? s.programs).includes(t.program) && (!s.ends || s.ends >= today())
  const picked = t.ids.map((id) => byId.get(id)).filter((s): s is Section => Boolean(s) && s!.term === term)
  const pickedKeys = new Set(picked.map((s) => s.key))
  const results = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (needle.length < 2) return []
    const seen = new Set<string>()
    const out: Section[] = []
    for (const s of sections) {
      if (s.term !== term || seen.has(s.key) || !open(s)) continue
      if (!`${s.number} ${s.title} ${s.faculty.join(' ')}`.toLowerCase().includes(needle)) continue
      seen.add(s.key)
      out.push(s)
      if (out.length >= 6) break
    }
    return out
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, sections, term, t.program])

  const clashIds = new Set<string>()
  const clashes: string[] = []
  picked.forEach((a, i) => picked.slice(i + 1).forEach((b) => {
    if (sectionsClash(a, b)) { clashIds.add(a.id); clashIds.add(b.id); clashes.push(`${a.number} and ${b.number}`) }
  }))
  const units = picked.reduce((n, s) => n + s.units, 0) + untimed + doneUnits
  const tba = picked.filter((s) => s.start_min == null || !s.days.length)
  // A term already under way hides its finished courses. MBA first years get those counted back (doneUnits);
  // for anyone else the count is partial, so don't check it against the minimum.
  const underway = (code: string) => sections.some((s) => s.term === code && s.ends && s.ends < today())
  const minimum = prog?.min_units && !(underway(term) && !doneUnits) && !(isMba && t.year === '2' && term === '202701') ? prog.min_units : null
  const termLabel = (code: string) => (code === '202603' && underway(code) ? 'Fall-2 2026' : TERM_NAMES[code])
  const sectionsOf = (key: string) => sections.filter((s) => s.key === key && open(s))

  const add = (s: Section) => {
    const best = sectionsOf(s.key).find((x) => !picked.some((p) => sectionsClash(p, x))) ?? s
    setT((v) => ({ ...v, ids: [...v.ids.filter((id) => byId.get(id)?.key !== s.key), best.id].slice(0, 20) }))
    setQ('')
  }
  const swap = (oldId: string, newId: string) => setT((v) => ({ ...v, ids: v.ids.map((id) => (id === oldId ? newId : id)) }))
  const remove = (id: string) => setT((v) => ({ ...v, ids: v.ids.filter((x) => x !== id), auto: v.auto.filter((x) => x !== id) }))
  const download = async () => {
    const res = await fetch('/api/ics/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ course_ids: picked.map((s) => s.id) }) })
    const url = URL.createObjectURL(await res.blob())
    const a = Object.assign(document.createElement('a'), { href: url, download: 'my-som-week.ics' })
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
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

      <div className="wb-main"><div className="wb-left">
      <div className="row between wb-term">
        {t.year === 'admit'
          ? <span className="small faint">Example week · Fall 2026</span>
          : (
            <div className="tabs wb-tabs" role="tablist" aria-label="Term">
              {(['202603', '202701'] as const).map((code) => (
                <button key={code} type="button" className={t.term === code ? 'on' : ''} onClick={() => setT((v) => ({ ...v, term: code }))}>{termLabel(code)}</button>
              ))}
            </div>
          )}
        <span className="mono small">
          {units} units{untimed ? ` (incl. ${untimed} core)` : ''}{doneUnits ? ` (incl. ${doneUnits} done in Fall-1)` : ''}
          {minimum ? (units < minimum ? ` · minimum ${minimum}, add ${minimum - units} more` : ` · minimum ${minimum} met`) : ''}
        </span>
      </div>
      {note && <p className={`small wb-note ${example ? 'example' : ''}`}>{note}</p>}

      <Timetable sections={picked} clashIds={clashIds} compact={!wide} />
      {tba.length > 0 && <p className="small faint wb-tba">No published time: {tba.map((s) => s.number).join(', ')}</p>}
      </div><div className="wb-right">

      <div className="wb-search">
        <Search className="icon sm faint" aria-hidden />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Add a course: name, number or professor" aria-label="Search courses to add" />
        {results.length > 0 && (
          <ul className="wb-results" role="listbox" aria-label="Matching courses">
            {results.map((s) => (
              <li key={s.key}>
                <button type="button" onClick={() => add(s)} disabled={pickedKeys.has(s.key)}>
                  <span><span className="course-num">{s.number}</span> {s.title}<span className="faint small"> · {s.time || 'time TBA'}</span></span>
                  {pickedKeys.has(s.key) ? <Check className="icon sm" /> : <Plus className="icon sm" />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {picked.length > 0 && (
        <ul className="wb-picked">
          {picked.map((s) => {
            const options = sectionsOf(s.key)
            const auto = t.auto.includes(s.id)
            return (
              <li key={s.id} className={clashIds.has(s.id) ? 'clash' : ''}>
                <span className="wb-picked-name" title={[s.room, s.exam && `Final exam: ${s.exam}`].filter(Boolean).join(' · ')}>
                  <span className="course-num">{s.number}</span> {s.title}
                  {(s.room.trim() || s.exam) && <span className="faint"> · {[s.room.trim(), shortExam(s.exam)].filter(Boolean).join(' · ')}</span>}
                </span>
                {auto && <span className="wb-tag">{isMba || t.program === 'EMBA' ? 'core' : 'required'}</span>}
                {!auto && options.length > 1 && (
                  <select className="lp-select sm" value={s.id} onChange={(e) => swap(s.id, e.target.value)} aria-label={`Section of ${s.number}`}>
                    {options.map((o) => <option key={o.id} value={o.id}>§{o.section} · {o.time || 'TBA'}</option>)}
                  </select>
                )}
                <button type="button" className="btn icon ghost" aria-label={`Remove ${s.number}`} onClick={() => remove(s.id)}><X className="icon sm" /></button>
              </li>
            )
          })}
        </ul>
      )}

      <div className="wb-status small">
        {clashes.length
          ? <span className="lp-clash"><TriangleAlert className="icon sm" />{clashes[0]} meet at the same time{clashes.length > 1 ? ` (+${clashes.length - 1} more)` : ''}. Try another section.</span>
          : picked.length > 0 ? <span className="pa-ok"><Check className="icon sm" /> No time clashes</span>
            : <span className="faint">{untimed ? 'Your core is counted above. Search for an elective to add it to the grid.' : 'Pick your program above, then add a course.'}</span>}
      </div>
      <div className="row wb-actions">
        <button type="button" className="btn primary sm" onClick={onSave} disabled={!picked.length}>Save to a free plan</button>
        <button type="button" className="btn ghost sm" onClick={download} disabled={!picked.length}><Download className="icon sm" />Calendar file</button>
      </div>
      <p className="faint wb-fine">Course data from SOM’s public directory{dataAsOf ? `, as of ${prettyDate(dataAsOf)}` : ''}. Nothing is stored until you sign up.</p>
      </div></div>
    </div>
  )
}
