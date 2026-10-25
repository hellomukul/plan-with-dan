"""Official Yale SOM facts Dan may quote, each with its source URL.

This is the "Yale database" for questions the course catalog can't answer (rules,
calendars, processes, offices). Every entry comes from an official page listed in
`url`, checked on the date in `checked`. If nothing here or in the catalog answers
a question, Dan says it doesn't know and sends the student to OFFICIAL_LINKS.

Program-specific entries carry `programs`; an entry with no programs applies to all.
"""

from __future__ import annotations

import re

from rules import CALENDAR, DEGREE, GSA_DAYS, GSR_OPTIONS, LDR, SOURCES

CHECKED = "2026-10-24"

# Where to send a student when the app doesn't know. Only confirmed official pages.
OFFICIAL_LINKS: dict[str, tuple[str, str]] = {
    "mba_requirements": ("Full-time MBA degree requirements (Yale Bulletin)", SOURCES["requirements"]),
    "mba_curriculum": ("Full-time MBA curriculum (Yale Bulletin)", SOURCES["curriculum"]),
    "calendar": ("SOM academic calendar", SOURCES["calendar"]),
    "policies": ("Course policies for SOM degree programs (Yale Bulletin)", SOURCES["policies"]),
    "gsr": ("Global Studies Requirement", SOURCES["gsr"]),
    "gsr_funding": ("Global Studies financial support (Yale Bulletin)", SOURCES["gsr_funding"]),
    "gnw": ("Global Network Weeks", SOURCES["gnw"]),
    "bulletin": ("Yale Bulletin: School of Management", "https://catalog.yale.edu/management/"),
    "calendars": ("All SOM program calendars, 2026-27 (Yale Bulletin)", "https://catalog.yale.edu/management/calendars/"),
    "courses": ("SOM elective and core courses", "https://som.yale.edu/elective-core-courses"),
    "yale_courses": ("Yale Course Search", "https://courses.yale.edu/"),
    "canvas": ("Canvas (course sites)", "https://canvas.yale.edu/"),
    "auction": ("SOM course auction help (SOM IT)", "https://confluence.som.yale.edu/display/SC/Course+Auction"),
    "portal": ("SOM student portal", "https://portal.som.yale.edu/"),
    "contact": ("SOM offices and contacts (registrar, Academic Affairs, IT)", "https://som.yale.edu/about/contact"),
    "cdo": ("Career Development Office", "https://cdo.som.yale.edu/"),
    "finaid": ("SOM Financial Aid", "https://groups.som.yale.edu/finaid/contact-us/"),
    "non_som": ("Taking SOM courses as a non-SOM Yale student", "https://som.yale.edu/programs/resources-non-som-students"),
    "joint": ("Joint-degree programs (Yale Bulletin)", "https://catalog.yale.edu/management/full-time-mba/joint-degree-programs/"),
    "emba_reqs": ("MBA for Executives degree requirements", "https://catalog.yale.edu/management/mba-executives/emba-program-degree-requirements/"),
    "emba_calendar": ("MBA for Executives academic calendar", "https://som.yale.edu/programs/emba/curriculum/academic-calendar"),
    "mam": ("Master of Advanced Management (Yale Bulletin)", "https://catalog.yale.edu/management/mam/"),
    "mam_calendar": ("MAM academic calendar", "https://som.yale.edu/programs/mam/curriculum/the-academic-calendar"),
    "mms": ("Master of Management Studies programs (Yale Bulletin)", "https://catalog.yale.edu/management/mms/"),
    "phd": ("Yale SOM PhD program", "https://som.yale.edu/programs/phd"),
}

STOP = set("a an the and or of to in on for is are be do does i my me can how what when where which who will "
           "with at by it this that as from about any there their our you your have has get".split())


def _words(text: str) -> set[str]:
    return {w for w in re.findall(r"[a-z0-9]+", text.lower()) if w not in STOP and len(w) > 1}


