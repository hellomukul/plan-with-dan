# Notes: where every number comes from, and what to refresh

Built on Oct 25, 2026 (evening), against commit `3c778d7` plus the uncommitted work in progress at that time.

## Sources used

- **Real runs** (`evidence/token_runs.json`): FastAPI `TestClient` against a scratch SQLite database (`DATABASE_URL=sqlite:///…/x.db`), with the real `gpt-6-luna` through Portkey. The numbers are the `usage` field of each response. Test profile: first-year MBA, Silver cohort, healthcare-consulting background, interests Healthcare/Finance/AI, nothing before 9:00, Fridays free.
- **UI runs**: the dev web server on port 5186 (`pwd-web-d` config, proxying to the API on 8012, which uses the throwaway `data/dev_agents.db`). A throwaway account `qa.report.<timestamp>@example.com` was used and has been deleted.
- **Production aggregates** (`evidence/production_aggregates.json`): read-only `COUNT`/`SUM` queries through `backend/db.py` with the production `DATABASE_URL`, run around 21:00 UTC on Oct 25. No emails, names or URLs were printed or stored.
- **Tests** (`evidence/pytest_safety.txt`): `.venv/bin/python -m pytest -v -k "signup_login or injection or spend or budget or owner or package"` and the full suite.
- **Older measurements** from `docs/evidence_log.md` (Oct 24): the shortlist experiment and the news cost before and after the cap.
- **Real-user feedback** from `docs/user_feedback_review.md`.
- **Rules and competitors** from `docs/research.md` (checked Oct 24) and the Yale Bulletin links cited in the report.

## Every number

| Number | Where it appears | Source |
|---|---|---|
| 451 sections, 306 offerings; 234 Fall 2026 + 217 Spring 2027 | report tiles | `/api/health` and `catalog.get_catalog()` (live feed snapshot) |
| 1,140 other-Yale courses: GSAS 968, Environment 83, Public Health 70, Jackson 19 | report, slides | `other_courses.load()` after removing SOM cross-listings (the raw file has 1,165) |
| 17 cross-listed SOM courses (Divinity, Jackson, Law, Music, Environment, Yale College) | report | `catalog` offerings with `taught_with` |
| 11 agents; 15 tools + web search | report, slides, diagram | `backend/crew/agents.py`, `importer.py`, `tools.py` (incl. the new `other_yale_courses`) |
| Ask Dan turn: 26,435 in / 19,707 cached / 1,491 out / $0.001615 / 15.7 s; Dispatcher 2,114 in, $0.000156 | report, slides | token_runs.json → `chat` |
| LDR turn: 12,715 / 10,370 / 664 / $0.00067 / 10.8 s; 9 courses flagged for Spring 2027 | report | token_runs.json → `ldr` |
| Course picks: 7,534 / 1,826 / 1,405 / $0.001292 / 11.7 s; 159 eligible → 36 shortlisted; ~47.7k tokens saved; kept 12, dropped 0 | report, slides | token_runs.json → `package` (trace) |
| Desk brief: 1,939 / 1,545 / 252 / $0.000181 / 3.4 s; cards "Add 3 more units… Jan 26", "Pick a Global Studies path… Mar 8", "Plan a Leadership course" | report | token_runs.json → `desk` and `/api/usage` |
| AI news: 22,455 / 6,150 / 935 / 2 searches / $0.022159 (tokens $0.002159) | report, slides | token_runs.json → `news` |
| Injection: 0 tokens, $0, 0.01 s, 3 reasons | report, slides | token_runs.json → `inject`; screenshot 09 |
| UI runs: Ask Dan $0.0017 (35.7k in, 29.8k cached); LDR $0.0011 (12.4k in, 82% cached, 4 calls); Elihu replay 1.1 s (gateway cache) | report captions | Cost and safety page (screenshot 10) and the traces |
| Prices $0.10 / $0.01 / $0.50 per 1M; web search $0.01 per call; astra $10 / $1 / $50 | report, slides | `backend/pricing.py` |
| Caps: $0.05 per turn, $0.50 per student per day, $1.00 visitor pool, 15 visitor messages per IP per day, 12 requests (3 for news), chat 20/min, picks 6/min | report, slides | `backend/config.py`, `crew/chat.py`, `main.py` |
| Production chat average $0.00134 (21 runs, $0.02811) | cost model | production_aggregates.json → spend_by_feature.chat |
| Per student per month $0.1372 = 20×0.000181 + 3×0.001292 + 30×0.0013386 + 4×0.022159 + 1×0.0009 | report, slides | arithmetic on the rows above; the import cost is one dev-server run ($0.0009, Cost and safety page) |
| 100 → $13.72; ≈700 → $96.03; 10,000 → $1,371.89; without news $4.86 / $33.99 / $485.53; ceilings $1,500 / $10,500 / $150,000 | report, slides | the per-student figure × N; ceiling = $0.50 × 30 × N |
| Caching savings: chat −52% ($0.001615 vs $0.003389), LDR −58% | report, slides | same tokens priced without the cached rate |
| Shortlist experiment: $0.00309 → $0.00103 (−67%); 5 picks, 5/5 quotes, 4 vs 3 fit | report, slides | docs/evidence_log.md, docs/experiment_shortlist.json (Oct 24) |
| News before the cap $0.1156, after $0.0331 (Oct 24), $0.022 today | report, slides | docs/evidence_log.md + today's run |
| Production: 7 accounts (4 yale.edu, 7 onboarded), 5 active in 7 days, 35 plan items from 4 students, 14 Dan + 1 news questions from 4 students, 4 packages, 17 older recommender runs, 8 starred | report, slides | production_aggregates.json |
| Production AI spend $0.2065 over 78 runs, by feature; highest account $0.128 in total | report | production_aggregates.json |
| Production audit: input_blocked 4, recommendation_dropped 8 | report, slides | production_aggregates.json → audit_by_kind |
| Tests: 27 passed (safety selection incl. the sign-up test), 137 passed (full suite); 17 attack strings, 10 allowed questions | report, slides | evidence/pytest_safety.txt; `tests/test_core.py` |
| Real users: 2 (first-year MBA Silver; second-year MBA), 13 to-dos built; 32 units in Fall 2027; LDR 5 → 9; import 26 courses for ~$0.001; Pass/Fail 23.5 units; 100 of 273 electives describe grading | report, slides | docs/user_feedback_review.md |
| Faculty: 183 people, 49 co-taught courses | report | Faculty page (screenshot 18) |
| ≈700 full-time MBAs | report, slides | **approximation** (about 350 per class × 2); not an official count |
| 2–3 h by hand; 3–5 min in the app; ≈2,800 student-hours a year | report, slides | **estimates**: 159 electives × ~45 s ≈ 2 h, plus 20–30 min of clash checks and ~10 min of requirements; app time = measured 11.7 s + 0.5 s + estimated 2–4 min of reading; 700 × 2 h × 2 rounds |
| Proxy timing: goal typed 5:04 p.m., plan with 4 courses and no clash 5:05 p.m. | report | Cost and safety run times and the My plan "Recent changes" list |
| 72 units, 30.5 core / 41.5 electives, 16 graded units, 24-unit cap, $25 late fee, 10 GSA days, auction Nov 9 – Jan 4 | report, slides | Yale Bulletin 2026–27 and the registrar email, as encoded in `backend/rules.py` and the primer |
| Poets&Quants quote (2018) | report | docs/research.md |

