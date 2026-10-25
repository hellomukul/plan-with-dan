/* One course search engine for the whole app (home page explorer and the signed-in Course explorer), so a query
   works the same everywhere. Matches course numbers loosely ("mgt410", "MGT 410", "410"), titles,
   professors (whole names first, any order), topics, then descriptions. */
import type { Section } from '../api'

export const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const compact = (s: string) => norm(s).replace(/[^a-z0-9]/g, '')
const escape = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export type MatchWhy = 'number' | 'title' | 'professor' | 'topic' | 'description'

/** Score one course offering (all its sections) against a query. 0 = no match. */
export function scoreOffering(secs: Section[], query: string): { score: number; why: MatchWhy | null } {
  const needle = norm(query.trim())
  if (!needle) return { score: 1, why: null }
  const lead = secs[0]
  const words = needle.split(/\s+/).filter(Boolean)
  const tight = compact(needle)
  const number = compact(lead.number)  // "mgt410"
  const title = norm(lead.title)
  const faculty = norm([...new Set(secs.flatMap((s) => s.faculty))].join(' '))
  const topics = norm(lead.topics.join(' '))
  if (tight && (number === tight || number.replace(/^[a-z]+/, '') === tight)) return { score: 100, why: 'number' }
  if (tight.length >= 3 && /\d/.test(tight) && number.includes(tight.replace(/^mgt/, ''))) return { score: 80, why: 'number' }
  if (title.startsWith(needle)) return { score: 70, why: 'title' }
  if (words.every((w) => new RegExp(`\\b${escape(w)}`).test(title))) return { score: 62, why: 'title' }
  // Names only ever match from the start of a word, so "nathan" finds Nathan Novemsky but never Jonathan.
  const inFaculty = (w: string) => new RegExp(`\\b${escape(w)}`).test(faculty)
  if (words.every(inFaculty)) return { score: 58, why: 'professor' }
  if (words.every((w) => title.includes(w))) return { score: 50, why: 'title' }
  if (words.every((w) => title.includes(w) || topics.includes(w) || inFaculty(w))) return { score: 40, why: 'topic' }
  if (needle.length >= 4 && norm(lead.description).includes(needle)) return { score: 20, why: 'description' }
  return { score: 0, why: null }
}

/** Study trips (IE, GNW): real courses, but they shouldn't crowd the top of a browse list. */
export const isTrip = (s: Section) => /^(ie:|gnw)|global social entrepreneurship/i.test(s.title.trim())
/** Global Studies trips (IE, GNW, GSE) are applied for on the Requirements page's timeline, not just added. */
export const isGlobalTrip = isTrip
