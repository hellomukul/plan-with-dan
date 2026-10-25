<p align="center">
  <img src="docs/handsome-dan.svg" alt="Handsome Dan bulldogs" width="560">
</p>

<h1 align="center">Plan with Dan 🐶</h1>
<p align="center"><b>An AI chief of staff for Yale SOM students.</b><br>
Tell Dan what you want from SOM and Elihu, his course-picking owl, ranks real courses for it across every quarter you have left (through Spring 2028). Keep your timetable clash-free, track Global Studies, Leadership and your Pass/Fail budget, plan bids and swaps, add courses from other Yale schools, and sync your calendar. Nothing changes until you click, and every change can be undone.</p>

<p align="center">
  <b>Live app: <a href="https://plan-with-dan.onrender.com">plan-with-dan.onrender.com</a></b> (free hosting: the first load can take ~1 minute while it wakes up) ·
  <b>Report:</b> <code>Final Project Submission/report.html</code> ·
  <b>Slides:</b> <code>Final Project Submission/slides.html</code>
</p>

---

## Run it locally (about 3 minutes)

You need **Python 3.11+** and one API key: `PORTKEY_API_KEY` (course key, uses `gpt-6-luna`) or `OPENAI_API_KEY`. Node is **not** needed because the built web app is committed in `frontend/dist`.

**1. Get the code**
```bash
git clone <this-repo-url> plan-with-dan
cd plan-with-dan
```

**2. Install** (macOS / Linux)
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```
On Windows PowerShell, use `py -m venv .venv`, then `.venv\Scripts\Activate.ps1`, then `pip install -r requirements.txt`.

**3. Key.** The app looks for `.env` **in this folder first, then in the folder above it**. If the graders' `.env` sits one level up, there's nothing to do. Otherwise:
```bash
cp .env.example .env    # then paste your PORTKEY_API_KEY (or OPENAI_API_KEY)
```

**4. Start it**
```bash
uvicorn backend.main:app --port 8000
```

**5.** Open **http://localhost:8000**, click **Sign up**, and answer the 5 quick profile steps (about a minute).

**Notes**
- The database is a local SQLite file (`data/app.db`) and is created automatically on first run.
- The course data (`data/yale_som_classes.json`, 453 sections, under 1 MB) is in the repo, so no extra dataset is needed.
- If port 8000 is busy, use `--port 8010` and open that port instead.
- With no key, the app still runs. Search, planner, calendar, bids and Global Studies all work, and only the AI features say they're offline.

**Hosting it for friends (keep their accounts safe)**

Render's free disk is wiped on every deploy, restart or idle spin-down. A SQLite file there would lose every account, so online the app must use a managed Postgres:
1. Create a free database at [neon.tech](https://neon.tech) in AWS US East (Ohio), the same region as `render.yaml`. It has no expiry; Render's own free Postgres is deleted after 30 days. Copy its connection string.
2. In Render, go to **Environment** and set `DATABASE_URL` to that string. `/api/health` should then show `"storage": {"engine": "postgres"}`.
3. Optional: move your local data first. Run `python scripts/db_tools.py backup` locally, then run `python scripts/db_tools.py restore backups/<file>.json` with `DATABASE_URL` pointing at Neon.

To check the app against Postgres, run the whole test suite on an **empty** database: `TEST_DATABASE_URL=<url> python -m pytest -q`. It passed 58/58 on Neon (PostgreSQL 18) on Oct 24, 2026.

**Owner dashboard.** Set `OWNER_EMAILS` (comma-separated) in Render to the email of your own account. That account then sees **Owner dashboard** in the sidebar (`#/owner`): sign-ups, finished setup, active today / this week / this month, a 30-day chart, feature use, AI spend and the newest accounts. It refreshes every minute and shows no emails or names. Everyone else gets "page doesn't exist". List only emails that already have an account, since sign-up doesn't verify email ownership.

Owner tools (`scripts/db_tools.py`):
- `stats`: row counts.
- `backup`: a JSON snapshot. Keep these private, since they contain emails and password hashes.
- `restore`: loads a snapshot, and only into an empty database.
- `reset-password EMAIL`: there's no email service, so this is how you help a friend who forgot their password. It prompts for the new password and never echoes it.

