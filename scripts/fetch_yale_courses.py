"""Build data/yale_other_courses.json: courses at other Yale schools that SOM students can take, from the public Yale
Bulletin (catalog.yale.edu).

Why the Bulletin: Yale Course Search (courses.yale.edu) answers automated requests with a bot challenge, which we
don't try to get around. The Bulletin is public, allowed by its robots.txt, and lists each school's 2026-27
courses: code(s) with a term letter (a = fall, b = spring), title, instructor and description. It has no meeting
times or rooms, so the app says "times on Yale Course Search" and lets the student add them.

Who can take them (SOM Bulletin, course policies): SOM students may enroll in Yale College, Graduate School or other
professional-school courses with the instructor's permission, following that school's procedures, deadlines and
fees; graduate and Yale College courses typically carry 4 SOM units, as determined by the registrar; Yale College
credit needs the dean of students' approval in advance.

Run:  python scripts/fetch_yale_courses.py      (about 300 pages, one every 0.4 s, a few minutes)
"""
from __future__ import annotations

import html
import json
import re
import sys
import time
import urllib.robotparser
from datetime import date
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "yale_other_courses.json"
BASE = "https://catalog.yale.edu"
UA = "PlanWithDan/1.0 (Yale SOM student course planner; one request at a time)"
PAUSE = 0.8

# Bulletin section -> how we name the school to students
SECTIONS = {
    "/gsas/degree-granting-departments-programs/": "Graduate School (GSAS)",
    "/global-affairs/": "Jackson School of Global Affairs",
    "/environment/": "School of the Environment",
    "/ysph/": "School of Public Health",
}
TERM = {"a": "202603", "b": "202701"}  # the 2026-27 Bulletin: a = Fall 2026, b = Spring 2027
SKIP_TITLES = re.compile(r"\b(dissertation|thesis|independent (study|research)|directed (reading|research)|tutorial|"
                         r"research (in|seminar for)|teaching fellow|prospectus|summer research|internship|practicum credit)\b", re.I)
CODE = re.compile(r"\b([A-Z&]{2,6}) (\d{3,4})([ab]{0,2})\b")


def clean(s: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", s or ""))).strip()


def pages(client: httpx.Client) -> list[tuple[str, str]]:
    xml = client.get(f"{BASE}/sitemap.xml").text
    robots = urllib.robotparser.RobotFileParser()
    robots.parse(client.get(f"{BASE}/robots.txt").text.splitlines())
    out = []
    for url in re.findall(r"<loc>([^<]+)</loc>", xml):
        path = url.replace(BASE, "")
        for prefix, school in SECTIONS.items():
            if path.startswith(prefix) and robots.can_fetch(UA, url):
                if prefix.startswith("/gsas/") and path.rstrip("/").count("/") != 3:
                    continue  # one page per GSAS department
                out.append((url, school))
    return out


SMALL = {"and", "of", "the", "in", "for", "on"}
DEPT_FOR = {"/environment/": "Environment", "/global-affairs/": "Global Affairs"}


def dept_name(url: str) -> str:
    """The department, from the page address (the page heading is the school's generic title)."""
    for prefix, name in DEPT_FOR.items():
        if prefix in url:
            return name
    slug = url.rstrip("/").rsplit("/", 1)[-1]
    words = slug.split("-")
    return " ".join(w if (i and w in SMALL) else w.capitalize() for i, w in enumerate(words))


def parse(page: str, school: str, url: str) -> list[dict]:
    dept = dept_name(url)
    courses = []
    for block in re.findall(r'<div class="courseblock">(.*?)(?=<div class="courseblock">|</div>\s*</div>\s*</div>|$)', page, re.S):
        title_html = (re.search(r'courseblocktitle[^>]*>(.*?)</p>', block, re.S) or [None, ""])[1]
        strong = clean((re.search(r"<strong>(.*?)</strong>", title_html, re.S) or [None, ""])[1])
        if not strong or "," not in strong:
            continue
        codes_part, title = strong.split(",", 1)
        codes = [(m.group(1), m.group(2), m.group(3)) for m in CODE.finditer(codes_part)]
        title = title.strip().rstrip(".")
        if not codes or not title or SKIP_TITLES.search(title):
            continue
        if any(subject == "MGT" for subject, _, _ in codes):
            continue  # cross-listed with SOM: already in SOM's own course list (tagged "Taught with")
        letters = codes[0][2] or ""
        terms = [TERM[c] for c in letters if c in TERM]
        if not terms:
            continue  # no term letter: not scheduled in 2026-27
        instructor = clean((re.search(r'class="instructor"[^>]*>(.*?)</span>', title_html, re.S) or [None, ""])[1])
        desc = clean((re.search(r'courseblockdesc[^>]*>(.*?)</p>', block, re.S) or [None, ""])[1])
        courses.append({
            "number": f"{codes[0][0]} {codes[0][1]}",
            "also": [f"{s} {n}" for s, n, _ in codes[1:]],
            "title": title[:160],
            "instructor": instructor[:120],
            "school": school,
            "dept": dept[:80],
            "terms": terms,
            "description": desc[:1400],
            "source": url,
        })
    return courses


def merge(seen: dict[str, dict], c: dict) -> None:
    """One entry per real course: a cross-listed course appears on each department's page with that department's
    code first (CPLT 6046 / ENGL 5746 / ...), so match on title, instructor and terms and keep every code."""
    key = f"{c['title'].lower()}|{c['instructor'].lower()}|{','.join(c['terms'])}"
    if key in seen:
        first = seen[key]
        first["also"] = sorted((set(first["also"]) | set(c["also"]) | {c["number"]}) - {first["number"]})
        return
    seen[key] = c


def main() -> None:
    with httpx.Client(headers={"User-Agent": UA}, timeout=30, follow_redirects=True) as client:
        todo = pages(client)
        print(f"{len(todo)} Bulletin pages to read", file=sys.stderr)
        seen: dict[str, dict] = {}
        for i, (url, school) in enumerate(todo, 1):
            time.sleep(PAUSE)
            r = None
            for wait in (0, 3, 10):  # the server sometimes drops a connection: retry patiently, then skip the page
                time.sleep(wait)
                try:
                    r = client.get(url)
                    break
                except httpx.HTTPError:
                    r = None
            if r is None or r.status_code != 200 or "courseblock" not in r.text:
                continue
            for c in parse(r.text, school, url):
                merge(seen, c)
            if i % 25 == 0:
                print(f"  {i}/{len(todo)} pages, {len(seen)} courses", file=sys.stderr)
    data = {
        "source": "Yale Bulletin 2026-27 (catalog.yale.edu), public course listings",
        "fetched": date.today().isoformat(),
        "rules": ("SOM students may take these with the instructor's permission and must follow the offering school's "
                  "procedures, deadlines and fees. Graduate-school courses typically carry 4 SOM units; the registrar "
                  "decides the credit. Source: SOM Bulletin, course policies."),
        "rules_source": "https://catalog.yale.edu/management/rights-responsibilities-students/course-policies-residential-masters-degree-programs/",
        "courses": sorted(seen.values(), key=lambda c: (c["school"], c["number"])),
    }
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=0))
    print(f"wrote {len(seen)} courses to {OUT}", file=sys.stderr)


if __name__ == "__main__":
    main()
