"""USD prices per million tokens, used to attribute cost to every API call."""
from __future__ import annotations

# model id prefix -> (input, output, cache_write_5m, cache_read)
PRICES: dict[str, tuple[float, float, float, float]] = {
    "claude-fable-5-2": (8.0, 40.0, 10.0, 0.20),
    "claude-fable-5-1": (10.0, 50.0, 12.5, 1.0),
    "claude-opus-5-5": (4.0, 20.0, 5.0, 0.20),
    "claude-opus-5": (5.0, 25.0, 6.25, 0.50),
    "claude-opus-4-8": (5.0, 25.0, 6.25, 0.50),
    "claude-opus-4-7": (5.0, 25.0, 6.25, 0.50),
    "claude-sonnet-5-5": (2.0, 10.0, 2.5, 0.10),
    "claude-sonnet-5": (2.0, 10.0, 2.5, 0.20),
    "claude-haiku-5-5": (0.10, 0.50, 0.125, 0.01),
}
WEB_SEARCH_PER_REQUEST = 10.0 / 1000  # $10 per 1,000 searches


def price_for(model: str) -> tuple[float, float, float, float]:
    # Longest matching prefix wins so "claude-opus-5-5" doesn't match "claude-opus-5".
    best = None
    for key in sorted(PRICES, key=len, reverse=True):
        if model.startswith(key):
            best = PRICES[key]
            break
    return best or PRICES["claude-opus-5-5"]


def cost_usd(model: str, input_tokens: int, output_tokens: int, cache_write: int = 0,
             cache_read: int = 0, web_searches: int = 0) -> float:
    pin, pout, pcw, pcr = price_for(model)
    return (
        input_tokens * pin + output_tokens * pout + cache_write * pcw + cache_read * pcr
    ) / 1_000_000 + web_searches * WEB_SEARCH_PER_REQUEST
