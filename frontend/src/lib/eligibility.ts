/* Can this student take this course, and if not, exactly why? Used by the course explorer so a blocked course
   shows a specific, honest reason instead of silently disappearing from search. */
import type { Section } from '../api'
import { prettyDate } from './format'

export interface Who { program: string; year: string; cohort: string }
export interface Verdict {
  ok: boolean; reason: string; note?: string
  /** Why it's blocked when that's about dates: 'ended' (over) or 'closed' (in session, add/drop over). */
  tag?: 'ended' | 'closed'
  /** In session and add/drop closed, but otherwise open to this student: they can still add it as enrolled. */
  canEnroll?: boolean
}

const LABEL: Record<string, string> = {
  MBA: 'full-time MBA', 'MBA-JOINT': 'joint-degree MBA', EMBA: 'MBA for Executives', MAM: 'MAM',
  'MMS-AM': 'MMS Asset Management', 'MMS-GBS': 'MMS Global Business & Society', 'MMS-SR': 'MMS Systemic Risk',
  'MMS-TM': 'MMS Technology Management', 'MMS-PEM': 'MMS Public Education Management', PhD: 'PhD',
}
/** Today as a local YYYY-MM-DD (not UTC, so an evening in New Haven isn't already tomorrow). */
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const addDays = (iso: string, n: number) => { const [y, m, d] = iso.split('-').map(Number); const t = new Date(y, m - 1, d + n); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}` }
const dayGap = (a: string, b: string) => (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000

/** Add/drop lasts about a week from the day a section starts (SOM's calendar: Fall session-2 Oct 26 -> Nov 2,
    Spring Jan 19 -> Jan 26, Spring session-2 Mar 22 -> Mar 29). Same rule as the backend's POST /api/plan:
    once starts + 7 days is behind us, it can't newly be planned or bid on, only added as enrolled.
    A start date far before the end (a catalog typo such as 2026 for 2027) is ignored rather than trusted. */
export const ADD_DROP_DAYS = 7
export function addDropEnds(s: Pick<Section, 'starts' | 'ends'>): string | null {
  if (!s.starts) return null
  if (s.ends && dayGap(s.starts, s.ends) > 300) return null
  return addDays(s.starts, ADD_DROP_DAYS)
}
/** True when the section is under way and its add/drop week is over. */
export const addDropClosed = (s: Pick<Section, 'starts' | 'ends'>, on = today()) => { const end = addDropEnds(s); return Boolean(end && end < on) }
/** 'an MBA…', 'an MMS…', 'a MAM…', 'a full-time…' (by sound, not spelling). */
const article = (label: string) => (/^(MBA|MMS|EMBA|[aeio])/i.test(label) ? 'an' : 'a')

function ownerOf(s: Section): string {
  if (s.programs.includes('EMBA')) return 'MBA for Executives'
  if (s.programs.includes('PhD') && !s.programs.includes('MBA')) return 'PhD'
  if (s.tracks?.length && !s.programs.includes('MBA')) return s.tracks.map((t) => `MMS ${t}`).join(' / ')
  if (s.programs.includes('MAM') && !s.programs.includes('MBA')) return 'MAM'
  return 'full-time MBA'
}

/** The verdict for one section. Pass every section of a course and use the best one. */
export function verdict(s: Section, who: Who): Verdict {
  const me = LABEL[who.program] ?? who.program
  const isMba = who.program === 'MBA' || who.program === 'MBA-JOINT'
  if (s.ends && s.ends < today()) {
    return { ok: false, tag: 'ended', reason: `${s.number} §${s.section} already ended on ${prettyDate(s.ends)}.` }
  }
  if (s.core && s.programs.includes('MBA')) {
    if (isMba && (who.year === '1' || who.year === 'admit')) {
      return { ok: false, reason: `${s.number} is first-year core. SOM assigns your section by cohort, so you don’t add it yourself.`,
        note: who.cohort ? undefined : 'Add your cohort and Dan fills in your core.' }
    }
    if (isMba) return { ok: false, reason: `${s.number} is first-year MBA core, which you’ve already done as a second-year.` }
    return { ok: false, reason: `${s.number} is part of the full-time MBA core, so it isn’t open to ${me} students.` }
  }
  if (s.category.toUpperCase() === 'GSR' && !isMba) {
    return { ok: false, reason: `${s.number} is an International Experience, funded from the MBA Global Studies Account, so it’s only open to full-time MBAs.` }
  }
  const audiences = s.audiences ?? s.programs
  if (!audiences.includes(who.program)) {
    return { ok: false, reason: `${s.number} §${s.section} is ${article(ownerOf(s))} ${ownerOf(s)} course, so ${me} students can’t take it.` }
  }
  if (s.enrollment.trim().toLowerCase() === 'no') {
    return { ok: false, reason: `${s.number} §${s.section} isn’t open for enrollment (it’s usually the second half of a two-term course).` }
  }
  if (addDropClosed(s)) {
    return { ok: false, tag: 'closed', canEnroll: true,
      reason: `In session · add/drop closed. ${s.number} §${s.section} started ${prettyDate(s.starts!)} and add/drop ended ${prettyDate(addDropEnds(s)!)}.`,
      note: 'Already taking it? Add it as enrolled so it shows on your week and calendar.' }
  }
  const notes: string[] = []
  if (s.enrollment.toLowerCase() === 'permission') notes.push('Needs instructor permission.')
  if (s.enrollment.toLowerCase() === 'bid') notes.push('Filled through the course auction.')
  if (who.program === 'PhD' && s.programs.includes('MBA')) notes.push('PhD students request to enroll; seats are space-available.')
  if (who.program === 'EMBA' && !s.programs.includes('EMBA')) notes.push('Outside the EMBA schedule: needs faculty permission and mustn’t clash with class weekends.')
  return { ok: true, reason: '', note: notes.join(' ') || undefined }
}

/** Best verdict across a course's sections: open if any section is open to this student. `enrollable` lists the
    sections that are in session with add/drop closed but otherwise open (they can only be added as enrolled). */
export function courseVerdict(sections: Section[], who: Who): { verdict: Verdict; open: Section[]; enrollable: Section[] } {
  const verdicts = sections.map((s) => ({ s, v: verdict(s, who) }))
  const open = verdicts.filter((x) => x.v.ok).map((x) => x.s)
  const enrollable = verdicts.filter((x) => x.v.canEnroll).map((x) => x.s)
  if (open.length) return { verdict: verdicts.find((x) => x.v.ok)!.v, open, enrollable }
  const best = verdicts.find((x) => x.v.canEnroll) ?? verdicts[0]
  return { verdict: best?.v ?? { ok: false, reason: 'Not found.' }, open, enrollable }
}

/** Short per-section status for lists: "In session · add/drop closed", "Ended" or "Not open to you". */
export function blockedLabel(v: Verdict): string {
  return v.tag === 'closed' ? 'In session · add/drop closed' : v.tag === 'ended' ? 'Ended' : 'Not open to you'
}

/** The section to plan this course from for 2027-28 (an expected course), or null when the student can't: the same
    rules as POST /api/plan with a target_term. Not core (SOM assigns it), open to their program, and not the closed
    second half of a two-term course. Dates don't matter: next year's run hasn't started. */
export function nextYearSection(sections: Section[], who: Pick<Who, 'program'>): Section | null {
  const isMba = who.program === 'MBA' || who.program === 'MBA-JOINT'
  return sections.find((s) => !s.core && !s.projected && (s.audiences ?? s.programs).includes(who.program)
    && s.enrollment.trim().toLowerCase() !== 'no' && !(s.category.toUpperCase() === 'GSR' && !isMba)) ?? null
}
