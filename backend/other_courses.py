"""Courses at other Yale schools that SOM students can take (data/yale_other_courses.json, built from the public Yale
Bulletin by scripts/fetch_yale_courses.py).

They're shown apart from SOM's own courses, always labelled with their school, never mixed into SOM's unit totals,
and added to a plan as an "outside SOM" course. The rules come from SOM's Bulletin: instructor permission, the
offering school's procedures, deadlines and fees; graduate courses typically carry 4 SOM units, credit set by the
registrar; Yale College credit needs the dean of students' approval in advance.
"""
from __future__ import annotations

import json
import math
from collections import Counter
from functools import lru_cache

from catalog import _tokens
from config import DATA_DIR

PATH = DATA_DIR / "yale_other_courses.json"
TERM_NAME = {"202603": "Fall 2026", "202701": "Spring 2027"}


@lru_cache(maxsize=1)
def load() -> dict:
    if not PATH.exists():
        return {"courses": [], "rules": "", "rules_source": "", "source": "", "fetched": ""}
    data = json.loads(PATH.read_text())
    # A course SOM already lists under an MGT number (cross-listed, e.g. ENV 814 = MGT 563) stays in SOM's own list.
    from catalog import get_catalog
    som_titles = {" ".join(x.title.lower().split()) for x in get_catalog().sections}
    data["courses"] = [c for c in data["courses"] if " ".join(c["title"].lower().split()) not in som_titles]
    for c in data["courses"]:
        c["id"] = c["number"].replace(" ", "-").lower()
        c["term_names"] = [TERM_NAME.get(t, t) for t in c["terms"]]
        c["season"] = sorted({"fall" if t.endswith("03") else "spring" for t in c["terms"]})
    return data


class _Index:
    K1, B = 1.4, 0.75

    def __init__(self, courses: list[dict]):
        self.docs = [Counter(_tokens(c["title"]) * 3 + _tokens(c["dept"]) * 2 + _tokens(c["description"]) + _tokens(c["instructor"]))
                     for c in courses]
        self.lens = [sum(d.values()) or 1 for d in self.docs]
        self.avg = sum(self.lens) / max(1, len(self.lens))
        df: Counter = Counter()
        for d in self.docs:
            df.update(d.keys())
        n = max(1, len(self.docs))
        self.idf = {w: math.log(1 + (n - f + 0.5) / (f + 0.5)) for w, f in df.items()}

    def score(self, i: int, terms: list[str]) -> float:
        d, length, s = self.docs[i], self.lens[i], 0.0
        for w in terms:
            tf = d.get(w)
            if tf:
                s += self.idf[w] * tf * (self.K1 + 1) / (tf + self.K1 * (1 - self.B + self.B * length / self.avg))
        return s


@lru_cache(maxsize=1)
def _index() -> _Index:
    return _Index(load()["courses"])


def search(query: str = "", school: str = "", term: str = "", limit: int = 40) -> list[dict]:
    courses = load()["courses"]
    q = query.strip()
    number = " ".join(q.upper().split())
    terms = _tokens(q)
    out = []
    for i, c in enumerate(courses):
        if school and c["school"] != school:
            continue
        if term and term not in c["terms"]:
            continue
        if not q:
            out.append((0.0, c))
            continue
        if number and (c["number"] == number or number in c.get("also", [])):
            out.append((1000.0, c))
            continue
        s = _index().score(i, terms) if terms else 0.0
        if s > 0:
            out.append((s, c))
    out.sort(key=lambda x: (-x[0], x[1]["number"]))
    return [c for _, c in out[:limit]]


def summary() -> dict:
    data = load()
    schools = Counter(c["school"] for c in data["courses"])
    return {"count": len(data["courses"]), "schools": [{"name": k, "count": v} for k, v in schools.most_common()],
            "rules": data.get("rules", ""), "rules_source": data.get("rules_source", ""), "source": data.get("source", ""),
            "fetched": data.get("fetched", "")}
