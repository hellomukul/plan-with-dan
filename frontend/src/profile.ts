import type { Cohort } from './cohorts'

/**
 * Who the visitor is. Year is not a filter — Yale's first year is core and the
 * second is electives, so a year dropdown beside a core/elective dropdown was
 * the same fact twice. Asked once here, it personalises everything: which
 * cohort's week the core schedule opens on, which section is marked as yours,
 * and what the planner defaults to.
 */
export interface Profile {
  programme: string
  year: '1' | '2' | ''
  cohort: Cohort | ''
}

export const EMPTY_PROFILE: Profile = { programme: '', year: '', cohort: '' }

const KEY = 'som-profile'

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...EMPTY_PROFILE, ...JSON.parse(raw) } : EMPTY_PROFILE
  } catch {
    return EMPTY_PROFILE
  }
}

export function saveProfile(p: Profile): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    // Browsing must not break because storage is full or blocked.
  }
}

/** Cohorts only mean something for a first-year MBA. */
export function cohortApplies(p: Profile): boolean {
  return p.programme === 'MBA' && p.year === '1'
}

/** The requirement a profile implies, used to preset the planner. */
export function impliedRequirement(p: Profile): 'Core' | 'Elective' | 'Any' {
  if (p.programme !== 'MBA') return 'Any'
  if (p.year === '1') return 'Core'
  if (p.year === '2') return 'Elective'
  return 'Any'
}
