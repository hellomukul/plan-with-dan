"""Courses outside SOM that a student added by hand, as catalog Sections, so the timetable, clash checks and Dan's
tools treat them like any other class (their units stay apart from SOM's totals)."""
from __future__ import annotations

import json

from catalog import Meeting, Section
from db import OutsideCourse


def outside_section(o: OutsideCourse) -> Section:
    days = tuple(json.loads(o.days or "[]"))
    meeting = Meeting(days, o.start_min, o.end_min) if days and o.start_min is not None and o.end_min is not None else None
    season = "fall" if o.term.endswith("03") else "spring"
    return Section(id=f"x{o.id}", number=o.number or o.school or "Outside", title=o.title, term=o.term, session=season, starts=None,
                   ends=None, meeting=meeting, room="", units=o.units, section="", faculty=[], emails=[], category="Outside SOM",
                   course_type="", enrollment="outside", limit=None, attributes=[], prerequisite="",
                   description=f"{o.school or 'Outside SOM'} course you added.", syllabus="", bio="", new_course=False, visible=True)
