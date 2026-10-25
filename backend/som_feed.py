"""SOM's live course feed, turned into the same rows as the CSV export.

`POST https://som.yale.edu/courses/session-items/<term>` is the public JSON the
som.yale.edu course pages are built from. It carries everything the CSV export
does plus what the export drops: each core section's cohort, its room and its
final-exam slot. Rows come out with the CSV's column names (plus "Cohort" and
"Final Exam"), so `catalog.py` reads either source the same way.

The server refreshes from here in the background (see `start_refresher`) into
data/som_live.json. data/yale_som_classes.json stays as the committed fallback,
rebuilt by `scripts/refresh_data.py` from the feed (`--live`) or CSV exports.
"""

from __future__ import annotations

import json
import logging
import os
import ssl
import threading
import time
import urllib.request
from pathlib import Path

FEED_URL = "https://som.yale.edu/courses/session-items/{term}"
TERMS = ("202603", "202701")
REFRESH_SECONDS = 12 * 60 * 60
MIN_SHARE = 0.8  # a refresh must keep at least this share of the current rows, or it's treated as broken

log = logging.getLogger("uvicorn.error")

# feed field -> CSV column
FIELDS = {
    "courseID": "Course ID",
    "courseNumber": "Course Number",
    "courseTitle": "Course Title",
    "courseCategory": "Course Category",
    "courseSession": "Course Session",
    "courseSessionStartDate": "Course Session Start date",
    "courseSessionEndDate": "Course Session End Date",
    "courseDescription": "Course Description",
    "daysTimes": "Daytimes",
    "day": "Timings Day",
    "startTime": "Timings StartTime",
    "endTime": "Timings EndTime",
    "room": "Room",
    "section": "Section",
    "units": "Units",
    "termCode": "TermCode",
    "syllabus": "Syllabus",
    "oldSyllabus": "Old Syllabus",
    "visible": "Visible",
    "enrollmentLimit": "Enrollment Limit",
    "bidOrPermission": "Bid Or Permission",
    "allowBid": "Allow Bid",
    "courseAttributes": "Course Attributes",
    "prerequisite": "Prerequisite",
    "newCourse": "New Course",
    "cohort": "Cohort",
    "finalExamPresentation": "Final Exam",
    **{f"faculty{i}": f"Faculty {i}" for i in (1, 2, 3, 4)},
    **{f"faculty{i}Email": f"Faculty {i} Email" for i in (1, 2, 3, 4)},
}


def _tls() -> ssl.SSLContext:
    """Verify against certifi's bundle when present (python.org macOS builds ship without system roots)."""
    try:
        import certifi  # installed with httpx
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()


def fetch_items(term: str, timeout: float = 60) -> list[dict]:
    req = urllib.request.Request(FEED_URL.format(term=term), data=b"{}", method="POST",
                                 headers={"Content-Type": "application/json", "User-Agent": "PlanWithDan/1.0"})
    with urllib.request.urlopen(req, timeout=timeout, context=_tls()) as resp:  # noqa: S310 (fixed https URL)
        items = json.load(resp).get("data", {}).get("items", [])
    if not isinstance(items, list):
        raise ValueError(f"unexpected feed shape for {term}")
    return items


def to_row(item: dict) -> dict:
    row = {col: str(item.get(key) or "") for key, col in FIELDS.items()}
    # The feed lists multiple types with '|' ("EMBA|Core"); the CSV, and the catalog, use ','.
    row["Course Type"] = ",".join(t.strip() for t in str(item.get("courseType") or "").split("|") if t.strip())
    return row


def carry_bios(rows: list[dict], previous: list[dict]) -> int:
    """The feed has no faculty bios; keep the ones already written for the same course and instructor."""
    by_course = {(r.get("Course Number", "").strip(), r.get("Faculty 1", "").strip()): r.get("faculty_bio", "")
                 for r in previous if r.get("faculty_bio")}
    by_name: dict[str, str] = {}
    for (_, name), bio in by_course.items():
        by_name.setdefault(name, bio)
    kept = 0
    for r in rows:
        name = r.get("Faculty 1", "").strip()
        r["faculty_bio"] = by_course.get((r.get("Course Number", "").strip(), name)) or by_name.get(name, "")
        kept += bool(r["faculty_bio"])
    return kept


def fetch_rows(previous: list[dict], terms: tuple[str, ...] = TERMS) -> list[dict]:
    """Every section of `terms` as CSV-shaped rows, de-duplicated like the CSV import."""
    rows, seen = [], set()
    for term in terms:
        for item in fetch_items(term):
            row = to_row(item)
            key = (row["Course ID"], row["Section"], row["TermCode"])
            if row["Course ID"] and key not in seen:
                seen.add(key)
                rows.append(row)
    carry_bios(rows, previous)
    return rows


def looks_complete(rows: list[dict], previous: list[dict]) -> bool:
    terms = {r["TermCode"] for r in rows}
    return bool(rows) and set(TERMS) <= terms and len(rows) >= MIN_SHARE * len(previous)


def refresh_once(live_path: Path, fallback_path: Path) -> bool:
    """Fetch the feed into `live_path`. Returns True when new data was written."""
    current = live_path if live_path.exists() else fallback_path
    previous = json.loads(current.read_text(encoding="utf-8"))
    rows = fetch_rows(previous)
    if not looks_complete(rows, previous):
        log.warning("SOM live feed looked incomplete (%d rows vs %d); keeping current data", len(rows), len(previous))
        return False
    tmp = live_path.with_suffix(".tmp")
    tmp.write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")
    tmp.replace(live_path)
    log.info("SOM live feed: %d sections refreshed", len(rows))
    return True


def start_refresher(live_path: Path, fallback_path: Path, on_update) -> None:
    """Refresh now and every REFRESH_SECONDS in a daemon thread. Off when SOM_LIVE_FEED=0 (tests, offline)."""
    if os.getenv("SOM_LIVE_FEED", "1") == "0":
        return

    def loop() -> None:
        while True:
            try:
                if refresh_once(live_path, fallback_path):
                    on_update()
            except Exception as exc:  # network down, SOM changed the feed: keep serving what we have
                log.warning("SOM live feed refresh failed: %s", exc)
            time.sleep(REFRESH_SECONDS)

    threading.Thread(target=loop, name="som-live-feed", daemon=True).start()
