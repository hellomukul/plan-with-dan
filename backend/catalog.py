"""The SOM course catalog as typed, cleaned records, plus search.

Each row of data/yale_som_classes.json is one *section* of a course in one
term. We keep that granularity (`Section`) and group sections into `Offering`s
keyed by (course number, normalised title, term), so a course that runs in
both fall and spring is two offerings, never one merged card.

Everything an agent is told about a course comes from here. Agents never see
the raw file, only short "cards" built by `card_text`, so prompts stay small
and every fact can be traced back to a catalog field.
"""

from __future__ import annotations

import json
import math
import os
import re
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import date
from functools import lru_cache
from pathlib import Path
from typing import Iterable

from config import DATA_DIR

CATALOG_PATH = DATA_DIR / "yale_som_classes.json"  # committed snapshot: the fallback
LIVE_PATH = DATA_DIR / "som_live.json"  # written by som_feed's background refresh; preferred when present

TERM_NAMES = {"202603": "Fall 2026", "202701": "Spring 2027"}
SESSION_NAMES = {
    "fall": "Fall (full term)",
    "fall-1": "Fall 1",
    "fall-2": "Fall 2",
    "spring": "Spring (full term)",
    "spring-1": "Spring 1",
    "spring-2": "Spring 2",
}
DAY_ORDER = ["M", "T", "W", "Th", "F"]
DAY_ICS = {"M": "MO", "T": "TU", "W": "WE", "Th": "TH", "F": "FR"}

# Topic tags inferred from titles and descriptions (not official categories).
# A trailing "*" means "this stem plus any ending", so entrepreneur* catches
# entrepreneurship and entrepreneurial.
TOPIC_RULES: dict[str, dict[str, list[str]]] = {
    "AI & Machine Learning": {
        "any": ["artificial intelligence", "machine learning", "deep learning", "large language model*",
                "generative ai", "neural network*", "llm*", "agentic"],
        "title": ["ai"],
    },
    "Data & Analytics": {
        "any": ["data analy*", "data science", "econometric*", "regression", "causal inference",
                "statistic*", "predictive model*", "analytics"],
        "title": ["data"],
    },
    "Finance": {
        "any": ["corporate finance", "financial market*", "asset pricing", "portfolio*", "valuation",
                "fixed income", "hedge fund*", "private equity", "venture capital", "banking", "securities"],
        "title": ["finance", "financial", "investment*", "investor*", "capital"],
    },
    "Entrepreneurship": {"any": ["entrepreneur*", "startup*", "start-up*", "new venture*", "founder*"]},
    "Marketing & Customers": {
        "any": ["marketing", "consumer behavio*", "brand*", "customer*", "pricing strateg*"],
    },
    "Strategy": {"any": ["competitive strategy", "corporate strategy", "game theory", "competitive advantage"],
                 "title": ["strategy", "strategic"]},
    "Operations & Supply Chain": {
        "any": ["supply chain*", "operations management", "logistics", "manufacturing", "inventory"],
        "title": ["operations"],
    },
    "Leadership & People": {
        "any": ["leadership", "leading teams", "managing groups", "organizational behavio*", "talent",
                "people management"],
        "title": ["leader*", "executive", "teams"],
    },
    "Negotiation": {"any": ["negotiat*", "bargaining"]},
    "Healthcare": {"any": ["healthcare", "health care", "hospital*", "public health", "medicine",
                           "pharma*", "biotech*", "life science*"]},
    "Sustainability & Climate": {"any": ["sustainab*", "climate", "carbon", "environmental", "renewable*",
                                         "energy transition"]},
    "Policy & Society": {"any": ["public policy", "regulation", "government*", "inequality", "social mobility",
                                 "central bank*", "monetary policy"],
                         "title": ["society", "policy"]},
    "Ethics": {"any": ["ethic*", "moral*"]},
    "Global & International": {"any": ["international", "globali*", "emerging market*", "cross-border"],
                               "title": ["global", "ie"]},
    "Real Estate": {"any": ["real estate", "property market*"]},
    "Nonprofit & Impact": {"any": ["nonprofit*", "non-profit*", "social enterprise*", "philanthrop*",
                                   "impact investing", "social impact"]},
    "Behavioral Science": {"any": ["behavioral science", "behavioural science", "judgment and decision",
                                   "psycholog*", "behavioral economics"]},
    "Technology & Product": {"any": ["product management", "technology strateg*", "platform*", "digital",
                                     "software"],
                             "title": ["technology", "product", "tech"]},
    "Accounting": {"any": ["accounting", "financial statement*", "financial reporting", "audit*"]},
    "Media & Entertainment": {"any": ["media", "entertainment", "gaming", "sports"]},
}

