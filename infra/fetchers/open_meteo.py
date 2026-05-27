"""Open-Meteo daily-weather forecast — free, keyless, no auth.

Public endpoint:  https://api.open-meteo.com/v1/forecast
Docs:             https://open-meteo.com/en/docs
Auth:             none (truly keyless; non-commercial tier is unlimited)
Rate limit:       generous; framework default 1 RPS is well within bounds.
TTL:              daily — forecast updates a few times per day; daily cache
                  refresh is sufficient for risk-signal classification.

Pulls 21 days of daily aggregates per (lat, lng): 7 past + 14 forecast,
covering temperature_2m_max, temperature_2m_min, precipitation_sum, and
wind_gusts_10m_max. The seed script classifies extreme values into
disruption_signals rows; this fetcher only retrieves and shapes the raw
arrays.

Returns a dict shaped:
    {
      "latitude":  43.7531,
      "longitude": -79.5532,
      "timezone":  "America/Toronto",
      "daily": [
        {"date": "2026-05-20", "tmax": 22.4, "tmin": 11.1,
         "precip_mm": 0.4, "wind_gust_kmh": 31.0},
        ...
      ]
    }

Cache key is `f"{lat:.4f},{lng:.4f}"`; one snapshot per coordinate under
`infra/data/cache/open_meteo/`.
"""

from __future__ import annotations

from typing import Any
from urllib.parse import urlencode

from . import http
from .base import Fetcher

OPEN_METEO_BASE = "https://api.open-meteo.com/v1/forecast"


class OpenMeteoFetcher(Fetcher):
    source = "open_meteo"
    # Open-Meteo's robots.txt blocks generic crawlers on /v1/, but the v1
    # forecast endpoint is the explicitly documented public consumption
    # surface (https://open-meteo.com/en/docs). Mirror the Nominatim/Yahoo
    # rationale: comply with the published usage policy (polite UA + 1 RPS
    # rate limit enforced in fetchers.http) and bypass the robots check.
    respects_robots = False

    def __init__(self, *, forecast_days: int = 14, past_days: int = 7):
        self.forecast_days = forecast_days
        self.past_days = past_days

    def fetch_live(self, key: str) -> tuple[dict[str, Any], str]:
        # key is "lat,lng" -- split and re-encode.
        try:
            lat_str, lng_str = key.split(",", 1)
            lat = float(lat_str)
            lng = float(lng_str)
        except (ValueError, TypeError) as exc:
            raise ValueError(f"OpenMeteo key must be 'lat,lng', got {key!r}") from exc

        params = {
            "latitude":      f"{lat}",
            "longitude":     f"{lng}",
            "daily":         "temperature_2m_max,temperature_2m_min,"
                             "precipitation_sum,wind_gusts_10m_max",
            "forecast_days": self.forecast_days,
            "past_days":     self.past_days,
            "timezone":      "auto",
        }
        url = f"{OPEN_METEO_BASE}?{urlencode(params)}"
        resp = http.get(url, check_robots=self.respects_robots)
        resp.raise_for_status()

        payload = resp.json()
        daily = payload.get("daily") or {}
        times    = daily.get("time") or []
        tmax_arr = daily.get("temperature_2m_max") or []
        tmin_arr = daily.get("temperature_2m_min") or []
        prec_arr = daily.get("precipitation_sum") or []
        wind_arr = daily.get("wind_gusts_10m_max") or []

        if not times:
            raise ValueError(f"Open-Meteo returned no daily times for {key!r}")

        rows: list[dict[str, Any]] = []
        for i, d in enumerate(times):
            # Pull by index (parallel arrays may have nulls at different positions).
            rows.append(
                {
                    "date":           d,
                    "tmax":           tmax_arr[i] if i < len(tmax_arr) else None,
                    "tmin":           tmin_arr[i] if i < len(tmin_arr) else None,
                    "precip_mm":      prec_arr[i] if i < len(prec_arr) else None,
                    "wind_gust_kmh":  wind_arr[i] if i < len(wind_arr) else None,
                }
            )

        return (
            {
                "latitude":  payload.get("latitude", lat),
                "longitude": payload.get("longitude", lng),
                "timezone":  payload.get("timezone", "UTC"),
                "daily":     rows,
            },
            url,
        )


def fetch_daily(lat: float, lng: float, *, forecast_days: int = 14, past_days: int = 7) -> dict[str, Any]:
    """Convenience wrapper — live-then-cache-fallback daily weather for (lat, lng)."""
    key = f"{lat:.4f},{lng:.4f}"
    return OpenMeteoFetcher(forecast_days=forecast_days, past_days=past_days).get(key).data
