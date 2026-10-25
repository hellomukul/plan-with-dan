/* MBA-only rules on the home page's Requirements tab: Leadership Distribution, Global Studies and grading.
   Everything comes from /api/programs (backend/rules.py, 2026-27 Bulletin). Lists sit in fixed-height boxes,
   so picking a Global Studies option never changes the page length. */
import { useState, type KeyboardEvent } from 'react'
import { ExternalLink } from 'lucide-react'
import type { MbaRules, ReqCourse } from '../api'

function CourseList({ courses, empty }: { courses: ReqCourse[]; empty: string }) {
  if (!courses.length) return <p className="mr-empty faint small">{empty}</p>
  return (
    <ul className="mr-courses">
      {courses.map((c) => (
        <li key={c.key}><span className="course-num">{c.number}</span><span className="mr-ctitle">{c.title}</span><span className="faint">{c.term}</span></li>
      ))}
    </ul>
  )
}

export default function MbaRequirements({ rules, program }: { rules: MbaRules; program: string }) {
  const [pick, setPick] = useState(rules.gsr[0]?.key ?? '')
  const opt = rules.gsr.find((o) => o.key === pick) ?? rules.gsr[0]
  const cap = rules.pass_fail_cap[program] ?? rules.pass_fail_cap.MBA
  const onKey = (e: KeyboardEvent, i: number) => {
    const move = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key]
    if (!move) return
    e.preventDefault()
    const next = rules.gsr[(i + move + rules.gsr.length) % rules.gsr.length]
    setPick(next.key)
    document.getElementById(`mr-opt-${next.key}`)?.focus()
  }
  const countLabel = (o: MbaRules['gsr'][number]) =>
    !o.is_course ? 'apply' : o.courses.length ? `${o.courses.length} ${o.courses.length === 1 ? 'course' : 'courses'}` : 'none open'

  return (
    <div className="mr">
      <div className="mr-col">
        <section className="card ws-card mr-card" aria-labelledby="mr-ldr">
          <div className="section-label" id="mr-ldr"><span>Leadership Distribution Requirement</span></div>
          <p className="mr-lead">{rules.ldr.focus}</p>
          <p className="muted small">One course from SOM’s approved list, any time before graduation. The list lives on SOM’s internal site. {rules.ldr.petition}</p>
          <p className="muted small">Named by SOM as leadership electives: {rules.ldr.examples.join(', ')}.</p>
          <div className="mr-sub">Flagged as leadership electives this year ({rules.ldr.courses.length}) <span className="faint">· from SOM’s course feed, confirm on the internal list</span></div>
          <CourseList courses={rules.ldr.courses} empty="None flagged in SOM’s public course feed right now." />
          <div className="mr-src small">
            <a href={rules.ldr.source} target="_blank" rel="noreferrer">MBA curriculum (Yale Bulletin)<ExternalLink className="icon sm" /></a>
            <a href={rules.ldr.focus_source} target="_blank" rel="noreferrer">Leadership & Teams<ExternalLink className="icon sm" /></a>
          </div>
        </section>

        <section className="card ws-card mr-card" aria-labelledby="mr-grades">
          <div className="section-label" id="mr-grades"><span>How you’re graded</span></div>
          <table className="mr-table">
            <thead><tr><th>Grade</th><th>Share of the class</th><th>On transcript</th></tr></thead>
            <tbody>
              {rules.grading.map((g) => (
                <tr key={g.grade}><td><b>{g.grade}</b></td><td>{g.share}</td><td className={g.transcript ? 'yes' : 'faint'}>{g.transcript ? 'Yes' : 'No'}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="muted small">A forced distribution: only High Honors and Honors appear on your transcript. The Bulletin’s quality standard caps Pass and Fail grades at {cap} units across core and electives{program === 'MBA-JOINT' ? ' for joint-degree students' : ''}.</p>
          <div className="mr-src small">
            <a href={rules.grading_source} target="_blank" rel="noreferrer">MBA degree requirements (Yale Bulletin)<ExternalLink className="icon sm" /></a>
          </div>
        </section>
      </div>

      <section className="card ws-card mr-card mr-gsr" aria-labelledby="mr-gsr">
        <div className="section-label" id="mr-gsr"><span>Global Studies Requirement · any one of these</span></div>
        <p className="muted small" style={{ margin: 0 }}>You have {rules.gsa_days} funded travel days (the Global Studies Account). They’re never topped up, so pick with that in mind.</p>
        <div className="mr-opts" role="radiogroup" aria-labelledby="mr-gsr">
          {rules.gsr.map((o, i) => (
            <button key={o.key} id={`mr-opt-${o.key}`} type="button" role="radio" aria-checked={o.key === opt.key} tabIndex={o.key === opt.key ? 0 : -1}
              className={`mr-opt ${o.key === opt.key ? 'on' : ''}`} onClick={() => setPick(o.key)} onKeyDown={(e) => onKey(e, i)}>
              <span className="mr-opt-text">
                <b>{o.name}</b>
                <span className="faint small">{o.units ? `${o.units} units` : 'a full term'} · {o.gsa_days ? `uses ~${o.gsa_days} GSA days` : 'no GSA days'}</span>
              </span>
              <span className={`mr-count ${o.is_course && !o.courses.length ? 'none' : ''}`}>{countLabel(o)}</span>
            </button>
          ))}
        </div>
        <div className="mr-detail" aria-live="polite">
          <dl className="mr-kv small">
            <dt>When</dt><dd>{opt.timing}</dd>
            <dt>How to get in</dt><dd>{opt.enrol}</dd>
            <dt>Cost</dt><dd>{opt.cost}</dd>
          </dl>
          {opt.is_course
            ? <CourseList courses={opt.courses} empty="No sections open in SOM’s public course feed this year." />
            : <p className="mr-empty faint small">Not a course: you apply for it, so it isn’t in the catalog.</p>}
        </div>
        <div className="mr-src small">
          <a href={rules.gsr_source} target="_blank" rel="noreferrer">Global Studies Requirement<ExternalLink className="icon sm" /></a>
          <a href={rules.gsr_funding_source} target="_blank" rel="noreferrer">What SOM pays for<ExternalLink className="icon sm" /></a>
        </div>
      </section>
    </div>
  )
}
