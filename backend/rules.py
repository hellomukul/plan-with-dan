"""Yale SOM MBA rules the planner checks against, each with its source.

Transcribed from the 2026-27 Yale University Catalog (Bulletin) and SOM pages,
checked Oct 24 2026 (see docs/research.md). Where official sources disagree we
follow the Bulletin and say so.
"""

from __future__ import annotations

SOURCES = {
    "requirements": "https://catalog.yale.edu/management/full-time-mba/mba-degree-requirements/",
    "curriculum": "https://catalog.yale.edu/management/full-time-mba/mba-curriculum/",
    "gsr": "https://som.yale.edu/global-studies-requirement",
    "gsr_funding": "https://catalog.yale.edu/management/tuition-fees/global-studies-financial-support/",
    "calendar": "https://som.yale.edu/programs/mba/curriculum/academic-calendar",
    "policies": "https://catalog.yale.edu/management/rights-responsibilities-students/course-policies-residential-masters-degree-programs/",
    "gnw": "https://globalnetwork.io/programs/network-weeks",
}

DEGREE = {
    "total_units": 72,
    "core_units": 30.5,
    "elective_units": 41.5,
    "min_units_first_three_terms": 16,
    "approval_above_units": 24,
    "terms": 4,
}

# 2026-27 Bulletin core list (AI Foundations replaces Global Virtual Teams).
CORE_COURSES = [
    ("Managing Groups and Teams", 1),
    ("Basics of Accounting", 2),
    ("Basics of Economics", 2.5),
    ("Probability Modeling and Statistics", 2),
    ("AI Foundations for Managers", 2),
    ("Introduction to Negotiation", 1),
    ("Competitor", 2),
    ("Customer", 2),
    ("Investor", 2),
    ("State and Society", 2),
    ("The Workforce", 2),
    ("Operations Engine", 2),
    ("Sourcing and Managing Funds", 2),
    ("Innovator", 2),
    ("The Global Macroeconomy", 2),
    ("The Executive", 2),
]

LDR = {
    "summary": "At least one elective from the approved Leadership Distribution list, any time before graduation.",
    "how_flagged": "Courses carrying the MGLD attribute in SOM's public course feed (our inference; confirm on the internal list).",
    "petition": "Petitions go to Academic Affairs & Student Life.",
    "source": SOURCES["curriculum"],
}

GSA_DAYS = 10  # Global Studies Account: funded days at entry, never replenished

GSR_OPTIONS = [
    {
        "key": "ie",
        "name": "International Experience (IE)",
        "units": 4,
        "gsa_days": 10,
        "timing": "Half a term in class, then a ~10-day trip. Spring 2027 travel: Mar 8–19.",
        "enrol": "Course auction. You may bid only if all 10 GSA days are unused.",
        "cost": "SOM covers double-occupancy lodging and about half of meals; you pay airfare.",
        "match": {"title_prefix": "IE:"},
        "requires_full_gsa": True,
    },
    {
        "key": "gnw",
        "name": "Global Network Week (GNW)",
        "units": 1.5,
        "gsa_days": 5,
        "timing": "About a week, twice a year: Mar 8–12, 2027 and Oct 18–22, 2027.",
        "enrol": "Course auction. The subvention can cover up to two GNWs.",
        "cost": "50% of lodging and meals at State Department per-diem rates is reimbursed.",
        "match": {"title_prefix": "GNW"},
    },
    {
        "key": "snoc",
        "name": "Global Network online course (SNOC)",
        "units": 2,
        "gsa_days": 0,
        "timing": "Online, synchronous, with a team from other Global Network schools.",
        "enrol": "Auction, then the instructor selects. A place is not guaranteed.",
        "cost": "No travel cost.",
        "match": {"title_contains": "global network"},
    },
    {
        "key": "gse_india",
        "name": "Global Social Entrepreneurship: India (MGT 529)",
        "units": 2,
        "gsa_days": 10,
        "timing": "Fall-2 to Spring-1, mostly second-years. Two weeks of fieldwork in India in January.",
        "enrol": "Separate application (2026 window was Jun 1–12).",
        "cost": "SOM covers lodging and about half of meals; you pay airfare.",
        "match": {"number": "MGT 529"},
    },
    {
        "key": "gse_spring",
        "name": "Spring Global Social Entrepreneurship (MGT 865)",
        "units": None,
        "gsa_days": 5,
        "timing": "Spring-1 to Spring-2, mostly first-years. One week of fieldwork in March.",
        "enrol": "Application. Process and deadline are on the internal site.",
        "cost": "SOM covers lodging and about half of meals; you pay airfare.",
        "match": {"number": "MGT 865"},
    },
    {
        "key": "exchange",
        "name": "International exchange term",
        "units": None,
        "gsa_days": 10,
        "timing": "One term (fall or spring) of the second year.",
        "enrol": "Apply through Academic Affairs & Student Life. Partners: LSE, LBS, HEC Paris, IESE, NUS, Tsinghua SEM; petition for other Global Network schools.",
        "cost": "50% of lodging and meals at per-diem rates is reimbursed.",
        "match": None,
    },
]

