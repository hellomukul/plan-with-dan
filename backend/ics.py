"""Calendar output: an ICS feed students subscribe to from Google, Outlook or Apple.

Each class becomes one weekly recurring event:
- DTSTART is the first real meeting day on/after the session start (not the
  session start itself, which may fall on a day the class doesn't meet).
- RRULE ends (UNTIL, in UTC as RFC 5545 requires) at the end of the session's
  last day in New York time.
- EXDATE removes no-class days (recess, MLK Day, IE/GNW weeks).
- UIDs are stable per student and section, so refreshed feeds update events
  instead of duplicating them.
Academic deadlines are added as all-day events.
"""

from __future__ import annotations

import hashlib
from datetime import date, datetime, time, timedelta, timezone
from urllib.parse import urlencode
from zoneinfo import ZoneInfo

from icalendar import Calendar, Event, vRecur

from catalog import DAY_ICS, DAY_ORDER, Section
from rules import CALENDAR, CALENDAR_ENDS, MAKEUP_DAYS, NO_CLASS_DATES, calendar_end

ET = ZoneInfo("America/New_York")
PY_WEEKDAY = {"M": 0, "T": 1, "W": 2, "Th": 3, "F": 4}
NO_CLASS = {date.fromisoformat(d) for d in NO_CLASS_DATES}
MAKEUP = {date.fromisoformat(d): code for d, code in MAKEUP_DAYS.items()}  # e.g. Fri Jan 29 runs Monday


def first_meeting(sec: Section) -> date | None:
    if not sec.meeting or not sec.starts:
        return None
    wanted = {PY_WEEKDAY[d] for d in sec.meeting.days}
    day = sec.starts
    for _ in range(7):
        if day.weekday() in wanted:
            return day
        day += timedelta(days=1)
    return None


