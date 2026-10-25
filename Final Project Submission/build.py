"""Build report.html and slides.html from src/*.src.html.

Every {{IMG:name.jpg}} becomes a base64 data URI from img/, and {{DIAGRAM:light}} / {{DIAGRAM:dark}}
becomes the inline SVG agent diagram, so both outputs are single self-contained files.

    python3 build.py          (run from this folder; standard library only)

To refresh a screenshot after a deploy: replace the file in img/ (same name, JPEG, ~1400 px wide), then rerun.
"""
from __future__ import annotations

import base64
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent

PALETTES = {
    "light": dict(bg="#ffffff", text="#16181d", muted="#5b6472", agent="#286dc0", agent_text="#ffffff",
                  code="#eef2f7", code_stroke="#c5cfdb", code_text="#16181d", student="#ffffff",
                  student_stroke="#7d8796", lane="#f7f9fc", lane_stroke="#e2e7ee", arrow="#7d8796", accent="#286dc0"),
    "dark": dict(bg="#0b0b0c", text="#f2f4f7", muted="#a3abb8", agent="#286dc0", agent_text="#ffffff",
                 code="#1d1f23", code_stroke="#3a3f47", code_text="#e8ebf0", student="#141416",
                 student_stroke="#8a93a1", lane="#141416", lane_stroke="#26292e", arrow="#8a93a1", accent="#63aaff"),
}


