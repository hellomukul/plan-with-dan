"""Import courses already taken from a screenshot of the student's course history (student feedback: "take a screen
shot from Yale Hub and paste so the tool can auto pick my courses so far").

  1. Read   (agent)  the screenshot -> course numbers, titles and any clearly shown grades (structured output)
  2. Check  (code)   keep only well-formed course numbers, dedupe, mark which are in this year's SOM catalog
  3. Confirm (student) nothing is saved until the student ticks the list and confirms; the image is never stored

The model sees the image only; no student data goes with it.
"""

from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel
from pydantic_ai import Agent, BinaryContent

from catalog import get_catalog
from config import ai_available
from crew.agents import instructions
from crew.runtime import Run
from safety import BudgetExceeded, SpendGuard

_NUMBER = re.compile(r"^([A-Z&]{2,5}) ?(\d{3,4}[A-Z]?)$")


class FoundCourse(BaseModel):
    number: str
    title: str = ""
    grade: Literal["HH", "H", "PR", "P", "F", ""] = ""


class Found(BaseModel):
    courses: list[FoundCourse]


reader = Agent(output_type=Found, instructions=instructions("transcript_reader"), name="transcript_reader")


async def read_courses(db, user_id: int, data: bytes, media_type: str, already: set[str]) -> dict:
    run = Run(db=db, user_id=user_id, feature="import", guard=SpendGuard.for_user(db, user_id))
    out: dict = {"run_id": run.run_id, "courses": [], "note": ""}
    if not ai_available():
        out["note"] = "Reading screenshots needs the AI, which is offline right now. Type the course numbers instead."
        return {**out, "usage": run.usage_summary()}
    try:
        res = await run.call(reader, ["List the courses in this screenshot of my course history.",
                                      BinaryContent(data=data, media_type=media_type)], name="Transcript reader", requests=2)
        found = res.output.courses
    except BudgetExceeded as exc:
        out["note"] = str(exc)
        return {**out, "usage": run.usage_summary()}
    except Exception as exc:  # unreadable image or provider error: say so, never a 500
        run.audit("agent_error", agent="Transcript reader", detail=f"{type(exc).__name__}: {str(exc)[:200]}")
        out["note"] = "I couldn't read that image. Try a sharper screenshot of just the course list."
        return {**out, "usage": run.usage_summary()}

    cat = get_catalog()
    seen: set[str] = set()
    for c in found:
        m = _NUMBER.match(" ".join(c.number.upper().split()))
        if not m:
            continue
        number = f"{m.group(1)} {m.group(2)}"
        if number in seen:
            continue
        seen.add(number)
        offs = cat.offering_for_number(number)
        out["courses"].append({
            "number": number, "title": (offs[0].lead.title if offs else c.title.strip())[:120],
            "grade": c.grade, "known": bool(offs), "already": number in already,
        })
    run.emit("read", agent="Transcript reader", found=len(found), kept=len(out["courses"]))
    if not out["courses"]:
        out["note"] = "I couldn't find any course numbers in that image. Try a screenshot of just your course list."
    return {**out, "usage": run.usage_summary()}
