import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchCourses } from './api'
import type { Course } from './api'
import { FACETS, EMPTY_SELECTION, matches, valuesFor } from './facets'
import { fitsAlongside, planClashes } from './schedule'
import type { FacetKey, Selection } from './facets'
import { DanLegend } from './components/DanLegend'
import { FilterBar } from './components/FilterBar'
import { CampusGuide } from './components/CampusGuide'
import { FacultyDialog } from './components/FacultyDialog'
import { buildFaculty } from './faculty'
import { InstructorBrowser } from './components/InstructorBrowser'
import { QuickViews } from './components/QuickViews'
import { Wordmark } from './components/Wordmark'
import { quickViews } from './quickViews'
import type { QuickView } from './quickViews'
import { clearPlanParam, planFromUrl } from './share'
import { CoreSchedule } from './components/CoreSchedule'
import { loadProfile, saveProfile } from './profile'
import type { Profile } from './profile'
import { HowTo } from './components/HowTo'
import { ProfileBar } from './components/ProfileBar'
import { ViewTabs } from './components/ViewTabs'
import type { View } from './components/ViewTabs'
import { MyPlan } from './components/MyPlan'
import { TermPlanner } from './components/TermPlanner'

const PLAN_KEY = 'som-course-plan'
import ChatPanel from './components/ChatPanel'
import CourseCard from './components/CourseCard'

/** One-click starting points, so the hero does something useful. */

