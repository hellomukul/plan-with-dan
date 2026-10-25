import { useEffect, useMemo, useState } from 'react'
import { api, type Profile, type ProgramInfo } from '../api'
import HandsomeDan from '../mascots/HandsomeDan'
import { Briefcase, Clock, Coffee, GraduationCap, Globe2, BookOpen, Moon, Scale, FlaskConical, LogOut, Shield } from 'lucide-react'
import { EMPTY_PROFILE, useApp } from '../state'
import { importTryout, loadTryout, type Tryout } from '../lib/tryout'
import { calendarIntentFresh } from '../components/AuthDialog'
import './onboarding.css'
import { PACKAGE_GOAL_KEY } from '../lib/elihu'
import ScreenshotImport from '../components/ScreenshotImport'

const PROGRAMS = [
  { v: 'MBA', label: 'Full-time MBA', big: <GraduationCap className="icon lg" /> },
  { v: 'MBA-JOINT', label: 'MBA joint degree', big: <Scale className="icon lg" /> },
  { v: 'EMBA', label: 'MBA for Executives', big: <Briefcase className="icon lg" /> },
  { v: 'MAM', label: 'MAM', big: <Globe2 className="icon lg" /> },
  { v: 'MMS', label: 'MMS', big: <BookOpen className="icon lg" /> },
  { v: 'PhD', label: 'PhD (taking SOM courses)', big: <FlaskConical className="icon lg" /> },
]
const MMS_TRACKS = [
  { v: 'MMS-GBS', label: 'Global Business & Society' },
  { v: 'MMS-AM', label: 'Asset Management' },
  { v: 'MMS-SR', label: 'Systemic Risk' },
  { v: 'MMS-TM', label: 'Technology Management' },
  { v: 'MMS-PEM', label: 'Public Education Management' },
]
const TWO_YEAR = new Set(['MBA', 'MBA-JOINT', 'EMBA'])
const isOn = (program: string, v: string) => program === v || (v === 'MMS' && program.startsWith('MMS'))
const COHORTS = ['Gold', 'Silver', 'Blue', 'Green', 'Red']
const BACKGROUNDS = ['Consulting', 'Banking / Finance', 'Tech / Product', 'Healthcare', 'Nonprofit / Public', 'Startup', 'Marketing / Brand', 'Military', 'Education', 'Other']
const SHORT_GOALS = ['Consulting internship', 'Investment banking', 'PE / VC', 'Product management', 'Healthcare', 'Start my own company', 'Social impact', 'Still exploring']
const LONG_GOALS = ['Run a company someday', 'Become a partner', 'Lead a mission-driven org', 'Build AI products', 'Invest in climate', 'Pivot industries']
const TIMES = [
  { v: 0, label: 'Any time', big: <Clock className="icon lg" /> },
  { v: 540, label: 'Not before 9', big: <Coffee className="icon lg" /> },
  { v: 600, label: 'Not before 10', big: <Moon className="icon lg" /> },
]

const STEPS = ['You', 'Background', 'Interests', 'Goals', 'Schedule']
const NEEDS = ['', '', 'Pick at least one interest to continue', 'Add a short- or long-term goal to continue', '']
const needsCohort = (x: Profile) => (x.program === 'MBA' || x.program === 'MBA-JOINT') && x.year === '1'

/** The week a visitor built on the home page, if this browser has one (the home page saves it on every visit). */
function homeWeek(): Tryout | null {
  try { return localStorage.getItem('pwd-tryout') ? loadTryout() : null } catch { return null }
}

/** A new student starts from who they said they were on the home page: program, year and cohort. */
function fromHomeWeek(base: Profile, t: Tryout | null): Profile {
  if (!t || base.onboarded) return base
  const known = PROGRAMS.some((o) => o.v === t.program) || MMS_TRACKS.some((o) => o.v === t.program)
  if (!known) return base
  const year = !TWO_YEAR.has(t.program) ? '' : t.year === 'admit' ? '1' : t.year === '1' || t.year === '2' ? t.year : ''
  // An admit's cohort on the home page is only an example week (cohorts are assigned at orientation).
  const cohort = (t.program === 'MBA' || t.program === 'MBA-JOINT') && year === '1' && t.year !== 'admit' && COHORTS.includes(t.cohort) ? t.cohort : ''
  return { ...base, program: t.program, year, cohort }
}

