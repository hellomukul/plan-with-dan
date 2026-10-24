"""The agent roster. Instructions = shared static primer + one role section.

Keeping the primer first and identical across agents gives every call the same
long prefix, which the provider can serve from its prompt cache (billed at the
cached-input rate). Anything that changes per request (date, student, history)
goes in the user prompt, after the cacheable part.
"""

from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel, Field
from pydantic_ai import Agent
from pydantic_ai.capabilities import WebSearch

from config import PROMPTS_DIR
from crew.context import StudentContext
from crew.tools import BID_TOOLS, CAREER_TOOLS, CATALOG_TOOLS, NEWS_TOOLS, PLANNER_TOOLS


def _sections(filename: str) -> dict[str, str]:
    text = (PROMPTS_DIR / filename).read_text(encoding="utf-8")
    parts = re.split(r"^## (\w+)\s*$", text, flags=re.M)
    return {parts[i]: parts[i + 1].strip() for i in range(1, len(parts) - 1, 2)}


PRIMER = (PROMPTS_DIR / "primer.md").read_text(encoding="utf-8").strip()
ROLES = {**_sections("roles.md"), **_sections("recommender.md")}


def instructions(role: str) -> str:
    return f"{PRIMER}\n\n# Your role\n{ROLES[role]}"


SpecialistName = Literal["course_scout", "planner", "bid_coach", "career_coach", "news_desk", "none"]


class Route(BaseModel):
    specialist: SpecialistName
    task: str = Field(description="The request rewritten as a clear, self-contained task for the specialist.")
    direct_reply: str = Field(default="", description="Only when specialist is 'none'.")


class Pick(BaseModel):
    key: str
    why: str
    goal: Literal["short-term", "long-term", "interest"]
    evidence: str = ""
    priority: Literal[1, 2, 3] = 2


class Curation(BaseModel):
    picks: list[Pick]
    summary: str


class Critique(BaseModel):
    verdict: str
    watch_outs: list[str]


class Brief(BaseModel):
    text: str = Field(description="2-3 sentences, plain text, facts from the cards only.")


SPECIALIST_LABELS = {
    "course_scout": "Course Scout",
    "planner": "Planner",
    "bid_coach": "Bid Coach",
    "career_coach": "Career Coach",
    "news_desk": "AI News Desk",
}

dispatcher = Agent(output_type=Route, instructions=instructions("dispatcher"), name="dispatcher")

specialists: dict[str, Agent] = {
    "course_scout": Agent(deps_type=StudentContext, instructions=instructions("course_scout"),
                          tools=CATALOG_TOOLS, name="course_scout"),
    "planner": Agent(deps_type=StudentContext, instructions=instructions("planner"),
                     tools=PLANNER_TOOLS, name="planner"),
    "bid_coach": Agent(deps_type=StudentContext, instructions=instructions("bid_coach"),
                       tools=BID_TOOLS, name="bid_coach"),
    "career_coach": Agent(deps_type=StudentContext, instructions=instructions("career_coach"),
                          tools=CAREER_TOOLS, name="career_coach"),
    "news_desk": Agent(deps_type=StudentContext, instructions=instructions("news_desk"),
                       tools=NEWS_TOOLS, capabilities=[WebSearch(search_context_size="low")], name="news_desk"),
}

curator = Agent(output_type=Curation, instructions=instructions("curator"), name="curator")
critic = Agent(output_type=Critique, instructions=instructions("critic"), name="critic")
chief = Agent(output_type=Brief, instructions=instructions("chief"), name="chief_of_staff")
