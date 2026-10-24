import type { Course } from './api'

/**
 * Topic tags read from the title and description.
 *
 * The catalog gives each course exactly one "Course Category", and it is doing
 * two jobs badly. For 53% of rows it holds a programme (Core, EMBA, PhD) and
 * so says nothing about content: MGT 409 "AI Foundations for Managers" is
 * filed under Core, which is why its instructor never appeared under AI.
 * Where it does hold a subject it is sometimes simply wrong — MGT 897
 * "Entrepreneurial Finance" is filed under Artificial Intelligence.
 *
 * These tags are inferred, not official, and are labelled as such in the UI.
 * Matching is on whole words against the title and description, and each rule
 * needs a phrase specific enough not to fire on a passing mention.
 */

export interface TopicRule {
  topic: string
  /** Any of these, matched as whole words, tags the course. */
  terms: string[]
  /** Title-only terms, for words too common to trust in a description. */
  titleOnly?: string[]
}

export const TOPIC_RULES: TopicRule[] = [
  {
    topic: 'Artificial Intelligence',
    terms: [
      'artificial intelligence',
      'machine learning',
      'deep learning',
      'large language model',
      'generative ai',
      'neural network',
    ],
    titleOnly: ['ai'],
  },
  {
    topic: 'Data & Analytics',
    terms: [
      'data analysis',
      'data science',
      'econometric',
      'regression',
      'causal inference',
      'statistical',
      'predictive model',
    ],
    titleOnly: ['statistics', 'data', 'analytics'],
  },
  {
    topic: 'Negotiation',
    terms: ['negotiation', 'negotiating', 'bargaining'],
  },
  {
    topic: 'Leadership',
    terms: ['leadership', 'leading teams', 'managing groups', 'executive presence'],
    titleOnly: ['leader', 'executive'],
  },
  {
    topic: 'Entrepreneurship',
    terms: ['entrepreneur', 'startup', 'start-up', 'venture capital', 'new venture'],
  },
  {
    topic: 'Sustainability & Climate',
    terms: ['sustainability', 'climate', 'carbon', 'environmental', 'renewable'],
  },
  {
    topic: 'Healthcare',
    terms: ['healthcare', 'health care', 'hospital', 'public health', 'medicine'],
  },
  {
    topic: 'Investing & Markets',
    terms: [
      'asset pricing',
      'portfolio',
      'securities',
      'capital markets',
      'valuation',
      'fixed income',
      'hedge fund',
    ],
    titleOnly: ['investor', 'investment', 'investing'],
  },
  {
    topic: 'Accounting & Reporting',
    terms: ['accounting', 'financial statement', 'financial reporting', 'audit'],
  },
  {
    topic: 'Marketing & Customers',
    terms: ['marketing', 'consumer behavior', 'consumer behaviour', 'branding', 'customer'],
  },
  {
    topic: 'Operations & Supply Chain',
    terms: ['supply chain', 'operations management', 'logistics', 'manufacturing', 'inventory'],
  },
  {
    topic: 'Strategy & Competition',
    terms: ['competitive strategy', 'competitor', 'corporate strategy', 'game theory'],
  },
  {
    topic: 'Policy & Society',
    terms: ['public policy', 'regulation', 'government', 'inequality', 'social mobility'],
    titleOnly: ['society', 'policy'],
  },
  {
    topic: 'Ethics',
    terms: ['ethics', 'ethical', 'moral'],
  },
  {
    topic: 'Global & International',
    terms: ['international', 'globalization', 'globalisation', 'emerging market', 'cross-border'],
    titleOnly: ['global'],
  },
  {
    topic: 'Real Estate',
    terms: ['real estate', 'property market'],
  },
  {
    topic: 'Nonprofit & Impact',
    terms: ['nonprofit', 'non-profit', 'social enterprise', 'philanthropy', 'impact investing'],
  },
  {
    topic: 'Behavioral Science',
    terms: ['behavioral science', 'behavioural science', 'judgment and decision', 'psychology'],
  },
]

/** Whole-word match, so "ai" never fires inside "chair" or "retail". */
function hasTerm(haystack: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(haystack)
}

export function topicsOf(course: Course): string[] {
  const title = (course['Course Title'] ?? '').toLowerCase()
  const body = `${title} ${(course['Course Description'] ?? '').toLowerCase()}`

  const out: string[] = []
  for (const rule of TOPIC_RULES) {
    const hit =
      rule.terms.some((t) => hasTerm(body, t)) ||
      (rule.titleOnly ?? []).some((t) => hasTerm(title, t))
    if (hit) out.push(rule.topic)
  }
  return out
}