Sessions last 30 days and renew while in use. App updates that add database fields migrate existing tables automatically; columns are only ever added, never dropped.

**Run the tests** (offline, no key needed)
```bash
python -m pytest -q
```
There are 138 tests covering:
- safety: injection blocking, invented-course removal and spend caps
- accounts and web security: login enumeration, CSRF and the CSP header
- planning rules: clash logic, spring core units, the 16-unit window, non-MBA programs, Global Studies data, the make-up day, and planned-vs-done requirements
- the calendar feed and the desk scan
- best-fit filtering
- undo, including no duplicates
- bid-report privacy and duplicates
- profile validation
- account export and delete
- chat memory
- Yale facts lookup
- program rules for EMBA, MAM and all MMS tracks
- database migrations
- Course picks (ranking across quarters, apply, undo), moving courses between years, the Pass/Fail budget, screenshot import, outside-SOM courses, swap checks, cross-listed tags, other-Yale course search, the owner dashboard's privacy

**Course data**
- SOM courses: SOM's public course feed (`backend/som_feed.py`), snapshot in `data/yale_som_classes.json` (451 sections, 2026–27). SOM hasn't published 2027–28 yet, so Fall 2027 and Spring 2028 plans use this year's offering in the same quarter, and the app says so.
- Courses at other Yale schools: `python scripts/fetch_yale_courses.py` rebuilds `data/yale_other_courses.json` from the public Yale Bulletin (Graduate School, Jackson, Environment, Public Health; ~1,100 courses, no meeting times). Yale Course Search answers automated requests with a bot challenge, so we don't use it.

**Frontend development (optional, needs Node 20+)**
```bash
cd frontend && npm install && npm run dev
```
The dev UI runs on http://127.0.0.1:5173 and forwards `/api` to `API_PORT` (default 8000). Run `npm run build` to update `frontend/dist`.

## What it does

