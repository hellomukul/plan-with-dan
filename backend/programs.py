"""Every Yale SOM degree program the planner supports, with official rules and sources.

Facts are from the Yale Bulletin, School of Management 2026-2027 (B26, catalog.yale.edu/management)
unless marked "SOM web" (som.yale.edu, undated, checked Oct 24 2026). Anything we couldn't
confirm is listed under `unconfirmed` and shown to students as such, never as a rule.

Program codes are what the student picks in their profile. The legacy code "MMS" (no track)
still works and means "any MMS track".
"""

from __future__ import annotations

B26 = "https://catalog.yale.edu/management"
POLICIES = f"{B26}/rights-responsibilities-students/course-policies-residential-masters-degree-programs/"
GS_FUNDING = f"{B26}/tuition-fees/global-studies-financial-support/"
CALENDARS = f"{B26}/calendars/"

PROGRAMS: dict[str, dict] = {
    "MBA": {
        "label": "Full-time MBA", "base": "MBA", "total_units": 72, "min_units": 16, "min_note": "first three terms",
        "max_units": 24, "terms": 4,
        "summary": "72 units: about 30.5 core (assigned by cohort) and 41.5 elective. At least 16 units in each of the "
                   "first three terms; more than 24 in a term needs approval. Leadership and Global Studies requirements.",
        "required": [], "global": "Global Studies Requirement (one option; 10 funded GSA days).",
        "calendar": "MBA calendar (orientation Aug 17-21; GNW Oct 19-23 and Mar 8-19 with IE).",
        "sources": [f"{B26}/full-time-mba/mba-degree-requirements/", POLICIES, GS_FUNDING],
        "unconfirmed": [],
    },
    "MBA-JOINT": {
        "label": "MBA, joint degree", "base": "MBA", "total_units": 52, "min_units": 16, "min_note": "first three terms",
        "max_units": 24, "terms": 3,
        "summary": "Joint-degree students (Law, Medicine, MPH, MEM, Architecture, Drama, Divinity, GSAS master's) need "
                   "52 SOM units instead of 72, over three terms in residence at SOM, with at least 35.5 units graded "
                   "Proficient or higher and at most 16.5 Pass/Fail units.",
        "required": [], "global": "Whether the Leadership and Global Studies requirements apply isn't stated in the Bulletin.",
        "calendar": "MBA calendar while at SOM.",
        "sources": [f"{B26}/full-time-mba/joint-degree-programs/", f"{B26}/full-time-mba/mba-degree-requirements/"],
        "unconfirmed": ["Leadership (LDR) and Global Studies (GSR) requirements for joint-degree students"],
    },
    "EMBA": {
        "label": "MBA for Executives", "base": "EMBA", "total_units": 72, "min_units": None, "max_units": 24, "terms": 4,
        "summary": "72 units over 22 months: 33 core units, 17 Advanced Management units, the 2-unit EMBA Global "
                   "Network Week, and 20 elective units. Areas of focus: asset management, healthcare, sustainability "
                   "or general management (chosen at the end of year 1; a focus needs 4 designated courses, 8 units). "
                   "Electives open after the first semester in good standing. More than 24 units in a term needs approval.",
        "required": [], "global": "EMBA Global Network Week, June at the end of year 1 (Class of 2028: Jun 14-18, 2027). "
                                  "An MBA GNW or IE can't substitute.",
        "calendar": "Own calendar: July residency, then alternating Friday/Saturday class weekends Aug-May.",
        "sources": [f"{B26}/mba-executives/emba-program-degree-requirements/", f"{B26}/mba-executives/emba-curriculum/",
                    "https://som.yale.edu/programs/emba/curriculum/academic-calendar"],
        "unconfirmed": ["Whether EMBA electives use the course auction", "Required courses for each area of focus"],
    },
    "MAM": {
        "label": "Master of Advanced Management", "base": "MAM", "total_units": 40, "min_units": 20, "min_note": "each term",
        "max_units": 24, "terms": 2,
        "summary": "40 units in one year: 4 units of required MAM courses plus 36 elective units from SOM or approved "
                   "courses elsewhere at Yale. At least 20 units each term (the second term can be reduced with AASL "
                   "approval). Five funded travel days for a Global Network Week or a Global Social Entrepreneurship course.",
        "required": [{"number": "MGT 633", "title": "Topics in Advanced Management for Business and Society", "term": "202603", "units": 2},
                     {"number": "MGT 636", "title": "Managing Groups and Teams (MAM)", "term": "202603", "units": 2}],
        "global": "No Global Network Week requirement is stated; 5 subsidized travel days for a GNW or GSE course.",
        "calendar": "MBA calendar (orientation Aug 17-28).",
        "sources": [f"{B26}/mam/", f"{B26}/courses/fall-term-mam-required-courses/", GS_FUNDING, POLICIES],
        "unconfirmed": ["Whether a Global Network Week is required"],
    },
    "MMS-AM": {
        "label": "MMS in Asset Management", "base": "MMS", "track": "AM", "total_units": 36, "min_units": 18,
        "min_note": "each term", "max_units": 24, "terms": 2,
        "summary": "36 units in two terms: 18 required units (including the year-long colloquium and the Practical "
                   "Experience Requirement, at least 40 hours, after the first term) and 18 elective units. At least 18 units each term.",
        "required": [{"number": "MGT 595", "title": "Quantitative Investing", "term": "202603", "units": 4},
                     {"number": "MGT 921", "title": "Asset Management Colloquium", "term": "202603", "units": 2},
                     {"number": "MGT 924", "title": "Statistical Foundations", "term": "202603", "units": 2},
                     {"number": "MGT 927", "title": "Financial Econometrics", "term": "202603", "units": 4},
                     {"number": "MGT 532", "title": "Business Ethics", "term": "202701", "units": 2},
                     {"number": "MGT 641", "title": "Behavioral Finance", "term": "202701", "units": 2},
                     {"number": "MGT 921", "title": "Asset Management Colloquium", "term": "202701", "units": 2},
                     {"number": "MGT 928", "title": "Asset Management Practical Experience", "term": "202701", "units": 0}],
        "global": "No global requirement is stated.", "calendar": "MBA calendar (orientation Aug 17-28).",
        "sources": [f"{B26}/mms/mms-asset-management/", f"{B26}/courses/mms-asset-management-required-courses/"],
        "unconfirmed": [],
    },
    "MMS-GBS": {
        "label": "MMS in Global Business and Society", "base": "MMS", "track": "GBS", "total_units": 36, "min_units": 18,
        "min_note": "each term", "max_units": 24, "terms": 2,
        "summary": "36 units in two terms: the required global-perspectives course (MGT 627), at least 16 units from the "
                   "GBS course list, and electives, including some elsewhere at Yale. At least 18 units each term. "
                   "Global Network Week travel is subsidized.",
        "required": [{"number": "MGT 627", "title": "Business and Government after Communism", "term": "202603", "units": 2}],
        "list_tag": "GBS", "list_units": 16, "list_label": "GBS course list",
        "global": "No requirement stated; GNW travel is subsidized for GBS students.",
        "calendar": "MBA calendar (orientation Aug 17-28).",
        "sources": [f"{B26}/mms/mms-global-business-society/",
                    f"{B26}/courses/fall-term-mms-global-business-society-required-course/", GS_FUNDING],
        "unconfirmed": [],
    },
    "MMS-SR": {
        "label": "MMS in Systemic Risk", "base": "MMS", "track": "SR", "total_units": 36, "min_units": 18,
        "min_note": "each term", "max_units": 24, "terms": 2,
        "summary": "36 units: 28 required units (14 each term) plus 8 elective units in statistics, economics or finance.",
        "required": [{"number": "MGT 628", "title": "Central Banking", "term": "202603", "units": 4},
                     {"number": "MGT 642", "title": "Resolution of Systemically Important Banks", "term": "202603", "units": 2},
                     {"number": "MGT 890", "title": "The Global Financial Crisis", "term": "202603", "units": 4},
                     {"number": "MGT 946", "title": "Central Banking in Emerging Economies", "term": "202603", "units": 2},
                     {"number": "MGT 949", "title": "Systemic-Risk Colloquium", "term": "202603", "units": 2},
                     {"number": "MGT 523", "title": "Monetary Policy", "term": "202701", "units": 4},
                     {"number": "MGT 892", "title": "Introduction to Financial Crisis Communications", "term": "202701", "units": 2},
                     {"number": "MGT 943", "title": "Financial Stability Regulation", "term": "202701", "units": 2},
                     {"number": "MGT 945", "title": "Macroprudential Policy", "term": "202701", "units": 4},
                     {"number": "MGT 949", "title": "Systemic-Risk Colloquium", "term": "202701", "units": 2}],
        "global": "No global requirement is stated.", "calendar": "MBA calendar; no separate SR calendar in the Bulletin.",
        "sources": [f"{B26}/mms/mms-systemic-risk/", f"{B26}/courses/mms-systemic-risk-required-courses/"],
        "unconfirmed": ["Any 2026-27 start date different from the MBA calendar"],
    },
    "MMS-TM": {
        "label": "MMS in Technology Management", "base": "MMS", "track": "TM", "total_units": 36, "min_units": 18,
        "min_note": "each term", "max_units": 24, "terms": 2,
        "summary": "36 units: a required summer internship before the program, 14 required units, 14 units of "
                   "pre-approved SOM electives, and two graduate engineering (SEAS) courses (8 units). The program "
                   "director approves all course choices.",
        "required": [], "list_tag": "TM", "list_units": 14, "list_label": "pre-approved SOM electives",
        "global": "No global requirement is stated.", "calendar": "MBA calendar.",
        "sources": [f"{B26}/mms/mms-technology-management/", "https://som.yale.edu/programs/masters-technology-management/curriculum"],
        "unconfirmed": ["Required course numbers (SOM web lists Innovator, Foundations of Accounting and Valuation, "
                        "Introduction to Marketing and an ENAS design course, but they aren't in the Bulletin or the public course feed)"],
    },
    "MMS-PEM": {
        "label": "MMS in Public Education Management", "base": "MMS", "track": "PEM", "total_units": 36, "min_units": None,
        "max_units": None, "terms": 0,
        "summary": "14 months while working full-time: five residence weeks plus monthly online sessions. 36 units "
                   "(24 coursework, 8 colloquia, 4 capstone), no electives, own calendar ending August 2027.",
        "required": [], "global": "None stated.", "calendar": "Own calendar (ends Aug 2027).",
        "sources": [f"{B26}/mms/mms-public-education-management/", CALENDARS],
        "unconfirmed": ["PEM courses aren't in SOM's public course feed, so the planner can't list them"],
    },
    "PhD": {
        "label": "PhD student taking SOM courses", "base": "PhD", "total_units": None, "min_units": None,
        "max_units": None, "terms": 0,
        "summary": "SOM doctoral courses are listed for you. MBA electives need a Request to Enroll: space-available, "
                   "SOM students have priority, and your home program decides the credit.",
        "required": [], "global": "None.", "calendar": "Yale graduate school calendar for your home program.",
        "sources": ["https://som.yale.edu/programs/phd", "https://som.yale.edu/programs/resources-non-som-students"],
        "unconfirmed": [],
    },
}
PROGRAMS["MMS"] = {**PROGRAMS["MMS-GBS"], "label": "MMS (track not set)", "track": None, "required": [],
                   "list_tag": None, "summary": "36 units over two terms with at least 18 units each term. Pick your "
                   "track in your profile to see its required courses.", "unconfirmed": []}

CODES = list(PROGRAMS)


def get(program: str | None) -> dict:
    return PROGRAMS.get(program or "MBA", PROGRAMS["MBA"])


def base(program: str | None) -> str:
    return get(program)["base"]


def is_mba(program: str | None) -> bool:
    return base(program) == "MBA"
