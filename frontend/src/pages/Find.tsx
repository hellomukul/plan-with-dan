/* Course picks (Elihu): one flow. The student writes a goal, Elihu ranks real SOM courses by usefulness across every
   quarter they have left, the student ticks what to keep, and adds them in one click (components/PackageBuilder).
   When the student arrives from the Course explorer's "Stuck between two electives?" box, the courses they were
   weighing show side by side above it. The older one-term finder (POST /api/recommend) stays in the API for Dan's
   chat, but has no separate tab any more: two ways to get picks confused students. */
import { useMemo, useState } from 'react'
import { type Section } from '../api'
import CourseDrawer from '../components/CourseDrawer'
import PackageBuilder from '../components/PackageBuilder'
import { Check, MessageCircle, ScrollText, X } from 'lucide-react'
import Elihu from '../mascots/Elihu'
import { clearElihuContext, readElihuContext } from '../lib/elihu'
import { blockedLabel, courseVerdict } from '../lib/eligibility'
import { displayName } from '../lib/faculty'
import { enrollLabel, TERM_NAMES } from '../lib/format'
import { useApp } from '../state'
import './find.css'

/** The courses the student was weighing up in the Course explorer, side by side, with facts only. */
function Weighing({ keys, picked, onOpen, onClear }: { keys: string[]; picked: Set<string>; onOpen: (key: string) => void; onClear: () => void }) {
  const { sections, profile } = useApp()
  const who = { program: profile?.program || 'MBA', year: profile?.year ?? '', cohort: profile?.cohort ?? '' }
  const courses = keys.map((k) => sections.filter((s) => s.key === k)).filter((secs): secs is Section[] => secs.length > 0)
  if (!courses.length) return null
  const names = courses.map((secs) => secs[0].number)
  const label = (secs: Section[]) => `${secs[0].number} ${secs[0].title}`
  const ask = () => window.dispatchEvent(new CustomEvent('dan:ask', {
    detail: courses.length === 1 ? `Is ${label(courses[0])} a good fit for my goals and my week?`
      : `Help me choose between ${courses.map(label).join(' and ')}, given my goals and my week.`,
  }))
  return (
    <section className="card mt fd-weigh" aria-labelledby="fd-weigh-title">
      <div className="fd-weigh-head">
        <h3 id="fd-weigh-title"><ScrollText className="icon sm" />You were weighing up {names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`}</h3>
        <button type="button" className="btn icon ghost" aria-label="Clear these courses" onClick={onClear}><X className="icon sm" /></button>
      </div>
      <ul className="fd-weigh-grid">
        {courses.map((secs) => {
          const c = secs[0]
          const v = courseVerdict(secs, who)
          return (
            <li key={c.key}>
              <button type="button" className="fd-weigh-card" onClick={() => onOpen(c.key)}>
                <span className="course-num">{c.number} · {TERM_NAMES[c.term] ?? c.term_name}</span>
                <span className="fd-weigh-title">{c.title}</span>
                <span className="faint small fd-weigh-meta">{c.time || 'Time TBA'} · {c.units} units · {c.faculty[0] ? displayName(c.faculty[0]) : 'Faculty TBA'}</span>
                <span className="fd-weigh-pills">
                  {picked.has(c.key) ? <span className="cx-pill in"><Check className="icon xs" />In Elihu’s picks</span>
                    : v.open.length ? <span className="cx-pill plain">{enrollLabel(c.enrollment).text}</span>
                      : <span className="cx-pill no">{blockedLabel(v.verdict)}</span>}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      <p className="small muted fd-weigh-foot">
        Elihu picks from your goals; the cards above are facts from the catalog.{' '}
        <button type="button" className="link-btn" onClick={ask}><MessageCircle className="icon sm" style={{ verticalAlign: '-2px' }} /> {courses.length === 1 ? 'Ask Dan about it' : 'Ask Dan to compare them'}</button>
      </p>
    </section>
  )
}

export default function Find() {
  const [ctx, setCtx] = useState(readElihuContext)
  const [open, setOpen] = useState<string | null>(null)
  const picked = useMemo(() => new Set<string>(), [])
  return (
    <div className="fd">
      <div className="page-head fd-head elihu-host">
        <Elihu size={64} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <h1>Course picks</h1>
          <p>Tell Elihu, Dan’s course-picking owl, what you want from SOM. He ranks real courses for it across every quarter you have left, and you choose what goes in your plan.</p>
        </div>
      </div>
      {ctx && <Weighing keys={ctx.keys} picked={picked} onOpen={setOpen} onClear={() => { clearElihuContext(); setCtx(null) }} />}
      <PackageBuilder onOpenCourse={setOpen} />
      {open && <CourseDrawer courseKey={open} onClose={() => setOpen(null)} />}
    </div>
  )
}
