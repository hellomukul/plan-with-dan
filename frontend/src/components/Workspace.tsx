/* The no-account workspace on the home page, modelled on the original class app:
   a sentence picker ("I'm an MBA first year in Blue") that drives four tabs:
   My plan (build your week) · Dates · Tools · Requirements. Choices are remembered in this browser. */
import { useEffect, useState } from 'react'
import { CalendarDays, Download, ExternalLink, Wrench, GraduationCap, Compass, Lock } from 'lucide-react'
import type { ProgramsInfo } from '../api'
import WeekBuilder from './WeekBuilder'
import { prettyDate, relDays, daysUntil } from '../lib/format'
import { DEFAULT_WHO, type Tryout } from '../lib/tryout'

const SHORT: Record<string, { label: string; article: string }> = {
  MBA: { label: 'MBA', article: 'an' }, 'MBA-JOINT': { label: 'MBA joint-degree', article: 'an' },
  EMBA: { label: 'EMBA', article: 'an' }, MAM: { label: 'MAM', article: 'a' },
  'MMS-AM': { label: 'MMS Asset Management', article: 'an' }, 'MMS-GBS': { label: 'MMS Global Business & Society', article: 'an' },
  'MMS-SR': { label: 'MMS Systemic Risk', article: 'an' }, 'MMS-TM': { label: 'MMS Technology Management', article: 'an' },
  'MMS-PEM': { label: 'MMS Public Education', article: 'an' }, PhD: { label: 'PhD', article: 'a' },
}
const COHORTS = ['Gold', 'Silver', 'Blue', 'Green', 'Red']
const TWO_YEAR = new Set(['MBA', 'MBA-JOINT', 'EMBA'])
const OWN_CALENDAR = new Set(['EMBA', 'MMS-PEM'])
type Tab = 'plan' | 'dates' | 'tools' | 'reqs'
const TABS: { id: Tab; label: string; icon: typeof Compass }[] = [
  { id: 'plan', label: 'My plan', icon: Compass },
  { id: 'dates', label: 'Dates', icon: CalendarDays },
  { id: 'tools', label: 'Tools', icon: Wrench },
  { id: 'reqs', label: 'Requirements', icon: GraduationCap },
]

/** "MBA · 1st year · Blue", for the chat's "answering for" pill. */
export function whoLabel(t: Tryout): string {
  const year = { '1': '1st year', '2': '2nd year', admit: 'admitted' }[t.year] ?? ''
  return [SHORT[t.program]?.label ?? t.program, TWO_YEAR.has(t.program) ? year : '', t.cohort].filter(Boolean).join(' · ')
}

const LINKS: [string, string, string][] = [
  ['Yale Course Search', 'Every Yale course, including other schools', 'https://courses.yale.edu/'],
  ['SOM student portal', 'Registration and the course auction', 'https://portal.som.yale.edu/'],
  ['Course auction help', 'How SOM’s bidding app works (SOM IT)', 'https://confluence.som.yale.edu/display/SC/Course+Auction'],
  ['Canvas', 'Course sites, syllabi, assignments', 'https://canvas.yale.edu/'],
  ['Career Development Office', 'Recruiting, coaching, job boards', 'https://cdo.som.yale.edu/'],
  ['SOM contacts', 'Registrar, Academic Affairs, IT help', 'https://som.yale.edu/about/contact'],
  ['Financial aid', 'SOM Financial Aid office', 'https://groups.som.yale.edu/finaid/contact-us/'],
  ['Yale Bulletin: SOM', 'The official rules for every program', 'https://catalog.yale.edu/management/'],
]
const GLOSSARY: [string, string][] = [
  ['Units', 'SOM credits. Most electives are 2 units (half a term) or 4 (full term).'],
  ['Sessions', 'Each term has two halves, session 1 and session 2. Half-term courses in different sessions never clash.'],
  ['Auction', 'How SOM fills popular electives: you bid points; the highest bids get seats.'],
  ['Add/drop', 'The week at the start of each session when you can still change courses for free.'],
  ['Core', 'Required first-year courses SOM schedules by cohort. You don’t bid on them.'],
  ['GSR / GSA', 'MBA Global Studies Requirement, and the 10 funded travel days that pay for it.'],
]