BIO_FAILURE = re.compile(
    r"\b(could not find|couldn['’]t find|was unable to|no (?:public |official |reliable )?"
    r"(?:information|record|profile|bio)|does not appear to be)\b",
    re.I,
)
TIME = re.compile(r"(\d{1,2}):(\d{2})\s*([AP])M", re.I)
WORD = re.compile(r"[a-z0-9]+")
STOP = set(
    "a an and are as at be by for from has have in into is it its of on or that the their this to was "
    "will with you your students course courses class this these those how what which who we our they "
    "them can also both more most such through about".split()
)


def _clean(value: object) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def _email(value: object) -> str:
    raw = str(value or "").strip().lower()
    found = re.match(r"[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*?\.(?:edu|com|org|net|gov)", raw)
    return found.group(0) if found else ""


def _exam(raw: object) -> str:
    """Keep the exam field only when it is an actual slot ("Wednesday, March 3, 2027 8:00-12:00 noon").

    For most courses SOM uses it for internal notes ("no 2025-2026", "n/a"), which are not exam dates.
    """
    text = _clean(raw)
    months = r"(?:January|February|March|April|May|June|July|August|September|October|November|December)"
    return text if re.search(rf"{months}\s+\d{{1,2}},\s+20\d\d", text) and len(text) < 120 else ""


def _date(raw: object) -> date | None:
    text = str(raw or "").strip()
    if len(text) >= 8 and text[:8].isdigit():
        try:
            return date(int(text[:4]), int(text[4:6]), int(text[6:8]))
        except ValueError:
            return None
    return None


def _minutes(h: str, m: str, ampm: str) -> int:
    hour = int(h) % 12 + (12 if ampm.upper() == "P" else 0)
    return hour * 60 + int(m)


@dataclass(frozen=True)
class Meeting:
    days: tuple[str, ...]
    start: int  # minutes after midnight
    end: int

    @property
    def label(self) -> str:
        return f"{' '.join(self.days)} {clock(self.start)}–{clock(self.end)}"


def clock(minutes: int) -> str:
    h, m = divmod(minutes, 60)
    return f"{h % 12 or 12}:{m:02d} {'PM' if h >= 12 else 'AM'}"


def parse_meeting(raw: str) -> Meeting | None:
    """'M  W 10:05 AM-11:25 AM' -> Meeting(('M','W'), 605, 685). None when TBA."""
    text = _clean(raw)
    times = list(TIME.finditer(text))
    if len(times) < 2:
        return None
    days = tuple(d for d in text[: times[0].start()].split() if d in DAY_ORDER)
    if not days:
        return None
    start = _minutes(*times[0].groups())
    end = _minutes(*times[1].groups())
    if end <= start:
        return None
    return Meeting(days=days, start=start, end=end)


def _has(text: str, term: str) -> bool:
    stem = term.endswith("*")
    core = re.escape(term.rstrip("*"))
    tail = r"[a-z]*" if stem else ""
    return re.search(rf"(?<![a-z0-9]){core}{tail}(?![a-z0-9])", text) is not None


def infer_topics(title: str, description: str) -> list[str]:
    t = title.lower()
    body = f"{t} {description.lower()}"
    return [
        topic
        for topic, rule in TOPIC_RULES.items()
        if any(_has(body, w) for w in rule.get("any", [])) or any(_has(t, w) for w in rule.get("title", []))
    ]