| Feature | What a student gets |
|---|---|
| **Public home page** | Dan, inline in the hero: program-aware starter questions answered instantly from a server cache, a live status line, and a calm visitor cap of 15 questions per device per day. Below it is an "I'm an MBA first year in Blue" picker driving four tabs, all without an account. **Your week** pre-fills what SOM schedules for you; then you add electives and check clashes, units and the calendar file. **Dates** has every remaining date and a calendar download. **Get help** has official links and a glossary. **Requirements** has your program's rules with sources. Then Straight answers and a 4-card account pitch. See `docs/landing_v3_brainstorm.md`. |
| **Dan's Desk** (home) | A 2–3 sentence brief written by the Chief of Staff agent *only* from decision cards that code computes (clashes, the 16-unit minimum, SOM deadlines, Global Studies, Leadership, bid split). Each card has a due date, a cited source, and approve / snooze / done. Below it: **best fits**, ranked in code with a label (Strong fit / Good fit / Worth a look), up to two reasons, demand shown separately, "Not for me", and a "Why?" panel quoting the course description. A side pane shows what's next, plan meters and an **undoable action log**. |
| 🎓 **Every SOM program** | Rules from the 2026–27 Yale Bulletin for the full-time MBA, joint-degree MBA, MBA for Executives, MAM, every MMS track (Asset Management, Global Business & Society, Systemic Risk, Technology Management, Public Education Management), and PhD students. Each program gets its own course eligibility, unit limits, required-course checklist and calendar. Gaps in the official data are listed in `docs/programs_data_audit.md`. |
| ✨ **Course picks** | Tell Elihu, Dan's course-picking owl, what you want from SOM. He ranks real courses for that goal across every quarter you have left (through Spring 2028), each with a reason and a quoted line from the course description. You tick what to keep and add them in one click (undoable). Clashes and time-preference breaks are flagged on the card; 2027–28 courses are labelled as expected from this year's offerings; a "Beyond SOM" list suggests matching courses at other Yale schools. |
| 🏛️ **Other Yale schools** | 1,140 courses SOM students can take at GSAS, Environment, Public Health and Jackson, from the public Yale Bulletin, in their own Course explorer tab with a violet school badge and the cross-registration rules. Add one to your plan as an outside course (you type the time, then it's clash-checked). SOM courses taught with another school carry a teal "Taught with" badge. |
| ✅ **Requirements** | Progress towards the degree, Leadership (every MGLD-flagged course), Global Studies, and a Pass/Fail budget from grades you log. Import courses you've taken from a Yale Hub screenshot. |
| 🐶 **Dan, on every page** | A floating chat with the bulldog in the corner of every page, including the public home page. Signed-in students get the full plan-aware Dan. Visitors can ask about courses, programs or AI news without an account: nothing is stored, each IP gets 15 questions a day, and all visitors share a $1/day budget (`PUBLIC_MESSAGES_PER_DAY`, `PUBLIC_DAILY_BUDGET_USD`). |
| 🐶 **Ask Dan** | Chat that routes each question to one specialist: Course Scout, Planner, Bid Coach, Career Coach or SOM Guide. Specialists use tools that read real data and can offer one-click "add to plan" buttons.<ul><li>**Personal:** every answer sees your program, goals and plan.</li><li>**Memory:** Dan remembers the whole conversation. Older turns are folded into a summary by a Memory Keeper agent, and lasting facts about you are kept. You can see and delete those facts.</li><li>**Honest:** when the catalog and the sourced Yale facts base don't cover a question, Dan says "I don't know" and links the official page.</li></ul> |
| 📰 **AI News Desk** | Answers about current AI news using web search, with sources, and finishes with the SOM course where you can learn the topic. |
| 🗓️ **My plan** | A weekly timetable with session-1 and session-2 views, clash detection based on real session dates, section switching, a unit check (16-unit minimum, approval needed above 24), and status tracking (planned, bidding, enrolled, completed). |
| 🌍 **Global studies** | Every way to meet the GSR (IE, GNW, SNOC, GSE, exchange), checked against your 10 funded GSA days, with the matching courses and key dates. |
| 🎯 **Bidding** | Splits a points budget by priority and seat demand. Students report their own bid outcomes so real history builds up; a course's outcomes stay hidden until five students report it. "Swap a seat" checks a body-to-body swap against your plan and drafts the post. |
| 📆 **Calendar** | A month view of classes and SOM deadlines, plus one private subscription link for Google, Outlook and Apple Calendar, or an .ics download. |
| 🧾 **Cost & safety** | Token counts and dollars for every run, daily budgets, and a log of every safety event. |
| **Privacy and data** | What's stored and where AI requests go (Portkey → OpenAI), one-click export of all your data, and password-confirmed account deletion. |
| **⌘K** | Jump to any page or course, or hand a question to Dan, from the keyboard. |

## How the agents work

```
Chat turn:   safety screen ─▶ budget check ─▶ Dispatcher (1 small structured call)
                                               │ routes to exactly one specialist
             Course Scout · Planner · Bid Coach · Career Coach · AI News Desk (+web search)
                                               │ deterministic tools: search_catalog, check_fit,
                                               │ plan_review, requirements_status, global_options,
                                               │ bid_history, suggest_bid_split, suggest_add …
                                               ▼
             output check (secrets, course numbers not in the catalog) ─▶ answer + "add" buttons

Find my courses: Retriever (code, BM25 on goals) ─▶ Curator agent ─▶ Validator (code)
                 ─▶ Scheduler (code: clash-free sections + backups) ─▶ Critic agent
```

- **Model:** `gpt-6-luna` through Portkey. It's the only model the course key allows, and at $0.10 / $0.50 per 1M tokens a typical turn costs under a fifth of a cent.
- **Facts come from tools; reasoning comes from the model.** Times, clashes, units, requirement status and the GSA budget are always computed in code.
- **Prompt caching:** every agent's instructions start with the same static primer, so 60–70% of input tokens are billed at the cached rate.

## Safety

| Risk | Defense (built and tested) |
|---|---|
| Prompt injection or data leaks | `screen_input` blocks "ignore your instructions", system-prompt and key requests, other students' data, fake control tags and SQL before any model call, so a blocked attempt costs $0. Untrusted text (descriptions, web pages, notes, chat history) is wrapped in `<untrusted>` fences. Blocked messages are never replayed into later prompts. |
| Invented courses or facts | The recommender only accepts keys from the shortlist it was given, and removes any "evidence" quote that isn't really in the course description. The chat output is checked for course numbers that aren't in the catalog. |
| Wrong actions | Agents can only *suggest* plan changes. The student clicks to add. |
| Loops and overspending | Request limits per agent, a per-tool loop guard, a token cap derived from the remaining budget, $0.05 per turn and $0.50 per student per day (configurable), plus rate limits on login, chat and recommend. |
| Account security | Argon2id hashes, HttpOnly SameSite session cookies (only the token hash is stored), a CSRF origin check, a strict Content-Security-Policy, and no secrets in the repo. Login gives the same answer and timing whether or not an email exists. **Signup can't fully hide that** without email verification (an existing email isn't signed in), so we keep its timing equal and rate limit it. Expired sessions are purged at startup. |
| Bid data | One report per student, course and term (a new report replaces the old one). Stats stay hidden until 3 real reports exist, so no single classmate's bid shows. SAMPLE rows never change a point split. |
| Privacy | Blocked prompts are never stored (only the reason and length are logged). Students can export all their data or delete their account. A Privacy page explains the data flow to Portkey and OpenAI. |
| Mistaken actions | Every plan change is logged with one-click undo; desk cards can be snoozed or dismissed and restored. |

