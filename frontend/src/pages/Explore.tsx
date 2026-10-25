/* Course explorer (signed in): the same master/detail explorer as the home page (components/CourseExplorer), wired to
   the student's real profile and plan. Every course says whether it's open to you (with the specific reason if not)
   and whether each section fits your week (your plan plus the core SOM schedules for you); adding goes straight into
   My plan. Around it: one fixed-height prompt strip (review your goals when they're empty or stale, otherwise a small
   "ask Dan about courses"), and Elihu's box between the 2nd and 3rd course. Nothing here changes the page length. */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { MessageCircle, UserRound, X } from 'lucide-react'
import { api, type Section } from '../api'
import CourseExplorer from '../components/CourseExplorer'
import Elihu from '../mascots/Elihu'
import { setElihuContext } from '../lib/elihu'
import { useApp } from '../state'
import './explore.css'

/** Goals older than this get a gentle "still true?" (about one term). */
const STALE_DAYS = 120
const TERMS = ['202603', '202701']
const facultyHref = (name: string) => `#/faculty/${encodeURIComponent(name)}`

export default function Explore() {
  const { plan, profile, sectionById, addCourse, refreshPlan, undoToast, toast, routeArg, shortlist, go } = useApp()
  const program = profile?.program || 'MBA'
  const who = useMemo(() => ({ program, year: profile?.year ?? '', cohort: profile?.cohort ?? '' }), [program, profile?.year, profile?.cohort])

  // The core SOM already schedules for this student (both terms), so clash checks see their real week.
  const [coreIds, setCoreIds] = useState<string[]>([])
  useEffect(() => {
    let live = true
    if (!profile) { setCoreIds([]); return }
    Promise.all(TERMS.map((term) => api.starterWeek({ program: who.program, year: who.year, cohort: who.cohort, term })
      .then((r) => (r.example ? [] : r.ids)).catch(() => [] as string[])))
      .then((lists) => { if (live) setCoreIds([...new Set(lists.flat())]) })
    return () => { live = false }
  }, [profile, who])

  const week = useMemo(() => {
    const seen = new Map<string, Section>()
    for (const id of coreIds) { const s = sectionById.get(id); if (s) seen.set(s.id, s) }
    for (const i of plan?.items ?? []) seen.set(i.section.id, i.section)
    return [...seen.values()]
  }, [coreIds, sectionById, plan])

  // Returned promises keep the explorer's Add buttons disabled until the request settles (no double adds).
  const onAdd = useCallback((s: Section) => addCourse(s.id), [addCourse])
  // In session with add/drop closed: the backend only takes it as "enrolled" (for students already in the class).
  const onEnroll = useCallback(async (s: Section) => {
    try {
      const r = await api.addToPlan(s.id, 'student', 'enrolled')
      await refreshPlan()
      undoToast(`Added ${s.number} as enrolled`, r.action_id)
    } catch (e) { toast((e as Error).message, 'bad') }
  }, [refreshPlan, undoToast, toast])

  const leadByKey = useMemo(() => {
    const m = new Map<string, Section>()
    for (const s of sectionById.values()) if (!m.has(s.key)) m.set(s.key, s)
    return m
  }, [sectionById])

  // Elihu's box: the course you're looking at plus your starred ones travel with you to his page.
  const elihuSlot = useCallback(({ selectedKey }: { selectedKey: string | null }) => {
    const keys = [...(selectedKey ? [selectedKey] : []), ...shortlist.keys()].filter((k, i, a) => a.indexOf(k) === i).slice(0, 4)
    const sel = selectedKey ? leadByKey.get(selectedKey) : undefined
    const sub = sel ? `He’ll weigh ${sel.number}${keys.length > 1 ? ` and ${keys.length - 1} starred` : ''} against your goals`
      : keys.length ? `He’ll weigh your ${keys.length} starred course${keys.length === 1 ? '' : 's'} against your goals`
        : 'He reads your goals and picks a shortlist'
    return (
      <button type="button" className="xp-elihu elihu-host" onClick={() => { setElihuContext(keys); go('find') }}
        aria-label="Stuck between two electives? Ask Elihu">
        <Elihu size={30} />
        <span className="xp-elihu-text">
          <span className="xp-elihu-q">Stuck between two electives?</span>
          <span className="faint small xp-elihu-sub">{sub}</span>
        </span>
        <span className="xp-elihu-go">Ask Elihu</span>
      </button>
    )
  }, [shortlist, leadByKey, go])

  return (
    <div className="xp">
      <div className="page-head">
        <div>
          <h1>Course explorer</h1>
          <p>Every SOM course this year, and who teaches it. Pick one to see if it’s open to you and which sections fit your week, then add it to your plan.</p>
        </div>
      </div>

      <PromptStrip />

      <CourseExplorer variant="page" who={who} week={week} autoIds={coreIds} onAdd={onAdd} onEnroll={onEnroll}
        initialFaculty={routeArg || undefined} listSlot={elihuSlot} facultyHref={facultyHref} />
    </div>
  )
}