interface Props {
  t: Tryout
  setT: (f: (t: Tryout) => Tryout) => void
  info: ProgramsInfo | null
  onSave: () => void
  onSignup: () => void
}

export default function Workspace({ t, setT, info, onSave, onSignup }: Props) {
  const [tab, setTab] = useState<Tab>(() => (localStorage.getItem('pwd-tab') as Tab) || 'plan')
  useEffect(() => { localStorage.setItem('pwd-tab', tab) }, [tab])
  const programs = info?.programs ?? []
  const p = programs.find((x) => x.code === t.program)
  const isMba = t.program === 'MBA' || t.program === 'MBA-JOINT'
  const art = SHORT[t.program]?.article ?? 'a'
  const today = info ? new Date(info.today + 'T00:00:00') : new Date()
  const count = t.ids.length

  const downloadDates = async () => {
    const res = await fetch('/api/ics/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ course_ids: [] }) })
    const url = URL.createObjectURL(await res.blob())
    Object.assign(document.createElement('a'), { href: url, download: 'som-key-dates.ics' }).click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="ws">
      <div className="ws-bar">
        <div className="ws-picker" role="group" aria-label="About you">
          <span>I’m {art}</span>
          <select className="ws-pill" value={t.program} aria-label="Program"
            onChange={(e) => setT((v) => ({ ...v, program: e.target.value, year: TWO_YEAR.has(e.target.value) ? v.year : '', cohort: '' }))}>
            {Object.entries(SHORT).map(([code, s]) => <option key={code} value={code}>{s.label}</option>)}
          </select>
          {TWO_YEAR.has(t.program) && (
            <select className="ws-pill" value={t.year} aria-label="Year" onChange={(e) => setT((v) => ({ ...v, year: e.target.value, cohort: e.target.value === '2' ? '' : v.cohort }))}>
              <option value="">student (pick year)</option>
              <option value="1">first year</option>
              <option value="2">second year</option>
              {isMba && <option value="admit">admit (starting 2027)</option>}
            </select>
          )}
          {!TWO_YEAR.has(t.program) && <span>student</span>}
          {isMba && (t.year === '1' || t.year === 'admit') && (
            <>
              <span>in</span>
              <select className="ws-pill" value={t.cohort} aria-label="Cohort" onChange={(e) => setT((v) => ({ ...v, cohort: e.target.value }))}>
                <option value="">{t.year === 'admit' ? 'any cohort' : 'my cohort'}</option>
                {COHORTS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </>
          )}
          <button type="button" className="link-btn small" onClick={() => setT((v) => ({ ...v, ...DEFAULT_WHO, ids: v.ids.filter((id) => !v.auto.includes(id)), auto: [] }))}>reset</button>
        </div>
        <div className="ws-tabs" role="tablist" aria-label="Workspace">
          {TABS.map((x) => (
            <button key={x.id} type="button" role="tab" aria-selected={tab === x.id} className={tab === x.id ? 'on' : ''} onClick={() => setTab(x.id)}>
              <x.icon className="icon sm" />{x.label}
              {x.id === 'plan' && count > 0 && <span className="ws-badge">{count}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="ws-panel" role="tabpanel">
        {tab === 'plan' && (
          <WeekBuilder t={t} setT={setT} programs={programs} dataAsOf={info?.data_as_of} onSave={onSave} showWho={false} wide={typeof window === 'undefined' || window.innerWidth > 900} />
        )}

        {tab === 'dates' && (
          <div className="card ws-card">
            {p && OWN_CALENDAR.has(p.code) ? (
              <p className="muted" style={{ margin: 0 }}>The {p.label} runs on its own calendar ({p.calendar.replace(/^Own calendar:?\s*/i, '')}), which Plan with Dan doesn’t model yet.{' '}
                <a href={p.sources[p.sources.length - 1]} target="_blank" rel="noreferrer">Open the official calendar<ExternalLink className="icon sm" /></a></p>
            ) : (
              <>
                <div className="row between" style={{ flexWrap: 'wrap', gap: 8 }}>
                  <div className="section-label" style={{ margin: 0 }}><span>Coming up · MBA, MAM and MMS calendar</span></div>
                  <button type="button" className="btn sm" onClick={downloadDates}><Download className="icon sm" />Add these to my calendar</button>
                </div>
                <ul className="ws-dates">
                  {(info?.dates ?? info?.upcoming ?? []).map((d) => (
                    <li key={d.date + d.title} className={`k-${d.kind}`}>
                      <span className="mono">{prettyDate(d.date)}{d.end !== d.date ? ` – ${prettyDate(d.end)}` : ''}</span>
                      <span>{d.title}</span>
                      <span className="faint small">{relDays(daysUntil(d.date, today))}</span>
                    </li>
                  ))}
                </ul>
                <p className="faint small" style={{ marginBottom: 0 }}>From the 2026–27 SOM academic calendar. Auction dates are announced on the SOM portal.</p>
              </>
            )}
          </div>
        )}

        {tab === 'tools' && (
          <div className="ws-tools">
            <div className="card ws-card">
              <div className="section-label"><span>Links you need</span></div>
              <ul className="ws-links">
                {LINKS.map(([name, sub, url]) => (
                  <li key={url}><a href={url} target="_blank" rel="noreferrer"><b>{name}</b><ExternalLink className="icon sm" /></a><span className="faint small">{sub}</span></li>
                ))}
              </ul>
            </div>
            <div className="stack" style={{ gap: 16 }}>
              <div className="card ws-card">
                <div className="section-label"><span>Dan’s tools · free account</span></div>
                <ul className="ws-links">
                  {[['Bid coach', 'Spread your auction points by priority and seat demand'], ['Global Studies planner', 'IE, GNW or SNOC against your funded days (MBA)'], ['Calendar sync', 'One private link for Google, Outlook or Apple'], ['Weekly deadline cards', 'The 3 things due this week, with real dates']].map(([n, s]) => (
                    <li key={n}><button type="button" className="link-btn" onClick={onSignup}><Lock className="icon sm" /><b>{n}</b></button><span className="faint small">{s}</span></li>
                  ))}
                </ul>
              </div>
              <div className="card ws-card">
                <div className="section-label"><span>SOM words, in plain English</span></div>
                <dl className="ws-gloss">{GLOSSARY.map(([w, d]) => <div key={w}><dt>{w}</dt><dd>{d}</dd></div>)}</dl>
              </div>
            </div>
          </div>
        )}

        {tab === 'reqs' && (
          !p ? <div className="card ws-card faint small">Loading program rules…</div> : (
            <div className="card ws-card stack" style={{ gap: 12 }}>
              <h3 style={{ margin: 0 }}>{p.label}</h3>
              <div className="lp-stats">
                <div><b>{p.total_units ?? '–'}</b><span>units to graduate</span></div>
                <div><b>{p.min_units ?? '–'}</b><span>minimum per term{p.base === 'MBA' ? ' (first 3)' : ''}</span></div>
                <div><b>{p.max_units ? `>${p.max_units}` : '–'}</b><span>needs approval</span></div>
              </div>
              <p className="muted small" style={{ margin: 0 }}>{p.summary}</p>
              {p.required.length > 0 && (
                <div>
                  <div className="section-label"><span>Required courses</span></div>
                  <ul className="lp-req">{p.required.map((r) => <li key={r.number + r.term}><span className="course-num">{r.number}</span> {r.title} <span className="faint">· {r.term === '202603' ? 'Fall' : 'Spring'} · {r.units} units</span></li>)}</ul>
                </div>
              )}
              <dl className="lp-kv small"><dt>Global</dt><dd>{p.global}</dd><dt>Calendar</dt><dd>{p.calendar}</dd></dl>
              {p.unconfirmed.length > 0 && <p className="small" style={{ margin: 0, color: 'var(--amber)' }}>Not in official sources yet: {p.unconfirmed.join('; ')}.</p>}
              <div className="row small" style={{ gap: 12, flexWrap: 'wrap' }}>
                {p.sources.slice(0, 3).map((u, i) => <a key={u} href={u} target="_blank" rel="noreferrer">{i === 0 ? 'Official requirements (Yale Bulletin)' : `Source ${i + 1}`}<ExternalLink className="icon sm" /></a>)}
              </div>
            </div>
          )
        )}
      </div>
    </div>
  )
}