def programs_for(category: str, course_type: str) -> list[str]:
    tokens = {t.strip().lower() for t in course_type.split(",") if t.strip()}
    cat = category.lower()
    found: set[str] = set()
    if "emba" in tokens or cat == "emba":
        found.add("EMBA")
    if "phd" in tokens or cat == "phd":
        found.add("PhD")
    if "mam" in tokens or cat == "mam":
        found.add("MAM")
    if any(t.startswith("mms") for t in tokens) or cat.startswith("mms"):
        found.add("MMS")
    if cat in ("gnam", "gnw"):
        found.add("Global Network")
    degree_owned = found & {"EMBA", "PhD", "MAM"}
    if not degree_owned and (tokens & {"core", "elective"} or cat == "core" or not found):
        found.add("MBA")
    return sorted(found)


MMS_TRACKS = ("AM", "GBS", "SR", "TM")


def mms_tracks_for(category: str, course_type: str) -> list[str]:
    """MMS tracks a section is designated for, e.g. 'elective,MMS AM,MMS TM' -> ['AM', 'TM']."""
    found = set()
    for raw in [*course_type.split(","), category.replace("MMG", "MMS")]:
        t = raw.strip().upper()
        if t.startswith("MMS "):
            found.add(t[4:].strip())
    return sorted(found & set(MMS_TRACKS))


def audiences_for(programs: list[str], tracks: list[str], category: str, any_core: bool) -> list[str]:
    """Program codes (see programs.py) whose students can plan this section.

    - MBA and joint-degree MBA students: MBA sections.
    - MBA for Executives: EMBA sections only (other SOM courses need faculty permission, space-available).
    - MAM and MMS students: their own designated courses plus SOM electives (not the MBA core, and not
      International Experience, which is funded from the MBA Global Studies Account).
    - PhD students: doctoral courses plus MBA electives by Request to Enroll.
    """
    mba_elective = "MBA" in programs and not any_core
    cat = category.upper()
    shared = mba_elective and cat != "GSR"
    aud: set[str] = set()
    if "MBA" in programs:
        aud |= {"MBA", "MBA-JOINT"}
    if "EMBA" in programs:
        aud.add("EMBA")
    if "MAM" in programs or shared:
        aud.add("MAM")
    for t in MMS_TRACKS:
        if t in tracks or shared:
            aud.add(f"MMS-{t}")
    if tracks or "MMS" in programs or shared:
        aud.add("MMS")
    if "PhD" in programs or (shared and cat not in ("GNW", "GNAM")):
        aud.add("PhD")
    return sorted(aud)