const SUGGESTIONS = ['How does course bidding work?', 'Which electives count for Leadership?', 'What’s a good elective load for spring?']

/** One fixed-height strip: a dismissible "review your goals" when they're empty or stale, otherwise "ask Dan". */
function PromptStrip() {
  const { user, profile, profileSavedAt, go } = useApp()
  const empty = Boolean(profile) && !profile!.goal_short.trim() && !profile!.goal_long.trim()
  const ageDays = profileSavedAt ? Math.floor((Date.now() - Date.parse(profileSavedAt)) / 86_400_000) : 0
  const stale = !empty && ageDays > STALE_DAYS
  const state = empty ? 'empty' : stale ? `stale:${profileSavedAt}` : ''
  const storeKey = user ? `pwd-goals-nudge:${user.id}` : ''
  const [dismissed, setDismissed] = useState<string | null>(() => (storeKey ? localStorage.getItem(storeKey) : null))
  useEffect(() => { setDismissed(storeKey ? localStorage.getItem(storeKey) : null) }, [storeKey])
  const nudge = Boolean(state) && dismissed !== state
  const dismiss = () => { try { localStorage.setItem(storeKey, state) } catch { /* private mode */ } setDismissed(state) }
  const ask = (text?: string) => window.dispatchEvent(new CustomEvent('dan:ask', { detail: text ?? '' }))
  const months = Math.max(1, Math.round(ageDays / 30))

  if (nudge) {
    return (
      <div className="xp-strip nudge" role="note">
        <UserRound className="icon sm xp-strip-icon" aria-hidden />
        <p className="xp-strip-text">
          {empty ? <><b>Add your goals</b> so Dan and Elihu can tell you which of these courses matter for you. Two sentences is plenty.</>
            : <><b>Goals set {months} month{months === 1 ? '' : 's'} ago.</b> Still true? A quick look keeps Dan’s and Elihu’s picks sharp.</>}
        </p>
        <div className="xp-strip-actions">
          <button type="button" className="btn sm primary" onClick={() => go('profile')}>{empty ? 'Add goals' : 'Review profile'}</button>
          <button type="button" className="btn icon ghost xp-strip-x" aria-label="Dismiss this reminder" onClick={dismiss}><X className="icon sm" /></button>
        </div>
      </div>
    )
  }
  return (
    <div className="xp-strip" role="note">
      <MessageCircle className="icon sm xp-strip-icon" aria-hidden />
      <p className="xp-strip-text"><b>Questions about a course?</b> <span className="muted">Ask Dan about bidding, workload or requirements.</span></p>
      <div className="xp-strip-actions">
        {SUGGESTIONS.map((s, i) => (
          <button key={s} type="button" className={`chip xp-strip-chip n${i}`} onClick={() => ask(s)}>{s}</button>
        ))}
        <button type="button" className="btn sm xp-strip-ask" onClick={() => ask()}>Ask Dan</button>
      </div>
    </div>
  )
}