/** "mgt402, MGT 403" -> valid course numbers, plus anything that doesn't look like one. */
function parseCourses(text: string): { codes: string[]; bad: string[] } {
  const codes: string[] = []
  const bad: string[] = []
  for (const raw of text.split(/[,\n;]+/)) {
    const t = raw.trim().toUpperCase().replace(/\s+/g, ' ')
    if (!t) continue
    const m = /^([A-Z&]{2,5}) ?(\d{3,4}[A-Z]?)$/.exec(t)
    if (!m) { bad.push(raw.trim()); continue }
    const code = `${m[1]} ${m[2]}`
    if (!codes.includes(code)) codes.push(code)
  }
  return { codes, bad }
}

export default function Onboarding({ editing = false }: { editing?: boolean }) {
  const { profile, topics, refreshProfile, refreshPlan, go, toast, user, sections, endSession } = useApp()
  // Start from who they said they were on the home page (program, year, cohort); they can change it here.
  const [week] = useState(() => (editing ? null : homeWeek()))
  const [p, setP] = useState<Profile>(() => fromHomeWeek(profile ?? EMPTY_PROFILE, week))
  const carried = Boolean(week) && !editing && !(profile?.onboarded)
  // Arrived with a goal for the course package (typed on the landing page): finish on the package, not the desk.
  const [packageGoal] = useState(() => (editing ? '' : sessionStorage.getItem(PACKAGE_GOAL_KEY) ?? ''))
  // First-year MBAs must pick a cohort (it sets their core class times), or say they don't know it yet.
  const [cohortUnsure, setCohortUnsure] = useState(() => week?.year === 'admit')
  const [step, setStep] = useState(0)
  const [completedText, setCompletedText] = useState((profile?.completed ?? []).join(', '))
  const [saving, setSaving] = useState(false)
  // Each program's own global-travel rule (MBA: 10 funded GSA days; MAM: 5 subsidized days; most: none stated).
  const [programs, setPrograms] = useState<ProgramInfo[]>([])
  useEffect(() => { api.programs().then((r) => setPrograms(r.programs ?? [])).catch(() => undefined) }, [])

  useEffect(() => {
    if (profile) {
      const next = fromHomeWeek(profile, editing ? null : week)
      // A goal typed on the landing page fills the goals step, so a new student doesn't type it twice.
      if (packageGoal && !next.goal_short && !next.goal_long) next.goal_long = packageGoal.slice(0, 300)
      setP(next)
      setCompletedText(profile.completed.join(', '))
    }
  }, [profile, editing, week])

  const courses = useMemo(() => parseCourses(completedText), [completedText])
  const catalogNumbers = useMemo(() => new Set(sections.map((x) => x.number)), [sections])
  const notInCatalog = sections.length ? courses.codes.filter((c) => c.startsWith('MGT ') && !catalogNumbers.has(c)) : []

  const gsaMba = p.program === 'MBA' || p.program === 'MBA-JOINT'
  const travelDays = gsaMba ? 10 : Number(/(\d+) (?:funded|subsidi[sz]ed)/i.exec(programs.find((x) => x.code === p.program)?.global ?? '')?.[1]) || null
  const gsaLabel = gsaMba ? 'Global Studies days already used (of your 10 funded GSA days)'
    : travelDays ? `Subsidized global travel days already used (of your ${travelDays})` : 'Funded global travel days already used, if any'
  const gsaMax = travelDays ?? 10

  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => setP((x) => ({ ...x, [k]: v }))
  const setPref = (k: string, v: unknown) => setP((x) => ({ ...x, prefs: { ...x.prefs, [k]: v } }))
  const toggleInterest = (t: string) =>
    setP((x) => ({
      ...x,
      interests: x.interests.includes(t) ? x.interests.filter((i) => i !== t) : x.interests.length >= 6 ? x.interests : [...x.interests, t],
    }))

  const canNext = [
    Boolean(p.program && p.program !== 'MMS' && (!TWO_YEAR.has(p.program) || p.year) && (!needsCohort(p) || p.cohort || cohortUnsure)),
    true,
    p.interests.length > 0,
    Boolean(p.goal_short.trim() || p.goal_long.trim()),
    true,
  ][step]

  const stepNeeds = !canNext ? (step === 0 ? (p.program === 'MMS' ? 'Pick your MMS track to continue'
    : TWO_YEAR.has(p.program) && !p.year ? 'Pick your year to continue' : 'Pick your cohort to continue') : NEEDS[step]) : ''

  const save = async (then: 'find' | 'home') => {
    if (courses.bad.length) { toast(`These don’t look like course numbers: ${courses.bad.join(', ')}. Use the form MGT 402.`, 'bad'); return }
    // Came in through "Link your calendar": finish on the Calendar page, where the subscribe buttons are. Read it now:
    // the Calendar page takes the flag as soon as the saved profile lets it render.
    const toCalendar = !editing && calendarIntentFresh()
    setSaving(true)
    try {
      const completed = courses.codes.slice(0, 60)
      await api.saveProfile({ ...p, cohort: needsCohort(p) ? p.cohort : '', completed, onboarded: true })
      const added = editing ? 0 : await importTryout().catch(() => 0)  // the week they built on the home page
      await Promise.all([refreshProfile(), refreshPlan()])  // so Bid coach, My plan etc. see the imported courses
      toast(added ? `Profile saved, and ${added} course${added > 1 ? 's' : ''} from your try-out week added to your plan` : 'Profile saved', 'good')
      go(toCalendar ? 'calendar' : then)
    } catch (e) {
      toast((e as Error).message, 'bad')
    } finally {
      setSaving(false)
    }
  }

  const avoid = p.prefs.avoid_days ?? []
  const signOut = async () => {
    await api.logout().catch(() => undefined)
    endSession('logout')
  }

  return (
    <div className={`main ob ${editing ? 'ob-editing' : ''}`}>
      <div className="row between mb ob-head">
        <div className="row ob-hello">
          <HandsomeDan size={40} furColor="#f4b183" bandanaColor="#00356b" />
          <div>
            <h2 style={{ margin: 0 }}>{editing ? 'Your profile' : `Hey${user?.name ? ` ${user.name}` : ''}! Let’s get to know you`}</h2>
            <div className="muted small">5 quick steps · ~1 minute · you can change anything later</div>
          </div>
        </div>
        {editing ? <button className="btn sm ghost" onClick={() => go('home')}>Cancel</button> : (
          <div className="row ob-exit">
            <a className="btn sm ghost" href="#/privacy"><Shield className="icon sm" />Privacy</a>
            <button type="button" className="btn sm ghost" onClick={signOut}><LogOut className="icon sm" />Sign out</button>
          </div>
        )}
      </div>
      <div className="steps mb" aria-hidden="true">{STEPS.map((s, i) => <span key={s} className={i <= step ? 'on' : ''} title={s} />)}</div>
      <p className="sr-only" aria-live="polite">Step {step + 1} of {STEPS.length}: {STEPS[step]}</p>

      <div className="card pad-lg stack ob-card" style={{ gap: 18 }}>
        {step === 0 && (
          <>
            <h3>Which program are you in?</h3>
            {carried && <p className="muted small ob-carried">Filled in from the week you built on the home page. Change anything that isn’t right.</p>}
            <div className="choice-grid">
              {PROGRAMS.map((o) => (
                <button key={o.v} type="button" aria-pressed={isOn(p.program, o.v)} className={`choice ${isOn(p.program, o.v) ? 'on' : ''}`} onClick={() => set('program', o.v === 'MMS' && p.program.startsWith('MMS') ? p.program : o.v)}>
                  <span className="big">{o.big}</span>{o.label}
                </button>
              ))}
            </div>
            {p.program.startsWith('MMS') && (
              <>
                <h3>Which MMS track?</h3>
                <div className="row">
                  {MMS_TRACKS.map((t) => (
                    <button key={t.v} type="button" aria-pressed={p.program === t.v} className={`chip ${p.program === t.v ? 'on' : ''}`} onClick={() => set('program', t.v)}>{t.label}</button>
                  ))}
                </div>
              </>
            )}
            {TWO_YEAR.has(p.program) && (
              <>
                <h3>What year?</h3>
                <div className="row">
                  {[['1', p.program === 'EMBA' ? 'First year' : 'First year (core + first electives)'], ['2', p.program === 'EMBA' ? 'Second year' : 'Second year (all electives)']].map(([v, l]) => (
                    <button key={v} type="button" aria-pressed={p.year === v} className={`chip ${p.year === v ? 'on' : ''}`} onClick={() => set('year', v)}>{l}</button>
                  ))}
                </div>
              </>
            )}
            {(p.program === 'MBA' || p.program === 'MBA-JOINT') && p.year === '1' && (
              <>
                <h3>Your cohort <span className="muted small">(sets your core class times)</span></h3>
                <div className="row">
                  {COHORTS.map((c) => (
                    <button key={c} type="button" aria-pressed={p.cohort === c} className={`chip ${p.cohort === c ? 'on' : ''}`}
                      onClick={() => { set('cohort', c); setCohortUnsure(false) }}>{c}</button>
                  ))}
                  <button type="button" aria-pressed={!p.cohort && cohortUnsure} className={`chip ${!p.cohort && cohortUnsure ? 'on' : ''}`}
                    onClick={() => { set('cohort', ''); setCohortUnsure(true) }}>Not assigned yet</button>
                </div>
              </>
            )}
          </>
        )}

        {step === 1 && (
          <>
            <h3>What did you do before SOM?</h3>
            <div className="row">
              {BACKGROUNDS.map((b) => (
                <button key={b} type="button" aria-pressed={p.background.startsWith(b)} className={`chip ${p.background.startsWith(b) ? 'on' : ''}`} onClick={() => set('background', b)}>{b}</button>
              ))}
            </div>
            <label className="field">Anything more specific? (optional)
              <input value={p.background} maxLength={280} onChange={(e) => set('background', e.target.value)} placeholder="e.g. 4 years in healthcare strategy consulting" />
            </label>
          </>
        )}

        {step === 2 && (
          <>
            <div className="row between">
              <h3 style={{ margin: 0 }}>What lights you up? <span className="muted small">(pick up to 6)</span></h3>
              <span className="mono faint">{p.interests.length}/6</span>
            </div>
            <div className="row">
              {topics.map((t) => (
                <button key={t} type="button" aria-pressed={p.interests.includes(t)} className={`chip ${p.interests.includes(t) ? 'on' : ''}`} onClick={() => toggleInterest(t)}>
                  {t}
                </button>
              ))}
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h3 id="ob-goal-short">Short-term goal <span className="muted small">(internship, recruiting, next 12 months)</span></h3>
            <div className="row">
              {SHORT_GOALS.map((g) => <button key={g} type="button" className="chip" aria-label={`Add ${g} to your short-term goal`} onClick={() => setP((x) => ({ ...x, goal_short: x.goal_short ? `${x.goal_short}; ${g}` : g }))}>+ {g}</button>)}
            </div>
            <textarea aria-labelledby="ob-goal-short" value={p.goal_short} maxLength={380} onChange={(e) => set('goal_short', e.target.value)} placeholder="e.g. Summer internship in healthcare private equity" />
            <h3 id="ob-goal-long">Long-term goal <span className="muted small">(5–10 years)</span></h3>
            <div className="row">
              {LONG_GOALS.map((g) => <button key={g} type="button" className="chip" aria-label={`Add ${g} to your long-term goal`} onClick={() => setP((x) => ({ ...x, goal_long: x.goal_long ? `${x.goal_long}; ${g}` : g }))}>+ {g}</button>)}
            </div>
            <textarea aria-labelledby="ob-goal-long" value={p.goal_long} maxLength={380} onChange={(e) => set('goal_long', e.target.value)} placeholder="e.g. Lead a healthcare services company" />
          </>
        )}

        {step === 4 && (
          <>
            <h3>Your schedule vibe</h3>
            <div className="choice-grid">
              {TIMES.map((t) => (
                <button key={t.v} type="button" aria-pressed={(p.prefs.no_before ?? 0) === t.v} className={`choice ${(p.prefs.no_before ?? 0) === t.v ? 'on' : ''}`} onClick={() => setPref('no_before', t.v || undefined)}>
                  <span className="big">{t.big}</span>{t.label}
                </button>
              ))}
            </div>
            <label className="toggle"><input type="checkbox" checked={Boolean(p.prefs.fridays_free)} onChange={(e) => setPref('fridays_free', e.target.checked)} /> Keep Fridays free (recruiting trips, life)</label>
            <div className="row">
              <span className="muted small">Avoid these days:</span>
              {['M', 'T', 'W', 'Th'].map((d) => (
                <button key={d} type="button" aria-pressed={avoid.includes(d)} aria-label={`Avoid ${({ M: 'Monday', T: 'Tuesday', W: 'Wednesday', Th: 'Thursday' } as Record<string, string>)[d]}`} className={`chip ${avoid.includes(d) ? 'on' : ''}`}
                  onClick={() => setPref('avoid_days', avoid.includes(d) ? avoid.filter((x) => x !== d) : [...avoid, d])}>{d}</button>
              ))}
            </div>
            <label className="field">Courses you’ve already taken or are taking (optional, course numbers)
              <input value={completedText} maxLength={600} onChange={(e) => setCompletedText(e.target.value)} placeholder="e.g. MGT 402, MGT 403, MGT 525"
                aria-invalid={courses.bad.length > 0} aria-describedby="ob-courses-msg" />
            </label>
            <ScreenshotImport onAdded={(nums) => setCompletedText((t) => [...new Set([...parseCourses(t).codes, ...nums])].join(', '))} />
            <p id="ob-courses-msg" className={`small ob-courses-msg ${courses.bad.length ? 'error-text' : 'muted'}`} role={courses.bad.length ? 'alert' : undefined}>
              {courses.bad.length ? `These don’t look like course numbers: ${courses.bad.join(', ')}. Use the form MGT 402.`
                : notInCatalog.length ? `Not in this year’s SOM catalog: ${notInCatalog.join(', ')}. Keep it only if you took it in an earlier year.` : '\u00a0'}
            </p>
            <label className="field">{gsaLabel}
              <input type="number" min={0} max={gsaMax} value={p.gsa_days_used} onChange={(e) => set('gsa_days_used', Math.max(0, Math.min(gsaMax, Number(e.target.value) || 0)))} />
            </label>
          </>
        )}
      </div>

      <div className="ob-foot">
        <button type="button" className="btn ghost" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>← Back</button>
        <span className="small muted ob-need" aria-live="polite">{stepNeeds}</span>
        <div className="row ob-next">
          {step < STEPS.length - 1 ? (
            <button type="button" className="btn primary" disabled={!canNext} onClick={() => setStep((s) => s + 1)}>Next →</button>
          ) : (
            <>
              {packageGoal ? <>
                <button type="button" className="btn" disabled={saving} onClick={() => save('home')}>Save and see my desk</button>
                <button type="button" className="btn primary" disabled={saving} onClick={() => save('find')}>Save and see my course package</button>
              </> : <>
                <button type="button" className="btn" disabled={saving} onClick={() => save('find')}>Save and ask Elihu for picks</button>
                <button type="button" className="btn primary" disabled={saving} onClick={() => save('home')}>Save and see my desk</button>
              </>}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
