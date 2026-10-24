#!/usr/bin/env python3
"""Build submission/report.html and submission/slides.html as single self-contained files.

Screenshots from submission/img/ are embedded as base64, so both files open by
double-clicking on any computer with every image showing. Numbers come from
docs/evidence_log.md and docs/experiment_shortlist.json (real runs).

    python3 scripts/build_submission.py
"""

from __future__ import annotations

import base64
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
IMG = ROOT / "submission" / "img"
OUT = ROOT / "submission"

REPO_URL = "https://github.com/hellomukul/plan-with-dan"
APP_URL = "https://plan-with-dan.onrender.com"  # update after deploy
AUTHOR = "Mukul Gupta"


def img(name: str, alt: str, cls: str = "shot") -> str:
    data = base64.b64encode((IMG / f"{name}.jpg").read_bytes()).decode()
    return f'<img class="{cls}" alt="{alt}" src="data:image/jpeg;base64,{data}">'


def fig(name: str, caption: str, cls: str = "shot") -> str:
    return f'<figure>{img(name, caption, cls)}<figcaption>{caption}</figcaption></figure>'


EXP = json.loads((ROOT / "docs" / "experiment_shortlist.json").read_text())["summary"]

# ------------------------------------------------------------------ measured numbers
CHAT = {"runs": 4, "input": 20368, "cached": 14601, "output": 1799, "cost": 0.00162}
REC = {"runs": 9, "input": 6800, "cached": 1137, "output": 1080, "cost": 0.00115}
NEWS = {"runs": 3, "input": 27791, "cached": 9834, "output": 948, "web": 3.7, "cost": 0.0390}
NEWS_BEFORE = 0.1156
DESK = {"input": 1329, "output": 86, "cost": 0.000176}
MONTH = {"rec": 3, "chat": 20, "news": 8}
MONTH["desk"] = 30
per_user = MONTH["rec"] * REC["cost"] + MONTH["chat"] * CHAT["cost"] + MONTH["news"] * NEWS["cost"] + MONTH["desk"] * DESK["cost"]
per_user_no_news = MONTH["rec"] * REC["cost"] + MONTH["chat"] * CHAT["cost"] + MONTH["desk"] * DESK["cost"]


def usd(x: float, d: int = 2) -> str:
    return f"${x:,.{d}f}"


SCALE_ROWS = "".join(
    f"<tr><td>{label}</td><td>{n:,}</td><td>{usd(per_user * n)}</td><td>{usd(per_user_no_news * n)}</td>"
    f"<td>{usd(n * 0.50 * 30, 0)}</td></tr>"
    for label, n in [("One student", 1), ("A pilot (one section)", 100), ("All SOM full-time MBAs (≈700)", 700), ("Large school / multi-school", 10_000)]
)

