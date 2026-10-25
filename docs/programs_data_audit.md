# Program coverage and data audit (Oct 24, 2026)

**Question:** does Plan with Dan have the official data and logic to work for every Yale SOM student, not only full-time MBAs?

**Sources:**
- The Yale Bulletin, School of Management 2026–27 (catalog.yale.edu/management), fetched Oct 24, 2026.
- SOM program pages (som.yale.edu).
- SOM's public course feed, which the app already uses: 453 sections, Fall 2026 and Spring 2027.

The rules now live in `backend/programs.py`, with a source URL for every fact. Anything I couldn't confirm is listed under `unconfirmed` and shown to students as "Unconfirmed", never as a rule.

## Coverage by program

The "Spring 2027 courses" column counts offerings visible to that program in the app.

| Program (profile code) | Rules modelled | Spring 2027 courses | Required courses in data | Calendar |
|---|---|---|---|---|
| Full-time MBA (`MBA`) | 72 units, cohort core, 16-unit minimum (first three terms), 24-unit cap, LDR, GSR and the 10-day GSA | 100 | Core by cohort (fall sections only) | MBA |
| MBA joint degree (`MBA-JOINT`) | 52 SOM units, 3 terms at SOM, otherwise MBA rules | 100 | as MBA | MBA |
| MBA for Executives (`EMBA`) | 72 units = 33 core + 17 advanced + 2 EMBA GNW + 20 electives; focus areas; 24-unit cap | 10 (EMBA sections) | EMBA core is in the feed | **Own calendar**: MBA dates are hidden, with a note |
| MAM (`MAM`) | 40 units = 4 required + 36 electives; at least 20 units per term; 24-unit cap; 5 funded travel days | 88 (before this fix: 2) | MGT 633 and MGT 636 (fall), both in data | MBA |
| MMS Asset Management (`MMS-AM`) | 36 units = 18 required + 18 electives; at least 18 per term | 90 | All 8 required sections are in data | MBA |
| MMS Global Business & Society (`MMS-GBS`) | 36 units; MGT 627; at least 16 units from the GBS list; at least 18 per term | 89 | **MGT 627 is not in the public feed** | MBA |
| MMS Systemic Risk (`MMS-SR`) | 36 units = 28 required + 8 electives (stats, econ or finance) | 89 | All 10 required sections are in data | MBA |
| MMS Technology Management (`MMS-TM`) | 36 units = 14 required + 14 pre-approved + 8 engineering school (SEAS) units | 89 | **Required numbers unconfirmed.** They're on SOM's web page but not in the Bulletin or the feed | MBA |
| MMS Public Education Management (`MMS-PEM`) | Summary only | 0 | **No PEM courses in the public feed** | **Own calendar** |
| PhD taking SOM courses (`PhD`) | Request-to-enroll note; doctoral courses plus MBA electives | 109 | n/a | Home school |

## What was wrong before this audit, and is now fixed

- **MAM, MMS and PhD students couldn't see SOM electives.** Eligibility only showed courses tagged with their program, so a MAM student saw 2 courses. Now each course carries the list of programs that can take it (`Section.audiences`).
- **All MMS tracks were treated as one.** There are 5 tracks (AM, GBS, SR, TM and PEM), each with its own required courses. The feed tags courses by track (for example "MMS AM"), and the app now uses those tags.
- **Non-MBA students only got a "not modelled yet" note.** Requirements, desk cards, best fits and chat now use each program's real minimum and cap, and its required-course checklist.
- **EMBA students were shown MBA deadlines.** EMBA students and MMS-PEM students now see a note pointing to their own calendar instead.
- **Two MBA rules had been flagged as unsourced. Both are now verified:**
  - The 24-unit approval rule is in the Bulletin's course policies for residential master's programs, so it also covers MAM and MMS.
  - The 10-day GSA is on the Bulletin's Global Studies financial support page. The same page gives MAM students a 5-day subvention and MMS-GBS students GNW travel support.

## Still missing (what the app can't know from official public data)

1. **MGT 627** (the required MMS-GBS course) and the MMS-TM required courses aren't in SOM's public course feed. The app says so and sends students to their program office.
2. **MMS-PEM courses** aren't in the feed at all. PEM students get the program summary and links, not a planner.
3. **EMBA:**
   - The required course for each area of focus isn't public.
   - Whether EMBA electives use the auction isn't stated.
   - The EMBA calendar dates aren't modelled; the app links to them instead.
4. **MAM:** whether a Global Network Week is required isn't stated.
5. **Joint degrees:** whether the Leadership and Global Studies requirements apply isn't stated.
6. **Internal-only data:**
   - The official Leadership course list. The app infers it from the MGLD flag.
   - Auction dates, point budgets and clearing prices.
7. **2027–28 courses** aren't published yet, so second-years and MBA planners can't plan beyond Spring 2027.

## How to keep it current

- The server refreshes itself from SOM's live feed (`som.yale.edu/courses/session-items/<term>`) at startup and every 12 hours, into `data/som_live.json`. That feed adds each core section's cohort (fall and spring), its room and its final-exam slot. If the feed is down or looks incomplete, the server keeps serving the committed snapshot.
- Run `python scripts/refresh_data.py --live` to rebuild the committed snapshot from the feed, or pass CSV exports from som.yale.edu/elective-core-courses if the feed is ever unavailable.
- Re-check `backend/programs.py` against the new Bulletin each August. Every fact there has its source URL beside it.
