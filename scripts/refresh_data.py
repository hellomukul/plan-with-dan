#!/usr/bin/env python3
"""Refresh the committed course snapshot, data/yale_som_classes.json.

The running server already refreshes itself from SOM's live feed (see
backend/som_feed.py). This rebuilds the committed fallback it starts from.

From the live feed (preferred: adds cohorts, rooms and core exam slots):

    python3 scripts/refresh_data.py --live

From CSV exports, if the feed is ever unavailable. Export from
https://som.yale.edu/elective-core-courses (one export per term is fine — pass
them all), then:

    python3 scripts/refresh_data.py ~/Downloads/courseslist-*.csv

Duplicate exports of the same term are harmless; rows are de-duplicated on
Course ID + Section + TermCode. Faculty bios are carried across from the current
snapshot so they are not lost. data/yale_som.db is rewritten too if it exists.

Nothing is written until every source has parsed, so a bad export or a broken
feed leaves the current data alone.
"""

from __future__ import annotations

import csv
import json
import shutil
import sqlite3
import sys
from collections import Counter
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
import som_feed  # noqa: E402
JSON_PATH = ROOT / "data" / "yale_som_classes.json"
DB_PATH = ROOT / "data" / "yale_som.db"
STAMP_PATH = ROOT / "data" / "last_updated.json"

# db column -> CSV header. faculty_bio has no CSV source; it is preserved.
COLUMN_MAP = {
    "course_id": "Course ID",
    "course_number": "Course Number",
    "course_title": "Course Title",
    "course_category": "Course Category",
    "course_type": "Course Type",
    "course_session": "Course Session",
    "course_description": "Course Description",
    "faculty_1": "Faculty 1",
    "faculty_1_email": "Faculty 1 Email",
    "faculty_bio": None,
    "daytimes": "Daytimes",
    "timings_day": "Timings Day",
    "timings_start": "Timings StartTime",
    "timings_end": "Timings EndTime",
    "room": "Room",
    "section": "Section",
    "units": "Units",
    "term_code": "TermCode",
    "syllabus": "Syllabus",
    "old_syllabus": "Old Syllabus",
}

REQUIRED = ["Course ID", "Course Number", "Course Title", "TermCode", "Section"]


def write_db(merged: list[dict]) -> None:
    """The older agent search database, kept in step when it exists."""
    con = sqlite3.connect(DB_PATH)
    cols = [c[1] for c in con.execute("PRAGMA table_info(courses)")]
    con.execute("DELETE FROM courses")
    con.execute("DELETE FROM sqlite_sequence WHERE name='courses'")
    insert_cols = [c for c in cols if c != "id"]
    stmt = (
        f"INSERT INTO courses ({','.join(insert_cols)}) "
        f"VALUES ({','.join('?' * len(insert_cols))})"
    )
    for r in merged:
        values = []
        for c in insert_cols:
            src = "faculty_bio" if c == "faculty_bio" else COLUMN_MAP.get(c)
            values.append(r.get(src, "") if src else "")
        con.execute(stmt, values)
    con.commit()
    con.close()
    print(f"  wrote {DB_PATH.relative_to(ROOT)}")


def read_csv(path: Path) -> list[dict]:
    with path.open(encoding="utf-8-sig", newline="") as fh:
        rows = list(csv.DictReader(fh))
    if not rows:
        raise SystemExit(f"{path.name}: no rows")
    missing = [c for c in REQUIRED if c not in rows[0]]
    if missing:
        raise SystemExit(f"{path.name}: missing columns {missing}")
    return rows


def read_exports(paths: list[Path]) -> list[dict]:
    for p in paths:
        if not p.exists():
            raise SystemExit(f"no such file: {p}")
    merged: list[dict] = []
    seen: set[tuple[str, str, str]] = set()
    for p in paths:
        rows = read_csv(p)
        added = 0
        for r in rows:
            key = (r["Course ID"], r["Section"], r["TermCode"])
            if key in seen:
                continue
            seen.add(key)
            merged.append(r)
            added += 1
        print(f"  {p.name}: {len(rows)} rows, {added} new")
    return merged


def main(argv: list[str]) -> int:
    if not argv:
        raise SystemExit(__doc__)
    previous = json.loads(JSON_PATH.read_text(encoding="utf-8")) if JSON_PATH.exists() else []
    if argv == ["--live"]:
        merged = som_feed.fetch_rows(previous)
        if not som_feed.looks_complete(merged, previous):
            raise SystemExit(f"live feed looks incomplete ({len(merged)} rows vs {len(previous)}); nothing written")
        print(f"  live feed: {len(merged)} sections")
    else:
        merged = read_exports([Path(p).expanduser() for p in argv])

    terms = Counter(r["TermCode"] for r in merged)
    print(f"\n  merged: {len(merged)} rows across {len(terms)} term(s): {dict(terms)}")

    courses = {(r["Course Number"], r["Course Title"].strip().lower()) for r in merged}
    print(f"  distinct courses: {len(courses)}")

    # Back up, then write.
    for target in (JSON_PATH, DB_PATH):
        if target.exists():
            shutil.copy(target, target.with_suffix(target.suffix + ".bak"))

    # Neither source has faculty bios; carry them over from the current snapshot.
    restored = som_feed.carry_bios(merged, previous)
    JSON_PATH.write_text(
        json.dumps(merged, ensure_ascii=False, indent=1), encoding="utf-8"
    )
    print(f"\n  wrote {JSON_PATH.relative_to(ROOT)} ({restored} rows kept a bio)")

    if DB_PATH.exists():
        write_db(merged)

    STAMP_PATH.write_text(
        json.dumps(
            {
                "refreshed": date.today().isoformat(),
                "rows": len(merged),
                "terms": sorted(terms),
            },
            indent=1,
        ),
        encoding="utf-8",
    )
    print(f"  wrote {STAMP_PATH.relative_to(ROOT)}")

    print("\nNext:")
    print("  git add data && git commit -m 'Refresh course data' && git push")
    print("  then redeploy the BACKEND service on Render — the static site")
    print("  alone will not serve new data.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
