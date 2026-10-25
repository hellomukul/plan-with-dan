# What does a student need from their chief of staff? (Oct 25, 2026)

**Question (AI Project Updates, 3c):** what else should Dan do, beyond "answer anything on SOM academics"?

**Method:** six agents, each role-playing a student from a different program, read the README, the research notes, the persona tests and `backend/programs.py`, then named the 6 capabilities they'd use weekly, whether each can be built without internal SOM data, and one thing Dan must never do.

| Persona | Situation |
|---|---|
| MBA first year | Gold cohort, Fall-2 starting, consulting recruiting, spring bids coming |
| MBA second year | Offer in hand, club president, last bids, graduating in May |
| EMBA | Director-level job, two kids, flies twice a month, alternate Fri/Sat weekends |
| MAM | International, prior MBA, one year on F-1, career switch or home |
| MMS (AM) | 22–24, one year, 18-unit floor, analyst recruiting, new to the US |
| MBA/JD | Splitting years between SOM and Yale Law, two calendars |

## What came up most

| # | Capability | Asked for by | Data needed | Today |
|---|---|---|---|---|
| 1 | **Clash radar for my whole life.** Import my other calendar (recruiting, travel, Law school), or paste events, and flag what hits a class, exam or deadline | MBA1, MBA2, EMBA, MMS, MBA/JD (5 of 6) | Yes, user-provided (.ics import or typed events) | Only SOM classes and SOM dates are checked |
| 2 | **Syllabus to deadlines.** Upload a syllabus PDF once; every case, problem set and exam lands on Dan's Desk and in the calendar feed | MBA1, MBA2, MMS, EMBA (4 of 6) | Yes, from files the student uploads; Canvas changes won't show | Not built |
| 3 | **"Will I graduate?" audit.** Units left, required courses, LDR/GSR/GSA, per-term floors, with done and planned kept separate; add courses the feed lacks (MGT 627, MGT 928, Law credits) | MBA2, MAM, MMS, MBA/JD (4 of 6) | Yes, from the Bulletin plus the student's own record | Partly built. Persona tests found "planned" shown as "done" and the 16-unit minimum shown to 2nd years |
| 4 | **One deadline desk for everything.** SOM dates plus my own: offer paperwork, club handover, home-country hiring, Law clinic deadlines, each tagged by source | MBA2, MBA/JD, MAM, EMBA (4 of 6) | Yes, user-provided | Dan's Desk shows SOM dates only |
| 5 | **Recruiting-aware term planning.** Keep Spring-1 light for superdays; workload and crunch-week heatmap; finals and interview crunch planner | MBA1, MBA2, MMS (3 of 6) | Partly: times, units and core exam slots are public (live feed); workload needs crowdsourcing | Clash checks only |
| 6 | **Add/drop what-if.** "If I drop X and take waitlisted Y, am I still at 16/72 units, clash-free and GSR-complete?" plus the late-fee date | MBA2, MAM (visa-safe load) | Yes | Not built |
| 7 | **Bid coach with honest numbers.** Split points across must-wins and nice-to-haves, name a backup for every course | MBA1, MBA2 | Partly; real clearing prices are internal, crowdsourced numbers must be labelled as such | Bid notes only |
| 8 | **Global Studies decision helper.** GNW vs IE vs exchange given GSA days, cost and clashes; funded travel days for MAM | MBA1, MAM | Yes | GSA days tracked |

## Program-specific needs (one persona each, but high stakes for that group)

- **EMBA: model the EMBA calendar.** A class-weekend countdown ("Fri/Sat on campus: pre-reads, the group deliverable due Thursday, book travel now"), a work-travel clash check, and a subscribe link with EMBA dates that family can see. Biggest gap: EMBA dates are linked, not modelled, so none of this works yet.
- **MAM and MMS (international): a sourced visa and OPT timeline.** It works backwards from the end date: when the OPT window opens, the grace period, reduced-load approvals, and the I-20 travel signature. Every item quotes the OISS page and says "confirm with OISS".
- **MBA/JD: a two-school planner.** Import the Law schedule, a joint-degree ledger (52 SOM units, at least 35.5 graded), and no SOM 16-unit warning in a Law semester.
- **EMBA: an employer-facing term summary.** One page with days away from work and dates, for a manager or sponsor.
- **MBA1: a networking follow-up tracker.** A thank-you note due in 24 hours and a "ping again in 3 weeks" reminder, linked to target firms.

## Guardrails all six agreed on

1. **Dan advises; the student clicks.** Never send emails, submit or change bids, register or drop courses. Drafts and reminders are fine.
2. **Label every number honestly.** Guessed or crowdsourced bid prices must never look like SOM history.
3. **Immigration: flag and route, never decide.** Show the date and the OISS source, and send students to OISS. Never say "you're fine". Don't store visa or SEVIS details.
4. **Don't treat everyone as a full-time MBA.** No auction or recruiting nudges for EMBA, no 16-unit warning for 2nd years or Law terms, and "Unconfirmed, ask X" when the rules aren't public.
5. **Stay quiet unless it matters.** For EMBA students especially: no daily digest, only items due or clashing within about 10 days.

## Suggested build order

1. **Personal events in** (3a, 1, 4). Let students import an .ics file or type events and deadlines. That powers the life clash radar and one deadline desk, and it fits the calendar-linking work in 3a.
2. **Fix and extend the graduation audit** (3). Keep done and planned separate, allow manual courses, and apply program-aware floors.
3. **Syllabus import** (2). Students upload a PDF; Dan extracts dated items and the student confirms each one before it lands anywhere.
4. **Add/drop what-if** (6). This is cheap, because the requirement checks already exist.
5. **EMBA calendar modelling** and the **international timeline with sources**: one program each, but each is the difference between Dan working for that group or not.
6. **Bid coach** once there is enough honestly labelled crowdsourced data.
