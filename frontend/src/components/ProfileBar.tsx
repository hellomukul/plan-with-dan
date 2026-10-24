import { COHORTS, COHORT_DOT } from '../cohorts'
import type { Cohort } from '../cohorts'
import { cohortApplies } from '../profile'
import type { Profile } from '../profile'

interface Props {
  profile: Profile
  programmes: string[]
  onChange: (p: Profile) => void
}

/**
 * One sentence you fill in. Everything downstream reads from it rather than
 * asking again: the core schedule opens on your cohort, your section is
 * marked in every core course, and the planner starts where you are.
 */
export function ProfileBar({ profile, programmes, onChange }: Props) {
  const set = (patch: Partial<Profile>) => onChange({ ...profile, ...patch })
  const showCohort = cohortApplies(profile)

  return (
    <div className="profilebar">
      <span className="profilebar__lead">I&apos;m a</span>

      <select
        value={profile.programme}
        onChange={(e) => set({ programme: e.target.value })}
        aria-label="Your programme"
      >
        <option value="">— programme —</option>
        {programmes.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>

      {profile.programme === 'MBA' && (
        <select
          value={profile.year}
          onChange={(e) => set({ year: e.target.value as Profile['year'] })}
          aria-label="Your year"
        >
          <option value="">— year —</option>
          <option value="1">first year</option>
          <option value="2">second year</option>
        </select>
      )}

      {showCohort && (
        <>
          <span className="profilebar__lead">in</span>
          <select
            value={profile.cohort}
            onChange={(e) => set({ cohort: e.target.value as Cohort | '' })}
            aria-label="Your cohort"
          >
            <option value="">— cohort —</option>
            {COHORTS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          {profile.cohort && (
            <span
              className="profilebar__dot"
              style={{ background: COHORT_DOT[profile.cohort as Cohort] }}
              aria-hidden="true"
            />
          )}
        </>
      )}

      {profile.programme && (
        <button
          type="button"
          className="profilebar__clear"
          onClick={() => onChange({ programme: '', year: '', cohort: '' })}
        >
          reset
        </button>
      )}
    </div>
  )
}
