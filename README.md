<p align="center">
  <img src="docs/handsome-dan.svg" alt="Handsome Dan bulldogs" width="560">
</p>

<h1 align="center">Plan with Dan 🐶</h1>
<p align="center"><b>An AI chief of staff for Yale SOM students.</b><br>
Every day it surfaces the few planning decisions that matter (with real SOM deadlines), ranks real courses against your goals, keeps your timetable clash-free, plans Global Studies, coaches your bids and syncs your calendar. Nothing changes until you click, and every change can be undone.</p>

<p align="center">
  <b>Live app:</b> <i>(Render link added at deploy time)</i> ·
  <b>Report:</b> <code>submission/report.html</code> ·
  <b>Slides:</b> <code>submission/slides.html</code>
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

**5.** Open **http://localhost:8000**, click **Create account**, and answer the 5-question quiz.

**Notes**
- The database is a local SQLite file (`data/app.db`) and is created automatically on first run.
- The course data (`data/yale_som_classes.json`, 453 sections, under 1 MB) is in the repo, so no extra dataset is needed.
- If port 8000 is busy, use `--port 8010` and open that port instead.
- With no key, the app still runs. Search, planner, calendar, bids and Global Studies all work, and only the AI features say they're offline.

**Run the tests** (offline, no key needed)
```bash
python -m pytest -q
```
There are 49 tests covering:
- safety: injection blocking, invented-course removal and spend caps
- accounts and web security: login enumeration, CSRF and the CSP header
- planning rules: clash logic, spring core units, the 16-unit window, non-MBA programs, Global Studies data, the make-up day, and planned-vs-done requirements
- the calendar feed and the desk scan
- best-fit filtering
- undo, including no duplicates
- bid-report privacy and duplicates
- profile validation
- account export and delete

**Frontend development (optional, needs Node 20+)**
```bash
cd frontend && npm install && npm run dev
```
The dev UI runs on http://127.0.0.1:5173 and forwards `/api` to `API_PORT` (default 8000). Run `npm run build` to update `frontend/dist`.

## What it does

| Feature | What a student gets |
|---|---|
| **Dan's Desk** (home) | A 2–3 sentence brief written by the Chief of Staff agent *only* from decision cards that code computes (clashes, the 16-unit minimum, SOM deadlines, Global Studies, Leadership, bid split). Each card has a due date, a cited source, and approve / snooze / done. Below it: **best fits**, ranked in code with a label (Strong fit / Good fit / Worth a look), up to two reasons, demand shown separately, "Not for me", and a "Why?" panel quoting the course description. A side pane shows what's next, plan meters and an **undoable action log**. |
| ✨ **Find my courses** | A 5-step quiz (program, background, interests, short- and long-term goals, schedule vibe) leads to a shortlist of real courses. Each pick comes with a reason, a quoted line from the course description, a clash check, and backups in the same slot. |
| 🐶 **Ask Dan** | Chat that routes each question to one specialist (Course Scout, Planner, Bid Coach or Career Coach). Specialists use tools that read real data and can offer one-click "add to plan" buttons. |
| 📰 **AI News Desk** | Answers about current AI news using web search, with sources, and finishes with the SOM course where you can learn the topic. |
| 🗓️ **My plan** | A weekly timetable with session-1 and session-2 views, clash detection based on real session dates, section switching, a unit check (16-unit minimum, approval needed above 24), and status tracking (planned, bidding, enrolled, completed). |
| 🌍 **Global studies** | Every way to meet the GSR (IE, GNW, SNOC, GSE, exchange), checked against your 10 funded GSA days, with the matching courses and key dates. |
| 🎯 **Bid coach** | Splits a points budget by priority and seat demand. Students report their own bid outcomes so real history builds up (demo rows are clearly labelled **SAMPLE**). |
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
docs/              research notes, evidence log, submission checklist
```

## What I added to the lecture 8 base

This started from the class's *Yale SOM Course Explorer* (lecture 8: a catalog browser plus a single Q&A agent; upstream `zlisto/yale_som_courses_zlisto`, my fork `hellomukul/yale_som_courses_silver`). I kept the course data and the Handsome Dan mascot and **rewrote the backend and UI**:

- **Agents:** a multi-agent crew (Dispatcher plus 5 specialists) and a 5-stage recommender pipeline (Retriever, Curator, Validator, Scheduler, Critic), with an AI News Desk using web search.
- **Accounts and storage:** student accounts with saved profiles, plans, Global Studies choices, chats and bid reports.
- **Planning tools:** deterministic tools for clashes (fixing the base app's half-term bug), requirements, the GSA budget, backups and bid splits.
- **Calendar:** a subscription feed for Google, Outlook and Apple.
- **Safety and cost:** a safety layer, per-run token and cost accounting, spend caps, and a test suite.
- **Data:** seat limits and LDR/GSR flags merged in from SOM's public feed.
- **Chief of staff:** Dan's Desk, with a code desk scan, a cached Chief of Staff brief (about $0.0002 a day), honest best fits and an undo log.
- **Design:** a research-driven redesign ("Quiet Yale": calm layout, one Yale-blue accent, Geist type, no emoji, ⌘K; see `docs/design_brief.md`). The CSS-only Labubu component is still in the repo but no longer on the main screens.
- **Privacy:** export, delete, a privacy page, CSP and generic signup.

Not an official Yale tool. Requirements and dates follow the 2026–27 Yale Bulletin and SOM pages (sources in `backend/rules.py` and `docs/research.md`). Always confirm on the SOM internal site.
