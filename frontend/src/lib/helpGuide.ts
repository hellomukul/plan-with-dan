/* "Get help": every person and office the guide can point to, in one place. The four doors, the
   "See everyone" directory and Dan's knowledge (backend/knowledge.py) all use these notes and links.
   Each URL was opened and checked on CHECKED. The CMS (12twenty) pages and the SOM portal need a Yale login. */

export const CHECKED = '2026-10-25'

/** The four doors. The directory uses the same groups. */
export type HelpGroup = 'career' | 'academic' | 'wellbeing' | 'more'

export interface HelpResource {
  id: string
  group: HelpGroup
  label: string
  note: string // one line for the directory and the door card
  url: string
  act: 'book' | 'open'
}

export const RESOURCES: HelpResource[] = [
  { id: 'cdo-coach', group: 'career', label: 'CDO career coach appointment', note: '30 minutes with a coach, booked in CMS (12twenty)', url: 'https://som-yale.12twenty.com/appointments', act: 'book' },
  { id: 'cdo-open-hours', group: 'career', label: 'CDO coach Open Hours', note: 'Drop in for a quick question, usually Mon–Thu 11:30–1:00', url: 'https://cdo.som.yale.edu/faqs/', act: 'open' },
  { id: 'employer-events', group: 'career', label: 'Employer events and info', note: 'Who’s coming to SOM and how to engage', url: 'https://cdo.som.yale.edu/channels/employer/', act: 'open' },
  { id: 'interview-rooms', group: 'career', label: 'Interview rooms (WebEMS)', note: 'Reserve an SOM room for an interview, Yale login', url: 'https://yalesom.emscloudservice.com/web/', act: 'book' },
  { id: 'cdo-interview-prep', group: 'career', label: 'Prepare for your interview', note: 'CDO guides for case, behavioral and technical interviews', url: 'https://cdo.som.yale.edu/channels/prepare-for-your-interview/', act: 'open' },
  { id: 'cms-events', group: 'career', label: 'CMS events', note: 'Sign up for employer events in 12twenty', url: 'https://som-yale.12twenty.com/events', act: 'book' },
  { id: 'recruiting-policies', group: 'career', label: 'Recruiting policies', note: 'Read before you reach out to employers', url: 'https://cdo.som.yale.edu/resources/yale-som-recruiting-policies/', act: 'open' },
  { id: 'aasl', group: 'academic', label: 'Academic Affairs & Student Life (AASL)', note: 'Course planning, workload, leave, anything about your program', url: 'https://groups.som.yale.edu/aasl/', act: 'open' },
  { id: 'registrar', group: 'academic', label: 'SOM contacts (Registrar)', note: 'Registration records and the right office for each question', url: 'https://som.yale.edu/about/contact', act: 'open' },
  { id: 'sas', group: 'academic', label: 'Student Accessibility Services', note: 'Accommodations for classes and exams', url: 'https://sas.yale.edu', act: 'open' },
  // New registrar forms (from the registrar's auction email, Oct 2026). The swap form lives behind the SOM portal login.
  { id: 'swap-form', group: 'academic', label: 'Body-to-body swap form', note: 'Trade a seat with a classmate, from Jan 5 (SOM portal)', url: 'https://portal.som.yale.edu/', act: 'open' },
  { id: 'independent-study', group: 'academic', label: 'Independent study (MGT 690)', note: 'Up to 4 units, no bid points. Petition rules in the Bulletin', url: 'https://catalog.yale.edu/management/rights-responsibilities-students/course-policies-residential-masters-degree-programs/', act: 'open' },
  { id: 'som-counselor', group: 'wellbeing', label: 'SOM’s embedded counselor', note: 'A Yale Mental Health & Counseling clinician based at SOM', url: 'https://groups.som.yale.edu/aasl/yale-mental-health-and-wellness/', act: 'book' },
  { id: 'ymhc', group: 'wellbeing', label: 'Yale Mental Health & Counseling', note: 'Counseling for all Yale students, free', url: 'https://yalehealth.yale.edu/department/mental-health-counseling', act: 'open' },
  { id: 'good-life', group: 'wellbeing', label: 'Good Life Center', note: 'A calm space and programs for wellbeing', url: 'https://goodlifecenter.yale.edu', act: 'open' },
  { id: 'chaplain', group: 'wellbeing', label: 'Chaplain’s Office', note: 'Support from chaplains of many faiths, and none', url: 'https://chaplain.yale.edu', act: 'open' },
  { id: 'oiss', group: 'more', label: 'OISS (international students)', note: 'Visas and work authorization: the office that decides', url: 'https://oiss.yale.edu', act: 'open' },
  { id: 'mentorship', group: 'more', label: 'Yale alumni mentorship (Cross Campus)', note: 'Join a program in the Mentorship tab; matches each semester', url: 'https://alumni.yale.edu/connect/yale-alumni-mentorship-program', act: 'open' },
  { id: 'tsai-city', group: 'more', label: 'Tsai CITY', note: 'Advising, programs and funding for your venture idea', url: 'https://city.yale.edu', act: 'open' },
]

