#!/usr/bin/env python3
"""Refresh the course data from CSV exports.

Export from https://som.yale.edu/elective-core-courses (one export per term is
fine — pass them all), then:

    python3 scripts/refresh_data.py ~/Downloads/courseslist-*.csv

Duplicate exports of the same term are harmless; rows are de-duplicated on
Course ID + Section + TermCode. Both data/yale_som_classes.json (served by the
API) and data/yale_som.db (searched by the agent) are rewritten, with faculty
bios carried across from the existing database so they are not lost.

Nothing is written until every file has parsed, so a bad export leaves the
current data alone.
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


def read_csv(path: Path) -> list[dict]:
    with path.open(encoding="utf-8-sig", newline="") as fh:
        rows = list(csv.DictReader(fh))
    if not rows:
        raise SystemExit(f"{path.name}: no rows")
    missing = [c for c in REQUIRED if c not in rows[0]]
    if missing:
        raise SystemExit(f"{path.name}: missing columns {missing}")
    return rows


def main(argv: list[str]) -> int:
    paths = [Path(p).expanduser() for p in argv]
    if not paths:
        raise SystemExit(__doc__)
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

    terms = Counter(r["TermCode"] for r in merged)
    print(f"\n  merged: {len(merged)} rows across {len(terms)} term(s): {dict(terms)}")

    courses = {(r["Course Number"], r["Course Title"].strip().lower()) for r in merged}
    print(f"  distinct courses: {len(courses)}")

    # Back up, then write.
    for target in (JSON_PATH, DB_PATH):
        if target.exists():
            shutil.copy(target, target.with_suffix(target.suffix + ".bak"))

    con = sqlite3.connect(DB_PATH)
    cols = [c[1] for c in con.execute("PRAGMA table_info(courses)")]

    # The export has no faculty_bio column, so bios only exist in the database.
    # Carry them into BOTH outputs — the API serves the JSON, and dropping them
    # there silently empties "About the instructor" across the site.
    bios: dict[tuple[str, str], str] = {}
    by_name: dict[str, str] = {}
    for num, fac, bio in con.execute(
        "SELECT course_number, faculty_1, faculty_bio FROM courses"
    ):
        if bio:
            bios[(num or "").strip(), (fac or "").strip()] = bio
            by_name.setdefault((fac or "").strip(), bio)

    restored = 0
    for r in merged:
        name = (r.get("Faculty 1") or "").strip()
        key = ((r.get("Course Number") or "").strip(), name)
        bio = bios.get(key) or by_name.get(name, "")
        r["faculty_bio"] = bio
        if bio:
            restored += 1

    JSON_PATH.write_text(
        json.dumps(merged, ensure_ascii=False, indent=1), encoding="utf-8"
    )
    print(f"\n  wrote {JSON_PATH.relative_to(ROOT)} ({restored} rows kept a bio)")

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
            if c == "faculty_bio":
                key = (
                    (r.get("Course Number") or "").strip(),
                    (r.get("Faculty 1") or "").strip(),
                )
                values.append(bios.get(key, ""))
            else:
                src = COLUMN_MAP.get(c)
                values.append(r.get(src, "") if src else "")
        con.execute(stmt, values)
    con.commit()
    kept = con.execute(
        "SELECT COUNT(*) FROM courses WHERE faculty_bio != ''"
    ).fetchone()[0]
    con.close()
    print(f"  wrote {DB_PATH.relative_to(ROOT)} ({kept} faculty bios carried over)")

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
