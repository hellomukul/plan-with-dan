/**
 * Term dates and the tools a new student has to sign into.
 *
 * Dates are transcribed from Yale SOM's academic calendar; tool descriptions
 * from SOM's own IT service catalog and student-life pages. Both are linked so
 * anything that drifts can be checked at the source.
 */

export const CALENDAR_SOURCE =
  'https://som.yale.edu/programs/mba/curriculum/academic-calendar'

export type EntryKind =
  | 'deadline'
  | 'exam'
  | 'break'
  | 'milestone'
  | 'classes'
  | 'grades'
  | 'holiday'

export interface CalendarEntry {
  /** ISO date the entry starts, for sorting and "what's next". */
  date: string
  /** How Yale writes it. */
  label: string
  what: string
  kind: EntryKind
}

export interface Term {
  name: string
  entries: CalendarEntry[]
}

export const ACADEMIC_CALENDAR: Term[] = [
  {
    name: 'Fall 2026',
    entries: [
      { date: '2026-08-09', label: 'August 9–15 (Sun–Sat)', what: 'Math Camp (by invitation only)', kind: 'milestone' },
      { date: '2026-08-17', label: 'August 17–21 (Mon–Fri)', what: 'Incoming student orientation — required for all MBA students', kind: 'milestone' },
      { date: '2026-08-17', label: 'August 17–28 (Mon–Fri)', what: 'Incoming student orientation — required for all MAM and MMS students', kind: 'milestone' },
      { date: '2026-08-18', label: 'August 18 (Tue), 8:30 a.m.', what: 'SOM open add/drop period begins', kind: 'deadline' },
      { date: '2026-08-24', label: 'August 24–28 (Mon–Fri)', what: 'MGT 401 Managing Groups & Teams meets — required core, MBA first years', kind: 'classes' },
      { date: '2026-08-31', label: 'August 31 (Mon)', what: 'Session-1 MBA core classes begin (MBA first years)', kind: 'classes' },
      { date: '2026-09-02', label: 'September 2 (Wed)', what: 'Fall-term SOM classes begin; Yale College and Graduate School begin', kind: 'classes' },
      { date: '2026-09-04', label: 'September 4 (Fri)', what: 'Make-up day: Monday classes meet', kind: 'classes' },
      { date: '2026-09-07', label: 'September 7 (Mon)', what: 'Labor Day — classes do not meet, offices closed', kind: 'holiday' },
      { date: '2026-09-09', label: 'September 9 (Wed), 5:00 p.m.', what: 'Add/drop ends — session-1, full-semester and non-SOM electives', kind: 'deadline' },
      { date: '2026-09-25', label: 'September 25 (Fri), 5:00 p.m.', what: 'Last day for a late drop or late audit request — session-1 elective', kind: 'deadline' },
      { date: '2026-10-02', label: 'October 2 (Fri)', what: 'MGT 403 Probability Modeling & Statistics meets — required core', kind: 'classes' },
      { date: '2026-10-15', label: 'October 15 (Thu)', what: 'Classes end', kind: 'classes' },
      { date: '2026-10-16', label: 'October 16 (Fri)', what: 'Friday classes end; elective final exam period', kind: 'exam' },
      { date: '2026-10-19', label: 'October 19–22 (Mon–Thu)', what: 'Core final exam period (MBA first years)', kind: 'exam' },
      { date: '2026-10-19', label: 'October 19–23 (Mon–Fri)', what: 'Global Network Week — SOM classes do not meet', kind: 'milestone' },
      { date: '2026-10-23', label: 'October 23 (Fri), 5:00 p.m.', what: 'Last day for a late drop or late audit request — full-term elective', kind: 'deadline' },
      { date: '2026-10-26', label: 'October 26 (Mon)', what: 'Classes resume; session-2 classes begin (core and elective)', kind: 'classes' },
      { date: '2026-11-02', label: 'November 2 (Mon), 5:00 p.m.', what: 'Add/drop ends — session-2 electives', kind: 'deadline' },
      { date: '2026-11-06', label: 'November 6 (Fri), 5:00 p.m.', what: 'Session-1 grades due (with some exceptions)', kind: 'grades' },
      { date: '2026-11-20', label: 'November 20 (Fri), 5:00 p.m.', what: 'Last day for a late drop or late audit request — session-2 elective', kind: 'deadline' },
      { date: '2026-11-23', label: 'November 23–27 (Mon–Fri)', what: 'November recess', kind: 'break' },
      { date: '2026-11-30', label: 'November 30 (Mon)', what: 'Classes resume', kind: 'classes' },
      { date: '2026-12-15', label: 'December 15 (Tue)', what: 'Classes end', kind: 'classes' },
      { date: '2026-12-16', label: 'December 16 (Wed)', what: 'Session-2 Wednesday-only classes end', kind: 'classes' },
      { date: '2026-12-16', label: 'December 16–22 (Wed–Tue)', what: 'Core and elective final exam period', kind: 'exam' },
      { date: '2026-12-17', label: 'December 17 (Thu)', what: 'Session-2 Thursday-only classes end', kind: 'classes' },
      { date: '2026-12-18', label: 'December 18 (Fri)', what: 'Session-2 Friday-only classes end', kind: 'classes' },
      { date: '2026-12-23', label: 'December 23 (Wed)', what: 'Winter recess begins', kind: 'break' },
    ],
  },
  {
    name: 'Spring 2027',
    entries: [
      { date: '2027-01-04', label: 'January 4 (Mon), 5:00 p.m.', what: 'Fall grades due (with some exceptions)', kind: 'grades' },
      { date: '2027-01-05', label: 'January 5 (Tue), 8:30 a.m.', what: 'SOM open add/drop period begins', kind: 'deadline' },
      { date: '2027-01-18', label: 'January 18 (Mon)', what: 'Martin Luther King Jr. Day — classes do not meet, offices closed', kind: 'holiday' },
      { date: '2027-01-19', label: 'January 19 (Tue)', what: 'SOM, Yale College and Graduate School classes begin', kind: 'classes' },
      { date: '2027-01-26', label: 'January 26 (Tue), 5:00 p.m.', what: 'Add/drop ends — session-1, full-semester and non-SOM electives', kind: 'deadline' },
      { date: '2027-01-29', label: 'January 29 (Fri)', what: 'Make-up day: Monday classes meet, Friday classes do not', kind: 'classes' },
      { date: '2027-02-12', label: 'February 12 (Fri), 5:00 p.m.', what: 'Last day for a late drop or late audit request — session-1 elective', kind: 'deadline' },
      { date: '2027-03-02', label: 'March 2 (Tue)', what: 'Classes end', kind: 'classes' },
      { date: '2027-03-03', label: 'March 3 (Wed)', what: 'Session-1 Wednesday-only classes end', kind: 'classes' },
      { date: '2027-03-03', label: 'March 3–5 (Wed–Fri)', what: 'Session-1 final exam period (core and elective)', kind: 'exam' },
      { date: '2027-03-04', label: 'March 4 (Thu)', what: 'Session-1 Thursday-only classes end', kind: 'classes' },
      { date: '2027-03-05', label: 'March 5 (Fri), 5:00 p.m.', what: 'Session-1 Friday-only classes end; last day for a late drop or audit request — full-term elective', kind: 'deadline' },
      { date: '2027-03-08', label: 'March 8–19 (Mon–Fri)', what: 'International Experience; Global Network Week — classes do not meet', kind: 'milestone' },
      { date: '2027-03-19', label: 'March 19 (Fri), 5:00 p.m.', what: 'Session-1 grades due (with some exceptions)', kind: 'grades' },
      { date: '2027-03-22', label: 'March 22 (Mon)', what: 'Classes resume; session-2 classes begin', kind: 'classes' },
      { date: '2027-03-26', label: 'March 26 (Fri)', what: 'Good Friday — offices closed, courses meet', kind: 'holiday' },
      { date: '2027-03-29', label: 'March 29 (Mon)', what: 'Add/drop ends — session-2 electives', kind: 'deadline' },
      { date: '2027-04-16', label: 'April 16 (Fri), 5:00 p.m.', what: 'Last day for a late drop or late audit request — session-2 elective', kind: 'deadline' },
      { date: '2027-05-04', label: 'May 4 (Tue)', what: 'Classes end', kind: 'classes' },
      { date: '2027-05-05', label: 'May 5 (Wed)', what: 'Session-2 Wednesday-only classes end', kind: 'classes' },
      { date: '2027-05-05', label: 'May 5–11 (Wed–Tue)', what: 'Final exam period (core and electives)', kind: 'exam' },
      { date: '2027-05-06', label: 'May 6 (Thu)', what: 'Session-2 Thursday-only classes end', kind: 'classes' },
      { date: '2027-05-07', label: 'May 7 (Fri)', what: 'Session-2 Friday-only classes end', kind: 'classes' },
      { date: '2027-05-17', label: 'May 17 (Mon), 5:00 p.m.', what: 'Graduating student grades due', kind: 'grades' },
      { date: '2027-05-24', label: 'May 24 (Mon)', what: 'Commencement', kind: 'milestone' },
      { date: '2027-06-02', label: 'June 2 (Wed), 5:00 p.m.', what: 'Continuing student grades due (with some exceptions)', kind: 'grades' },
    ],
  },
]