GLOBAL_WEEKS = [
    {"name": "Global Network Week", "start": "2027-03-08", "end": "2027-03-12"},
    {"name": "International Experience travel window", "start": "2027-03-08", "end": "2027-03-19"},
    {"name": "Global Network Week", "start": "2027-10-18", "end": "2027-10-22"},
]

# Fall 2026 core: which section each cohort sits in (Class of 2028).
COHORT_SECTIONS = {
    "MGT 402": {"Silver": "01", "Red": "02", "Green": "03", "Gold": "04", "Blue": "05"},
    "MGT 403": {"Red": "01", "Gold": "02", "Blue": "03", "Silver": "04", "Green": "05"},
    "MGT 404": {"Gold": "01", "Green": "02", "Silver": "03", "Red": "04", "Blue": "05"},
    "MGT 409": {"Gold": "01", "Green": "02", "Red": "03", "Silver": "04", "Blue": "05"},
    "MGT 410": {"Green": "01", "Blue": "02", "Gold": "03", "Red": "04", "Silver": "05"},
    "MGT 411": {"Blue": "01", "Gold": "02", "Red": "03", "Silver": "04", "Green": "05"},
    "MGT 412": {"Green": "01", "Blue": "02", "Red": "03", "Silver": "04", "Gold": "05"},
    "MGT 413": {"Red": "01", "Silver": "02", "Green": "03", "Blue": "04", "Gold": "05"},
}

# kind: deadline | exam | break | classes | grades | holiday | global | milestone
CALENDAR = [
    ("2026-10-26", "Session-2 classes begin (Fall)", "classes"),
    ("2026-11-02", "Add/drop ends, Fall session-2 electives (5 p.m.)", "deadline"),
    ("2026-11-06", "Fall session-1 grades due", "grades"),
    ("2026-11-20", "Late drop / audit deadline, Fall session-2 (5 p.m.)", "deadline"),
    ("2026-11-23", "November recess begins (through Nov 27)", "break"),
    ("2026-11-30", "Classes resume", "classes"),
    ("2026-12-15", "Fall classes end", "classes"),
    ("2026-12-16", "Fall final exams (through Dec 22)", "exam"),
    ("2026-12-23", "Winter recess begins", "break"),
    ("2027-01-04", "Fall grades due", "grades"),
    ("2027-01-05", "Spring open add/drop begins (8:30 a.m.)", "deadline"),
    ("2027-01-18", "MLK Day, no classes", "holiday"),
    ("2027-01-19", "Spring classes begin", "classes"),
    ("2027-01-26", "Add/drop ends: session-1, full-term and non-SOM courses (5 p.m.)", "deadline"),
    ("2027-01-29", "Make-up day: Monday schedule", "classes"),
    ("2027-02-12", "Late drop / audit deadline, Spring session-1 (5 p.m.)", "deadline"),
    ("2027-03-03", "Spring session-1 finals (through Mar 5)", "exam"),
    ("2027-03-05", "Late drop deadline, full-term electives (5 p.m.)", "deadline"),
    ("2027-03-08", "International Experience + Global Network Week (no classes through Mar 19)", "global"),
    ("2027-03-19", "Spring session-1 grades due", "grades"),
    ("2027-03-22", "Spring session-2 begins", "classes"),
    ("2027-03-29", "Add/drop ends, Spring session-2 (5 p.m.)", "deadline"),
    ("2027-04-16", "Late drop / audit deadline, Spring session-2 (5 p.m.)", "deadline"),
    ("2027-05-04", "Spring classes end", "classes"),
    ("2027-05-05", "Spring finals (through May 11)", "exam"),
    ("2027-05-24", "Commencement", "milestone"),
]

# Days with no classes, used to add EXDATEs to calendar feeds.
NO_CLASS_DATES = [
    "2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27",
    "2027-01-18",
    "2027-03-08", "2027-03-09", "2027-03-10", "2027-03-11", "2027-03-12",
    "2027-03-15", "2027-03-16", "2027-03-17", "2027-03-18", "2027-03-19",
]


def gsr_courses(catalog, term: str | None = None) -> dict[str, list[str]]:
    """Offering keys in the catalog for each Global Studies option."""
    out: dict[str, list[str]] = {o["key"]: [] for o in GSR_OPTIONS}
    for off in catalog.offerings.values():
        s = off.lead
        if term and s.term != term:
            continue
        for opt in GSR_OPTIONS:
            m = opt["match"]
            if not m:
                continue
            hit = (
                ("title_prefix" in m and s.title.upper().startswith(m["title_prefix"].upper()))
                or ("title_contains" in m and m["title_contains"] in s.title.lower())
                or ("number" in m and s.number == m["number"])
            )
            if hit:
                out[opt["key"]].append(off.key)
    return out
