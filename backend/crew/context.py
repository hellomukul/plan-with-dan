"""What an agent knows about the student it is helping, loaded fresh per request."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date

from sqlmodel import Session, select

from catalog import Catalog, Section, get_catalog, project
from db import BidReport, GlobalChoice, PlanItem, Profile
from planning import PlanRow
from crew.runtime import Run

DEFAULT_TERM = "202701"  # the term students are planning right now


@dataclass
class StudentContext:
    run: Run
    catalog: Catalog
    profile: dict
    plan: list[PlanRow]
    global_choices: list[dict]
    today: date = field(default_factory=date.today)
    outside: list[Section] = field(default_factory=list)  # courses at other Yale schools the student added
    proposals: list[dict] = field(default_factory=list)
    tool_uses: dict[str, int] = field(default_factory=dict)

    @property
    def db(self) -> Session:
        return self.run.db

    def sections(self, term: str | None = None) -> list[Section]:
        return [r.section for r in self.plan if not term or r.section.term == term]

    def bump(self, tool: str, cap: int = 6) -> bool:
        """Count tool uses; False once a tool has been called too often in one run (loop guard)."""
        self.tool_uses[tool] = self.tool_uses.get(tool, 0) + 1
        return self.tool_uses[tool] <= cap

    def bid_reports(self, number: str) -> list[dict]:
        rows = self.db.exec(select(BidReport).where(BidReport.course_number == number, BidReport.source != "sample")).all()
        return [r.model_dump() for r in rows]


def load_context(run: Run) -> StudentContext:
    catalog = get_catalog()
    profile: dict = {}
    plan: list[PlanRow] = []
    choices: list[dict] = []
    if run.user_id:
        p = run.db.get(Profile, run.user_id)
        profile = p.as_dict() if p else {}
        for item in run.db.exec(select(PlanItem).where(PlanItem.user_id == run.user_id)).all():
            sec = catalog.by_id.get(item.course_id)
            if sec:
                # a 2027-28 plan item is stored as this year's section: show it in its own term, times TBA
                plan.append(PlanRow(project(sec, item.target_term) if item.target_term else sec, item.status))
        choices = [c.model_dump(include={"option_key", "target_term", "status", "note"})
                   for c in run.db.exec(select(GlobalChoice).where(GlobalChoice.user_id == run.user_id)).all()]
    outside = []
    if run.user_id:
        from db import OutsideCourse
        from outside import outside_section
        outside = [outside_section(o) for o in run.db.exec(select(OutsideCourse).where(OutsideCourse.user_id == run.user_id)).all()]
    return StudentContext(run=run, catalog=catalog, profile=profile, plan=plan, global_choices=choices, outside=outside)
