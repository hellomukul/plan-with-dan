#!/usr/bin/env python3
"""Verify every cohort -> section pairing against the catalog.

    python3 scripts/check_cohorts.py

Reads the pairings out of frontend/src/cohorts.ts and checks each one against
data/yale_som_classes.json: the cohort's section must exist, and no two
cohorts may share a section. Run it after editing cohorts.ts.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TS = ROOT / "frontend" / "src" / "cohorts.ts"
DATA = ROOT / "data" / "yale_som_classes.json"


def parse_pairings(text: str) -> dict[str, dict[str, str]]:
    block = re.search(
        r"COHORT_SECTIONS[^=]*=\s*\{(.*?)\n\}", text, re.S
    )
    if not block:
        raise SystemExit("could not find COHORT_SECTIONS in cohorts.ts")
    out: dict[str, dict[str, str]] = {}
    for line in block.group(1).splitlines():
        m = re.match(r"\s*'([^']+)':\s*\{(.*)\},?\s*$", line)
        if not m:
            continue
        out[m.group(1)] = dict(
            re.findall(r"(\w+):\s*'([^']+)'", m.group(2))
        )
    return out


def main() -> int:
    rows = json.loads(DATA.read_text(encoding="utf-8"))
    pairings = parse_pairings(TS.read_text(encoding="utf-8"))
    problems: list[str] = []

    for number, cohorts in pairings.items():
        sections = {
            (r.get("Section") or "").strip()
            for r in rows
            if (r.get("Course Number") or "").strip() == number
        }
        if not sections:
            problems.append(f"{number}: not in the catalog at all")
            continue
        used: dict[str, str] = {}
        for cohort, sec in cohorts.items():
            if sec not in sections:
                problems.append(
                    f"{number}: {cohort} -> section {sec}, which does not exist "
                    f"(catalog has {sorted(sections)})"
                )
            if sec in used:
                problems.append(
                    f"{number}: {cohort} and {used[sec]} both claim section {sec}"
                )
            used[sec] = cohort
        print(f"  {number}: {len(cohorts)} cohorts -> {sorted(cohorts.values())}")

    print()
    if problems:
        print(f"{len(problems)} problem(s):")
        for p in problems:
            print(f"  ! {p}")
        return 1
    print(f"All {len(pairings)} courses check out.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
