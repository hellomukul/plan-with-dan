/* "Get help": four doors (career, academics, wellbeing, international & more). Pick one and get one card: the
   main person to see, the other places behind that door, and one big button.
   Plain links only: opening one is never recorded, sent anywhere or used for suggestions.
   Data lives in lib/helpGuide.ts; styles in help-guide.css under the .hg root. */
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { ArrowUpRight, Briefcase, CalendarPlus, Check, ChevronDown, Globe, GraduationCap, HeartHandshake, Phone } from 'lucide-react'
import { CHECKED, GROUPS, OPTIONS, RESOURCES, URGENT, byId, type HelpGroup, type HelpOption } from '../lib/helpGuide'
import { prettyDate } from '../lib/format'
import HandsomeDan from '../mascots/HandsomeDan'
import BookedForm from './BookedForm'
import './help-guide.css'

const KEY = 'pwd-help'
const GROUP_ICON: Record<HelpGroup, typeof Briefcase> = {
  career: Briefcase, academic: GraduationCap, wellbeing: HeartHandshake, more: Globe,
}
// Directory columns, in reading order and split so both end at nearly the same height (Career alone is 7
// rows). Explicit columns, because a row-by-row grid left a tall hole under the shorter group in each row.
const DIR_COLUMNS: HelpGroup[][] = [['career', 'more'], ['academic', 'wellbeing']]

/** The door's line icon (lucide, like the rest of the app). Wellbeing stays calm: same muted style as the others. */
function DoorIcon({ group }: { group: HelpGroup }) {
  const Icon = GROUP_ICON[group]
  return <span className="hg-door-icon" aria-hidden="true"><Icon className="icon" /></span>
}

export function UrgentLine({ compact = false }: { compact?: boolean }) {
  return (
    <p className={`hg-urgent ${compact ? 'compact' : ''}`}>
      <Phone className="icon sm" aria-hidden />
      <span>{URGENT.text} <a href={URGENT.tel}>{URGENT.phone}</a>. In the US you can also call or text <a href={URGENT.crisisTel}>988</a>.</span>
    </p>
  )
}

/* Two rows on a shared subgrid (what's behind this door / button), so the button is always the last row, at the
   same height for every door, level with the last door in the picker. Content sits at the top; spare room goes
   above the button. */
function Recommendation({ opt, on }: { opt: HelpOption; on: boolean }) {
  const primary = byId(opt.primary)
  return (
    <div className={`hg-rec-inner ${on ? 'on' : ''}`} aria-hidden={!on}>
      <div className="hg-rec-body">
        <h3>{opt.title}</h3>
        <div className="hg-tags">{opt.tags.map((t) => <span key={t} className="hg-tag">{t}</span>)}</div>
        <p className="hg-text">{opt.text}</p>
        {opt.urgent && <UrgentLine compact />}
        <ul className="hg-secondary" aria-label={`Also behind ${opt.label}`}>
        {opt.links.map((id) => {
          const r = byId(id)
          return (
            <li key={id}>
              <a href={r.url} target="_blank" rel="noreferrer" tabIndex={on ? 0 : -1}>
                <span className="hg-row-text"><b>{r.label}</b><span className="hg-row-note">{r.note}</span></span>
                <ArrowUpRight className="icon sm" aria-hidden />
              </a>
            </li>
          )
        })}
        </ul>
      </div>
      <a className="btn primary lg hg-go" href={primary.url} target="_blank" rel="noreferrer" tabIndex={on ? 0 : -1}>{opt.cta}</a>
    </div>
  )
}