export const GROUPS: { id: HelpGroup; label: string }[] = [
  { id: 'career', label: 'Career / CDO' },
  { id: 'academic', label: 'Academics' },
  { id: 'wellbeing', label: 'Wellbeing' },
  { id: 'more', label: 'International & more' },
]

export interface HelpOption {
  id: HelpGroup
  label: string
  hint: string // second line on the door: what's behind it
  title: string
  text: string
  tags: string[] // short mono labels, e.g. "TAKES 30 MIN"
  primary: string // resource id behind the big button
  cta: string // the big button's label
  links: string[] // resource ids listed in the card, each with its note
  urgent?: boolean // show the "Need someone right now?" line
  calm?: boolean // wellbeing: plain copy, no playful touches
}

export const OPTIONS: HelpOption[] = [
  { id: 'career', label: 'Career / CDO', hint: 'Coach, open hours, employers, interview rooms',
    title: 'Career Development Office (CDO)',
    text: 'Book 30 min with a coach: bring your resume and 2–3 roles you’re eyeing. Just a quick question? Drop in to Open Hours.',
    tags: ['TAKES 30 MIN', 'CMS LOGIN'], primary: 'cdo-coach', cta: 'Book a coach in CMS ↗',
    links: ['cdo-open-hours', 'employer-events', 'interview-rooms'] },
  // TODO: AASL drop-in times could be pulled in automatically once the app has a campus events source.
  // Until then the card links to the AASL site, which lists them; never type times in by hand.
  { id: 'academic', label: 'Academics', hint: 'AASL, registrar, accessibility, new forms',
    title: 'Academic Affairs & Student Life (AASL)',
    text: 'Course planning, workload, leave, anything about your program. Drop-ins are listed on their site.',
    tags: ['YOUR PROGRAM', 'DROP-INS ON SITE'], primary: 'aasl', cta: 'Open AASL ↗',
    links: ['registrar', 'sas', 'swap-form', 'independent-study'] },
  { id: 'wellbeing', label: 'Wellbeing', hint: 'Counseling, someone to talk to, urgent help',
    title: 'SOM’s embedded counselor',
    text: 'A Yale Mental Health & Counseling clinician based at SOM. Short-term counseling, free, and you book it yourself online.',
    tags: ['FREE', 'SELF-SCHEDULED'], primary: 'som-counselor', cta: 'Book online ↗',
    links: ['ymhc', 'good-life', 'chaplain'], urgent: true, calm: true },
  { id: 'more', label: 'International & more', hint: 'Visas, alumni mentors, startups',
    title: 'OISS, mentors and Tsai CITY',
    text: 'Dan doesn’t advise on visas or work authorization. OISS does, and they’re the office that decides.',
    tags: ['INTERNATIONAL', 'ALUMNI', 'VENTURES'], primary: 'oiss', cta: 'Open OISS ↗',
    links: ['mentorship', 'tsai-city'] },
]

export const URGENT = {
  text: 'Need someone right now? Yale Mental Health & Counseling’s on-call clinician answers at any hour:',
  phone: '203-432-0290',
  tel: 'tel:2034320290',
  crisis: 'In the US you can also call or text 988.',
  crisisTel: 'tel:988',
}

export const byId = (id: string) => RESOURCES.find((r) => r.id === id)!
