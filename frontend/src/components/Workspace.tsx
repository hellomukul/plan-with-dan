/* The no-account workspace on the home page, modelled on the original class app:
   a sentence picker ("I'm an MBA first year in Blue") that drives four tabs:
   My plan (build your week) · Dates · Tools · Requirements. Choices are remembered in this browser. */
import { useEffect, useState, type KeyboardEvent, type ReactNode } from 'react'
import { CalendarDays, ExternalLink, Wrench, GraduationCap, Compass, Lock } from 'lucide-react'
import type { ProgramsInfo } from '../api'
import WeekBuilder from './WeekBuilder'
import HelpGuide from './HelpGuide'
import MbaRequirements from './MbaRequirements'
import DatesTab from './DatesTab'
import { resetTryout, type Tryout } from '../lib/tryout'
import { useApp } from '../state'

const SHORT: Record<string, { label: string; article: string }> = {
  MBA: { label: 'MBA', article: 'an' }, 'MBA-JOINT': { label: 'MBA joint-degree', article: 'an' },
  EMBA: { label: 'EMBA', article: 'an' }, MAM: { label: 'MAM', article: 'a' },
  'MMS-AM': { label: 'MMS Asset Management', article: 'an' }, 'MMS-GBS': { label: 'MMS Global Business & Society', article: 'an' },
  'MMS-SR': { label: 'MMS Systemic Risk', article: 'an' }, 'MMS-TM': { label: 'MMS Technology Management', article: 'an' },
  'MMS-PEM': { label: 'MMS Public Education', article: 'an' }, PhD: { label: 'PhD', article: 'a' },
}
const COHORTS = ['Gold', 'Silver', 'Blue', 'Green', 'Red']
const TWO_YEAR = new Set(['MBA', 'MBA-JOINT', 'EMBA'])
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

