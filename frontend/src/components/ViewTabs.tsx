export type View = 'browse' | 'plan' | 'core' | 'myplan' | 'campus'

interface Props {
  view: View
  onChange: (v: View) => void
  /** Courses in the shortlist, shown as a badge on the My plan tab. */
  planCount: number
  /** Hard timetable clashes, so the tab can warn without being opened. */
  clashCount: number
  /** Courses in the catalog, so the hint never goes stale. */
  total: number
}

const TABS: { id: View; label: string; hint: string; icon: string }[] = [
  {
    id: 'browse',
    label: 'Catalog',
    hint: 'Every course, filtered by semester, programme and subject',
    icon: '🔍',
  },
  {
    id: 'plan',
    label: 'Requirements',
    hint: 'What your degree actually demands, sourced from Yale',
    icon: '🎓',
  },
  {
    id: 'core',
    label: 'Core schedule',
    hint: 'Your cohort\u2019s first-year week, hour by hour',
    icon: '📅',
  },
  {
    id: 'campus',
    label: 'Dates & tools',
    hint: 'Term dates, deadlines, and the apps you\u2019ll need',
    icon: '🗓',
  },
  {
    id: 'myplan',
    label: 'My plan',
    hint: 'Shortlist, unit count, clash check and calendar export',
    icon: '🗂',
  },
]

/**
 * Four disclosure toggles stacked above the grid read as a pile of
 * accordions — opening one shoved the others around. These are really four
 * separate things you come here to do, so they are top-level views.
 */
export function ViewTabs({ view, onChange, planCount, clashCount, total }: Props) {
  const hintFor = (id: View, hint: string) =>
    id === 'browse' ? `All ${total} courses, filtered by semester and subject` : hint

  return (
    <nav className="viewtabs" aria-label="Sections">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          className={view === t.id ? 'is-on' : ''}
          aria-current={view === t.id ? 'page' : undefined}
          title={hintFor(t.id, t.hint)}
          onClick={() => onChange(t.id)}
        >
          <span className="viewtabs__top">
            <span className="viewtabs__icon" aria-hidden="true">
              {t.icon}
            </span>
            <span className="viewtabs__label">{t.label}</span>
          </span>
          {t.id === 'myplan' && planCount > 0 && (
            <span className="viewtabs__count">{planCount}</span>
          )}
          {t.id === 'myplan' && clashCount > 0 && (
            <span className="viewtabs__warn" title={`${clashCount} timetable clash`}>
              !
            </span>
          )}
          <span className="viewtabs__hint">{hintFor(t.id, t.hint)}</span>
        </button>
      ))}
    </nav>
  )
}