def _at(day: date, minutes: int) -> datetime:
    """Local time on `day`; 24:00 (1440) rolls over to midnight the next day."""
    day, minutes = day + timedelta(days=minutes // 1440), minutes % 1440
    return datetime.combine(day, time(minutes // 60, minutes % 60), ET)


def meeting_dates(sec: Section) -> list[date]:
    """Every date this section meets, after skipping no-class days."""
    start = first_meeting(sec)
    if not start or not sec.ends or not sec.meeting:
        return []
    wanted = {PY_WEEKDAY[d] for d in sec.meeting.days}
    out, day = [], start
    while day <= sec.ends:
        if day in MAKEUP:  # this date follows another weekday's schedule
            if MAKEUP[day] in sec.meeting.days:
                out.append(day)
        elif day.weekday() in wanted and day not in NO_CLASS:
            out.append(day)
        day += timedelta(days=1)
    return out


def class_event(sec: Section, owner: str) -> Event | None:
    start_day = first_meeting(sec)
    if not start_day or not sec.ends or not sec.meeting:
        return None
    m = sec.meeting
    ev = Event()
    ev.add("uid", f"{owner}-{sec.id}@planwithdan")
    ev.add("dtstamp", datetime.now(timezone.utc))
    ev.add("summary", f"{sec.number} {sec.title}")
    ev.add("location", sec.room or "Evans Hall")
    who = ", ".join(sec.faculty) or "TBA"
    ev.add("description", f"Section {sec.section} · {sec.units:g} units · {who}\nAdded by Plan with Dan")
    ev.add("dtstart", _at(start_day, m.start))
    ev.add("dtend", _at(start_day, m.end))
    until = datetime.combine(sec.ends, time(23, 59, 59), ET).astimezone(timezone.utc)
    ev.add("rrule", vRecur(freq="WEEKLY", byday=[DAY_ICS[d] for d in m.days], until=until))
    wanted = {PY_WEEKDAY[d] for d in m.days}
    in_range = lambda d: start_day <= d <= sec.ends  # noqa: E731
    skips = {d for d in NO_CLASS if in_range(d) and d.weekday() in wanted}
    skips |= {d for d, code in MAKEUP.items() if in_range(d) and d.weekday() in wanted and code not in m.days}
    extra = sorted(d for d, code in MAKEUP.items() if in_range(d) and code in m.days and d.weekday() not in wanted)
    if skips:
        ev.add("exdate", [_at(d, m.start) for d in sorted(skips)])
    if extra:
        ev.add("rdate", [_at(d, m.start) for d in extra])
    return ev


def deadline_event(day: str, label: str, kind: str) -> Event:
    ev = Event()
    digest = hashlib.sha1(f"{day}|{label}".encode()).hexdigest()[:12]
    ev.add("uid", f"som-{digest}@planwithdan")
    ev.add("dtstamp", datetime.now(timezone.utc))
    ev.add("summary", f"SOM · {label}")
    d = date.fromisoformat(day)
    last = date.fromisoformat(calendar_end(day))
    ev.add("dtstart", d)
    ev.add("dtend", last + timedelta(days=1))  # all-day DTEND is exclusive
    ev.add("categories", [kind])
    ev.add("transp", "TRANSPARENT")
    return ev


def personal_event(row, owner: str) -> Event:
    """A student's own booked appointment (coach, interview room...), as a one-off event."""
    ev = Event()
    ev.add("uid", f"{owner}-personal-{row.id}@planwithdan")
    ev.add("dtstamp", datetime.now(timezone.utc))
    ev.add("summary", row.title)
    day = date.fromisoformat(row.date)
    ev.add("dtstart", _at(day, row.start_min))
    ev.add("dtend", _at(day, row.end_min))
    if row.location:
        ev.add("location", row.location)
    if row.note:
        ev.add("description", row.note)
    return ev


def build_calendar(sections: list[Section], owner: str, include_deadlines: bool = True, personal: list | None = None,
                   dates: list[tuple[str, str, str]] | None = None) -> bytes:
    """dates: the academic dates to include (defaults to the shared calendar; rules.calendar_for adds the auction)."""
    cal = Calendar()
    cal.add("prodid", "-//Plan with Dan//Yale SOM planner//EN")
    cal.add("version", "2.0")
    cal.add("calscale", "GREGORIAN")
    cal.add("x-wr-calname", "Plan with Dan · My SOM classes")
    cal.add("x-wr-timezone", "America/New_York")
    cal.add("refresh-interval;value=duration", "PT6H")
    cal.add("x-published-ttl", "PT6H")
    for sec in sections:
        ev = class_event(sec, owner)
        if ev is not None:
            cal.add_component(ev)
    if include_deadlines:
        for day, label, kind in (dates if dates is not None else CALENDAR):
            cal.add_component(deadline_event(day, label, kind))
    for row in personal or []:
        cal.add_component(personal_event(row, owner))
    cal.add_missing_timezones()
    return cal.to_ical()


def google_template_link(sec: Section) -> str | None:
    """One-click 'add to Google Calendar' for a single recurring class."""
    start_day = first_meeting(sec)
    if not start_day or not sec.meeting or not sec.ends:
        return None
    fmt = "%Y%m%dT%H%M%S"
    s = _at(start_day, sec.meeting.start).strftime(fmt)
    e = _at(start_day, sec.meeting.end).strftime(fmt)
    until = datetime.combine(sec.ends, time(23, 59, 59), ET).astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    days = ",".join(DAY_ICS[d] for d in DAY_ORDER if d in sec.meeting.days)
    params = {
        "action": "TEMPLATE",
        "text": f"{sec.number} {sec.title}",
        "dates": f"{s}/{e}",
        "ctz": "America/New_York",
        "location": sec.room or "Evans Hall",
        "details": f"Section {sec.section} · added from Plan with Dan",
        "recur": f"RRULE:FREQ=WEEKLY;BYDAY={days};UNTIL={until}",
    }
    return "https://calendar.google.com/calendar/render?" + urlencode(params)
