"""Token prices and cost math.

USD per 1M tokens, OpenAI standard tier, from the course tokenomics notes
(https://developers.openai.com/api/docs/pricing, checked 2026-10-06).
A cached input token is billed at the cheaper `cached_input` rate.

Web search calls carry a per-call tool fee on top of tokens. It is set from
WEB_SEARCH_USD_PER_CALL so it can be corrected without a code change.
"""

from __future__ import annotations

import os

MILLION = 1_000_000

PRICES: dict[str, dict[str, float]] = {
    "gpt-6-luna": {"input": 0.10, "cached_input": 0.01, "output": 0.50},
    "gpt-6-astra": {"input": 10.00, "cached_input": 1.00, "output": 50.00},
}
DEFAULT_PRICE = PRICES["gpt-6-luna"]
WEB_SEARCH_USD_PER_CALL = float(os.getenv("WEB_SEARCH_USD_PER_CALL", "0.01"))


def prices_for(model: str) -> dict[str, float]:
    return PRICES.get(model, DEFAULT_PRICE)


def cost_usd(
    model: str,
    input_tokens: int,
    output_tokens: int,
    cached_tokens: int = 0,
    web_searches: int = 0,
) -> float:
    p = prices_for(model)
    cached = max(0, min(cached_tokens, input_tokens))
    fresh = max(0, input_tokens - cached)
    tokens = (fresh * p["input"] + cached * p["cached_input"] + max(0, output_tokens) * p["output"]) / MILLION
    return round(tokens + web_searches * WEB_SEARCH_USD_PER_CALL, 6)
