/* The no-account timetable on the home page: picks live in this browser until the student signs up,
   then they're saved into the real plan (after onboarding, so the program is known). */
import { api } from '../api'

const KEY = 'pwd-tryout'

export interface Tryout { term: string; program: string; ids: string[] }

export function loadTryout(): Tryout {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '{}')
    return { term: v.term || '202701', program: v.program || 'MBA', ids: Array.isArray(v.ids) ? v.ids.slice(0, 12) : [] }
  } catch {
    return { term: '202701', program: 'MBA', ids: [] }
  }
}

export function saveTryout(t: Tryout): void {
  localStorage.setItem(KEY, JSON.stringify(t))
}

/** Save any no-account picks into the signed-in student's plan. Returns how many were added. */
export async function importTryout(): Promise<number> {
  const t = loadTryout()
  if (!t.ids.length) return 0
  const r = await api.importPlan(t.ids)
  localStorage.removeItem(KEY)
  return r.added
}
