/* "Plan for Fall 2027 / Spring 2028": SOM hasn't published 2027-28, so a student with a second year ahead can plan
   an *expected* course from this year's offering in the same season (POST /api/plan with target_term; times TBA).
   Shown on the signed-in Course explorer page and in the course drawer. One block, three states: the action,
   "Planned for Fall 2027" (with Remove), or "already in your plan for Fall 2026". Renders nothing when the student
   has no 2027-28 to plan (second-years, one-year programs) or the course isn't theirs to plan (core, other programs). */
import { useRef, useState } from 'react'
import { CalendarPlus, Check } from 'lucide-react'
import { api, type Section } from '../api'
import { NEXT_YEAR, quarterLabel, termName } from '../lib/format'
import { nextYearSection } from '../lib/eligibility'
import { useApp } from '../state'
import './course-explorer.css'

export default function NextYearAction({ secs, program }: { secs: Section[]; program: string }) {
  const { plan, refreshPlan, undoToast, toast } = useApp()
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const lead = secs[0]
  const target = lead ? NEXT_YEAR[lead.term] : undefined
  if (!lead || !target || !plan?.planning_terms?.some((t) => t.code === target)) return null
  const items = plan.items ?? []
  const next = items.find((i) => i.expected && i.section.number === lead.number)
  const now = items.find((i) => !i.expected && i.section.number === lead.number)
  const sec = nextYearSection(secs, { program })
  if (!next && !now && !sec) return null
  const when = termName(target)
  const quarter = quarterLabel(lead.session)

  const run = async (fn: () => Promise<void>) => {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    try { await fn() } catch (e) { toast((e as Error).message, 'bad') } finally { lock.current = false; setBusy(false) }
  }
  const add = () => run(async () => {
    const r = await api.planNextYear(sec!.id, target)
    await refreshPlan()
    if (r.unchanged) toast(`${lead.number} is already planned for ${when}`)
    else undoToast(`Planned ${lead.number} for ${when} (expected, times TBA)`, r.action_id)
  })
  const remove = () => run(async () => {
    const r = await api.removeFromPlan(next!.id)
    await refreshPlan()
    undoToast(`Removed ${lead.number} from ${termName(next!.target_term ?? target)}`, r.action_id)
  })

  return (
    <div className={`nx ${next ? 'on' : ''}`} role="group" aria-label="Plan it for 2027–28">
      {next ? (
        <>
          <span className="nx-text small">
            <b><Check className="icon xs" /> Planned for {termName(next.target_term ?? target)}</b>
            <span className="muted"> Expected, based on this year’s {quarter} offering. Times TBA until SOM publishes 2027–28.</span>
          </span>
          <button type="button" className="btn sm ghost nx-btn" disabled={busy} aria-busy={busy || undefined} onClick={() => void remove()}>
            {busy ? 'Removing…' : 'Remove'}</button>
        </>
      ) : now ? (
        <span className="nx-text small muted">
          Already in your plan for {termName(now.section.term)}, so it can’t go in {when} too.
        </span>
      ) : (
        <>
          <span className="nx-text small muted">
            SOM hasn’t published 2027–28 yet, so this is an expected course based on this year’s {quarter} offering, times TBA.
          </span>
          <button type="button" className="btn sm nx-btn" disabled={busy} aria-busy={busy || undefined} onClick={() => void add()}>
            <CalendarPlus className="icon sm" />{busy ? 'Planning…' : `Plan for ${when}`}</button>
        </>
      )}
    </div>
  )
}
