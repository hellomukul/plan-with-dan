#!/usr/bin/env python3
"""Add seat limits, requirement flags and prerequisites from SOM's public course feed.

The public course directory (https://som.yale.edu/courses) loads from
    POST https://som.yale.edu/courses/session-items/{termCode}
This script fetches each term in data/yale_som_classes.json and copies a few
fields onto the matching rows (matched on Course ID):

    Enrollment Limit, Allow Bid, Course Attributes, Prerequisite, New Course,
    Faculty 2..4

Usage:
    python3 scripts/enrich_from_som_feed.py            # fetch live
    python3 scripts/enrich_from_som_feed.py feed.json  # use saved feed files

Nothing is written unless every term parsed.
"""

from __future__ import annotations

import json
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
JSON_PATH = ROOT / "data" / "yale_som_classes.json"
FEED_URL = "https://som.yale.edu/courses/session-items/{term}"

COPY = {
    "enrollmentLimit": "Enrollment Limit",
    "allowBid": "Allow Bid",
    "courseAttributes": "Course Attributes",
    "prerequisite": "Prerequisite",
    "newCourse": "New Course",
    "faculty2": "Faculty 2",
    "faculty3": "Faculty 3",
    "faculty4": "Faculty 4",
}


def fetch(term: str) -> list[dict]:
    req = urllib.request.Request(
        FEED_URL.format(term=term),
        data=b"{}",
        headers={"Content-Type": "application/json", "User-Agent": "plan-with-dan/1.0"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.load(resp)["data"]["items"]


def main(argv: list[str]) -> int:
    rows = json.loads(JSON_PATH.read_text(encoding="utf-8"))
    terms = sorted({r.get("TermCode", "") for r in rows if r.get("TermCode")})

    items: list[dict] = []
    if argv:
        for path in argv:
            items += json.loads(Path(path).read_text(encoding="utf-8"))["data"]["items"]
    else:
        for term in terms:
            got = fetch(term)
            print(f"term {term}: {len(got)} feed rows")
            items += got

    by_id = {str(i.get("courseID")): i for i in items}
    matched = 0
    for row in rows:
        feed = by_id.get(str(row.get("Course ID")))
        if not feed:
            continue
        matched += 1
        for src, dst in COPY.items():
            value = feed.get(src)
            if value not in (None, ""):
                row[dst] = str(value).strip()

    if not matched:
        print("No rows matched; leaving the data alone.")
        return 1
    JSON_PATH.write_text(json.dumps(rows, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"Enriched {matched} of {len(rows)} rows -> {JSON_PATH.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
