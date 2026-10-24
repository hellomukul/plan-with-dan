"""SAMPLE bid reports so the Bids page isn't empty on day one.

SOM does not publish clearing prices (see docs/research.md). These rows are
made up for illustration, stored with source="sample", and labelled SAMPLE
everywhere they appear. Real numbers come from students reporting their own
outcomes in the app. Delete samples with: DELETE FROM bidreport WHERE source='sample'.
"""

from __future__ import annotations

import random

from sqlmodel import Session, select

from catalog import get_catalog
from db import BidReport, engine

SAMPLE_TERM = "202603"  # pretend history from the fall auction
COURSES = 8
REPORTS_PER_COURSE = 6


def seed_sample_bids() -> int:
    with Session(engine) as db:
        if db.exec(select(BidReport).where(BidReport.source == "sample")).first():
            return 0
        cat = get_catalog()
        bid_courses = sorted(
            {o.lead.number: o.lead for o in cat.eligible("202701") if o.lead.enrollment.lower() == "bid" and o.lead.limit}.values(),
            key=lambda s: (s.limit or 999, s.number),
        )[:COURSES]
        rng = random.Random(409)  # deterministic, so every install shows the same samples
        added = 0
        for lead in bid_courses:
            demand = 1.6 if (lead.limit or 75) <= 40 else 0.8
            clearing = int(rng.uniform(20, 70) * demand)
            for _ in range(REPORTS_PER_COURSE):
                bid = max(1, int(rng.gauss(clearing, clearing * 0.45)))
                db.add(BidReport(
                    user_id=None, course_number=lead.number, course_title=lead.title, term_code=SAMPLE_TERM,
                    points_bid=bid, got_seat=bid >= clearing, clearing_points=clearing, source="sample",
                ))
                added += 1
        db.commit()
        return added
