/* Faculty in the Course Explorer: a warm, respectful card for one person, and the daily spotlight shown when nothing
   is selected. Every fact comes from the SOM course catalog (name, courses and sessions this year, course topics);
   nothing is invented: no bios, titles, photos or ratings. */
import type { ReactNode } from 'react'
import { ArrowRight, Check, ExternalLink, Search } from 'lucide-react'
import HandsomeDan from '../mascots/HandsomeDan'
import { TERM_NAMES, prettyDate } from '../lib/format'
import { courseCount, profileLink, type Faculty, type FacultyCourse } from '../lib/faculty'

export function Avatar({ f, size = 'md' }: { f: Pick<Faculty, 'initials' | 'display'>; size?: 'sm' | 'md' | 'lg' }) {
  return <span className={`cx-ava ${size}`} aria-hidden title={f.display}>{f.initials}</span>
}

function StatusPill({ c }: { c: FacultyCourse }) {
  if (c.status === 'done') return <span className="cx-pill plain"><Check className="icon xs" />Done</span>
  if (c.status === 'now') return <span className="cx-pill in">In session</span>
  return <span className="cx-pill plain">{c.starts ? `Starts ${prettyDate(c.starts).replace(/^\w+, /, '')}` : 'Coming up'}</span>
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

/** Their official SOM profile when the catalog links one that resolves, otherwise the directory search. */
export function ProfileLink({ f }: { f: Faculty }) {
  const link = profileLink(f)
  return (
    <a className="small cx-fac-link" href={link.url} target="_blank" rel="noreferrer">
      {link.official ? 'Official SOM faculty profile' : 'Find them in the SOM faculty directory'}<ExternalLink className="icon sm" />
    </a>
  )
}

export function FacultyCard({ f, byName, label, onOpenCourse, onOpenPerson, pageHref, extra }: {
  f: Faculty; byName: Map<string, Faculty>; label?: string; onOpenCourse: (key: string) => void; onOpenPerson: (name: string) => void
  /** Link to this person's Faculty page (signed-in app only). */
  pageHref?: string
  /** One more link for the footer, e.g. "check their courses against your week". */
  extra?: ReactNode
}) {
  const team = [...new Set(f.courses.flatMap((c) => c.team))].map((n) => byName.get(n)).filter((x): x is Faculty => Boolean(x))
    .sort((a, b) => a.last.localeCompare(b.last))
  const done = f.courses.filter((c) => c.status === 'done').length
  return (
    <article className="cx-card cx-fac" aria-label={`Faculty: ${f.display}`}>
      <div className="cx-fac-head">
        <Avatar f={f} size="lg" />
        <div style={{ minWidth: 0 }}>
          <div className="course-num cx-fac-label">{label ?? 'Faculty · 2026–27'}</div>
          <h4 className="cx-fac-name">{f.display}</h4>
          <div className="cx-meta small muted">
            <span>{courseCount(f)} this year</span>
            <span>{plural(f.sections, 'section')}</span>
            <span>{f.terms.map((t) => TERM_NAMES[t] ?? t).join(' & ')}</span>
          </div>
        </div>
      </div>

      <div>
        <div className="section-label"><span>In the classroom this year</span>{done > 0 && <span className="faint">{done} already done</span>}</div>
        <ul className="cx-fac-courses">
          {f.courses.map((c) => (
            <li key={c.key}>
              <button type="button" onClick={() => onOpenCourse(c.key)} className={c.status === 'done' ? 'done' : ''}>
                <span className="cx-row-top">
                  <span className="course-num">{c.lead.number}</span>
                  <span className="cx-row-title">{c.lead.title}</span>
                </span>
                <span className="cx-row-meta faint small">
                  {TERM_NAMES[c.lead.term]}{c.lead.session_name ? ` · ${c.lead.session_name}` : ''}
                  {c.status === 'done' && c.ends ? ` · ended ${prettyDate(c.ends)}` : ` · ${plural(c.secs.length, 'section')}`}
                </span>
                <StatusPill c={c} />
              </button>
            </li>
          ))}
        </ul>
      </div>

      {f.topics.length > 0 && (
        <div>
          <div className="section-label"><span>Themes across their courses</span></div>
          <div className="cx-fac-topics">{f.topics.slice(0, 8).map((t) => <span key={t} className="cx-pill plain">{t}</span>)}</div>
        </div>
      )}

      {team.length > 0 && (
        <div>
          <div className="section-label"><span>Teaches alongside</span></div>
          <div className="cx-fac-team">
            {team.map((p) => (
              <button key={p.name} type="button" className="chip" onClick={() => onOpenPerson(p.name)}>
                <Avatar f={p} size="sm" />
                <span className="cx-fac-chip-name">{p.display}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="cx-fac-foot">
        <div className="cx-fac-links">
          <ProfileLink f={f} />
          {pageHref && <a className="small cx-fac-link" href={pageHref}>Open their faculty page<ArrowRight className="icon sm" /></a>}
          {extra}
        </div>
        <p className="faint small">From the SOM course catalog: courses, sessions and course topics only.</p>
      </div>
    </article>
  )
}

/** Shown when no course or person is picked: what the pane does, plus a few faculty, rotating daily (never random). */
export function FacultySpotlight({ people, total, onOpenPerson }: { people: Faculty[]; total: number; onOpenPerson: (name: string) => void }) {
  return (
    <div className="cx-welcome">
      <div className="cx-welcome-top">
        <Search className="icon lg faint" />
        <p className="muted">Pick a course to see whether you can take it, which sections fit your week, and what it covers.</p>
      </div>
      {people.length > 0 && (
        <section className="cx-spot" aria-labelledby="cx-spot-title">
          <div className="cx-spot-head">
            <HandsomeDan size={44} />
            <div style={{ minWidth: 0 }}>
              <h5 id="cx-spot-title">Meet the faculty</h5>
              <p className="small muted">{total} faculty teach SOM courses this year. Search any name above, or say hello to today’s spotlight.</p>
            </div>
          </div>
          <ul className="cx-spot-grid">
            {people.map((f) => {
              const next = f.courses.find((c) => c.status !== 'done') ?? f.courses[0]
              return (
                <li key={f.name}>
                  <button type="button" onClick={() => onOpenPerson(f.name)}>
                    <Avatar f={f} />
                    <span className="cx-spot-text">
                      <span className="cx-spot-name">{f.display}</span>
                      <span className="faint small cx-spot-sub">{next ? `${next.lead.number} ${next.lead.title}` : ''}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
          <p className="faint small cx-spot-note">The spotlight changes every day.</p>
        </section>
      )}
    </div>
  )
}