## Repo map

```
backend/
  main.py          API routes + serves frontend/dist
  config.py        .env loading (repo folder, then parent), model client
  db.py, auth.py   SQLModel tables; accounts and sessions
  catalog.py       typed catalog, topic tagging, BM25 search
  planning.py      clashes, week review, requirements, GSA, backups, bid maths
  rules.py         SOM rules + calendar with sources (2026–27 Bulletin)
  ics.py           calendar feed (RRULE/EXDATE/VTIMEZONE)
  safety.py        input screen, fencing, output check, spend guard, validator
  pricing.py       token prices → dollars
  crew/            agents, tools, chat pipeline, recommender pipeline, run accounting
  prompts/         shared primer + role prompts
frontend/          React + Vite + TypeScript (dist/ is committed)
data/              SOM course data (public course directory, Oct 2026)
scripts/           refresh_data.py, enrich_from_som_feed.py
tests/             pytest suite
docs/              research notes, evidence log, user feedback review
Final Project Submission/   report.html, slides.html (submitted on Canvas), their sources and evidence
```

## What I added to the lecture 8 base

This started from the class's *Yale SOM Course Explorer* (lecture 8: a catalog browser plus a single Q&A agent; upstream `zlisto/yale_som_courses_zlisto`, my fork `hellomukul/yale_som_courses_silver`). I kept the course data and the Handsome Dan mascot and **rewrote the backend and UI**:

- **Agents:** a multi-agent crew (Dispatcher plus 6 specialists, a Memory Keeper) and a 5-stage recommender pipeline (Retriever, Curator, Validator, Scheduler, Critic), with an AI News Desk using web search.
- **Accounts and storage:** student accounts with saved profiles, plans, Global Studies choices, chats and bid reports.
- **Planning tools:** deterministic tools for clashes (fixing the base app's half-term bug), requirements, the GSA budget, backups and bid splits.
- **Calendar:** a subscription feed for Google, Outlook and Apple.
- **Safety and cost:** a safety layer, per-run token and cost accounting, spend caps, and a test suite.
- **Data:** seat limits and LDR/GSR flags merged in from SOM's public feed.
- **Chief of staff:** Dan's Desk, with a code desk scan, a cached Chief of Staff brief (about $0.0002 a day), honest best fits and an undo log.
- **Design:** a research-driven redesign ("Quiet Yale": calm layout, one Yale-blue accent, Geist type, no emoji, ⌘K; see `docs/design_brief.md`). The CSS-only Labubu component is still in the repo but no longer on the main screens.
- **Privacy:** export, delete, a privacy page, CSP and generic signup.

Not an official Yale tool. Requirements and dates follow the 2026–27 Yale Bulletin and SOM pages (sources in `backend/rules.py` and `docs/research.md`). Always confirm on the SOM internal site.