def _gsr_text() -> str:
    lines = []
    for o in GSR_OPTIONS:
        units = f"{o['units']} units" if o["units"] else "units vary"
        lines.append(f"{o['name']}: {units}, about {o['gsa_days']} GSA days. {o['timing']} Enroll: {o['enrol']} Cost: {o['cost']}")
    return " ".join(lines)


def _calendar_text() -> str:
    return " ".join(f"{d}: {label}." for d, label, _ in CALENDAR)


KB: list[dict] = [
    {
        "id": "mba-units", "programs": ["MBA"], "title": "Full-time MBA unit requirements",
        "text": (f"The full-time MBA requires {DEGREE['total_units']} units: about {DEGREE['core_units']} core units and "
                 f"at least {DEGREE['elective_units']} elective units. Each of the first three terms needs at least "
                 f"{DEGREE['min_units_first_three_terms']} graded units; a heavy term doesn't make up for a light one. "
                 f"More than {DEGREE['approval_above_units']} units in a term needs approval."),
        "url": SOURCES["requirements"], "keywords": "units credits graduate requirement minimum maximum overload",
    },
    {
        "id": "mba-core", "programs": ["MBA"], "title": "Full-time MBA core curriculum",
        "text": ("First-year MBA students take the core by cohort; it's assigned, not bid on. 2026-27 core includes "
                 "Managing Groups and Teams, Basics of Accounting, Basics of Economics, Probability Modeling and Statistics, "
                 "AI Foundations for Managers, Introduction to Negotiation, and the Organizational Perspectives courses "
                 "(Competitor, Customer, Investor, State and Society, The Workforce, Operations Engine, Sourcing and "
                 "Managing Funds, Innovator, The Global Macroeconomy, The Executive)."),
        "url": SOURCES["curriculum"], "keywords": "core cohort first year required courses waive",
    },
    {
        "id": "ldr", "programs": ["MBA"], "title": "Leadership Distribution Requirement (LDR)",
        "text": f"{LDR['summary']} {LDR['how_flagged']} {LDR['petition']}",
        "url": LDR["source"], "keywords": "leadership ldr distribution requirement mgld",
    },
    {
        "id": "gsr", "programs": ["MBA"], "title": "Global Studies Requirement and the Global Studies Account",
        "text": (f"MBA students complete one Global Studies option. Every student has a {GSA_DAYS}-day Global Studies "
                 f"Account that is never replenished. {_gsr_text()}"),
        "url": SOURCES["gsr"], "keywords": "global studies gsr gsa ie international experience gnw network week snoc exchange travel trip abroad",
    },
    {
        "id": "calendar", "programs": ["MBA", "MBA-JOINT", "MAM", "MMS", "MMS-AM", "MMS-GBS", "MMS-SR", "MMS-TM", "PhD"], "title": "2026-27 SOM academic calendar (MBA, MAM and MMS key dates)",
        "text": _calendar_text(),
        "url": SOURCES["calendar"], "keywords": "calendar dates deadline add drop classes begin end exams recess holiday break finals",
    },
    {
        "id": "auction", "programs": ["MBA", "MBA-JOINT", "MAM", "MMS", "MMS-AM", "MMS-GBS", "MMS-SR", "MMS-TM"], "title": "How the SOM course auction works",
        "text": ("Most SOM electives are filled through the course auction: students bid points, and seats go to the highest "
                 "bids. Some courses need instructor permission instead. SOM does not publish clearing prices or point "
                 "budgets. The core is assigned, not bid on. For the 2026-27 auction (registrar email to first-year MBAs): "
                 "it runs Nov 9, 8:30 a.m. to Jan 4, 8:30 a.m.; first-years bid on IE, GNW and SNOC in rounds 1-2 and on "
                 "electives in rounds 2-3; spring add/drop is in Yale Hub from Jan 5, not the auction."),
        "url": SOURCES["policies"], "keywords": "auction bid bidding points clearing price seats register registration",
    },
    {
        "id": "add-drop", "programs": ["MBA", "MBA-JOINT", "MAM", "MMS", "MMS-AM", "MMS-GBS", "MMS-SR", "MMS-TM", "PhD"], "title": "Add/drop and late changes",
        "text": ("Each session has an add/drop period of about a week. Overlapping courses aren't allowed, and one is "
                 "removed after add/drop. Changes after the deadline need a late form and a $25 fee."),
        "url": SOURCES["policies"], "keywords": "add drop late change withdraw audit fee overlap clash",
    },
    {
        "id": "cross-reg", "programs": None, "title": "Taking courses elsewhere at Yale",
        "text": ("SOM students can take courses in other Yale schools with instructor permission, registered through Yale's "
                 "registration system. These courses usually count 4 units toward the SOM degree; check the Bulletin's "
                 "course policies for limits."),
        "url": SOURCES["policies"], "keywords": "cross registration other schools yale college law school non-som outside",
    },
]