export default function HelpGuide() {
  const [picked, setPicked] = useState<string>(() => {
    const saved = localStorage.getItem(KEY)
    return OPTIONS.some((o) => o.id === saved) ? saved! : OPTIONS[0].id
  })
  const [touched, setTouched] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [booking, setBooking] = useState(false)
  const pills = useRef<(HTMLButtonElement | null)[]>([])
  useEffect(() => { localStorage.setItem(KEY, picked) }, [picked])

  const opt = OPTIONS.find((o) => o.id === picked) ?? OPTIONS[0]
  const choose = (o: HelpOption) => { setPicked(o.id); setTouched(true) }
  const onKey = (e: KeyboardEvent, i: number) => {
    const move = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key]
    if (!move) return
    e.preventDefault()
    const next = (i + move + OPTIONS.length) % OPTIONS.length
    choose(OPTIONS[next])
    pills.current[next]?.focus()
  }

  return (
    <section className="hg" aria-labelledby="hg-title">
      <div className="hg-top">
        <div className="hg-card hg-picker">
          <div className="hg-picker-head">
            <div>
              <h2 id="hg-title">What do you need help with?</h2>
              {/* both lines share one grid cell, so swapping them never changes the header height on phones */}
              <p className="hg-sub">
                <span className={touched && !opt.calm ? '' : 'on'}>Pick one to see who can help.</span>
                <span className={touched && !opt.calm ? 'on' : ''}>Here’s where to go.</span>
              </p>
            </div>
            {/* in the header, not floating over the card edge; hidden (space kept) for the calm options */}
            <span className={`hg-mascot ${opt.calm ? 'off' : ''}`} aria-hidden="true"><HandsomeDan size={46} furColor="#f4b183" bandanaColor="#00356b" /></span>
          </div>
          <div className="hg-pills" role="radiogroup" aria-labelledby="hg-title">
            {OPTIONS.map((o, i) => (
              <button key={o.id} ref={(el) => { pills.current[i] = el }} type="button" role="radio" aria-checked={o.id === picked}
                tabIndex={o.id === picked ? 0 : -1} className={`hg-pill hg-door ${o.id === picked ? 'on' : ''}`}
                onClick={() => choose(o)} onKeyDown={(e) => onKey(e, i)}>
                <DoorIcon group={o.id} />
                <span className="hg-door-text"><b>{o.label}</b><span className="hg-door-hint">{o.hint}</span></span>
                <Check className="icon sm hg-check" aria-hidden />
              </button>
            ))}
          </div>
        </div>

        {/* Every recommendation sits in the same grid cell and only the picked one is visible, so the card is
            always as tall as the longest one and switching never changes the page length. */}
        <article className="hg-card hg-rec" aria-live="polite">
          <div className="hg-rec-stack">
            {OPTIONS.map((o) => <Recommendation key={o.id} opt={o} on={o.id === opt.id} />)}
          </div>
        </article>
      </div>

      <div className="hg-tiles">
        {/* same label / main line / note rows as the two tiles beside it, so all three line up */}
        <div className="hg-card hg-tile">
          <span className="hg-tile-label">NEED SOMEONE NOW</span>
          <a className="hg-tile-main hg-tel" href={URGENT.tel}><Phone className="icon" />{URGENT.phone}</a>
          <span className="hg-tile-sub">Yale Mental Health &amp; Counseling’s on-call clinician answers at any hour. In the US you can also call or text <a href={URGENT.crisisTel}>988</a>.</span>
        </div>
        <button type="button" className="hg-card hg-tile hg-tile-btn" onClick={() => setBooking(true)}>
          <span className="hg-tile-label">BOOKED ONE?</span>
          <span className="hg-tile-main"><CalendarPlus className="icon" />Add it to my calendar</span>
          <span className="hg-tile-sub">Add it so Dan can work around it.</span>
        </button>
        <button type="button" className="hg-card hg-tile hg-tile-btn" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll} aria-controls="hg-directory">
          <span className="hg-tile-label">SEE EVERYONE</span>
          <span className="hg-tile-main">{RESOURCES.length} people and offices<ChevronDown className={`icon ${showAll ? 'hg-rot' : ''}`} /></span>
          <span className="hg-tile-sub">career, academics, wellbeing, visas and more</span>
        </button>
      </div>

      <div id="hg-directory" className={`hg-dir ${showAll ? 'open' : ''}`}>
        <div className="hg-dir-inner">
          <div className="hg-card hg-dir-card">
            {DIR_COLUMNS.map((col, c) => <div key={c} className="hg-dir-col">{col.map((id) => {
              const g = GROUPS.find((x) => x.id === id)!
              const Icon = GROUP_ICON[g.id]
              return (
                <div key={g.id} className="hg-group">
                  <div className="hg-group-head"><span className={`hg-gicon g-${g.id}`}><Icon className="icon sm" /></span>{g.label}</div>
                  <ul>
                    {RESOURCES.filter((r) => r.group === g.id).map((r) => (
                      <li key={r.id}>
                        <a href={r.url} target="_blank" rel="noreferrer" tabIndex={showAll ? 0 : -1}>
                          <span className="hg-row-text"><b>{r.label}</b><span className="hg-row-note">{r.note}</span></span>
                          <span className={`hg-row-pill ${r.act}`}>{r.act === 'book' ? 'Book ↗' : 'Open ↗'}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                  {g.id === 'wellbeing' && <UrgentLine compact />}
                </div>
              )
            })}</div>)}
          </div>
        </div>
      </div>

      <p className="hg-privacy">Private by design: these are plain links. Dan doesn’t record which ones you open and never uses them for suggestions.</p>
      <p className="hg-checked">Links checked {prettyDate(CHECKED)}.</p>

      {booking && <BookedForm defaultTitle={opt.calm ? 'Appointment' : opt.title}  /* neutral: subscribed calendars are often shared */ onClose={() => setBooking(false)} />}
    </section>
  )
}