DIAGRAM = """
<svg viewBox="0 0 980 640" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Agent architecture diagram" class="diagram">
  <defs>
    <marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#7d7494"/></marker>
    <style>
      .t{font:600 13px Inter,Arial,sans-serif;fill:#1d1626}.s{font:11px Inter,Arial,sans-serif;fill:#5b5470}
      .ai{fill:#e6effa;stroke:#286dc0;stroke-width:1.6}.code{fill:#effbd9;stroke:#7fbf1f;stroke-width:1.6}
      .io{fill:#f3f4f6;stroke:#9ca3af;stroke-width:1.4}.ln{stroke:#7d7494;stroke-width:1.5;fill:none;marker-end:url(#a)}
      .h{font:700 14px Geist,Inter,Arial,sans-serif;fill:#00356b}
    </style>
  </defs>
  <text x="10" y="22" class="h">A · Chat turn ("Ask Dan" and AI News)</text>
  <rect x="10" y="40" width="120" height="54" rx="10" class="io"/><text x="22" y="62" class="t">Student</text><text x="22" y="80" class="s">question</text>
  <rect x="160" y="40" width="130" height="54" rx="10" class="code"/><text x="172" y="62" class="t">Safety screen</text><text x="172" y="80" class="s">blocks injection · $0</text>
  <rect x="320" y="40" width="130" height="54" rx="10" class="code"/><text x="332" y="62" class="t">Spend guard</text><text x="332" y="80" class="s">turn + daily caps</text>
  <rect x="480" y="40" width="140" height="54" rx="10" class="ai"/><text x="492" y="62" class="t">Dispatcher</text><text x="492" y="80" class="s">routes to 1 specialist</text>
  <path d="M130 67 H158" class="ln"/><path d="M290 67 H318" class="ln"/><path d="M450 67 H478" class="ln"/>
  <g>
    <rect x="660" y="10" width="150" height="34" rx="9" class="ai"/><text x="672" y="32" class="t">Course Scout</text>
    <rect x="660" y="50" width="150" height="34" rx="9" class="ai"/><text x="672" y="72" class="t">Planner</text>
    <rect x="660" y="90" width="150" height="34" rx="9" class="ai"/><text x="672" y="112" class="t">Bid Coach</text>
    <rect x="660" y="130" width="150" height="34" rx="9" class="ai"/><text x="672" y="152" class="t">Career Coach</text>
    <rect x="660" y="170" width="150" height="34" rx="9" class="ai"/><text x="672" y="192" class="t">AI News Desk</text>
    <path d="M620 67 C640 67 640 27 658 27" class="ln"/><path d="M620 67 H658" class="ln"/><path d="M620 67 C640 67 640 107 658 107" class="ln"/>
    <path d="M620 67 C640 67 640 147 658 147" class="ln"/><path d="M620 67 C640 67 640 187 658 187" class="ln"/>
  </g>
  <rect x="828" y="10" width="146" height="190" rx="10" class="code"/><text x="840" y="32" class="t">Tools (code)</text>
  <text x="840" y="52" class="s">search_catalog</text><text x="840" y="68" class="s">course_details</text><text x="840" y="84" class="s">check_fit · find_alternates</text>
  <text x="840" y="100" class="s">plan_review</text><text x="840" y="116" class="s">requirements_status</text><text x="840" y="132" class="s">global_options</text>
  <text x="840" y="148" class="s">bid_history · bid split</text><text x="840" y="164" class="s">suggest_add (student ok)</text><text x="840" y="180" class="s">+ OpenAI web search</text>
  <path d="M810 100 H826" class="ln"/>
  <rect x="480" y="200" width="150" height="54" rx="10" class="code"/><text x="492" y="222" class="t">Output check</text><text x="492" y="240" class="s">secrets · unknown courses</text>
  <path d="M735 205 C735 228 660 228 632 228" class="ln"/>
  <rect x="320" y="200" width="130" height="54" rx="10" class="io"/><text x="332" y="222" class="t">Answer +</text><text x="332" y="240" class="s">+ "Add" buttons</text>
  <path d="M480 227 H452" class="ln"/>

  <text x="10" y="310" class="h">B · "Find my courses" recommender pipeline</text>
  <rect x="10" y="330" width="120" height="60" rx="10" class="io"/><text x="22" y="354" class="t">5-step quiz</text><text x="22" y="372" class="s">goals · prefs</text>
  <rect x="155" y="330" width="135" height="60" rx="10" class="code"/><text x="167" y="354" class="t">Retriever</text><text x="167" y="372" class="s">BM25 → 28 of ~100</text>
  <rect x="315" y="330" width="135" height="60" rx="10" class="ai"/><text x="327" y="354" class="t">Curator agent</text><text x="327" y="372" class="s">picks 4–7 + quotes</text>
  <rect x="475" y="330" width="135" height="60" rx="10" class="code"/><text x="487" y="354" class="t">Validator</text><text x="487" y="372" class="s">drops invented picks</text>
  <rect x="635" y="330" width="135" height="60" rx="10" class="code"/><text x="647" y="354" class="t">Scheduler</text><text x="647" y="372" class="s">clash-free + backups</text>
  <rect x="795" y="330" width="135" height="60" rx="10" class="ai"/><text x="807" y="354" class="t">Critic agent</text><text x="807" y="372" class="s">honest watch-outs</text>
  <path d="M130 360 H153" class="ln"/><path d="M290 360 H313" class="ln"/><path d="M450 360 H473" class="ln"/><path d="M610 360 H633" class="ln"/><path d="M770 360 H793" class="ln"/>
  <text x="10" y="425" class="h">C · Dan's Desk (chief of staff), once a day</text>
  <rect x="10" y="440" width="150" height="60" rx="10" class="io"/><text x="22" y="464" class="t">Plan + profile</text><text x="22" y="482" class="s">deadlines · bids · GSA</text>
  <rect x="190" y="440" width="170" height="60" rx="10" class="code"/><text x="202" y="464" class="t">Desk scan</text><text x="202" y="482" class="s">≤3 cards, due + source</text>
  <rect x="390" y="440" width="170" height="60" rx="10" class="ai"/><text x="402" y="464" class="t">Chief of Staff agent</text><text x="402" y="482" class="s">brief from cards only</text>
  <rect x="590" y="440" width="170" height="60" rx="10" class="code"/><text x="602" y="464" class="t">Best fits (code)</text><text x="602" y="482" class="s">labels · reasons · demand</text>
  <rect x="790" y="440" width="180" height="60" rx="10" class="io"/><text x="802" y="464" class="t">Approve / snooze</text><text x="802" y="482" class="s">every change has undo</text>
  <path d="M160 470 H188" class="ln"/><path d="M360 470 H388" class="ln"/><path d="M560 470 H588" class="ln"/><path d="M760 470 H788" class="ln"/>
  <rect x="10" y="540" width="22" height="16" rx="4" class="ai"/><text x="40" y="553" class="s">LLM agent (gpt-6-luna, spends tokens)</text>
  <rect x="300" y="540" width="22" height="16" rx="4" class="code"/><text x="330" y="553" class="s">deterministic code (free, testable)</text>
  <rect x="560" y="540" width="22" height="16" rx="4" class="io"/><text x="590" y="553" class="s">student input / output</text>
  <text x="10" y="590" class="s">Every agent shares one static primer (rules + safety) as the first part of its instructions, so the provider serves it from the prompt cache.</text>
  <text x="10" y="608" class="s">Agents never write data: they suggest, the student clicks. Clashes, units, requirements and the GSA budget are always computed in code.</text>
</svg>
"""

CSS = """
@page { size: letter; margin: 0.6in 0.65in; }
* { box-sizing: border-box; }
body { font-family: Geist, Inter, -apple-system, 'Segoe UI', Arial, sans-serif; color: #1d1626; line-height: 1.45; font-size: 10.2pt; margin: 0; background: #fff; }
.wrap { max-width: 860px; margin: 0 auto; padding: 32px 24px 64px; }
h1, h2, h3 { font-family: Geist, Inter, Arial, sans-serif; letter-spacing: -0.01em; line-height: 1.2; }
h1 { font-size: 30pt; margin: 0 0 6px; }
h2 { font-size: 17pt; margin: 34px 0 10px; color: #00356b; border-bottom: 2px solid #cfe0f5; padding-bottom: 4px; page-break-after: avoid; }
h3 { font-size: 12.5pt; margin: 20px 0 6px; page-break-after: avoid; }
p { margin: 0 0 10px; }
a { color: #286dc0; }
.sub { color: #5b5470; font-size: 12pt; }
.hero { border-radius: 18px; padding: 26px 28px; background: #00356b; color: #fff; }
.hero h1 { color: #fff; } .hero .sub { color: #d6e4f5; } .hero a { color: #9cc8ff; }
.pill { display: inline-block; padding: 2px 10px; border-radius: 999px; background: #e6effa; color: #00356b; font-size: 9.5pt; font-weight: 600; margin: 2px 4px 2px 0; }
.pill.lime { background: #ecfbd2; color: #4a7a05; } .pill.sky { background: #e3f4ff; color: #0f5f8f; }
table { width: 100%; border-collapse: collapse; margin: 8px 0 14px; font-size: 9.6pt; page-break-inside: avoid; }
th { text-align: left; background: #eef4fb; color: #00356b; font-weight: 700; padding: 6px 8px; border-bottom: 2px solid #cfe0f5; }
td { padding: 6px 8px; border-bottom: 1px solid #e5e9ef; vertical-align: top; }
.num { text-align: right; font-variant-numeric: tabular-nums; }
figure { margin: 12px 0 18px; page-break-inside: avoid; }
.shot { width: 100%; border-radius: 10px; border: 1px solid #dde3ea; box-shadow: 0 4px 16px rgba(10, 30, 60, 0.12); display: block; }
.half { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.half figure { margin: 6px 0 10px; }
figcaption { font-size: 9pt; color: #6b6380; margin-top: 5px; }
.callout { border-left: 4px solid #286dc0; background: #f3f7fc; padding: 10px 14px; border-radius: 8px; margin: 10px 0 14px; page-break-inside: avoid; }
.callout.lime { border-color: #7fbf1f; background: #f6fde9; } .callout.amber { border-color: #e2a400; background: #fff9e6; }
.todo { border: 2px dashed #e2a400; background: #fffbea; padding: 12px 14px; border-radius: 10px; margin: 10px 0 14px; }
.kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 12px 0; }
.kpi { border: 1px solid #dbe5f2; border-radius: 12px; padding: 10px 12px; background: #f8fbfe; }
.kpi b { display: block; font-family: Geist, Inter, sans-serif; font-size: 17pt; color: #00356b; }
.kpi span { font-size: 8.8pt; color: #6b6380; }
.diagram { width: 100%; height: auto; border: 1px solid #e3e8ef; border-radius: 12px; background: #fff; }
ol li, ul li { margin-bottom: 4px; }
code { background: #eef2f7; padding: 1px 5px; border-radius: 5px; font-size: 9.5pt; }
.small { font-size: 9.2pt; color: #6b6380; }
.pb { page-break-before: always; }
@media print { .wrap { padding: 0; } h2 { margin-top: 22px; } .hero { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
"""

