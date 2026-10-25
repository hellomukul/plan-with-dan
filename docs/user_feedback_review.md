# Real-user feedback review (Oct 25, 2026)

**Status: all 13 to-dos done and tested** (also ticked on the Notion page). Dropped items, with reasons, are at the end.

**Source:** the Notion page "Feedback from real user" (WhatsApp messages and two screenshots).
**Who:** two Yale SOM students: a first-year MBA (Silver cohort) and a second-year MBA. Named by role only.
**Build reviewed:** both used the *previously published* version. Each point below is checked against the current local build (commit 1ae58f7) before deciding.

## What they liked (usable as evidence in the report)

**First-year MBA (Silver):**
- "Love!!"
- My plan is "the most intuitive" page.

**Second-year MBA:**
- "I absolutely loved the tool, and think it is very thoughtful. Really impressive!!"
- "A lot of my ideas on a similar tool were already captured by you."
- They had planned to build something similar themselves and never found the time.

## Point by point

| # | Who | Feedback | Checked against the current build | Verdict |
|---|---|---|---|---|
| 1 | First-year | The dropdown colour is hard to read (the "Any topic" filter in the Course explorer, shown on Windows). | Native dropdown lists take their colours from the operating system. We set `color-scheme: dark` but never styled the options themselves, so on some Windows setups the list can render low-contrast. | **Fix now.** Give options an explicit dark background and light text. |
| 2 | First-year | Rename "Running total" to "Progress towards degree". | Still says "Running total" on My plan & timetable. | **Fix now.** |
| 3 | First-year | Colour-code first-year required core vs electives. | Core chips are only dashed and grey; electives have no distinct colour, and there's no legend. | **Fix now.** Distinct elective accent and a small legend (Core · Elective · Expected). |
| 4 | First-year | Move classes around on My plan, e.g. drop some from a term that's over the limit (she had 32 units in Fall 2027). | In the all-years view a course opens its details; removing or moving takes extra clicks. The new Course picks pre-ticks only the essentials, so overloading a term is now less likely. | **Fix now.** Quick Move and Remove on each elective in the all-years view. |
| 5 | Second-year | Asked about LDR electives; the chatbot pointed to an internal page and missed electives. | Tested on the current build: Dan now lists LDR courses itself, but only 5 of the 10 that SOM's feed flags for Spring 2027 (his search stops at the top matches). Yale's internal LDR page needs a NetID, so we can't read it. | **Fix now.** A tool that lists every flagged LDR course, used for LDR questions. Keep the honest note that flags come from the public feed. |
| 6 | Second-year | The elective-load answer should consider clubs, projects and social commitments. | Tested: the answer talks only about units and the 16–24 range. | **Fix now.** Dan weighs recruiting, clubs, projects and social plans, and asks about them if unknown. |
| 7 | Second-year | Wants bid information while comparing electives. | Already there: Shortlist → compare shows seats, demand and the median winning bid. Not in the course details panel. | **Mostly solved.** Small add: demand line in the course details panel. |
| 8 | First-year | Log grades, to see how many more Pass credits are allowed. | The rule is already in the data (`PASS_FAIL_CAP_UNITS`: 23.5 units for the MBA, 16.5 for joint degrees). Grades aren't stored. | **Next.** A Pass/Fail budget on Requirements, with grades on completed courses. |
| 9 | Both | Courses outside SOM (e.g. Yale GSAS English). | Still SOM only. | **Next.** First let students add an outside course by hand; import Yale-wide data later. |
| 10 | Second-year | Entering already-taken courses is a pain; paste a Yale Hub screenshot and have them picked up. | Today it's a typed list in the profile. | **Next.** Screenshot import (image reading, as in the course's image-analysis lecture), with a confirmation step. |
| 11 | Second-year | Workload per course (assignments, exam vs project). | Not shown. | **Later.** Pull exam-or-project and deliverables from descriptions and syllabi, labelled as estimates. |
| 12 | Second-year | Peer feedback (course evaluations), and similar-taste recommendations. | Evaluations are behind Yale login; can't be read. | **Later.** Optional student ratings, crowdsourced like bid outcomes. The similar-taste idea is the student's own "overkill" note. |
| 13 | Second-year | Strategy for body-to-body (B2B) swaps. | The swap-form date is stored; there's no strategy help. | **Later.** A swap section on Bidding. |

## Also learned
- Both reviewed the old version. Several pain points (confusing navigation, too much at once) are already addressed by the signed-in redesign and the new Course picks flow. **Ask them to look again after the push.**
- The second-year: "ask diverse people to get everyone's view." The next round should include MAM, EMBA and international students.

## What was done (to-do list on Notion, worked in order)

| # | To-do | Built |
|---|---|---|
| 1 | Readable dropdowns | Explicit high-contrast option colours, so lists drawn by the operating system stay readable on Windows. |
| 2 | "Progress towards degree" | Renamed on My plan & timetable. |
| 3 | Core vs electives | Electives in blue with an "Elective" tag, core grey and dashed, expected 2027–28 courses dashed blue, plus a legend. |
| 4 | Move or remove on My plan | A "⋯" menu on each planned course: move it to the same season this or next year, or remove it. Both can be undone, and a move is only offered when it can succeed. |
| 5 | Every LDR course | New Dan tool `ldr_courses` lists every course SOM's data flags for Leadership; tested: all 9 for Spring 2027 in one call ($0.0005). |
| 6 | Course load in context | Dan weighs recruiting, clubs, projects, work and personal plans, asks if they're unknown, and labels ranges as guidance, not rules. |
| 7 | Bids while comparing | The course details panel shows seats, demand and pooled past winning bids. |
| 8 | Peer feedback | A "Course evaluations" link to SOM's official page (Yale login). |
| 9 | Workload | "How it's graded" in course details, read from the description and exam schedule (100 of 273 electives say something; the rest point to the syllabus). |
| 10 | Pass/Fail budget | On Requirements: finished courses (completed core added automatically) with a grade you log; units left against the Bulletin cap (23.5 for the MBA). Grades are private and never sent to the AI. |
| 11 | Screenshot import | On Profile: upload a Yale Hub screenshot, Dan reads course numbers and any grades, and you tick what to keep. The image isn't stored. Tested on a real screenshot: 26 courses found for about $0.001, with catalog titles shown so misreads are easy to spot. |
| 12 | Outside-SOM courses | "Add a course from outside SOM" on My plan: school, number, title, units, term, days and times. It joins the term, the timetable and clash checks, with its units shown apart from SOM's totals. |
| 13 | Body-to-body swaps | "Swap a seat" on Bidding: pick a course you'd give up and one you want; Dan checks fit by section (plan, core, outside courses), unit and requirement changes, and drafts a post. Tips are labelled as tips. |

Tests: 134 pass, including new ones for moves, grades, imports, outside courses and swap checks.
