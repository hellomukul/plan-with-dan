#!/usr/bin/env python3
"""Did the cost cut hurt quality? Recommender with a 28-course shortlist vs the full eligible catalog.

For each setting, runs the real pipeline N times for one demo student and records:
tokens, cost, picks, how many picks survived validation, how many evidence quotes
were verified, and how many picks fit the timetable. Writes docs/experiment_shortlist.json.

    .venv/bin/python scripts/experiment_shortlist.py demo.student@yale.edu 2
"""

from __future__ import annotations

import asyncio
import json
import statistics
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from sqlmodel import Session, select  # noqa: E402

import crew.recommender as rec  # noqa: E402
from db import User, engine, init_db  # noqa: E402


async def one(db, user_id: int, shortlist: int) -> dict:
    rec.SHORTLIST = shortlist
    out = await rec.recommend(db, user_id, "202701")
    t = out["usage"]["total"]
    picks = out.get("picks", [])
    return {
        "shortlist": out.get("shortlist_size"),
        "input_tokens": t["input_tokens"],
        "cached_tokens": t["cached_tokens"],
        "output_tokens": t["output_tokens"],
        "cost_usd": t["cost_usd"],
        "picks": [p["number"] for p in picks],
        "dropped": len(out.get("dropped", [])),
        "quotes_verified": sum(1 for p in picks if p.get("evidence")),
        "fits": sum(1 for p in picks if p.get("fits")),
        "seconds": round(sum(a["seconds"] for a in out["usage"]["agents"]), 1),
    }


async def main(email: str, n: int) -> None:
    init_db()
    with Session(engine) as db:
        user = db.exec(select(User).where(User.email == email)).first()
        if not user:
            raise SystemExit(f"No user {email}; sign up in the app first.")
        results = {"shortlist_28": [], "full_catalog": []}
        for _ in range(n):
            results["shortlist_28"].append(await one(db, user.id, 28))
            results["full_catalog"].append(await one(db, user.id, 10_000))

    def avg(rows, k):
        return round(statistics.mean(r[k] for r in rows), 6)

    summary = {}
    for name, rows in results.items():
        summary[name] = {k: avg(rows, k) for k in ("shortlist", "input_tokens", "output_tokens", "cost_usd", "dropped",
                                                    "quotes_verified", "fits", "seconds")}
        summary[name]["avg_picks"] = statistics.mean(len(r["picks"]) for r in rows)
    a = {p for r in results["shortlist_28"] for p in r["picks"]}
    b = {p for r in results["full_catalog"] for p in r["picks"]}
    summary["pick_overlap"] = {"shortlist_only": sorted(a - b), "full_only": sorted(b - a), "both": sorted(a & b)}
    out = {"runs": results, "summary": summary}
    path = ROOT / "docs" / "experiment_shortlist.json"
    path.write_text(json.dumps(out, indent=2))
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 2))