REPORT = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Plan with Dan: Final Project Report · {AUTHOR}</title>
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400&display=swap" rel="stylesheet">
<style>{CSS}</style></head><body><div class="wrap">

<!-- 1. TITLE + LINKS -->
<section class="hero">
  <div class="pill">MGT 409 · AI Foundations for Managers · Final project</div>
  <h1>Plan with Dan</h1>
  <p class="sub"><b>An AI chief of staff for Yale SOM students: it surfaces the few planning decisions that matter this week and turns your goals into a clash-free, requirement-aware plan, with real courses only.</b></p>
  <p class="sub">{AUTHOR} · Yale SOM · October 2026<br>
  GitHub: <a href="{REPO_URL}">{REPO_URL}</a><br>
  Live app: <a href="{APP_URL}">{APP_URL}</a> (Render; first load can take ~1 min while the free server wakes up)</p>
</section>

<div class="kpis">
  <div class="kpi"><b>453</b><span>real SOM course sections (Fall 2026 + Spring 2027)</span></div>
  <div class="kpi"><b>9</b><span>AI agents + a code "desk scan", 12 deterministic tools + web search</span></div>
  <div class="kpi"><b>{usd(CHAT['cost'], 4)}</b><span>average chat turn, 72% of input from prompt cache</span></div>
  <div class="kpi"><b>49</b><span>automated tests incl. injection, hallucination, overspend, privacy</span></div>
</div>

<!-- 2. MOTIVATION -->
<h2>1 · Motivation: who has this problem?</h2>
<p><b>Every SOM student, twice a year.</b> Before each term, roughly 700 full-time MBA students (plus MAM, MMS and EMBA students) build a schedule out of ~100 eligible electives per term. They bid scarce points in SOM's course auction and make sure the plan satisfies degree rules that live in four different places. I am one of these students: planning means juggling the SOM course directory, the auction app, the academic calendar, the Bulletin's degree requirements and usually a spreadsheet.</p>
<div class="todo"><b>Your own story (edit before submitting):</b> one or two sentences about a real planning moment, e.g. how long your last bidding round took or a clash you hit.</div>
<h3>How it's done today, and what it costs</h3>
<ul>
  <li><b>Information is scattered.</b> Course times are in the public directory, the auction in a separate NetID app, requirement lists on the internal site, Global Studies rules on another page, and deadlines on the calendar. A student built <i>MySOMClasses</i> precisely because no official planner existed.</li>
  <li><b>Hidden clashes.</b> SOM terms are split into session-1, session-2 and full-term courses. Overlapping courses are not allowed, and the registrar removes one after add/drop. Late changes cost a $25 fee (<a href="https://catalog.yale.edu/management/rights-responsibilities-students/course-policies-residential-masters-degree-programs/">course policies</a>).</li>
  <li><b>Bidding anxiety with no price signal.</b> SOM does not publish past clearing prices. A 2018 SOM student leader said the auction was "causing enormous stress, anxiety, and frustration throughout the student body" (<a href="https://poetsandquants.com/2018/05/06/2018-best-mbas-hosanna-odhner-yale-som/">Poets&amp;Quants</a>). The Yale Daily News reported a course with 126 bids for 70 seats.</li>
  <li><b>The Global Studies trap.</b> Every student has a 10-day Global Studies Account that is never topped up. An International Experience needs <i>all 10 days unused</i>, and students pay their own airfare (<a href="https://catalog.yale.edu/management/tuition-fees/global-studies-financial-support/">Bulletin</a>). Spending 5 days on a GNW in year 1 silently rules out an IE in year 2.</li>
  <li><b>Choosing by popularity instead of goals.</b> With limited time, students copy friends' schedules rather than mapping courses to their career goal.</li>
</ul>
<p>The cost is mostly <b>time and bad outcomes</b>: hours per term per student, wasted bid points, missed requirements, and courses that don't serve the student's goals. At SOM's scale, even one hour saved per student per term is ~1,400 student-hours a year.</p>