def diagram(theme: str) -> str:
    c = PALETTES[theme]
    out: list[str] = []

    def box(x, y, w, h, kind, title, sub="", size=13):
        if kind == "agent":
            fill, stroke, tc, dash = c["agent"], c["agent"], c["agent_text"], ""
        elif kind == "code":
            fill, stroke, tc, dash = c["code"], c["code_stroke"], c["code_text"], ""
        else:
            fill, stroke, tc, dash = c["student"], c["student_stroke"], c["text"], ' stroke-dasharray="5 4"'
        out.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="8" fill="{fill}" stroke="{stroke}" stroke-width="1.4"{dash}/>')
        cy = y + h / 2 + (-5 if sub else 4)
        out.append(f'<text x="{x + w / 2}" y="{cy}" text-anchor="middle" font-size="{size}" font-weight="650" fill="{tc}">{title}</text>')
        if sub:
            for i, line in enumerate(sub.split("|")):
                out.append(f'<text x="{x + w / 2}" y="{cy + 15 + i * 13}" text-anchor="middle" font-size="10.5" fill="{tc}" opacity="0.85">{line}</text>')

    def arrow(x1, y1, x2, y2, dashed=False):
        d = ' stroke-dasharray="4 4"' if dashed else ""
        out.append(f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{c["arrow"]}" stroke-width="1.6" marker-end="url(#ah-{theme})"{d}/>')

    def lane(y, h, label):
        out.append(f'<rect x="2" y="{y}" width="996" height="{h}" rx="10" fill="{c["lane"]}" stroke="{c["lane_stroke"]}"/>')
        out.append(f'<text x="16" y="{y + 20}" font-size="13" font-weight="700" fill="{c["accent"]}">{label}</text>')

    # A. Ask Dan
    lane(4, 262, "A · Ask Dan: one chat turn")
    box(14, 108, 92, 56, "student", "Student", "question")
    box(122, 108, 104, 56, "code", "Safety screen", "injection? → stop, $0")
    box(242, 108, 104, 56, "code", "Spend guard", "$0.05 turn · $0.50 day")
    box(362, 108, 104, 56, "agent", "Dispatcher", "picks ONE specialist")
    box(362, 196, 104, 52, "agent", "Memory Keeper", "folds long chats")
    specs = ["Course Scout", "Planner", "Career Coach", "SOM Guide", "Bid Coach", "AI News Desk"]
    for i, s in enumerate(specs):
        box(492, 34 + i * 37, 142, 30, "agent", s, size=12)
    box(652, 34, 176, 215, "code", "", "")
    tools = ["15 code tools", "search_catalog · course_details", "check_fit · find_alternates", "ldr_courses · suggest_add", "other_yale_courses",
             "my_profile_and_plan", "plan_review · requirements_status", "global_options · upcoming_dates",
             "yale_facts (sourced Bulletin)", "bid_history · suggest_bid_split", "+ OpenAI web search (News)",
             "each specialist: its own subset"]
    for i, t in enumerate(tools):
        weight = "700" if i == 0 else "400"
        out.append(f'<text x="740" y="{54 + i * 16.5}" text-anchor="middle" font-size="{12 if i == 0 else 10.5}" font-weight="{weight}" fill="{c["code_text"]}">{t}</text>')
    box(846, 60, 140, 56, "code", "Output check", "secrets · unknown MGT #s")
    box(846, 150, 140, 72, "student", "Answer", "+ receipt (tokens, $)|+ Add buttons: you click")
    arrow(106, 136, 120, 136); arrow(226, 136, 240, 136); arrow(346, 136, 360, 136)
    arrow(466, 136, 490, 128)
    arrow(414, 196, 414, 166, dashed=True)
    arrow(634, 140, 650, 140)
    arrow(828, 88, 844, 88)
    arrow(916, 116, 916, 148)

    # B. Course picks
    lane(276, 128, "B · Course picks: Elihu ranks courses for a goal, every quarter left")
    y = 306
    box(14, y, 92, 56, "student", "Goal", "own words")
    box(120, y, 92, 56, "code", "Screen", "same as chat")
    box(226, y, 128, 56, "code", "Pool + shortlist", "BM25: 159 → 36")
    box(368, y, 112, 56, "agent", "Elihu", "ranks 10–15 + quote")
    box(494, y, 112, 56, "code", "Validator", "drops invented keys")
    box(620, y, 126, 56, "code", "Placer", "earliest quarter|that fits the week")
    box(760, y, 108, 56, "student", "You tick", "move · undo")
    box(882, y, 104, 56, "student", "My plan", "clash-checked")
    box(226, 368, 128, 28, "code", "Beyond SOM search", size=11)
    for x1, x2 in ((106, 118), (212, 224), (354, 366), (480, 492), (606, 618), (746, 758), (868, 880)):
        arrow(x1, y + 28, x2, y + 28)

    # C. Desk + D. Import
    lane(414, 98, "C · Dan's Desk: the chief-of-staff brief")
    y = 442
    box(14, y, 150, 54, "student", "Plan · profile", "deadlines · bids · GSA")
    box(184, y, 150, 54, "code", "Desk scan", "≤3 decision cards|each cites its rule")
    box(354, y, 150, 54, "agent", "Chief of Staff", "2–3 sentence brief")
    box(524, y, 150, 54, "code", "Cache", "1 written brief/day")
    box(694, y, 150, 54, "student", "Next step", "approve · snooze · done")
    for x1, x2 in ((164, 182), (334, 352), (504, 522), (674, 692)):
        arrow(x1, y + 27, x2, y + 27)

    lane(522, 92, "D · Screenshot import of courses taken")
    y = 548
    box(14, y, 150, 54, "student", "Yale Hub image", "never stored")
    box(184, y, 150, 54, "agent", "Transcript reader", "vision → numbers, grades")
    box(354, y, 150, 54, "code", "Check", "valid numbers · in catalog?")
    box(524, y, 150, 54, "student", "You confirm", "nothing saved before")
    for x1, x2 in ((164, 182), (334, 352), (504, 522)):
        arrow(x1, y + 27, x2, y + 27)

    # Legend
    lx, ly = 700, 548
    out.append(f'<rect x="{lx}" y="{ly}" width="18" height="14" rx="3" fill="{c["agent"]}"/><text x="{lx + 26}" y="{ly + 11}" font-size="11.5" fill="{c["text"]}">AI agent (gpt-6-luna, spends tokens)</text>')
    out.append(f'<rect x="{lx}" y="{ly + 22}" width="18" height="14" rx="3" fill="{c["code"]}" stroke="{c["code_stroke"]}"/><text x="{lx + 26}" y="{ly + 33}" font-size="11.5" fill="{c["text"]}">plain code (free, tested)</text>')
    out.append(f'<rect x="{lx}" y="{ly + 44}" width="18" height="14" rx="3" fill="{c["student"]}" stroke="{c["student_stroke"]}" stroke-dasharray="4 3"/><text x="{lx + 26}" y="{ly + 55}" font-size="11.5" fill="{c["text"]}">student input / decision</text>')

    head = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 618" role="img" '
            f'aria-label="Plan with Dan agent diagram" style="width:100%;height:auto;font-family:Geist,Inter,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">'
            f'<defs><marker id="ah-{theme}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
            f'<path d="M0,0 L10,5 L0,10 z" fill="{c["arrow"]}"/></marker></defs>')
    return head + "".join(out) + "</svg>"


def data_uri(name: str) -> str:
    path = HERE / "img" / name
    mime = "image/png" if name.lower().endswith(".png") else "image/jpeg"
    return f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode()


def build(src: str, dst: str) -> None:
    text = (HERE / "src" / src).read_text(encoding="utf-8")
    text = re.sub(r"\{\{IMG:([\w.\-]+)\}\}", lambda m: data_uri(m.group(1)), text)
    text = re.sub(r"\{\{DIAGRAM:(light|dark)\}\}", lambda m: diagram(m.group(1)), text)
    leftover = re.findall(r"\{\{[^}]*\}\}", text)
    if leftover:
        raise SystemExit(f"{src}: unreplaced placeholders {leftover[:5]}")
    (HERE / dst).write_text(text, encoding="utf-8")
    print(f"{dst}: {(HERE / dst).stat().st_size / 1e6:.2f} MB")


if __name__ == "__main__":
    build("report.src.html", "report.html")
    build("slides.src.html", "slides.html")
