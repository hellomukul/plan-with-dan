/* The no-account week builder on the home page: choices live in this browser until the student signs up,
   then the courses they added are saved into the real plan (after onboarding, so the program is known). */
import { api } from '../api'

const KEY = 'pwd-tryout'

export interface Tryout {
  term: string
  program: string
  year: string // '1' | '2' | 'admit' | ''
  cohort: string
  ids: string[] // everything on the grid
  auto: string[] // the part SOM schedules for you (core / required), filled in from official data
}

// Default visitor: a first-year MBA in Gold, looking at the current fall term.
export const DEFAULT_WHO = { term: '202603', program: 'MBA', year: '1', cohort: 'Gold' }
const EMPTY: Tryout = { ...DEFAULT_WHO, ids: [], auto: [] }

export function loadTryout(): Tryout {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '{}')
    return {
      ...EMPTY, ...v,
      ids: Array.isArray(v.ids) ? v.ids.slice(0, 20) : [],
      auto: Array.isArray(v.auto) ? v.auto : [],
    }
  } catch {
    return EMPTY
  }
}

export function saveTryout(t: Tryout): void {
  localStorage.setItem(KEY, JSON.stringify(t))
}

/** Which courses to copy into a new plan. MBA core is assigned (and counted automatically), and an admit's
    example week isn't theirs, so only the courses the student chose, plus program-required ones, move over. */
export function importableIds(t: Tryout): string[] {
  if (t.year === 'admit') return t.ids.filter((id) => !t.auto.includes(id))
  if (t.program.startsWith('MBA')) return t.ids.filter((id) => !t.auto.includes(id))
  return t.ids
}

/** Save the no-account week into the signed-in student's plan. Returns how many were added. */
export async function importTryout(): Promise<number> {
  const ids = importableIds(loadTryout())
  localStorage.removeItem(KEY)
  if (!ids.length) return 0
  const r = await api.importPlan(ids)
  return r.added
}