AI spent while gathering this evidence: about $0.035 (two scratch batches of $0.0042 and $0.0259, plus about $0.0044 in the UI). That's under the $0.10 budget.

## Refresh after tonight's final deploy

**Update (Oct 25, ~6:40 p.m.):** re-captured against commit `cbc8030` (local API on 8012, account `sam.student.<timestamp>@example.com`, since deleted): 01, 03, 03b, 04, 05, 06, 10, 13, 14. The current Course picks run was a fresh one: 14 courses; 7,526 in / 1,826 cached / 2,030 out; $0.0016; 12.7 s; kept 14, dropped 0. MGT 635 shows "Outside your preferences: starts before 9:00 AM". Spend for the re-capture was about $0.0055. Only refresh again if the wording changes after this commit.

Wording is still being polished (for example "Get course picks" and the Desk's "Coming up"). Replace these in `img/` (same names), then run `python3 build.py`:

1. `03_desk.jpg`: Dan's Desk (used in the report and slides). Keep the same story if you can: a first-year with 13 Spring units, before adding courses. `03b_desk_after_plan.jpg` is a spare showing the Desk after the plan was built.
2. `01_landing.jpg`: signed-out hero (report and slides title).
3. `04_course_picks.jpg` and `05_elihu_trace.jpg`: Course picks results and "See how Elihu decided" (report and slides).
4. `06_my_plan.jpg`: My plan & timetable (report and slides).
5. `14_explorer_taught_with.jpg`: explorer, "Taught with" filter (report).
6. `12_requirements_ldr_passfail.jpg`, `13_shortlist_compare.jpg`, `10_cost_page.jpg` (report), only if those pages change.
7. Spares, not embedded: `02_visitor_chat.jpg`, `15_other_yale_schools.jpg` (shows 1,140), `16_bidding.jpg`, `17_calendar.jpg`, `18_faculty.jpg`.

Also re-check after the deploy:

- **Test count.** It was 136 at the start of the evening and 137 at the end. If it changes, update "137" in both `src` files.
- **Production aggregates.** Rerun the read-only count script if you want the latest sign-ups and spend for Impact and Tokenomics.
- **Other-Yale course count (1,140).** Check it if the data file is rebuilt.
- **Print length.** The report printed to **14 Letter pages** (Chrome, CSS margins). It must stay within 10–15.

## Personal lines Mukul may want to add

- In `src/report.src.html`, Section 2 (Motivation) has an invisible marker: `<!-- MUKUL: optional personal line here … -->`. One or two sentences from your own experience would strengthen "a real person behind it", for example how long your first bidding round or schedule took, or a clash you hit. Don't add numbers you can't stand behind.
- Optional: ask the two classmates whether they're happy to be quoted by role (they're quoted as "a first-year MBA, Silver cohort" and "a second-year MBA", with no names).

## Things I noticed (not fixed: no app code was changed)

- **Preference warnings.** Course picks placed MGT 635 (Tue/Thu 8:30 a.m., its only section) for a "nothing before 9" student, with no warning on the card. `best_section` prefers preference-respecting sections but falls back silently. This is listed as a limit in the report.
- **Test-order dependency.** On its own, `pytest -k "injection or spend or budget or owner or package"` fails `test_chat_injection_blocked_without_spending` with a 401, because the shared client only signs in during `test_signup_login…`. Add `signup_login` to the `-k` expression, or make the test sign itself in.