<!-- 3. WHAT IS NEW -->
<h2>2 · What is new here</h2>
<p>I looked at what already exists before building (full notes in <code>docs/research.md</code>):</p>
<table>
<tr><th>Product</th><th>What it does well</th><th>What it lacks for an SOM student</th></tr>
<tr><td><b>CourseTable</b> (Yale, student-run)</td><td>Worksheets, conflict hiding, calendar export, friends, evaluations</td><td>SOM evaluations appear absent; no auction support, no SOM requirements (core, LDR, Global Studies), no recommender; half-term handling unverified</td></tr>
<tr><td><b>MySOMClasses</b>; <b>yale-som-course-picker</b> (GitHub)</td><td>SOM schedule viewing / picking from the public feed</td><td>No accounts, no requirements, no agent, no bid data</td></tr>
<tr><td><b>SOM course directory + auction app</b></td><td>The official listing and the auction itself</td><td>No planning, no clash help before bidding, no history, no advice</td></tr>
<tr><td><b>Coursicle</b>, <b>Stellic</b></td><td>Generic schedule builder; licensed degree-audit</td><td>Nothing SOM-specific; Yale does not use Stellic</td></tr>
<tr><td><b>Wharton Course Match, Booth iBid, Kellogg BidReg</b></td><td>Allocation built into each school's system</td><td>Only at those schools</td></tr>
<tr><td><b>ChatGPT Pulse, Gemini Daily Brief, Google CC</b></td><td>Daily AI briefs from your inbox and calendar (Gemini's is free in the US since Sep 2026)</td><td>Generic: no SOM rules, deadlines, requirements or course data; Pulse drew "creepy/irrelevant" complaints</td></tr>
<tr><td><b>Lindy, Motion, Sunsama, Reclaim</b></td><td>AI assistants and planners: approvals, auto-scheduling, daily planning rituals</td><td>Built for knowledge workers' email and calendars, not degree planning; paid</td></tr>
<tr><td><b>ChatGPT / Claude / Gemini</b></td><td>Great conversation about goals</td><td>No current SOM catalog, so it invents courses, times and rules (documented in the Aurora study, arXiv 2602.17999)</td></tr>
</table>
<div class="callout"><b>What Plan with Dan does that none of them do:</b> it is a <i>chief of staff for SOM decisions</i>, not another inbox summary. Every morning, plain code scans the student's plan, requirements, deadlines, bids and Global Studies budget and produces at most three decision cards, each with a real due date and a cited source; an agent only words the brief. On top of that it combines (1) an AI recommender that can <i>only</i> recommend real SOM courses and must quote the description to justify each pick; (2) clash checking on real session dates (half-terms included) with same-slot backups; (3) SOM-specific requirement tracking, including the 10-day GSA budget rule that most students don't know about; (4) a bid coach that is honest about missing data and crowdsources real outcomes for next year; and (5) one private calendar feed for Google, Outlook and Apple. It started from the class's lecture 8 course explorer: I kept the course data and the mascot and rewrote the backend and UI (see "What I added", Section 8).</div>

<!-- 4. AGENTS -->
<h2 class="pb">3 · The agents</h2>
{DIAGRAM}
<h3>Roster</h3>
<table>
<tr><th>Agent</th><th>Job</th><th>Tools it can call</th><th>Output</th></tr>
<tr><td><b>Dispatcher</b></td><td>Reads the message plus recent history and picks exactly one specialist; answers greetings and off-topic messages itself</td><td>none (one small call)</td><td>Structured <code>Route</code></td></tr>
<tr><td><b>Course Scout</b></td><td>Finds and compares real courses, checks fit, proposes adds</td><td><code>search_catalog</code>, <code>course_details</code>, <code>check_fit</code>, <code>find_alternates</code>, <code>suggest_add</code>, <code>my_profile_and_plan</code></td><td>Markdown + add buttons</td></tr>
<tr><td><b>Planner</b></td><td>Timetable, clashes, units, core/LDR/Global Studies, deadlines</td><td><code>plan_review</code>, <code>requirements_status</code>, <code>global_options</code>, <code>upcoming_dates</code>, <code>check_fit</code>, …</td><td>Markdown</td></tr>
<tr><td><b>Bid Coach</b></td><td>Auction strategy, honest about missing data</td><td><code>bid_history</code>, <code>suggest_bid_split</code>, <code>course_details</code></td><td>Markdown</td></tr>
<tr><td><b>Career Coach</b></td><td>Goal → skills → courses, each tied to course content</td><td><code>search_catalog</code>, <code>course_details</code>, <code>suggest_add</code>, <code>check_fit</code></td><td>Markdown + add buttons</td></tr>
<tr><td><b>AI News Desk</b></td><td>Current AI news with dated sources, then "Learn this at SOM"</td><td>OpenAI web search, <code>search_catalog</code></td><td>Cited markdown</td></tr>
<tr><td><b>Curator</b></td><td>Picks 4–7 courses from a code-built shortlist for the quiz answers</td><td>none (shortlist is in the prompt)</td><td>Structured <code>Curation</code></td></tr>
<tr><td><b>Critic</b></td><td>Reviews the final, code-checked plan against the goals</td><td>none</td><td>Structured <code>Critique</code></td></tr>
<tr><td><b>Chief of Staff</b></td><td>Writes the 2–3 sentence brief on Dan's Desk from the decision cards only (cached once per day)</td><td>none (cards come from the code <code>desk scan</code>)</td><td>Structured <code>Brief</code></td></tr>
</table>
<h3>Design choices (and why)</h3>
<ul>
  <li><b>Dispatcher, not a boss.</b> In class we built a boss that calls several specialists and reads all their reports. Here a cheap dispatcher (~1.3k tokens, $0.0002) sends each turn to <i>one</i> specialist that carries only its own tools. That is fewer tokens per turn and fewer chances for a specialist to wander outside its lane.</li>
  <li><b>The AI decides; code computes.</b> 12 tools are plain Python: clashes use real session dates, units and requirements follow the 2026–27 Bulletin, and the GSA budget rules are encoded. The model reasons about goals and trade-offs; it never does the math or remembers times.</li>
  <li><b>Code before and after the LLM in the recommender.</b> A BM25 retriever narrows ~100 eligible courses to 28 before the Curator runs. Afterwards, a validator, a scheduler and backup finding run in code. Only the Curator and Critic spend tokens.</li>
  <li><b>Chief of staff, but code decides what matters.</b> The desk scan (clashes, the 16-unit minimum, SOM deadlines, Global Studies, Leadership, bid split, missing times, missing goals) is deterministic and every card cites its rule; the agent can't invent a date. Students approve, snooze (3 days) or dismiss each card, and every plan change is logged with <b>undo</b>.</li>
  <li><b>Human in the loop.</b> Agents can only <i>suggest</i> a course (<code>suggest_add</code>); the student clicks "Add".</li>
  <li><b>Model: <code>gpt-6-luna</code></b> through Portkey. It is the only model allowed on the course key, and at $0.10 / $0.50 per 1M tokens it is 100× cheaper than <code>gpt-6-astra</code>. Structured outputs and tool calling worked reliably in all test runs.</li>
</ul>
<h3>One real run, step by step</h3>
<p><b>Run A: chat.</b> The student (first-year, Silver cohort, healthcare-consulting background, goal: healthcare PE internship, then running a healthcare services company) asks <i>"Which Global Studies option fits me best, and does it fit my GSA days?"</i></p>
{fig("chat_trace", "Real run, expanded trace. Dispatcher (1.3k in / 240 out, $0.0002) → Planner, which calls my_profile_and_plan → requirements_status → global_options → plan_review. The Planner finishes at 9.3k in / 1.2k out, $0.0009. The answer recommends Spring GSE (MGT 865) because it uses ~5 of 10 GSA days and fits the long-term goal, and flags that the Spring plan is below the 16-unit minimum. The blocked injection attempt from the previous turn sits harmlessly above.")}
<ol>
  <li><b>Safety screen (code):</b> passes the message; <b>spend guard</b> confirms budget left.</li>
  <li><b>Dispatcher</b> returns <code>{{specialist: "planner", task: "…"}}</code>.</li>
  <li><b>Planner</b> calls <code>my_profile_and_plan</code> (year 1, 0 GSA days used), <code>requirements_status</code> (13 Spring units, LDR met, GSR not met), <code>global_options</code> (all six options with budget checks and matching Spring courses) and <code>plan_review</code> (no clashes).</li>
  <li><b>Output check (code)</b> verifies every MGT number mentioned exists in the catalog, then the answer and its receipt are saved.</li>
</ol>
<p><b>Run C: Dan's Desk.</b> When the same student opens the app, the desk scan finds three decisions (Spring is 3 units short of the 16-unit minimum, Fall session-2 add/drop closes Nov 2, and four bid courses have no point split). The Chief of Staff agent turns them into a brief (1,329 input / 86 output tokens, $0.00018), and the second load that day is served from cache at $0.</p>
<div class="half">
{fig("desk", "Dan's Desk (the new home): a brief written only from code-computed decision cards, the decisions list (approve / why / snooze / done), best fits with honest labels, and a side pane with what's next, plan meters and an undoable action log.")}
{fig("desk_fits", "Best fits: a label instead of a percentage, at most two reason chips built from data, demand shown separately, and 'Not for me' that demotes similar courses. Sections outside the student's schedule preferences are hidden.")}
</div>
<p><b>Run B: "Find my courses".</b> The same student presses <i>Run Dan's crew</i>:</p>
{fig("find_trace", "Recommender trace: Retriever (code) 93 eligible → 28 shortlisted (~65k tokens never sent) → Curator (5.3k in / 492 out, $0.0007) → Validator (code) kept 5, dropped 1 pick that was not in the shortlist → Scheduler (code) found clash-free sections → Critic ($0.0004). Total $0.001.")}

<!-- 5. TOKENOMICS -->
<h2>4 · Tokenomics</h2>
<p>Every model call is logged with input, cached-input, output and web-search counts (<code>usagelog</code> table). The app shows them to the student as a receipt on every answer and on the <i>Cost &amp; safety</i> page. Prices are from the course notes: $0.10 input, $0.01 cached input and $0.50 output per 1M tokens. Web search is estimated at $0.01 per call (configurable).</p>
{fig("usage", "The app's own Cost & safety page: spend vs the daily cap, token totals (35% cached across all runs), and per-run receipts showing which agents ran.")}
<h3>Measured cost of a typical run</h3>
<table>
<tr><th>Run type (production settings)</th><th class="num">Runs</th><th class="num">Input</th><th class="num">Cached</th><th class="num">Output</th><th class="num">Web</th><th class="num">Avg cost</th></tr>
<tr><td>Chat turn (Dispatcher + 1 specialist)</td><td class="num">{CHAT['runs']}</td><td class="num">{CHAT['input']:,}</td><td class="num">{CHAT['cached']:,} (72%)</td><td class="num">{CHAT['output']:,}</td><td class="num">0</td><td class="num"><b>{usd(CHAT['cost'], 4)}</b></td></tr>
<tr><td>Find my courses (Curator + Critic)</td><td class="num">{REC['runs']}</td><td class="num">{REC['input']:,}</td><td class="num">{REC['cached']:,}</td><td class="num">{REC['output']:,}</td><td class="num">0</td><td class="num"><b>{usd(REC['cost'], 4)}</b></td></tr>
<tr><td>AI news question (web search)</td><td class="num">{NEWS['runs']}</td><td class="num">{NEWS['input']:,}</td><td class="num">{NEWS['cached']:,}</td><td class="num">{NEWS['output']:,}</td><td class="num">{NEWS['web']}</td><td class="num"><b>{usd(NEWS['cost'], 4)}</b></td></tr>
<tr><td>Dan's Desk brief (once per day, then cached)</td><td class="num">1</td><td class="num">{DESK['input']:,}</td><td class="num">0</td><td class="num">{DESK['output']:,}</td><td class="num">0</td><td class="num"><b>{usd(DESK['cost'], 5)}</b></td></tr>
<tr><td>Blocked injection attempt</td><td class="num">2</td><td class="num">0</td><td class="num">0</td><td class="num">0</td><td class="num">0</td><td class="num"><b>$0</b></td></tr>
</table>
<h3>Per student per month, and at scale</h3>
<p>Assumption for a planning month: one desk brief per day, 3 recommender runs, 20 chat turns and 8 news questions per student, which gives <b>{usd(per_user)}</b> per student per month (<b>{usd(per_user_no_news, 3)}</b> without the news desk; web search is about 90% of the cost). The daily cap of $0.50 per student bounds the worst case at $15 per student per month, even for a bot or a bug.</p>
<table>
<tr><th>Scale</th><th class="num">Students</th><th class="num">Monthly AI cost</th><th class="num">…without news</th><th class="num">Hard ceiling (caps)</th></tr>
{SCALE_ROWS}
</table>
<p class="small">Hosting: Render free tier for the demo. For an organisation: Render Starter (~$7/month) plus a managed Postgres (Neon free tier, then ~$19/month), so AI plus hosting for all of SOM is roughly $270/month in peak planning months.</p>
<h3>What I did to keep cost down, and whether it hurt</h3>
<table>
<tr><th>Measure</th><th>Measured effect</th><th>Did it hurt quality?</th></tr>
<tr><td><b>gpt-6-luna</b> instead of gpt-6-astra (the lecture 8 base app used astra)</td><td>100× cheaper per token</td><td>Course key requires it; tool calling and structured output worked in all runs</td></tr>
<tr><td><b>Shared static primer first</b> in every agent's instructions (prompt caching)</td><td>72% of chat input tokens billed at the cached rate (10× cheaper)</td><td>No: identical instructions</td></tr>
<tr><td><b>Retriever shortlist</b> (28 cards instead of the whole catalog)</td><td>Recommender {usd(EXP['full_catalog']['cost_usd'], 5)} → <b>{usd(EXP['shortlist_28']['cost_usd'], 5)}</b> per run (−67%); output 3,655 → 905 tokens</td><td><b>No.</b> Over 3 runs each: same 5 picks, 5/5 quotes verified, <i>more</i> picks fitting the timetable (4 vs 3), 3 of 5 picks identical (table below)</td></tr>
<tr><td><b>Web-search cap</b> (low context, ≤2 searches, ≤3 requests)</td><td>News {usd(NEWS_BEFORE, 3)} → {usd(NEWS['cost'], 3)} per question (−66%); 11 → ~4 searches</td><td><b>Partly.</b> One of the first three capped answers came back without source links. I added a strict citation rule and a code check that warns when a news answer has no links; the next answer had two dated links.</td></tr>
<tr><td><b>Dispatcher</b> (one specialist per turn)</td><td>Routing costs ~$0.0002 per turn</td><td>No misroutes in the 4 logged test turns</td></tr>
<tr><td><b>Safety screen before the model</b></td><td>Injection attempts cost $0</td><td>No false blocks on 4 normal test questions (unit tests)</td></tr>
</table>
<table>
<tr><th>Experiment (3 runs each)</th><th class="num">Courses shown</th><th class="num">Input</th><th class="num">Output</th><th class="num">Cost</th><th class="num">Picks</th><th class="num">Quotes verified</th><th class="num">Fit timetable</th></tr>
<tr><td>Code shortlist (production)</td><td class="num">28</td><td class="num">{EXP['shortlist_28']['input_tokens']:,.0f}</td><td class="num">{EXP['shortlist_28']['output_tokens']:,.0f}</td><td class="num">{usd(EXP['shortlist_28']['cost_usd'], 5)}</td><td class="num">{EXP['shortlist_28']['avg_picks']:.0f}</td><td class="num">{EXP['shortlist_28']['quotes_verified']:.0f}/5</td><td class="num">{EXP['shortlist_28']['fits']:.0f}</td></tr>
<tr><td>Full eligible catalog</td><td class="num">76</td><td class="num">{EXP['full_catalog']['input_tokens']:,.0f}</td><td class="num">{EXP['full_catalog']['output_tokens']:,.0f}</td><td class="num">{usd(EXP['full_catalog']['cost_usd'], 5)}</td><td class="num">{EXP['full_catalog']['avg_picks']:.0f}</td><td class="num">{EXP['full_catalog']['quotes_verified']:.0f}/5</td><td class="num">{EXP['full_catalog']['fits']:.0f}</td></tr>
</table>
<p class="small">Caveat: identical repeated prompts sometimes returned in under a second, which suggests the Portkey gateway served cached responses. The token counts reported per call are still what the app logs and bills against.</p>

<!-- 6. SAFETY -->
<h2>5 · Safety</h2>
<table>
<tr><th>Risk for this app</th><th>Defense that is built</th><th>Evidence</th></tr>
<tr><td><b>Prompt injection / data exfiltration</b> ("ignore your rules", "print the API key", "show other students' plans")</td><td><code>screen_input</code> blocks these patterns <i>before</i> any model call. Untrusted text (descriptions, web pages, notes, chat history) is wrapped in <code>&lt;untrusted&gt;</code> fences, and the primer forbids following instructions inside them. Blocked messages are never replayed into later prompts.</td><td>Screenshot below; 7 attack unit tests; <code>input_blocked</code> log</td></tr>
<tr><td><b>Invented courses / facts</b></td><td>The Curator can only choose keys from its shortlist; the Validator drops anything else and strips "evidence" quotes not found in the description. The chat output check flags MGT numbers not in the catalog. Times, units and rules come only from tools.</td><td>Validator dropped an out-of-list pick on 7 runs (safety log); unit tests</td></tr>
<tr><td><b>Wrong actions</b></td><td>Agents cannot write to the plan; they propose, and the student clicks "Add". The scheduler never claims a clashing pick "fits".</td><td>Find-page "Clashes with …" badges</td></tr>
<tr><td><b>Loops / overspending</b></td><td>Request limit per agent, a per-tool loop guard (6 calls), a token ceiling computed from the remaining budget, $0.05 per turn and $0.50 per student per day caps, and rate limits (login 5/min, chat 20/min, recommend 6/min)</td><td>Spend-guard unit test; <code>over_run_budget</code> event</td></tr>
<tr><td><b>Privacy</b></td><td>A Privacy page explains what's stored and that AI requests go through Portkey to OpenAI; one-click <b>export</b> of all your data and <b>account deletion</b> (password-confirmed); blocked prompts are no longer stored anywhere; signup gives a generic message with equal timing (it can't fully hide an existing email without email verification, and we say so)</td><td>Export/delete and generic-signup tests</td></tr>
<tr><td><b>Mistaken actions</b></td><td>Every plan change (add, remove, switch, status) is written to an action log with one-click <b>undo</b>; desk cards can be snoozed, dismissed and restored</td><td>Undo test; toasts with Undo</td></tr>
<tr><td><b>Account security</b></td><td>Argon2id hashes, HttpOnly SameSite cookies (only the token's SHA-256 is stored), identical errors for wrong password vs no account, a cross-site (CSRF) origin check, a strict Content-Security-Policy, path-traversal-safe static serving, and no secrets in the repo</td><td>Auth and CSRF tests; key-scan before commit</td></tr>
</table>
<div class="half">
{fig("blocked", "Defense working: an injection attempt is blocked by the safety screen with five reasons, 0 model calls, $0.")}
{fig("safety_log", "The safety log: the blocked prompt, plus the Validator dropping a recommended course that wasn't in the shortlist, on every run.")}
</div>
<h3>Malfunctions I found by testing, and fixed</h3>
<ol>
  <li><b>History poisoning.</b> The blocked injection text was saved to chat history and replayed into the next prompt, which tripped Azure OpenAI's content filter and broke the following turn. Fixed: blocked turns are excluded from history, and provider filter errors are now caught, logged and answered politely.</li>
  <li><b>Budget overrun inside one call.</b> The first news answer ran 11 web searches and cost $0.116, more than twice the $0.05 turn cap, because the cap is checked between calls. Fixed with the search cap and a 3-request limit (now about $0.04), plus an <code>over_run_budget</code> audit event.</li>
  <li><b>Wrong section for the program.</b> The scheduler assigned an EMBA-only section (§E1) to an MBA student. Fixed: section choice is now filtered by the student's program.</li>
  <li><b>Silent truncation.</b> A 20,000-character cap silently cut the Curator's shortlist in the full-catalog experiment. Removed, because the shortlist size is already bounded in code.</li>
  <li><b>Uncited news.</b> Added a strict citation rule plus a code check that warns the student when sources are missing.</li>
</ol>

<!-- 7. IMPACT -->
<h2>6 · Impact</h2>
<table>
<tr><th>Metric</th><th>Today</th><th>With Plan with Dan</th><th>Source</th></tr>
<tr><td>Time from "what should I take?" to a clash-free shortlist</td><td>Many tabs, often an evening (pilot timing below)</td><td>~1 min quiz + ~15 s crew run + a few clicks</td><td>Own measurement in the app</td></tr>
<tr><td>Courses checked against goals</td><td>Whatever a student has time to read</td><td>All ~100 eligible courses scored; 28 read by the Curator</td><td>Retriever logs</td></tr>
<tr><td>Hidden clash / half-term errors</td><td>Found after add/drop ($25 late fee)</td><td>Caught before bidding, with same-slot backups</td><td>Scheduler, tests</td></tr>
<tr><td>GSA-budget mistakes (e.g. losing IE eligibility)</td><td>Rule buried in the Bulletin</td><td>Budget check on every option</td><td>Global page</td></tr>
<tr><td>Cost to serve all of SOM</td><td>n/a</td><td>≈{usd(per_user * 700, 0)}/month AI in planning months (hard cap {usd(700 * 15, 0)})</td><td>Measured runs × assumptions</td></tr>
<tr><td>Bid price information</td><td>Not public</td><td>Crowdsourced reports build real history from next term</td><td>Bid coach</td></tr>
</table>
<div class="todo"><b>Pilot user test (fill in before submitting).</b> Protocol: <code>docs/user_test.md</code>. Classmate: ____ (year __). Old way: ____ min to 3 non-clashing electives (clash check done? Y/N). With Plan with Dan: ____ min to a clash-free plan; would bid on __/__ picks. Usefulness ___/10. Quote: "__________________". Screenshot of their plan: attached.</div>
<p><b>Simulated persona testing (not a substitute for the pilot).</b> Six AI tester agents each played a different student (an anxious first-year on a phone, a second-year power user, a budget-minded international student, EMBA/MMS students, a security tester, a career switcher) against the real app for about $0.16 in total. They found 8 serious bugs that every other test had missed, including first-year spring core not being counted toward units, chat proposing another program's section, stale Global Network Week listings and signup timing. All were fixed and covered by 14 new tests (<code>docs/persona_testing.md</code>).</p>
<p>If one hour per student per term is saved, SOM's ~700 full-time MBAs save ~1,400 hours a year for about $3,000 a year in AI cost at the assumptions above. The bigger win is quality: plans that actually map to each student's goals and never break the rules.</p>

<!-- 8. LIMITS -->
<h2>7 · Limits and next steps</h2>
<ul>
  <li><b>No real bid history yet.</b> SOM doesn't publish it. The app crowdsources outcomes; demo rows are labelled SAMPLE. Next: ask SOM's registrar or student government to share anonymised clearing prices.</li>
  <li><b>Rules are transcribed.</b> Requirements and dates follow the 2026–27 Bulletin; LDR/GSR flags are inferred from SOM's public feed codes. Next: a monthly refresh script and a "report an error" button.</li>
  <li><b>No course evaluations or workload data</b> (behind Yale login). Next: a partnership with CourseTable or SOM.</li>
  <li><b>Calendar sync is one-way</b> (subscription feed). Google refreshes slowly (up to ~24 h). Full API sync would need OAuth keys and Google verification.</li>
  <li><b>Free hosting</b> sleeps, and its disk resets. Use Neon Postgres via <code>DATABASE_URL</code> for durable accounts.</li>
  <li><b>Next month:</b> Yale CAS sign-in; a cohort view ("which friends are in this course"); a pre-auction "what-if" simulator; Spring core cohort mapping; and an evaluation set of 50 student profiles to measure recommendation quality.</li>
</ul>

<h2>8 · What I added to the lecture 8 base</h2>
<p>The lecture 8 <i>Yale SOM Course Explorer</i> was a catalog browser with one Q&amp;A agent (gpt-6-astra) that sent the whole catalog to the model on every search. I kept the SOM course data and the Handsome Dan mascot and rewrote the rest:</p>
<ul>
  <li>The 8-agent crew (dispatcher pattern) and the 5-stage recommender.</li>
  <li>Student accounts with saved profiles, plans, Global Studies choices, chats and bids.</li>
  <li>Deterministic planning tools that fix the base app's half-term clash bug.</li>
  <li>A calendar feed; the safety layer; per-run token accounting; 49 tests.</li>
  <li>Seat limits and requirement flags merged from SOM's public feed.</li>
  <li>Dan's Desk: a chief-of-staff home with a code desk scan, a cached Chief of Staff brief, honest best fits and an undo log.</li>
  <li>A research-driven redesign ("Quiet Yale"): after the first version felt busy, I studied Linear's calm redesign, NN/g's visual-hierarchy and dashboard research, and Google's People + AI Guidebook on explaining recommendations. Result: one Yale-blue accent, Geist type, no emoji, bars instead of rings, a ⌘K command menu, and fit labels instead of percentages.</li>
  <li>Privacy controls: export, delete, a privacy page, CSP, generic signup.</li>
</ul>
<div class="half">
{fig("plan", "My plan: weekly timetable with session-1/2 tags, clash panel and week review.")}
{fig("bids_history", "Bid coach: honest SAMPLE labelling until real student reports arrive.")}
</div>
<div class="half">
{fig("privacy", "Privacy and data: what's stored, where it goes (Portkey → OpenAI), export and delete.")}
{fig("cmdk", "⌘K command menu: jump to any page or course, or hand a question to Dan.")}
</div>
<p class="small">How to run: see the README (<code>pip install -r requirements.txt</code>, then <code>uvicorn backend.main:app</code>; the .env is read from the repo folder, then the folder above it). Sources for every SOM rule are in <code>backend/rules.py</code> and <code>docs/research.md</code>. Not an official Yale tool.</p>
</div></body></html>
"""

SLIDES = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Plan with Dan · Slides · {AUTHOR}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/dist/reveal.css">
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400&display=swap" rel="stylesheet">
<style>
:root {{ --pink:#63aaff; --lilac:#8cc2ff; --lime:#3dd68c; }}
.reveal {{ font-family: Geist, Inter, Arial, sans-serif; color: #f6f2ff; font-size: 30px; }}
.reveal-viewport {{ background: #0b0b0c; }}
.reveal h1, .reveal h2, .reveal h3 {{ font-family: Geist, Inter, sans-serif; color: #fff; text-transform: none; letter-spacing: -0.02em; }}
.reveal h1 {{ font-size: 2.3em; }} .reveal h2 {{ font-size: 1.45em; margin-bottom: .4em; }}
.grad {{ color: var(--pink); }}
.reveal ul {{ text-align: left; }} .reveal li {{ margin: .25em 0; }}
.reveal .shot {{ border-radius: 14px; box-shadow: 0 10px 40px rgba(0,0,0,.5); max-height: 520px; margin: 0; }}
.cols {{ display: grid; grid-template-columns: 1fr 1fr; gap: 26px; align-items: center; text-align: left; }}
.cols > * {{ min-width: 0; }}
.reveal .cols .shot {{ width: 100%; height: auto; max-height: 470px; object-fit: contain; }}
.kpis {{ display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-top: 20px; }}
.kpi {{ background: #141416; border: 1px solid #27272b; border-radius: 18px; padding: 16px; }}
.kpi b {{ display: block; font-family: Geist, sans-serif; font-size: 1.5em; color: var(--pink); }}
.kpi span {{ font-size: .55em; color: #b3aac8; }}
.small {{ font-size: .6em; color: #b3aac8; }}
.tag {{ display: inline-block; padding: 4px 14px; border-radius: 999px; background: rgba(99,170,255,.12); border: 1px solid rgba(99,170,255,.42); color: #8cc2ff; font-weight: 500; font-size: .5em; }}
.reveal table {{ font-size: .55em; }} .reveal table th {{ color: var(--pink); border-bottom: 2px solid #34343a; }} .reveal table td {{ border-bottom: 1px solid #27272b; }}
.diagram {{ background: #fff; border-radius: 16px; padding: 8px; width: 100%; }}
</style></head><body>
<div class="reveal"><div class="slides">

<section>
  <span class="tag">MGT 409 final project</span>
  <h1>Plan with <span class="grad">Dan</span></h1>
  <p>Your <b>AI chief of staff</b> for the SOM semester: the few decisions that matter this week, and a clash-free plan from <b>real courses only</b>.</p>
  <p class="small">{AUTHOR} · Yale SOM · Oct 2026 · {REPO_URL}</p>
</section>

<section>
  <h2>The problem: planning an SOM semester is a part-time job</h2>
  <ul>
    <li>~700 MBAs × 2 terms: ~100 electives, half-terms, a points auction, rules in 4 places</li>
    <li>Clashes surface <i>after</i> add/drop; late changes cost $25</li>
    <li>No public bid history: "enormous stress, anxiety, and frustration" (SOM student, 2018)</li>
    <li>The hidden trap: 10 Global Studies days, and an IE needs all 10 unused</li>
  </ul>
</section>

<section>
  <h2>What's new</h2>
  <table>
    <tr><th>Existing</th><th>Missing for SOM students</th></tr>
    <tr><td>CourseTable · MySOMClasses</td><td>No auction help, no SOM requirements, no recommender</td></tr>
    <tr><td>SOM directory + auction app</td><td>No planning or clash help before bidding</td></tr>
    <tr><td>ChatGPT Pulse · Gemini Daily Brief</td><td>Generic inbox briefs, no SOM rules or deadlines</td></tr>
    <tr><td>ChatGPT</td><td>No SOM catalog: invents courses and times</td></tr>
  </table>
  <p>Plan with Dan: <b>an agent that can only recommend real courses</b> and quotes the description to prove it. Clash checks on real dates, GSA-budget rules, an honest bid coach, and a calendar feed.</p>
</section>

<section>
  <h2>How the agents work</h2>
  {DIAGRAM.replace('class="diagram"', 'class="diagram" style="max-height:540px"')}
</section>

<section>
  <h2>Demo</h2>
  {img("desk", "Dan's Desk")}
  <p class="small">Dan's Desk: a brief written only from code-computed decisions, approve / snooze / done, best fits with honest labels, and undo for every change.</p>
</section>

<section>
  <h2>Cost to run (measured, gpt-6-luna)</h2>
  <div class="kpis">
    <div class="kpi"><b>{usd(CHAT['cost'], 4)}</b><span>chat turn · 72% cached</span></div>
    <div class="kpi"><b>{usd(REC['cost'], 4)}</b><span>recommender run</span></div>
    <div class="kpi"><b>{usd(NEWS['cost'], 3)}</b><span>AI news question</span></div>
    <div class="kpi"><b>{usd(per_user)}</b><span>per student / month</span></div>
  </div>
  <ul>
    <li>All of SOM (~700): <b>≈{usd(per_user * 700, 0)}/month</b>; 10,000 students ≈ {usd(per_user * 10000, 0)}/month</li>
    <li>Shortlist: <b>−67%</b> recommender cost, same quality · search cap: <b>−66%</b> news cost</li>
  </ul>
</section>

<section>
  <h2>Safety: defenses that fired in testing</h2>
  <div class="cols">
    {img("blocked", "Injection blocked")}
    <ul>
      <li>Injection blocked before the model: <b>$0</b></li>
      <li>Validator dropped invented / out-of-list picks</li>
      <li>Caps: $0.05 per turn, $0.50 per day, loop guards</li>
      <li>Fixed by testing: history poisoning, budget overrun, wrong EMBA section</li>
      <li>Undo for every change · export / delete your data</li>
      <li>49 automated tests</li>
    </ul>
  </div>
</section>

<section>
  <h2>Impact</h2>
  <ul>
    <li>Goal → clash-free shortlist in <b>~2 minutes</b> instead of an evening</li>
    <li>Every pick is a real course, with evidence and a backup</li>
    <li>Saves rule mistakes (16-unit minimum, GSA budget, half-term clashes) <i>before</i> bidding</li>
    <li>1 hour saved × 700 students × 2 terms ≈ <b>1,400 hours / year</b> for ≈ $3k / year</li>
    <li>Pilot: ____ classmate(s): ___ min → ___ min, "_______________"</li>
  </ul>
</section>

<section>
  <h2>What's next</h2>
  <ul>
    <li>Real anonymised bid history (SOM registrar or student government)</li>
    <li>Yale CAS login and friends' schedules</li>
    <li>Auction "what-if" simulator; Spring core cohort map</li>
    <li>An evaluation set of 50 student profiles to score recommendations</li>
  </ul>
  <p class="small">Try it: {APP_URL} · Code: {REPO_URL}</p>
</section>

</div></div>
<script src="https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/dist/reveal.js"></script>
<script>Reveal.initialize({{ hash: true, width: 1280, height: 760, margin: 0.06, transition: 'slide' }});</script>
</body></html>
"""

OUT.mkdir(exist_ok=True)
(OUT / "report.html").write_text(REPORT, encoding="utf-8")
(OUT / "slides.html").write_text(SLIDES, encoding="utf-8")
print(f"report.html {len(REPORT) / 1e6:.2f} MB · slides.html {len(SLIDES) / 1e6:.2f} MB · per-user {per_user:.3f}")