@dataclass
class Section:
    id: str
    number: str
    title: str
    term: str
    session: str
    starts: date | None
    ends: date | None
    meeting: Meeting | None
    room: str
    units: float
    section: str
    faculty: list[str]
    emails: list[str]
    category: str
    course_type: str
    enrollment: str  # bid | permission | core | EMBA | PHD | ...
    limit: int | None
    attributes: list[str]
    prerequisite: str
    description: str
    syllabus: str
    bio: str
    new_course: bool
    visible: bool
    topics: list[str] = field(default_factory=list)
    programs: list[str] = field(default_factory=list)
    tracks: list[str] = field(default_factory=list)  # MMS tracks this section is designated for
    audiences: list[str] = field(default_factory=list)  # program codes that can plan it
    cohort: str = ""  # MBA core: the cohort this section is for (live feed only)
    exam: str = ""  # MBA core: the scheduled final exam, when SOM has published one

    @property
    def offering_key(self) -> str:
        return offering_key(self.number, self.title, self.term)

    @property
    def any_core(self) -> bool:
        """A required core course for some program (MBA, EMBA, ...): assigned, never bid on."""
        return "core" in {t.strip().lower() for t in self.course_type.split(",")}

    @property
    def is_core(self) -> bool:
        return self.any_core and "MBA" in self.programs

    def core_for(self, program: str) -> bool:
        owner = "EMBA" if program == "EMBA" else "MBA" if program in ("MBA", "MBA-JOINT") else program
        return self.any_core and owner in self.programs

    def ended(self, today: date | None = None) -> bool:
        return bool(self.ends and self.ends < (today or date.today()))

    @property
    def closed(self) -> bool:
        """Not open for enrollment (e.g. the second half of a two-term course)."""
        return self.enrollment.strip().lower() == "no"

    def open_to(self, program: str) -> bool:
        return program in self.audiences

    @property
    def counts_for_ldr(self) -> bool:  # inferred from the public feed's MGLD attribute
        return "MGLD" in self.attributes

    @property
    def counts_for_gsr(self) -> bool:  # inferred from the public feed's MGGS attribute
        return "MGGS" in self.attributes

    @property
    def time_label(self) -> str:
        return self.meeting.label if self.meeting else "Time TBA"

    def to_api(self) -> dict:
        return {
            "id": self.id,
            "key": self.offering_key,
            "number": self.number,
            "title": self.title,
            "term": self.term,
            "term_name": TERM_NAMES.get(self.term, self.term),
            "session": self.session,
            "session_name": SESSION_NAMES.get(self.session, self.session),
            "starts": self.starts.isoformat() if self.starts else None,
            "ends": self.ends.isoformat() if self.ends else None,
            "days": list(self.meeting.days) if self.meeting else [],
            "start_min": self.meeting.start if self.meeting else None,
            "end_min": self.meeting.end if self.meeting else None,
            "time": self.time_label,
            "room": self.room,
            "units": self.units,
            "section": self.section,
            "faculty": self.faculty,
            "emails": self.emails,
            "category": self.category,
            "enrollment": self.enrollment,
            "limit": self.limit,
            "ldr": self.counts_for_ldr,
            "gsr": self.counts_for_gsr,
            "core": self.is_core,
            "prerequisite": self.prerequisite,
            "description": self.description,
            "syllabus": self.syllabus,
            "bio": self.bio,
            "new": self.new_course,
            "topics": self.topics,
            "programs": self.programs,
            "tracks": self.tracks,
            "audiences": self.audiences,
            "cohort": self.cohort,
            "exam": self.exam,
        }


def offering_key(number: str, title: str, term: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "", title.lower().replace("&", "and"))
    return f"{number}|{slug}|{term}"


def _row_to_section(row: dict, aliases: dict[str, str]) -> Section:
    names = [_clean(row.get(f"Faculty {i}")) for i in (1, 2, 3, 4)]
    names = [aliases.get(n, n) for n in names if n]
    title = _clean(row.get("Course Title"))
    description = _clean(row.get("Course Description"))
    limit_raw = _clean(row.get("Enrollment Limit"))
    bio = _clean(row.get("faculty_bio"))
    bio = "" if BIO_FAILURE.search(bio) else re.sub(r"\(\[[^\]]*\]\([^)]*\)\)", "", bio).strip()
    try:
        units = float(_clean(row.get("Units")) or 0)
    except ValueError:
        units = 0.0
    section = Section(
        id=_clean(row.get("Course ID")),
        number=_clean(row.get("Course Number")),
        title=title,
        term=_clean(row.get("TermCode")),
        session=_clean(row.get("Course Session")).lower(),
        starts=_date(row.get("Course Session Start date")),
        ends=_date(row.get("Course Session End Date")),
        meeting=parse_meeting(row.get("Daytimes", "")),
        room=_clean(row.get("Room")),
        units=units,
        section=_clean(row.get("Section")),
        faculty=names,
        emails=[e for e in (_email(row.get("Faculty 1 Email")),) if e],
        category=_clean(row.get("Course Category")),
        course_type=_clean(row.get("Course Type")),
        enrollment=_clean(row.get("Bid Or Permission")),
        limit=int(limit_raw) if limit_raw.isdigit() and 1 < int(limit_raw) < 500 else None,
        attributes=[a for a in _clean(row.get("Course Attributes")).split("|") if a],
        prerequisite=_clean(row.get("Prerequisite")),
        description=description,
        syllabus=_clean(row.get("Syllabus")) or _clean(row.get("Old Syllabus")),
        bio=bio,
        new_course=_clean(row.get("New Course")).lower() in ("1", "yes", "true"),
        visible=_clean(row.get("Visible")) != "0",
    )
    section.cohort = _clean(row.get("Cohort")).title()
    section.exam = _exam(row.get("Final Exam")) if section.any_core else ""
    section.topics = infer_topics(title, description)
    section.programs = programs_for(section.category, section.course_type)
    section.tracks = mms_tracks_for(section.category, section.course_type)
    section.audiences = audiences_for(section.programs, section.tracks, section.category, section.any_core)
    return section


