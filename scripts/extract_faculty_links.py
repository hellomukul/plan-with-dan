#!/usr/bin/env python3
"""Regenerate frontend/src/facultyLinks.ts from the faculty bios.

Each bio the research agent wrote ends with a citation to the instructor's
Yale directory page. Those slugs are authoritative; deriving them from names
is wrong for about a third of the faculty, because the directory uses middle
initials and legal first names (Jake Thomas is jacob-thomas).

    python3 scripts/extract_faculty_links.py
"""

from __future__ import annotations

import json
import re
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / "data" / "yale_som.db"
OUT = ROOT / "frontend" / "src" / "facultyLinks.ts"

SLUG = re.compile(
    r"https://som\.yale\.edu/faculty-research/faculty-directory/([a-z0-9\-]+)"
)

HEADER = """/**
 * Yale faculty-directory slugs, harvested from the citation each bio ends
 * with. Only slugs Yale itself published are here — deriving them from names
 * gets about a third wrong, because the directory uses middle initials and
 * legal first names: Jake Thomas is jacob-thomas, Sigga Benediktsdottir is
 * sigridur-benediktsdottir.
 *
 * Regenerate with: python3 scripts/extract_faculty_links.py
 */

export const FACULTY_SLUGS: Record<string, string> = {
"""


def main() -> int:
    con = sqlite3.connect(DB)
    bios: dict[str, str] = {}
    for name, bio in con.execute("SELECT faculty_1, faculty_bio FROM courses"):
        if bio and name:
            bios.setdefault(name.strip(), bio)
    con.close()

    found = {}
    for name, bio in bios.items():
        m = SLUG.search(bio)
        if m:
            found[name] = m.group(1)

    lines = [HEADER]
    for name in sorted(found):
        lines.append(f"  {json.dumps(name)}: {json.dumps(found[name])},\n")
    lines.append("}\n")
    OUT.write_text("".join(lines), encoding="utf-8")
    print(f"wrote {len(found)} slugs to {OUT.relative_to(ROOT)}")
    print(f"({len(bios) - len(found)} faculty with a bio had no citation)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