export default function App() {
  const [query, setQuery] = useState('')
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selection, setSelection] = useState<Selection>(EMPTY_SELECTION)
  const [picked, setPicked] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(PLAN_KEY)
      return raw ? (JSON.parse(raw) as string[]) : []
    } catch {
      return []
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(PLAN_KEY, JSON.stringify(picked))
    } catch {
      // A full or blocked localStorage should not break browsing.
    }
  }, [picked])

  /** An explicit course list pinned from the planner, outside the facet model. */
  const [refreshed, setRefreshed] = useState<string>('')
  const [pinned, setPinned] = useState<{ keys: string[]; label: string } | null>(null)
  const [view, setView] = useState<View>('browse')
  const [facultyRaw, setFacultyRaw] = useState<string | null>(null)
  const [browseMode, setBrowseMode] = useState<'courses' | 'instructors'>('courses')
  const [profile, setProfileState] = useState<Profile>(() => loadProfile())
  const [quickId, setQuickId] = useState<string | null>(null)
  const [quickPredicate, setQuickPredicate] = useState<((g: { key: string; course: Course; sections: Course[] }) => boolean) | null>(null)
  const [fitsOnly, setFitsOnly] = useState(false)

  const setProfile = (p: Profile) => {
    setProfileState(p)
    saveProfile(p)
  }


  const [sharedFrom, setSharedFrom] = useState<string[] | null>(null)

  const togglePick = (key: string) =>
    setPicked((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    )

  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(() => {
      setLoading(true)
      fetchCourses(query, controller.signal)
        .then((res) => {
          setCourses(res.courses)
          setRefreshed(res.refreshed ?? '')
          setError('')
        })
        .catch((e: unknown) => {
          if (e instanceof DOMException && e.name === 'AbortError') return
          setError('Could not load courses. Start the backend: uvicorn main:app --port 8000')
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false)
        })
    }, 250)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query])

  // One row per section in the catalog, so collapse to one card per course.
  // Keying on the number alone is wrong: MGT 600 is 26 different Global
  // Network courses sharing one number, so the title is part of the key.
  const groups = useMemo(() => {
    const map = new Map<string, Course[]>()
    for (const c of courses) {
      const title = (c['Course Title'] ?? '')
        .toLowerCase()
        .replace(/&/g, 'and')
        .replace(/[^a-z0-9]/g, '')
      const key = `${c['Course Number'] || c['Course ID']}|${title}`
      const bucket = map.get(key)
      if (bucket) bucket.push(c)
      else map.set(key, [c])
    }
    return [...map.entries()].map(([key, rows]) => ({
      key,
      course: rows[0],
      sections: [...rows].sort((a, b) => (a.Section ?? '').localeCompare(b.Section ?? '')),
    }))
  }, [courses])

  const chosenGroups = useMemo(
    () => picked.map((k) => groups.find((g) => g.key === k)).filter(Boolean) as typeof groups,
    [picked, groups],
  )

  const shown = useMemo(() => {
    const base = pinned
      ? groups.filter((g) => pinned.keys.includes(g.key))
      : groups.filter((g) => matches(g.course, selection))
    const shaped = quickPredicate ? base.filter(quickPredicate) : base
    if (!fitsOnly || chosenGroups.length === 0) return shaped
    return shaped.filter((g) => fitsAlongside(g, chosenGroups))
  }, [groups, selection, pinned, fitsOnly, chosenGroups, quickPredicate])

  // Counts describe courses, not section rows.
  const options = useMemo(() => {
    const out = {} as Record<FacetKey, [string, number][]>
    for (const f of FACETS) {
      const counts = new Map<string, number>()
      for (const g of groups) {
        for (const v of valuesFor(g.course, f.key)) {
          counts.set(v, (counts.get(v) ?? 0) + 1)
        }
      }
      out[f.key] = [...counts.entries()].sort((a, b) => b[1] - a[1])
    }
    return out
  }, [groups])

  const hardClashes = useMemo(() => {
    const chosen = picked
      .map((k) => groups.find((g) => g.key === k))
      .filter(Boolean) as typeof groups
    return planClashes(chosen).filter((c) => c.kind === 'hard').length
  }, [picked, groups])

  const terms = useMemo(
    // Fall before Spring, not alphabetical.
    () =>
      (options.semester ?? [])
        .map(([name]) => name)
        .sort((a, b) => (a.startsWith('Fall') ? -1 : 1) - (b.startsWith('Fall') ? -1 : 1)),
    [options],
  )

  // A ?plan= link carries course numbers; match them to this catalog once.
  const sharedApplied = useRef(false)
  useEffect(() => {
    if (sharedApplied.current || groups.length === 0) return
    const shared = planFromUrl()
    if (!shared) return
    sharedApplied.current = true

    const keys: string[] = []
    const missing: string[] = []
    const sections: Record<string, string> = {}
    for (const number of shared.numbers) {
      const match = groups.find(
        (g) => g.course['Course Number'].trim() === number.trim(),
      )
      if (match) {
        keys.push(match.key)
        const sec = shared.sections[number]
        if (sec) sections[match.key] = sec
      } else {
        missing.push(number)
      }
    }
    if (keys.length > 0) {
      // Reading the URL is exactly the external system an effect is for; the
      // guard above makes sure this runs once per load.
      // eslint-disable-next-line react/set-state-in-effect
      setPicked(keys)
      if (Object.keys(sections).length > 0) {
        try {
          localStorage.setItem('som-section-choice', JSON.stringify(sections))
        } catch {
          // Section pins are a nicety; the plan still loads without them.
        }
      }
      // eslint-disable-next-line react/set-state-in-effect
      setSharedFrom(missing)
      // eslint-disable-next-line react/set-state-in-effect
      setView('myplan')
    }
    clearPlanParam()
  }, [groups])

  const views = useMemo(
    () => quickViews(profile, picked.length > 0),
    [profile, picked.length],
  )

  const applyQuickView = (v: QuickView) => {
    if (quickId === v.id) {
      setQuickId(null)
      setQuickPredicate(null)
      setFitsOnly(false)
      setSelection(EMPTY_SELECTION)
      return
    }
    setQuickId(v.id)
    setPinned(null)
    setBrowseMode('courses')
    setView('browse')
    setFitsOnly(v.id === 'fits')
    setQuickPredicate(v.predicate ? () => v.predicate! : null)
    setSelection({ ...EMPTY_SELECTION, ...(v.sel ?? {}) })
  }

  const facultyList = useMemo(() => buildFaculty(groups), [groups])


  const openFaculty = facultyRaw
    ? facultyList.find((f) => f.raw === facultyRaw) ?? null
    : null

  const facultyCount = useMemo(
    () => new Set(courses.map((c) => c['Faculty 1']?.trim()).filter(Boolean)).size,
    [courses],
  )

  const applyQuick = (sel: Partial<Selection>) =>
    setSelection({ ...EMPTY_SELECTION, ...sel })

  return (
    <>
      <header className="hero">
        <div className="hero__inner">
          <div className="hero__bar">
            <Wordmark />
            <a className="hero__howto" href="#how-to-use">
              <span aria-hidden="true">?</span> How to use this
            </a>
          </div>

          <div className="hero__main">
            <div className="hero__left">
              <h1>Course Explorer</h1>
              <p className="hero__pitch">
                The whole academic year in one place — every course, the degree
                requirements behind it, and a planner that catches clashes
                before the registrar does.
              </p>

              <input
                className="search"
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setSelection(EMPTY_SELECTION)
                }}
                placeholder="Search by title, number, professor, day…"
                aria-label="Search courses"
              />

              <p className="hero__facts">
                <b>{groups.length || '—'}</b> courses
                <i aria-hidden="true">·</i>
                <b>{facultyCount || '—'}</b> instructors
                <i aria-hidden="true">·</i>
                <b>{options.subject?.length || '—'}</b> subjects
                <i aria-hidden="true">·</i>
                {terms.join(' & ')}
              </p>
            </div>

            <aside className="hero__side">
              <ProfileBar
                profile={profile}
                programmes={(options.program ?? []).map(([name]) => name)}
                onChange={setProfile}
              />
            </aside>
          </div>

          <QuickViews
            views={views}
            activeId={quickId}
            onPick={(v) => applyQuickView(v)}
            onClear={() => {
              setQuickId(null)
              setQuickPredicate(null)
              setFitsOnly(false)
              setSelection(EMPTY_SELECTION)
            }}
          />
        </div>
      </header>

      <ViewTabs
        view={view}
        onChange={setView}
        planCount={picked.length}
        clashCount={hardClashes}
        total={groups.length}
      />

      <main className="main">
        {view === 'browse' && (
          <>

            <div className="toolbar">
            <div className="modeswitch" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={browseMode === 'courses'}
                className={browseMode === 'courses' ? 'is-on' : ''}
                onClick={() => setBrowseMode('courses')}
              >
                Courses
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={browseMode === 'instructors'}
                className={browseMode === 'instructors' ? 'is-on' : ''}
                onClick={() => setBrowseMode('instructors')}
              >
                Instructors <b>{facultyList.length}</b>
              </button>
            </div>

              {browseMode === 'courses' && (
                <div className="toolbar__filters">
                  {pinned ? (
                    <div className="pinned">
                      Showing <strong>{pinned.label}</strong> — {pinned.keys.length}{' '}
                      {pinned.keys.length === 1 ? 'course' : 'courses'}
                      <button type="button" onClick={() => setPinned(null)}>
                        Back to all courses
                      </button>
                    </div>
                  ) : (
                    <FilterBar
                      options={options}
                      total={groups.length}
                      shown={shown.length}
                      selection={selection}
                      onChange={setSelection}
                    />
                  )}
                </div>
              )}
              {browseMode === 'courses' && <DanLegend options={options} />}
            </div>

            {error ? <p className="notice notice--error">{error}</p> : null}
            {loading && courses.length === 0 && !error ? (
              <p className="notice">Loading courses…</p>
            ) : null}
            {!loading && !error && shown.length === 0 ? (
              <p className="notice">No courses match those filters.</p>
            ) : null}

            {browseMode === 'instructors' ? (
              <InstructorBrowser
                faculty={facultyList}
                onOpen={setFacultyRaw}
                onShowCourses={(keys, label) => {
                  setBrowseMode('courses')
                  setPinned({ keys, label })
                }}
              />
            ) : !error ? (
              <>
                <p className="count">
                  {shown.length} {shown.length === 1 ? 'course' : 'courses'}
                  <span className="count__term">
                    {terms.length > 1
                      ? `${terms.join(' and ')} — filter by semester above`
                      : terms[0]}
                  </span>
                  {refreshed && (
                    <span className="count__term" title="From the SOM course export">
                      Data as of {refreshed}
                    </span>
                  )}
                </p>
                <div className={`grid ${loading ? 'grid--loading' : ''}`}>
                  {shown.map((g) => (
                    <CourseCard
                      key={g.key}
                      course={g.course}
                      sections={g.sections}
                      picked={picked.includes(g.key)}
                      onTogglePick={() => togglePick(g.key)}
                      onOpenFaculty={setFacultyRaw}
                    />
                  ))}
                </div>
              </>
            ) : null}
          </>
        )}

        {view === 'plan' && (
          <TermPlanner
            groups={groups}
            programmes={(options.program ?? []).map(([name]) => name)}
            initialProgramme={profile.programme || undefined}
            initialRequirement="Any"
            initialYear={profile.year || undefined}
            onJump={(sel) => {
              setPinned(null)
              applyQuick(sel)
              setView('browse')
            }}
            onShowCourses={(keys, label) => {
              setSelection(EMPTY_SELECTION)
              setQuery('')
              setPinned({ keys, label })
              setView('browse')
            }}
          />
        )}

        {view === 'campus' && <CampusGuide />}

        {view === 'core' && (
          <CoreSchedule
            groups={groups}
            cohort={profile.cohort || undefined}
            year={profile.year || undefined}
            onGoToPlan={() => setView('myplan')}
          />
        )}

        {view === 'myplan' && sharedFrom && (
          <div className="sharedbanner">
            <strong>You&apos;re looking at a shared plan.</strong> It replaced
            whatever was in this browser.
            {sharedFrom.length > 0 && (
              <>
                {' '}
                {sharedFrom.length} course
                {sharedFrom.length === 1 ? '' : 's'} in the link
                {sharedFrom.length === 1 ? ' is' : ' are'} not in this catalog:{' '}
                {sharedFrom.join(', ')}.
              </>
            )}
            <button type="button" onClick={() => setSharedFrom(null)}>
              Got it
            </button>
          </div>
        )}

        {view === 'myplan' && (
          <MyPlan
            groups={groups}
            picked={picked}
            onRemove={togglePick}
            onClear={() => setPicked([])}
            onBrowse={() => setView('browse')}
            allGroups={groups}
            onOpenCourse={(key) => {
              setPinned({ keys: [key], label: 'One course' })
              setBrowseMode('courses')
              setView('browse')
            }}
          />
        )}
        <HowTo />

        <footer className="credit">
          <span>
            Designed by <strong>Mukul Gupta</strong>, Yale SOM MBA class of 2028.
          </span>
          <span className="credit__note">
            Course data from SOM&apos;s own export; requirements and term dates
            transcribed from Yale&apos;s published pages. Not an official Yale
            site — confirm anything that matters with your advisor.
          </span>
        </footer>
      </main>

      {view !== 'myplan' && picked.length > 0 && (
        <button
          type="button"
          className={`planpill${hardClashes > 0 ? ' has-clash' : ''}`}
          onClick={() => setView('myplan')}
        >
          <b>{picked.length}</b> in my plan
          {hardClashes > 0 && <em>{hardClashes} clash</em>}
        </button>
      )}

      {openFaculty && (
        <FacultyDialog
          faculty={openFaculty}
          onClose={() => setFacultyRaw(null)}
          onOpenCourse={(key) => {
            setFacultyRaw(null)
            setBrowseMode('courses')
            setPinned({ keys: [key], label: 'One course' })
            setView('browse')
          }}
        />
      )}

      <ChatPanel profile={{ programme: profile.programme, year: profile.year }} />
    </>
  )
}
