/* What a course is graded on, read from its own description (student feedback: "4 credits in 2 electives are very
   different workloads: exam vs project"). Plain keyword reading, no AI and no guessing: we only list what the
   description mentions, and say so. */
const SIGNALS: { label: string; rx: RegExp }[] = [
  { label: 'Exam', rx: /\b(final|midterm|mid-term|take[- ]home)?\s*exam(s|ination)?\b/i },
  { label: 'Group project', rx: /\b(group|team)\s+(project|work|assignment|presentation)s?\b/i },
  { label: 'Project', rx: /\bprojects?\b/i },
  { label: 'Paper or write-ups', rx: /\b(papers?|essays?|write-?ups?|memos?|reflection papers?)\b/i },
  { label: 'Cases', rx: /\bcase (study|studies|method|discussions?|analys[ie]s)\b|\b(HBS|business) cases\b|\bcases (and|from|on|about)\b/i },
  { label: 'Presentations', rx: /\bpresentations?\b|\bpitch(es)?\b/i },
  { label: 'Assignments or problem sets', rx: /\bproblem sets?\b|\bpsets?\b|\bassignments?\b/i },
  { label: 'Participation', rx: /\b(class )?participation\b/i },
  { label: 'Quizzes', rx: /\bquiz(zes)?\b/i },
  { label: 'Simulations', rx: /\bsimulations?\b|\brole[- ]?plays?\b/i },
  { label: 'Fieldwork or client work', rx: /\b(client|field ?work|consulting engagement|practicum|live project)\b/i },
]

export function gradedOn(description: string, hasExamDate: boolean): string[] {
  const text = description || ''
  const found = SIGNALS.filter((s) => s.rx.test(text)).map((s) => s.label)
  if (hasExamDate && !found.includes('Exam')) found.unshift('Exam')
  // "Group project" already says project
  return found.includes('Group project') ? found.filter((f) => f !== 'Project') : found
}
