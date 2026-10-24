/**
 * Putting a plan in a link, so two people can compare timetables.
 *
 * Group keys are "MGT 402|basicsofaccounting" — readable but long, and the
 * title half is derivable from the number in almost every case. Only the
 * course numbers and chosen sections travel; the receiving end matches them
 * back against its own catalog. A plan of ten courses fits in about 120
 * characters, which survives every mail client.
 */

export interface SharedPlan {
  /** Course numbers, e.g. ["MGT 402", "MGT 403"]. */
  numbers: string[]
  /** courseNumber -> section id, only for the ones that were pinned. */
  sections: Record<string, string>
}

const PARAM = 'plan'

export function encodePlan(plan: SharedPlan): string {
  const parts = plan.numbers.map((n) => {
    const sec = plan.sections[n]
    return sec ? `${n}.${sec}` : n
  })
  return parts.join('~').replace(/\s+/g, '_')
}

export function decodePlan(raw: string): SharedPlan {
  const numbers: string[] = []
  const sections: Record<string, string> = {}
  for (const part of raw.split('~')) {
    const clean = part.replace(/_/g, ' ').trim()
    if (!clean) continue
    const dot = clean.lastIndexOf('.')
    // A dot only separates a section when what follows looks like one.
    if (dot > 0 && /^[A-Za-z0-9]{1,3}$/.test(clean.slice(dot + 1))) {
      const number = clean.slice(0, dot)
      numbers.push(number)
      sections[number] = clean.slice(dot + 1)
    } else {
      numbers.push(clean)
    }
  }
  return { numbers, sections }
}

export function planFromUrl(): SharedPlan | null {
  const raw = new URLSearchParams(window.location.search).get(PARAM)
  return raw ? decodePlan(raw) : null
}

export function shareUrl(plan: SharedPlan): string {
  const url = new URL(window.location.href)
  url.search = ''
  url.hash = ''
  url.searchParams.set(PARAM, encodePlan(plan))
  return url.toString()
}

/** Drop the parameter once it has been read, so a reload is your own plan. */
export function clearPlanParam(): void {
  const url = new URL(window.location.href)
  if (!url.searchParams.has(PARAM)) return
  url.searchParams.delete(PARAM)
  window.history.replaceState({}, '', url.toString())
}