# Which links to offer when the app doesn't know, by program (keys into OFFICIAL_LINKS).
LINKS_BY_PROGRAM: dict[str, list[str]] = {
    "MBA": ["mba_requirements", "calendar", "policies", "contact"],
    "MBA-JOINT": ["joint", "mba_requirements", "calendar", "contact"],
    "EMBA": ["emba_reqs", "emba_calendar", "contact"],
    "MAM": ["mam", "mam_calendar", "policies", "contact"],
    "PhD": ["phd", "non_som", "contact"],
}
DEFAULT_LINKS = ["mms", "calendars", "policies", "contact"]  # MMS tracks and anything else


def links_for(program: str | None) -> list[tuple[str, str]]:
    keys = LINKS_BY_PROGRAM.get(program or "", DEFAULT_LINKS)
    return [OFFICIAL_LINKS[k] for k in keys if k in OFFICIAL_LINKS]


def add_entries(entries: list[dict]) -> None:
    KB.extend(entries)


ALIASES = {
    "MBA": "mba full-time fulltime", "MBA-JOINT": "joint dual degree jd mph mem law medicine",
    "EMBA": "emba executives executive weekend", "MAM": "mam advanced management global network",
    "MMS-AM": "mms asset management am", "MMS-GBS": "mms gbs global business society",
    "MMS-SR": "mms systemic risk sr central banking", "MMS-TM": "mms technology management tm",
    "MMS-PEM": "mms pem public education management", "PhD": "phd doctoral doctorate",
}


def _program_entries() -> list[dict]:
    from programs import PROGRAMS
    out = []
    for code, prog in PROGRAMS.items():
        if code == "MMS":
            continue
        req = "; ".join(f"{r['number']} {r['title']} ({r['units']:g} units, {'fall' if r['term'] == '202603' else 'spring'})"
                        for r in prog.get("required", []))
        text = prog["summary"] + (f" Required courses: {req}." if req else "") + f" Global: {prog['global']} Calendar: {prog['calendar']}"
        if prog.get("unconfirmed"):
            text += " Not confirmed in official sources: " + "; ".join(prog["unconfirmed"]) + "."
        audience = [code, "MMS"] if prog["base"] == "MMS" else [code]
        out.append({"id": f"program-{code.lower()}", "programs": audience,
                    "title": f"{prog['label']} degree requirements",
                    "text": text, "url": prog["sources"][0],
                    "keywords": "degree requirements units graduate required courses track program electives calendar global "
                                + ALIASES.get(code, "")})
    return out


KB.extend(_program_entries())
KB.extend([
    {"id": "offices", "programs": None, "title": "Who to contact at SOM",
     "text": ("Registrar: somregistrar@yale.edu. Academic Affairs and Student Life (AASL) handles academic policies, "
              "unit approvals and petitions; the Assistant Dean is listed on the SOM contact page. SOM IT help: "
              "somit@yale.edu, room L420, 203-432-7777. Financial aid: somfinancialaid@yale.edu. Career Development "
              "Office: cdo.som.yale.edu."),
     "url": "https://som.yale.edu/about/contact",
     "keywords": "contact office registrar email phone help it support financial aid career cdo aasl academic affairs dean"},
    {"id": "tools", "programs": None, "title": "Official course tools",
     "text": ("Yale Course Search (courses.yale.edu) lists courses across Yale. Course sites live on Canvas "
              "(canvas.yale.edu). SOM's course auction and registration run through the SOM student portal; SOM IT "
              "documents the bidding app."),
     "url": "https://som.yale.edu/elective-core-courses",
     "keywords": "canvas course search portal registration bidding app syllabus course site where find"},
])

