# Final project submission: Plan with Dan

MGT 409 · AI Foundations for Managers · due **Monday, Oct 26, 2026, 6:00 PM** on Canvas.

## What to submit on Canvas

| Item | What to upload or paste |
|---|---|
| GitHub repo (website URL) | https://github.com/hellomukul/plan-with-dan (public, or private with `zlisto` added as a collaborator) |
| Report | `report.html` from this folder: one self-contained file, images embedded |
| Slide deck | `slides.html` from this folder: reveal.js from a CDN, 10 slides, images embedded |
| Demo video (optional) | A 2–3 minute screen recording of a real run (goal → Course picks → My plan → Ask Dan) |

**Live app:** https://plan-with-dan.onrender.com (free tier: open it the day you submit; the first load can take up to a minute).

Don't upload `src/`, `img/`, `evidence/`, `build.py` or the notes: they're here to rebuild and check the two HTML files.

## Pre-submission checklist (mapped to the rubric)

**The app (30)**
- [ ] *It works (15):* on the live site, run Course picks once, add a course, and ask Dan one question. Push the final commit and check that no secrets are in the history (`git log -p | grep -i "sk-\|portkey"`).
- [ ] *Staff can run it (5):* the live link loads; the README at the top of the repo has the link and local steps; `.env.example` lists `PORTKEY_API_KEY` / `OPENAI_API_KEY`; dry run from a fresh clone with `.env` one folder up.
- [ ] *Look + feel (10):* click through the signed-out home and the Desk on a phone width as well as a laptop.

**The report (41):** open `report.html` by double-click and check:
- [ ] Sections 1–8 are in the brief's order: title + links, motivation, what is new, agents, tokenomics, safety, impact, limits + next steps.
- [ ] *Motivation + new (8):* named products compared (CourseTable, MySOMClasses, SOM directory/auction, Coursicle, Stellic, Course Match/iBid/BidReg, ChatGPT/Claude/Gemini/Clarity, Pulse/Daily Brief).
- [ ] *Agent design (10):* the diagram, the agent/tool table, and one real run traced step by step with screenshots.
- [ ] *Tokenomics (8):* measured input, cached and output tokens; cost per run, per student per month, at 100 and 10,000; cost cuts with quality evidence.
- [ ] *Safety (8):* the blocked-injection screenshot plus the pytest results.
- [ ] *Impact (5):* the two real users' quotes and what changed; the before/after time table (labelled estimate vs measured).
- [ ] *Design (2):* print preview (Letter, default margins) shows **14 pages**, every image visible.
- [ ] Optional: add your own line where `<!-- MUKUL: ... -->` sits in `src/report.src.html` (Motivation), then run `python3 build.py`.

**The slides (8)**
- [ ] Double-click `slides.html`, step through all 10 with the arrow keys, and press F for full screen. It needs internet for reveal.js; the images are embedded.

## Rebuilding after the final deploy

1. Replace any screenshot in `img/` (same file name, JPEG, about 1400 px wide). `NOTES.md` lists which ones to refresh.
2. Edit the text in `src/report.src.html` or `src/slides.src.html` if a number changed.
3. Run `python3 build.py` in this folder (standard library only). It rewrites `report.html` and `slides.html`.
