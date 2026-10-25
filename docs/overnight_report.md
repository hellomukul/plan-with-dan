# Overnight report: Updates 3.0 (Oct 25–26, 2026)

Everything below is built, tested and **not committed** (you said you'd commit in the morning). The final status of each Notion point is at the end.

## What's new for students

| Area | What changed |
|---|---|
| **Registrar email data** | The 2026–27 auction (Nov 9, 8:30 a.m. → Jan 4, 8:30 a.m.), rounds, GNW/IE/SNOC deadlines, the Nov 2 presentation, Nov 11 office hours, Yale Hub add/drop, the swap form, exchange auction and policies are stored in `backend/rules.py` (`AUCTION`, `AUCTION_DATES`). First-year MBAs (and joint-degree) see them on the Dates tab, signed-in calendar, .ics feed, Dan's Desk, Bid coach, Global studies and in Dan's answers. Nobody else does. No round dates are guessed; no staff names or meeting links are stored. |
| **Dan's Desk** | Rebuilt: today strip (next class, room, live countdown), this week's timetable, "This week" (max 3), auction countdown (first-year MBAs), one-line brief, progress rings (units, GSR, LDR). Recent actions moved to My plan. |
| **Sign up / log in** | Full-width toggle with a sliding pill and Gen Z copy; "Sort your semester. Hire a chief of staff, free."; Google and Microsoft sign-in (hidden until you add keys, see below); keeps the visitor's program, year, cohort and week; lands you where you were going. |
| **Calendar linking** | "Link your calendar" opens a one-step sheet that says it creates your free account; one-click Apple / Google / Outlook (Yale) / Outlook.com subscribe buttons; appointments can be deleted with Undo. |
| **Course explorer** | Renamed from Catalog; faculty filter and faculty search; "Your core" labels; in-session courses say "add/drop closed" with an "I'm taking it" option; a profile prompt when goals are empty or old; a subtle "Stuck between two electives? Ask Elihu" box. |
| **Elihu** | Dan's course recommender, with an HTML/CSS owl. Only recommends courses that fit the student's week, at most one global trip, follow-up questions as chips. |
| **Faculty page** | Daily spotlight, search, filters, A–Z, cards with courses this year, co-teachers, themes and a verified official profile link (71 of 75 links checked live; the rest fall back to the SOM directory). No ratings, opinions or photos. |
| **Global studies & Leadership** | Two separate requirements with progress pills, a 3-step strip, auction rounds for first-years, program-correct text for MAM/MMS. |
| **Get help** | Four doors: Career/CDO, Academics, Wellbeing (calm, with the urgent line), International & more. |

## How it was tested

- **Build team:** 4 agents (Global/Bids/Help; sign-in/calendar; explorer/faculty/Elihu; Desk), each owning separate files, each design-testing at 1440 / 1024 / 375.
- **External testing agency:** 3 independent testers (design + accessibility, student journeys, backend + security) found 128 issues: 1 blocker, 15 high. Four fixers and I fixed them; two retesters verified every item. No regressions; the blocker and all highs are fixed.
- **Automated:** 117 backend tests pass; the frontend type check (`npx tsc -p tsconfig.app.json`) is clean; the home-page layout audit (`qa/layout-audit.js`) passes at all three widths (page length never changes while you use it).
- **AI spend for all testing:** a few cents.

### Security fixes worth knowing
Rate limits can't be bypassed with a fake IP header; a classmate can't lock someone out; pre-registering a student's email can't be used to take over their account once they use Google; request bodies are capped; private calendar links are kept out of logs; HSTS on; API docs hidden on Render; Dan's injection screen catches far more tricks without blocking normal questions; "Sign out everywhere" on Privacy; bid stats need 5 different reporters.

## What you need to do

1. **Commit and push.** Nothing is committed (110 changed/new files). `frontend/dist` is rebuilt and must be committed too: Render serves it.
2. **Google / Microsoft sign-in (optional for today).** Follow `docs/oauth_setup.md`: create the Google OAuth client and the Microsoft Entra app, set the redirect URIs to your Render URL, then add `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` and `PUBLIC_BASE_URL` in Render. Until then the buttons stay hidden and email sign-up works.
3. **Send the course auction rounds file** from the registrar's email; I'll add the exact round dates (nothing guesses them now).
4. **After deploying,** check one thing on the live site: rate limits use Cloudflare's `CF-Connecting-IP` there. Type a wrong password 11 times for one email (yours): the 11th try should say "Too many attempts". Your correct password works again after 15 minutes, or immediately from another device.

## Known, decided or left for later
- No password reset (the app can't send email). The log-in dialog says so honestly; students can use Google/Microsoft once enabled.
- Bid statistics can't be fully protected from fake accounts; they're now much harder to game.
- Visitor chat limits reset if someone clears cookies (the per-IP cap still applies).
- Some catalog data quirks come from SOM's own feed (e.g. MGT 420 "Workforce" vs "The Workforce"; one section with a start date a year early, handled safely).
- On phones the home page tabs keep their natural heights (on desktop they're identical).

## Final checks (Oct 26, morning)
- Production build against your real Neon database: starts cleanly, the new tables and columns migrated, no server errors.
- Home-page layout audit on that build: pass at 1440 (3576 px throughout) and 375 (5571 px, no sideways scroll); 1024 passed on the same code (3621 px).
- 117 backend tests pass; frontend type check clean.

## Notion "Updates 3.0" status
- **Ticked (23):** calendar linking, sign-up toggle, Course explorer rename, profile prompt + Elihu, Faculty page, Global studies page, GSR & LDR, the registrar email item and all 10 sub-points, Help's 4 doors, Dan's Desk, the order, the split into separate areas, "Done means", and no Zoom link or staff names stored.
- **Left for you (3):** Google/Microsoft sign-in (built; switches on once you add the keys in Render), the git checkpoint commit, and sending the course auction rounds file.