/** A readable name for an official source link (never "Source 2" or a raw URL). */
function sourceLabel(url: string): string {
  const where = url.includes('catalog.yale.edu') ? 'Yale Bulletin' : 'SOM website'
  const rules: [RegExp, string][] = [
    [/calendar/, 'Academic calendar'], [/required-course/, 'Required courses'], [/degree-requirements/, 'Degree requirements'],
    [/joint-degree/, 'Joint degrees'], [/course-policies/, 'Course policies'], [/global-studies/, 'Global studies funding'],
    [/curriculum/, 'Curriculum'], [/non-som-students/, 'Courses for non-SOM students'], [/\/phd/, 'PhD program'],
  ]
  const hit = rules.find(([re]) => re.test(url))
  return `${hit ? hit[1] : 'Program page'} (${where})`
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
  ['Quarters', 'Each term has two quarters (SOM calls them sessions): Fall-1 and Fall-2, Spring-1 and Spring-2. Half-term courses in different quarters never clash; full-term courses run through both.'],
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

function Pane({ id, tab, children }: { id: Tab; tab: Tab; children: ReactNode }) {
  const on = id === tab
  return <div id={`ws-pane-${id}`} className={`ws-pane ${on ? 'on' : ''}`} role="tabpanel" aria-labelledby={`ws-tab-${id}`} aria-hidden={!on} inert={!on}>{children}</div>
}

export default function Workspace({ t, setT, info, onSave, onSignup }: Props) {
  const [tab, setTab] = useState<Tab>(() => (localStorage.getItem('pwd-tab') as Tab) || 'plan')
  useEffect(() => { localStorage.setItem('pwd-tab', tab) }, [tab])
  const programs = info?.programs ?? []
  const p = programs.find((x) => x.code === t.program)
  const isMba = t.program === 'MBA' || t.program === 'MBA-JOINT'
  const art = SHORT[t.program]?.article ?? 'a'
  const count = t.ids.length
  const { toast } = useApp()
  // Arrow keys (and Home / End) move between the workspace tabs, as in any tab list.
  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const i = TABS.findIndex((x) => x.id === tab)
    const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: TABS.length - 1 }[e.key]
    if (next === undefined) return
    e.preventDefault()
    const to = TABS[(next + TABS.length) % TABS.length].id
    setTab(to)
    document.getElementById(`ws-tab-${to}`)?.focus()
  }
  // "reset" starts over: default visitor, empty week (the core refills on its own). Undo puts everything back.
  const reset = () => {
    const before = t
    setT((v) => ({ ...resetTryout(), term: v.term }))
    if (before.ids.length) toast('Started over: the courses you added are cleared.', undefined, { label: 'Undo', run: () => setT(() => before) })
  }


  return (
    <div className="ws">
      <div className="ws-bar">
        <div className="ws-picker" role="group" aria-label="About you">
          <span className="ws-lead">I’m {art}</span>
          <select className="ws-pill ws-prog" value={t.program} aria-label="Program"
            onChange={(e) => setT((v) => ({ ...v, program: e.target.value, year: TWO_YEAR.has(e.target.value) ? v.year : '', cohort: '' }))}>
            {Object.entries(SHORT).map(([code, s]) => <option key={code} value={code}>{s.label}</option>)}
          </select>
          {/* year and cohort: inline on wide screens, one fixed second row on phones (so the bar's height never changes) */}
          <span className="ws-more">
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
          </span>
          <button type="button" className="link-btn small ws-reset" onClick={reset}>reset</button>
        </div>
        <div className="ws-tabs" role="tablist" aria-label="Workspace">
          {TABS.map((x) => (
            <button key={x.id} id={`ws-tab-${x.id}`} type="button" role="tab" aria-selected={tab === x.id} aria-controls={`ws-pane-${x.id}`}
              tabIndex={tab === x.id ? 0 : -1} className={tab === x.id ? 'on' : ''} onClick={() => setTab(x.id)} onKeyDown={onTabKey}>
              <x.icon className="icon sm" />{x.label}
              {x.id === 'plan' && count > 0 && <span className="ws-badge">{count}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* All four tabs stay mounted in one grid cell and only the active one shows (desktop), so the workspace
          is always as tall as its tallest tab and switching tabs never moves the rest of the page. */}
      <div className="ws-panel">
        <Pane id="plan" tab={tab}>
          <WeekBuilder t={t} setT={setT} programs={programs} dataAsOf={info?.data_as_of} onSave={onSave} showWho={false} wide={typeof window === 'undefined' || window.innerWidth > 900} />
        </Pane>

        <Pane id="dates" tab={tab}>
          <DatesTab t={t} info={info} />
        </Pane>

        <Pane id="tools" tab={tab}>
          <HelpGuide />
          <div className="ws-tools">
            <div className="card ws-card">
              <div className="section-label"><span>Links you need</span></div>
              <ul className="ws-links">
                {LINKS.map(([name, sub, url]) => (
                  <li key={url}><a href={url} target="_blank" rel="noreferrer"><span className="ws-link-name"><b>{name}</b><ExternalLink className="icon sm" /></span><span className="faint small">{sub}</span></a></li>
                ))}
              </ul>
            </div>
            <div className="card ws-card">
              <div className="section-label"><span>SOM words, in plain English</span></div>
              <dl className="ws-gloss">{GLOSSARY.map(([w, d]) => <div key={w}><dt>{w}</dt><dd>{d}</dd></div>)}</dl>
            </div>
            {/* full width last row: it absorbs the space left by the taller Plan tab, so no column ends early */}
            <div className="card ws-card ws-tools-wide">
              <div className="ws-tools-head">
                <div className="section-label"><span>Dan’s tools · free account</span></div>
                <button type="button" className="btn primary sm ws-tools-cta" onClick={onSignup}>Create a free account</button>
              </div>
              <ul className="ws-links two">
                {[['Bidding help', 'Spread your auction points by priority and seat demand'], ['Global Studies planner', 'IE, GNW or SNOC against your funded days (MBA)'], ['Calendar sync', 'One private link for Google, Outlook or Apple'], ['Weekly deadline cards', 'The 3 things due this week, with real dates']].map(([n, s]) => (
                  <li key={n}><button type="button" className="link-btn" onClick={onSignup}><span className="ws-link-name"><Lock className="icon sm" /><b>{n}</b></span><span className="faint small">{s}</span></button></li>
                ))}
              </ul>
            </div>
          </div>
        </Pane>

        <Pane id="reqs" tab={tab}>
          {!p ? <div className="card ws-card faint small">Loading program rules…</div> : (
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
                {p.sources.slice(0, 3).map((u) => <a key={u} href={u} target="_blank" rel="noreferrer">{sourceLabel(u)}<ExternalLink className="icon sm" /></a>)}
              </div>
            </div>
          )}
          {p && isMba && info?.mba && <MbaRequirements rules={info.mba} program={t.program} />}
        </Pane>
      </div>
    </div>
  )
}