@dataclass
class Offering:
    key: str
    sections: list[Section]

    @property
    def lead(self) -> Section:
        return self.sections[0]

    def sections_for(self, program: str | None = None, today: date | None = None) -> list[Section]:
        """Visible sections open to `program` that haven't ended."""
        return [s for s in self.sections
                if s.visible and (not program or s.open_to(program)) and not s.ended(today)]

    def summary(self) -> dict:
        s = self.lead
        return {
            "key": self.key,
            "number": s.number,
            "title": s.title,
            "term": s.term,
            "term_name": TERM_NAMES.get(s.term, s.term),
            "session": s.session,
            "units": s.units,
            "enrollment": s.enrollment,
            "limit": s.limit,
            "topics": s.topics,
            "ldr": s.counts_for_ldr,
            "gsr": s.counts_for_gsr,
            "faculty": sorted({f for sec in self.sections for f in sec.faculty}),
            "times": sorted({sec.time_label for sec in self.sections}),
            "section_ids": [sec.id for sec in self.sections],
        }


class Catalog:
    def __init__(self, rows: list[dict]):
        aliases = self._name_aliases(rows)
        self.sections: list[Section] = [_row_to_section(r, aliases) for r in rows]
        self.by_id: dict[str, Section] = {s.id: s for s in self.sections}
        grouped: dict[str, list[Section]] = defaultdict(list)
        for s in self.sections:
            grouped[s.offering_key].append(s)
        self.offerings: dict[str, Offering] = {
            k: Offering(k, sorted(v, key=lambda x: x.section)) for k, v in grouped.items()
        }
        self._index = _SearchIndex(self.offerings.values())

    @staticmethod
    def _name_aliases(rows: list[dict]) -> dict[str, str]:
        """Two spellings with one email are one person; keep the longer spelling."""
        by_email: dict[str, set[str]] = defaultdict(set)
        for r in rows:
            name, mail = _clean(r.get("Faculty 1")), _email(r.get("Faculty 1 Email"))
            if name and mail:
                by_email[mail].add(name)
        aliases: dict[str, str] = {}
        for names in by_email.values():
            if len(names) > 1:
                keep = max(names, key=len)
                aliases.update({n: keep for n in names if n != keep})
        return aliases

    def offering(self, key: str) -> Offering | None:
        return self.offerings.get(key)

    def cohort_core(self, term: str, cohort: str) -> list[Section]:
        """The MBA core sections a cohort sits in this term.

        Read from the live feed's cohort field; when the data has none for this term (a CSV snapshot),
        fall back to the hand-entered fall table in rules.COHORT_SECTIONS.
        """
        if not cohort:
            return []
        core = [s for s in self.sections if s.term == term and s.is_core and s.visible]
        if any(s.cohort for s in core):
            return [s for s in core if s.cohort == cohort]
        from rules import COHORT_SECTIONS
        return [s for s in core if COHORT_SECTIONS.get(s.number, {}).get(cohort) == s.section]

    def offering_for_number(self, number: str, term: str | None = None) -> list[Offering]:
        want = _clean(number).upper()
        return [o for o in self.offerings.values() if o.lead.number.upper() == want and (not term or o.lead.term == term)]

    def eligible(self, term: str | None = None, program: str | None = "MBA", include_core: bool = False,
                 today: date | None = None, include_closed: bool = False) -> list[Offering]:
        """Offerings with at least one visible, not-yet-ended section open to `program`.

        Checks every section, not just the first one, so an EMBA section of a course
        that also has an MBA section is still found for EMBA students.
        """
        out = []
        for o in self.offerings.values():
            if term and o.lead.term != term:
                continue
            mine = o.sections_for(program, today)
            if not mine:
                continue
            if not include_core and any(s.any_core for s in mine):
                continue
            if not include_closed and all(s.closed for s in mine):
                continue
            out.append(o)
        return out

    def search(self, query: str, pool: Iterable[Offering] | None = None, limit: int = 25) -> list[tuple[Offering, float]]:
        return self._index.rank(query, pool, limit)


