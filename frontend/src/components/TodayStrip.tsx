/* Dan's Desk today strip: the class in progress or the next one, its room, and a live countdown.
   All the time logic lives in lib/deskTime (pure, takes `now`). The box keeps one fixed height in every
   state (loading, in class, next class, weekend, no classes) so the page never jumps as the minute ticks. */
import { ArrowRight, Compass, MapPin, Search, Sparkles, UserRound } from 'lucide-react'
import { clockText, countdown, dayName, dayStart, at, todayState, type Meeting } from '../lib/deskTime'

interface Props {
  classes: Meeting[] | null
  now: Date
  hasPlan: boolean
  needsCohort: boolean
  onOpenCourse: (courseId: string) => void
  error?: boolean
  onRetry?: () => void
  go: (r: 'find' | 'explore' | 'profile' | 'calendar' | 'plan') => void
}

const splitTitle = (t: string) => {
  const parts = t.split(' ')
  return { num: parts.slice(0, 2).join(' '), name: parts.slice(2).join(' ') || t }
}

function DateTile({ iso }: { iso: string }) {
  const d = dayStart(iso)
  return (
    <div className="ts-date" aria-hidden="true">
      <span>{d.toLocaleDateString('en-US', { weekday: 'short' })}</span>
      <b>{d.getDate()}</b>
    </div>
  )
}

export default function TodayStrip({ classes, now, hasPlan, needsCohort, onOpenCourse, go, error, onRetry }: Props) {
  if (!classes && error) {
    return (
      <section className="card ts" aria-label="Today">
        <div className="ts-main">
          <DateTile iso={`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`} />
          <div className="ts-body">
            <span className="ts-eyebrow">Today</span>
            <span className="ts-title wrap">Couldn't load your classes</span>
            <span className="ts-meta wrap">Your plan is safe. This is just the connection.</span>
          </div>
          <div className="ts-cta"><button type="button" className="btn" onClick={onRetry}>Try again</button></div>
        </div>
        <div className="ts-foot"><span className="ts-foot-text">Dan retries when you come back to this page.</span></div>
      </section>
    )
  }
  if (!classes) {
    return (
      <section className="card ts" aria-label="Today" aria-busy="true">
        <div className="ts-main"><span className="skeleton ts-skel" /></div>
        <div className="ts-foot"><span className="skeleton" style={{ width: '40%' }} /></div>
      </section>
    )
  }

  const st = todayState(classes, now)
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const focus = st.current ?? st.next

  if (!focus) {
    return (
      <section className="card ts" aria-label="Today">
        <div className="ts-main">
          <DateTile iso={today} />
          <div className="ts-body">
            <span className="ts-eyebrow">Today</span>
            <span className="ts-title wrap">{needsCohort ? 'Set your cohort to see your week' : hasPlan ? 'No classes coming up' : 'Your week is a blank page'}</span>
            <span className="ts-meta wrap">{needsCohort ? 'Your core classes, rooms and a live countdown show up here.'
              : hasPlan ? 'Nothing timed on your calendar right now.' : 'Add courses and your next class, room and countdown show up here.'}</span>
          </div>
          <div className="ts-cta">
            {needsCohort ? (
              <button type="button" className="btn primary" onClick={() => go('profile')}><UserRound className="icon sm" />Set your cohort</button>
            ) : hasPlan ? (
              <button type="button" className="btn" onClick={() => go('plan')}><Compass className="icon sm" />Open my plan</button>
            ) : (
              <button type="button" className="btn primary" onClick={() => go('find')}><Sparkles className="icon sm" />Get course picks</button>
            )}
          </div>
        </div>
        <div className="ts-foot">
          <span className="ts-foot-text">{needsCohort ? <>It takes ten seconds in your profile. Then <button type="button" className="link-btn" onClick={() => go('find')}>find electives</button>.</>
            : hasPlan ? 'Courses with a published time appear here automatically.'
              : <>Or <button type="button" className="link-btn" onClick={() => go('explore')}><Search className="icon sm" style={{ verticalAlign: '-2px' }} /> open the course explorer</button> yourself.</>}</span>
        </div>
      </section>
    )
  }

  const dayList = classes.filter((c) => c.date === focus.date).sort((x, y) => x.start_min - y.start_min)
  const inClass = !!st.current
  const target = inClass ? at(focus.date, focus.end_min) : at(focus.date, focus.start_min)
  const left = countdown(target.getTime() - now.getTime())
  const { num, name } = splitTitle(focus.title)
  const when = inClass ? 'In class now' : `Next class · ${dayName(focus.date, now)}`
  const time = inClass ? `Until ${clockText(focus.end_min)}` : `${clockText(focus.start_min)}–${clockText(focus.end_min)}`

  let foot: string
  if (inClass && st.next && st.next.date === today) {
    foot = `Next: ${splitTitle(st.next.title).num} at ${clockText(st.next.start_min)}${st.next.room ? `, ${st.next.room}` : ''}`
  } else if (inClass) {
    foot = 'Last class today.'
  } else if (focus.date === today) {
    foot = st.laterToday ? `Then ${st.laterToday} more ${st.laterToday === 1 ? 'class' : 'classes'} today.` : 'Last class today.'
  } else if (st.weekend) {
    foot = 'No classes this weekend. Enjoy it.'
  } else {
    foot = st.todayTotal ? 'Done for today. Nice work.' : 'No classes today.'
  }

  return (
    <section className="card ts" aria-label="Today">
      <div className="ts-main">
        <DateTile iso={focus.date} />
        <div className="ts-body">
          <span className="ts-eyebrow">{inClass && <i className="ts-live" aria-hidden="true" />}{when}</span>
          <button type="button" className="ts-title link-plain" onClick={() => onOpenCourse(focus.course_id)} title={focus.title}>
            <span className="ts-num">{num}</span> {name}
          </button>
          <span className="ts-meta">
            <span>{time}</span>
            <span className="ts-room"><MapPin className="icon sm" />{focus.room || 'Room TBA'}</span>
          </span>
        </div>
        {dayList.length > 1 && (
          <ol className="ts-rail" aria-label={`Classes ${dayName(focus.date, now).toLowerCase()}`}>
            {dayList.slice(0, 4).map((c) => {
              const past = at(c.date, c.end_min).getTime() <= now.getTime()
              return (
                <li key={`${c.course_id}-${c.start_min}`} className={c === focus ? 'on' : past ? 'past' : ''}>
                  <span className="ts-rail-time">{clockText(c.start_min).replace(/ (AM|PM)$/, '')}</span>
                  <span className="ts-rail-num">{splitTitle(c.title).num}</span>
                </li>
              )
            })}
            {dayList.length > 4 && <li className="ts-rail-more">+{dayList.length - 4} more</li>}
          </ol>
        )}
        <div className="ts-count" aria-live="off">
          <span className="ts-count-label">{inClass ? 'ends in' : 'starts in'}</span>
          <span className="ts-count-value">{left}</span>
        </div>
      </div>
      <div className="ts-foot">
        <span className="ts-foot-text">{foot}</span>
        <button type="button" className="link-btn small ts-foot-link" onClick={() => go('calendar')}>Calendar<ArrowRight className="icon sm" /></button>
      </div>
    </section>
  )
}
