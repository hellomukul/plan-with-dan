import type { Selection } from './facets'
import type { Profile } from './profile'
import { avoidsDays, hasSectionEndingBy, hasSectionStartingAfter } from './schedule'
import type { CourseLike } from './schedule'

/**
 * One-click starting points. Some are facet selections; some are shapes the
 * facets cannot express — "nothing before ten", "Fridays clear" — which is
 * where a predicate runs over the parsed meeting times instead.
 */
export interface QuickView {
  id: string
  label: string
  hint: string
  group: 'For you' | 'Shape of your week' | 'Subject' | 'Practical'
  /** Facet selection to apply. */
  sel?: Partial<Selection>
  /** Extra filter the facets cannot express. */
  predicate?: (g: CourseLike) => boolean
}

const TEN = 10 * 60
const FIVE_PM = 17 * 60

export function quickViews(profile: Profile, hasPlan: boolean): QuickView[] {
  const views: QuickView[] = []

  /* --- personal, when we know who they are --- */
  if (profile.programme === 'MBA' && profile.year === '1') {
    views.push({
      id: 'my-core',
      label: 'My core',
      hint: 'The core courses you take as a first year',
      group: 'For you',
      sel: { program: ['MBA'], requirement: ['Core'] },
    })
    views.push({
      id: 'first-year-electives',
      label: 'My electives',
      hint: 'First years may add electives from Session 2',
      group: 'For you',
      sel: { program: ['MBA'], requirement: ['Elective'] },
    })
  } else if (profile.programme === 'MBA' && profile.year === '2') {
    views.push({
      id: 'my-electives',
      label: 'My electives',
      hint: 'Second year is entirely electives',
      group: 'For you',
      sel: { program: ['MBA'], requirement: ['Elective'] },
    })
  } else if (profile.programme) {
    views.push({
      id: 'my-programme',
      label: `${profile.programme} courses`,
      hint: `Everything open to ${profile.programme}`,
      group: 'For you',
      sel: { program: [profile.programme] },
    })
  }

  /* --- shapes you cannot get from a facet --- */
  views.push(
    {
      id: 'no-early',
      label: 'No early starts',
      hint: 'Has a section that starts at 10:00 or later',
      group: 'Shape of your week',
      predicate: (g) => hasSectionStartingAfter(g, TEN),
    },
    {
      id: 'fridays-free',
      label: 'Fridays clear',
      hint: 'Has a section that never meets on a Friday',
      group: 'Shape of your week',
      predicate: (g) => avoidsDays(g, ['F']),
    },
    {
      id: 'done-by-five',
      label: 'Done by 5pm',
      hint: 'Has a section that finishes by 17:00',
      group: 'Shape of your week',
      predicate: (g) => hasSectionEndingBy(g, FIVE_PM),
    },
  )

  if (hasPlan) {
    views.push({
      id: 'fits',
      label: 'Fits my plan',
      hint: 'Drops anything that clashes with your shortlist',
      group: 'Shape of your week',
    })
  }

  /* --- subject shortcuts --- */
  views.push(
    {
      id: 'finance',
      label: 'Finance & Accounting',
      hint: 'The money track',
      group: 'Subject',
      sel: { subject: ['Finance', 'Accounting'] },
    },
    {
      id: 'ai',
      label: 'AI & Tech',
      hint: 'Artificial Intelligence and Technology Management',
      group: 'Subject',
      sel: { subject: ['Artificial Intelligence', 'Technology Management'] },
    },
    {
      id: 'people',
      label: 'People & leadership',
      hint: 'Organizational Behavior and Strategy',
      group: 'Subject',
      sel: { subject: ['Organizational Behavior', 'Strategy'] },
    },
    {
      id: 'impact',
      label: 'Impact & sustainability',
      hint: 'Environment, nonprofit and healthcare',
      group: 'Subject',
      sel: {
        subject: [
          'Business & the Environment',
          'Nonprofit',
          'Healthcare Management',
        ],
      },
    },
  )

  /* --- practical --- */
  views.push(
    {
      id: 'global',
      label: 'Global study',
      hint: 'Courses that satisfy the Global Studies Requirement',
      group: 'Practical',
      sel: { program: ['Global Network'] },
    },
    {
      id: 'spring2',
      label: 'Spring 2 only',
      hint: 'The second half of the spring term',
      group: 'Practical',
      sel: { term: ['Spring 2'] },
    },
    {
      id: 'fall2',
      label: 'Fall 2 only',
      hint: 'The second half of the fall term',
      group: 'Practical',
      sel: { term: ['Fall 2'] },
    },
  )

  return views
}

/** The handful shown before "More"; the rest live in the menu. */
export const INLINE_COUNT = 5
