# Final project submission checklist (MGT 409, due Mon Oct 26 2026, 6:00 PM)

Source: *Final Project – AI Foundations for Managers* (course site, project_requirements.html).

## What goes on Canvas

| Item | Where it lives | Status |
|---|---|---|
| GitHub repo link (public, or private with `zlisto` as collaborator) | this repo | ☐ push, ☐ make public or add `zlisto` |
| `report.html`: 10–15 printed pages, self-contained, images embedded | `submission/report.html` | ☐ |
| `slides.html`: reveal.js from a CDN, 10 slides max, images embedded | `submission/slides.html` | ☐ |
| Demo video (optional): a 2–3 minute screen recording | upload to Canvas | ☐ |

## Repo requirements

- [ ] `README.md` explains what the app is and how to run it step by step. The live link goes at the top.
- [ ] `.env.example` lists `PORTKEY_API_KEY` / `OPENAI_API_KEY` with no real values.
- [ ] No real `.env` and no keys are committed. Check with `git log -p | grep -i "sk-\|portkey"` before pushing.
- [ ] The app reads `.env` from the repo folder first, then the parent folder (`backend/config.py`).
- [ ] It uses only the key names `PORTKEY_API_KEY` or `OPENAI_API_KEY`, with `gpt-6-luna` on the course key.
- [ ] The data is small (under 1 MB of JSON), so no separate test dataset is needed. The README says so.
- [ ] The 10-minute rule: a fresh clone runs with `pip install -r requirements.txt` and one `uvicorn` command. The built frontend is committed, so Node is not needed.
- [ ] Dry run: clone into a new folder, put `.env` one level up, follow the README, use the app.
- [ ] Online: deployed on Render, and the link was checked on submission day (free tier sleeps).

## Report sections (in this order) and the evidence each needs

| # | Section | Evidence needed for full credit |
|---|---|---|
| 1 | Title and links | Repo link, app link, one-sentence description |
| 2 | Motivation | A real person with the problem (classmate interview) |
| 3 | What is new | Named products we compared against (CourseTable, MySOMClasses, SOM auction, Coursicle, Stellic, ChatGPT…) |
| 4 | The agents | Diagram, plus one real run traced step by step with screenshots of what each agent did |
| 5 | Tokenomics | Real token counts (input, cached, output) from `/api/usage` and the in-app meter. Cost per run, per user per month, at 100 and 10,000 users. Cost cuts and whether they hurt quality |
| 6 | Safety | Screenshot or test of a defense stopping an attack (injection), a malfunction (an invented course dropped) and overspending (budget cap) |
| 7 | Impact | A real user tried it: quote, screenshot, before-and-after time |
| 8 | Limits and next steps | Honest list |

## Slides (10 max)
Title, problem, what's new, agents diagram, demo screenshots, cost, safety, impact numbers, what's next.

## Grading reminders
- A report row without its evidence gets at most half its points.
- Overdone ideas and class rebuilds are capped at Tier 1 unless there is a real twist. The README and report must have a **What I added** section separating this work from the lecture 8 base app.
- Tier 3 needs a real user, a measured before-and-after, and the cost for a whole organization (about 700 SOM MBA students).
