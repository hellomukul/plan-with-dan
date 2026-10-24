import { useEffect, useState } from 'react'
import { api, type Profile } from '../api'
import HandsomeDan from '../mascots/HandsomeDan'
import { Briefcase, Clock, Coffee, GraduationCap, Globe2, BookOpen, Moon } from 'lucide-react'
import { EMPTY_PROFILE, useApp } from '../state'

const PROGRAMS = [
  { v: 'MBA', label: 'MBA', big: <GraduationCap className="icon lg" /> },
  { v: 'EMBA', label: 'EMBA', big: <Briefcase className="icon lg" /> },
  { v: 'MAM', label: 'MAM', big: <Globe2 className="icon lg" /> },
  { v: 'MMS', label: 'MMS', big: <BookOpen className="icon lg" /> },
]
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

export default function Onboarding({ editing = false }: { editing?: boolean }) {
  const { profile, topics, refreshProfile, go, toast, user } = useApp()
  const [p, setP] = useState<Profile>(profile ?? EMPTY_PROFILE)
  const [step, setStep] = useState(0)
  const [completedText, setCompletedText] = useState((profile?.completed ?? []).join(', '))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (profile) { setP(profile); setCompletedText(profile.completed.join(', ')) }
  }, [profile])

  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => setP((x) => ({ ...x, [k]: v }))
  const setPref = (k: string, v: unknown) => setP((x) => ({ ...x, prefs: { ...x.prefs, [k]: v } }))
  const toggleInterest = (t: string) =>
    setP((x) => ({
      ...x,
      interests: x.interests.includes(t) ? x.interests.filter((i) => i !== t) : x.interests.length >= 6 ? x.interests : [...x.interests, t],
    }))

  const canNext = [
    Boolean(p.program && (p.program !== 'MBA' || p.year)),
    true,
    p.interests.length > 0,
    Boolean(p.goal_short.trim() || p.goal_long.trim()),
    true,
  ][step]

  const save = async (then: 'find' | 'home') => {
    setSaving(true)
    try {
      const completed = completedText.split(/[,\n;]+/).map((s) => s.trim().toUpperCase()).filter(Boolean)
      await api.saveProfile({ ...p, completed, onboarded: true })
      await refreshProfile()
      toast('Profile saved', 'good')
      go(then)
    } catch (e) {
      toast((e as Error).message, 'bad')
    } finally {
      setSaving(false)
    }
  }

  const avoid = p.prefs.avoid_days ?? []

  return (
    <div className="main" style={{ margin: '0 auto', maxWidth: 860 }}>
      <div className="row between mb">
        <div className="row">
          <HandsomeDan size={40} furColor="#f4b183" bandanaColor="#00356b" />
          <div>
            <h2 style={{ margin: 0 }}>{editing ? 'Your profile' : `Hey${user?.name ? ` ${user.name}` : ''}! Let’s get to know you`}</h2>
            <div className="muted small">5 quick steps · ~1 minute · you can change anything later</div>
          </div>
        </div>
        {editing && <button className="btn sm ghost" onClick={() => go('home')}>Cancel</button>}
      </div>
      <div className="steps mb">{STEPS.map((s, i) => <span key={s} className={i <= step ? 'on' : ''} title={s} />)}</div>

      <div className="card pad-lg stack" style={{ gap: 18, minHeight: 360 }}>
        {step === 0 && (
          <>
            <h3>Which program are you in?</h3>
            <div className="choice-grid">
              {PROGRAMS.map((o) => (
                <button key={o.v} className={`choice ${p.program === o.v ? 'on' : ''}`} onClick={() => set('program', o.v)}>
                  <span className="big">{o.big}</span>{o.label}
                </button>
              ))}
            </div>
            <h3>What year?</h3>
            <div className="row">
              {[['1', 'First year (core + first electives)'], ['2', 'Second year (all electives)']].map(([v, l]) => (
                <button key={v} className={`chip ${p.year === v ? 'on' : ''}`} onClick={() => set('year', v)}>{l}</button>
              ))}
            </div>
            {p.program === 'MBA' && p.year === '1' && (
              <>
                <h3>Your cohort</h3>
                <div className="row">
                  {COHORTS.map((c) => (
                    <button key={c} className={`chip ${p.cohort === c ? 'on' : ''}`} onClick={() => set('cohort', c)}>{c}</button>
                  ))}
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
                <button key={b} className={`chip ${p.background.startsWith(b) ? 'on' : ''}`} onClick={() => set('background', b)}>{b}</button>
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
                <button key={t} className={`chip ${p.interests.includes(t) ? 'on' : ''}`} onClick={() => toggleInterest(t)}>
                  {t}
                </button>
              ))}
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h3>Short-term goal <span className="muted small">(internship, recruiting, next 12 months)</span></h3>
            <div className="row">
              {SHORT_GOALS.map((g) => <button key={g} className="chip" onClick={() => setP((x) => ({ ...x, goal_short: x.goal_short ? `${x.goal_short}; ${g}` : g }))}>+ {g}</button>)}
            </div>
            <textarea value={p.goal_short} maxLength={380} onChange={(e) => set('goal_short', e.target.value)} placeholder="e.g. Summer internship in healthcare private equity" />
            <h3>Long-term goal <span className="muted small">(5–10 years)</span></h3>
            <div className="row">
              {LONG_GOALS.map((g) => <button key={g} className="chip" onClick={() => setP((x) => ({ ...x, goal_long: x.goal_long ? `${x.goal_long}; ${g}` : g }))}>+ {g}</button>)}
            </div>
            <textarea value={p.goal_long} maxLength={380} onChange={(e) => set('goal_long', e.target.value)} placeholder="e.g. Lead a healthcare services company" />
          </>
        )}

        {step === 4 && (
          <>
            <h3>Your schedule vibe</h3>
            <div className="choice-grid">
              {TIMES.map((t) => (
                <button key={t.v} className={`choice ${(p.prefs.no_before ?? 0) === t.v ? 'on' : ''}`} onClick={() => setPref('no_before', t.v || undefined)}>
                  <span className="big">{t.big}</span>{t.label}
                </button>
              ))}
            </div>
            <label className="toggle"><input type="checkbox" checked={Boolean(p.prefs.fridays_free)} onChange={(e) => setPref('fridays_free', e.target.checked)} /> Keep Fridays free (recruiting trips, life)</label>
            <div className="row">
              <span className="muted small">Avoid these days:</span>
              {['M', 'T', 'W', 'Th'].map((d) => (
                <button key={d} className={`chip ${avoid.includes(d) ? 'on' : ''}`}
                  onClick={() => setPref('avoid_days', avoid.includes(d) ? avoid.filter((x) => x !== d) : [...avoid, d])}>{d}</button>
              ))}
            </div>
            <label className="field">Courses you’ve already taken or are taking (optional, course numbers)
              <input value={completedText} onChange={(e) => setCompletedText(e.target.value)} placeholder="e.g. MGT 402, MGT 403, MGT 525" />
            </label>
            <label className="field">Global Studies days already used (of your 10 funded GSA days)
              <input type="number" min={0} max={10} value={p.gsa_days_used} onChange={(e) => set('gsa_days_used', Math.max(0, Math.min(10, Number(e.target.value) || 0)))} />
            </label>
          </>
        )}
      </div>

      <div className="row between mt">
        <button className="btn ghost" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>← Back</button>
        <div className="row">
          {step < STEPS.length - 1 ? (
            <button className="btn primary" disabled={!canNext} onClick={() => setStep((s) => s + 1)}>Next →</button>
          ) : (
            <>
              <button className="btn" disabled={saving} onClick={() => save('find')}>Save and run AI deep dive</button>
              <button className="btn primary" disabled={saving} onClick={() => save('home')}>Save and see my desk</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
