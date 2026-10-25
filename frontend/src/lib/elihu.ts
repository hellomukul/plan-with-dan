/* Hand-off from the Course explorer to Elihu (the "Find courses" page): the courses a student was weighing up travel
   along in sessionStorage, so Elihu's page can show them side by side and say whether his picks include them.
   Nothing is sent anywhere; the recommender itself still runs on the student's profile. */
const KEY = 'pwd-elihu-context'
const MAX_AGE_MS = 30 * 60_000

export interface ElihuContext { keys: string[]; term?: string; at: number }

export function setElihuContext(keys: string[], term?: string) {
  const unique = [...new Set(keys)].slice(0, 4)
  try {
    if (unique.length) sessionStorage.setItem(KEY, JSON.stringify({ keys: unique, term, at: Date.now() }))
    else sessionStorage.removeItem(KEY)
  } catch { /* storage off: Elihu just opens without context */ }
}

export function readElihuContext(): ElihuContext | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) || 'null') as ElihuContext | null
    // only fresh hand-offs: opening Elihu from the menu an hour later shouldn't resurface old courses
    return v && Array.isArray(v.keys) && v.keys.length && Date.now() - v.at < MAX_AGE_MS ? v : null
  } catch { return null }
}

export function clearElihuContext() {
  try { sessionStorage.removeItem(KEY) } catch { /* ignore */ }
}

/** Elihu's summary may end with the model's "FOLLOWUPS: a | b | c" line (older saved runs, or a backend that didn't
    strip it). Never show that raw: cut it off the text and return the questions, preferring the backend's own list. */
export function splitFollowups(summary: string, given?: string[] | null): { text: string; followups: string[] } {
  const m = (summary || '').match(/[\s>*_`]*\bFOLLOW[\s-]?UPS?[*_`]*\s*:\s*([^\n]*?)[\s*_`]*$/i)
  const text = m ? summary.slice(0, m.index).trimEnd() : (summary || '')
  const parsed = m ? m[1].split('|').map((q) => q.trim().replace(/^[-*•\d.)\s]+/, '')).filter((q) => q.length > 3 && q.length <= 160) : []
  const list = (given?.length ? given : parsed).map((q) => q.trim()).filter(Boolean)
  return { text, followups: [...new Set(list)].slice(0, 3) }
}