export const KIND_LABEL: Record<EntryKind, string> = {
  deadline: 'Deadline',
  exam: 'Exams',
  break: 'Recess',
  milestone: 'Milestone',
  classes: 'Classes',
  grades: 'Grades',
  holiday: 'Holiday',
}

/* ---------------- the apps you will be told to sign into ---------------- */

export interface Tool {
  name: string
  url: string
  tagline: string
  /** Written for someone who has never seen it. */
  what: string
  when: string
}

export const STUDENT_TOOLS: Tool[] = [
  {
    name: 'Canvas',
    url: 'https://yale.instructure.com',
    tagline: 'Where the coursework lives',
    what: "Yale's official course site. Every class has a page here with the syllabus, readings, assignment uploads and grades. The syllabus links on course cards in this app point at it.",
    when: 'Daily, once classes start. Check it before every session.',
  },
  {
    name: 'CampusGroups',
    url: 'https://groups.som.yale.edu',
    tagline: 'Clubs, events and the SOM calendar',
    what: "SOM's campus engagement platform: every club, every event, sign-ups, and the school-wide calendar. It is also where your course enrolment syncs to a calendar feed.",
    when: 'Weekly. Join clubs in your first fortnight — that is when recruiting for leadership roles happens.',
  },
  {
    name: 'Slack',
    url: 'https://somstudents.slack.com',
    tagline: 'How the school actually talks',
    what: 'The SOM student workspace. Cohort channels, club channels, and a channel per course. Most day-to-day questions get answered here faster than by email.',
    when: 'Constantly. Set up notifications on day one or you will miss things.',
  },
  {
    name: 'SOM Connect',
    url: 'https://somconnect.yale.edu',
    tagline: 'The alumni network',
    what: 'The alumni directory and engagement hub — regional groups, class groups, events. The people you want to talk to before a recruiting cycle are in here.',
    when: 'When you start networking, which is earlier than you think.',
  },
  {
    name: 'Career Development Office',
    url: 'https://cdo.som.yale.edu',
    tagline: 'Recruiting timelines and advising',
    what: 'CDO runs recruiting: deadlines, employer events, advisor appointments and the guides for each industry track.',
    when: 'From week one. Internship recruiting starts far earlier than most people expect.',
  },
  {
    name: 'SOM IT service catalog',
    url: 'https://confluence.som.yale.edu/display/SC',
    tagline: 'When something will not log in',
    what: 'The support documentation for all of the above — account setup, Slack and Canvas guides, printing, VPN, and who to ask when it breaks.',
    when: 'The first time anything refuses your NetID.',
  },
]