# Registrar's 2026-27 course auction email (to the MBA Class of 2028, Oct 14). First-year MBAs only.
from rules import AUCTION  # noqa: E402

KB.append({
    "id": "auction-2026", "programs": ["MBA", "MBA-JOINT"], "title": "2026-27 course auction dates and rules (first-year MBAs)",
    "text": (f"The course auction runs {AUCTION['opens']} {AUCTION['opens_time']} to {AUCTION['closes']} {AUCTION['closes_time']}. "
             + " ".join(AUCTION["rounds"] + AUCTION["global"]) + " " + AUCTION["add_drop"] + " " + AUCTION["exchange"] + " "
             + " ".join(f"{x['title']}: {x['date']}, {x['time']}, {x['where']}." for x in AUCTION["sessions"]) + " "
             + " ".join(AUCTION["policies"]) + " Exact round dates aren't in the email; check the course auction rounds file."),
    "url": "https://portal.som.yale.edu/",
    "keywords": "auction bid bidding rounds round dates opens closes ie gnw snoc exchange add drop yale hub swap form "
                "independent study mgt 690 audit law yale college credit units presentation office hours registrar",
})

# "Get help": who to see for what, behind the guide's four doors (career / CDO, academics, wellbeing, international &
# more). Same notes and links as the guide (frontend/src/lib/helpGuide.ts), checked 2026-10-25.
KB.extend([
    {"id": "help-career-coach", "programs": None, "title": "Career coaching: CDO coach appointments and Open Hours",
     "text": ("Book a 30-minute appointment with a CDO career coach in CMS (12twenty, Yale login): bring your resume and "
              "2-3 roles you're eyeing; you can hold one open slot at a time. For a quick question, drop in to coach Open "
              "Hours, usually Mon-Thu 11:30am-1:00pm, no booking; times and rooms are posted each day in Slack "
              "#cdo-coaches. The CDO also has guides for case, behavioral and technical interviews: "
              "https://cdo.som.yale.edu/channels/prepare-for-your-interview/. Book: https://som-yale.12twenty.com/appointments"),
     "url": "https://cdo.som.yale.edu/faqs/",
     "keywords": "career coach coaching cdo resume cv appointment open hours drop in interview prep case behavioral job internship"},
    {"id": "help-employers", "programs": None, "title": "Meeting recruiters and employers",
     "text": ("See which employers are coming to SOM on the CDO employer channel and sign up for their events in CMS "
              "(https://som-yale.12twenty.com/events). Read SOM's recruiting policies before reaching out: "
              "https://cdo.som.yale.edu/resources/yale-som-recruiting-policies/."),
     "url": "https://cdo.som.yale.edu/channels/employer/",
     "keywords": "recruiter recruiting employer company event networking coffee chat policies info session"},
    {"id": "help-interview-rooms", "programs": None, "title": "Booking a room for an interview",
     "text": ("Reserve an SOM interview room in WebEMS with your Yale login. Book early in recruiting season; rooms go fast."),
     "url": "https://yalesom.emscloudservice.com/web/",
     "keywords": "interview room space quiet book reserve webems ems zoom call virtual"},
    {"id": "help-mentors", "programs": None, "title": "Alumni mentors (Yale Alumni Mentorship on Cross Campus)",
     "text": ("Log in to Cross Campus, open the Mentorship tab and join a program. Matches are made at the start of each semester."),
     "url": "https://alumni.yale.edu/connect/yale-alumni-mentorship-program",
     "keywords": "mentor mentorship alumni alum cross campus advice network"},
    {"id": "help-tsai-city", "programs": None, "title": "Startups and ventures: Tsai CITY",
     "text": ("Tsai CITY offers advising, programs and funding for an idea or venture, from first sketch to launch."),
     "url": "https://city.yale.edu",
     "keywords": "startup start-up venture entrepreneurship founder idea funding tsai city innovation"},
    {"id": "help-aasl", "programs": None, "title": "Academic Affairs & Student Life (AASL)",
     "text": ("AASL handles course planning, workload, leave and anything about your program. Drop-in sessions are "
              "listed on their site. The Registrar keeps registration records (https://som.yale.edu/about/contact)."),
     "url": "https://groups.som.yale.edu/aasl/",
     "keywords": "aasl academic affairs student life workload leave absence course planning program advisor drop-in"},
    {"id": "help-forms", "programs": None, "title": "Registrar forms: body-to-body swap form and independent study (MGT 690)",
     "text": ("Two forms from the registrar's auction email. The body-to-body swap form, for trading a seat with a "
              "classmate, opens Jan 5 on the SOM student portal (Yale login). Independent study is MGT 690: up to 4 "
              "units and no bid points; you submit a Petition for Independent Study, and the rules are in the Bulletin's "
              "course policies: https://catalog.yale.edu/management/rights-responsibilities-students/course-policies-residential-masters-degree-programs/. "
              "AASL can help with either."),
     "url": "https://portal.som.yale.edu/",
     "keywords": "form forms swap body-to-body body to body trade seat independent study mgt 690 petition registrar"},
    {"id": "help-sas", "programs": None, "title": "Accommodations: Student Accessibility Services",
     "text": ("Student Accessibility Services arranges accommodations for classes and exams. Start early in the term so "
              "they're in place before exams."),
     "url": "https://sas.yale.edu",
     "keywords": "accommodations accommodation accessibility disability sas extra time exam"},
    {"id": "help-oiss", "programs": None, "title": "Visas and work authorization: OISS",
     "text": ("Dan doesn't advise on immigration, visas or work authorization (CPT, OPT, F-1, J-1). The Office of "
              "International Students & Scholars (OISS) does, and they're the office that decides."),
     "url": "https://oiss.yale.edu",
     "keywords": "visa immigration work authorization cpt opt f1 f-1 j1 j-1 international student oiss i-20 stem"},
    {"id": "help-wellbeing", "programs": None, "title": "Wellbeing and someone to talk to",
     "text": ("SOM has an embedded Yale Mental Health & Counseling clinician: short-term counseling, free for students, "
              "and you can book it yourself online. Yale Mental Health & Counseling (https://yalehealth.yale.edu/department/mental-health-counseling) "
              "serves all students; the Good Life Center (https://goodlifecenter.yale.edu) and the Chaplain's Office "
              "(https://chaplain.yale.edu) also help. Need someone right now? Yale Mental Health & Counseling's on-call "
              "clinician answers at any hour: 203-432-0290. In the US you can also call or text 988."),
     "url": "https://groups.som.yale.edu/aasl/yale-mental-health-and-wellness/",
     "keywords": "stress stressed anxiety anxious counseling counselor therapy therapist mental health wellbeing wellness talk "
                 "overwhelmed burnout sad lonely chaplain"},
])


def search(query: str, program: str | None = None, limit: int = 4) -> list[dict]:
    """Keyword match over titles, text and keywords, limited to the student's program."""
    want = _words(query)
    if not want:
        return []
    scored = []
    for e in KB:
        if e["programs"] and program and program not in e["programs"]:
            continue
        title, kw, body = _words(e["title"]), _words(e.get("keywords", "")), _words(e["text"])
        score = 3 * len(want & title) + 2 * len(want & kw) + len(want & body)
        if score >= 2:
            scored.append((score, e))
    scored.sort(key=lambda x: -x[0])
    return [e for _, e in scored[:limit]]