class _SearchIndex:
    """BM25 over title (weighted x3), topics (x2) and description."""

    K1, B = 1.4, 0.75

    def __init__(self, offerings: Iterable[Offering]):
        self.docs: dict[str, Counter] = {}
        lengths = {}
        df: Counter = Counter()
        for o in offerings:
            s = o.lead
            words = _tokens(s.title) * 3 + _tokens(" ".join(s.topics)) * 2 + _tokens(s.description)
            words += _tokens(" ".join(f for sec in o.sections for f in sec.faculty))
            tf = Counter(words)
            self.docs[o.key] = tf
            lengths[o.key] = len(words) or 1
            df.update(tf.keys())
        n = max(1, len(self.docs))
        self.avg = sum(lengths.values()) / n
        self.lengths = lengths
        self.idf = {w: math.log(1 + (n - c + 0.5) / (c + 0.5)) for w, c in df.items()}

    def rank(self, query: str, pool: Iterable[Offering] | None, limit: int) -> list[tuple[Offering, float]]:
        terms = [t for t in _tokens(query) if t in self.idf]
        candidates = list(pool) if pool is not None else []
        scored = []
        for o in candidates:
            tf = self.docs.get(o.key)
            if tf is None:
                continue
            score = 0.0
            for t in terms:
                f = tf.get(t, 0)
                if f:
                    norm = f * (self.K1 + 1) / (f + self.K1 * (1 - self.B + self.B * self.lengths[o.key] / self.avg))
                    score += self.idf[t] * norm
            scored.append((o, score))
        scored.sort(key=lambda x: (-x[1], x[0].lead.number))
        return scored[:limit]


def _tokens(text: str) -> list[str]:
    out = []
    for w in WORD.findall(text.lower()):
        if w in STOP or len(w) < 2:
            continue
        # light stemming so "entrepreneurial" meets "entrepreneurship"
        for suffix in ("ships", "ship", "ial", "ing", "ies", "ers", "er", "es", "s"):
            if len(w) > len(suffix) + 3 and w.endswith(suffix):
                w = w[: -len(suffix)]
                break
        out.append(w)
    return out


def card_text(o: Offering, max_desc: int = 320) -> str:
    """The compact line an agent sees for one offering. Every field is from the catalog."""
    s = o.lead
    desc = s.description[:max_desc] + ("…" if len(s.description) > max_desc else "")
    flags = [f for f, on in (("LDR", s.counts_for_ldr), ("GSR", s.counts_for_gsr), ("new", s.new_course)) if on]
    parts = [
        f"[{o.key}] {s.number} {s.title}",
        f"{TERM_NAMES.get(s.term, s.term)} / {SESSION_NAMES.get(s.session, s.session)}, {s.units:g} units",
        f"times: {', '.join(sorted({x.time_label for x in o.sections}))}",
        f"enrol: {s.enrollment or 'n/a'}" + (f", seats {s.limit}" if s.limit else ""),
        f"faculty: {', '.join(sorted({f for x in o.sections for f in x.faculty})) or 'TBA'}",
        f"topics: {', '.join(s.topics) or '-'}",
    ]
    if flags:
        parts.append("flags: " + ", ".join(flags))
    if s.prerequisite:
        parts.append(f"prereq: {s.prerequisite}")
    parts.append(f"about: {desc or '(no description published)'}")
    return " | ".join(parts)


def data_path() -> Path:
    """Where the catalog is read from: the live-feed cache when it exists, else the committed snapshot.

    SOM_LIVE_FEED=0 pins the snapshot (tests, offline runs)."""
    live = os.getenv("SOM_LIVE_FEED", "1") != "0" and LIVE_PATH.exists()
    return LIVE_PATH if live else CATALOG_PATH


@lru_cache(maxsize=1)
def get_catalog() -> Catalog:
    try:
        return Catalog(json.loads(data_path().read_text(encoding="utf-8")))
    except (OSError, ValueError):  # a damaged cache must never take the site down
        return Catalog(json.loads(CATALOG_PATH.read_text(encoding="utf-8")))
