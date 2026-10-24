const STEPS = [
  {
    n: '1',
    title: 'Say who you are',
    body: 'Set your programme, year and cohort in the bar at the top. The core schedule then opens on your own week and the requirements page starts where you are.',
  },
  {
    n: '2',
    title: 'Check what you owe',
    body: 'Requirements holds the real numbers — 72 units, 30.5 of core, 41.5 of electives — plus the Global Studies and Leadership requirements, each linked to Yale’s own page.',
  },
  {
    n: '3',
    title: 'Shortlist from the catalog',
    body: 'Press “Add to plan” on any course. Tick “only show courses that fit my plan” and anything that cannot physically fit disappears.',
  },
  {
    n: '4',
    title: 'Check the week works',
    body: 'My plan totals your units, names any two courses that put you in two rooms at once, draws a Monday–Friday timetable and exports it to your calendar.',
  },
]

const FAQ = [
  {
    q: 'Why is there no spring?',
    a: 'This catalog is a single-term extract — every row is Fall 2026. Spring is published separately.',
  },
  {
    q: 'Why are sections numbered instead of named by cohort?',
    a: 'They are named, for the eight first-year core courses we hold a cohort mapping for. Each course pairs cohorts to sections differently: Silver is 01 in Accounting but 04 in Statistics.',
  },
  {
    q: 'Can first years take electives?',
    a: 'Yes. The first year is mostly core, but electives open up from Session 2, which is why year and course type are separate filters.',
  },
  {
    q: 'How do I know a requirement number is right?',
    a: 'Every figure on the Requirements page links to the Yale catalog or som.yale.edu page it came from. Confirm with your advisor before you register — course bidding rules in particular are not published.',
  },
]

/**
 * Lives at the foot of every view rather than as a dismissible card: a guide
 * you can only see once is a guide you cannot go back to.
 */
export function HowTo() {
  return (
    <section className="howto" id="how-to-use">
      <header>
        <h2>How to use this</h2>
        <p>Four steps, and the questions people ask most.</p>
      </header>

      <ol>
        {STEPS.map((s) => (
          <li key={s.n}>
            <span className="howto__n">{s.n}</span>
            <div>
              <strong>{s.title}</strong>
              <p>{s.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="howto__faq">
        {FAQ.map((f) => (
          <details key={f.q}>
            <summary>{f.q}</summary>
            <p>{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  )
}
