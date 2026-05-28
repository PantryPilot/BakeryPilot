"""Polite HTTP client for BakeryPilot fetchers.

Provides a single `get()` helper used by every fetcher. Cross-cutting
concerns live here so per-source modules stay focused on parsing:

  - Polite User-Agent (`BakeryPilot/0.1 (+contact@bakerypilot.example)`)
  - Per-host rate limit of 1 request per second (Nominatim's published
    limit; safe default for everything else)
  - 10 s connect/read timeout
  - Retry-with-backoff on transient errors (network errors + 5xx)
  - robots.txt compliance check before the first request to a host,
    cached per host so we don't pound /robots.txt on every call

The framework deliberately does NOT cache the HTTP response itself --
that's the job of `fetchers.cache`, which stores parsed payloads, not
raw HTML/JSON, so cached snapshots stay readable in a text editor.
"""

from __future__ import annotations

import time
from collections import defaultdict
from urllib.parse import urlparse
from urllib.robotparser import RobotFileParser

import httpx

USER_AGENT = "BakeryPilot/0.1 (+contact@bakerypilot.example)"
DEFAULT_TIMEOUT = httpx.Timeout(10.0)
RATE_LIMIT_PER_HOST_SECONDS = 1.0  # Nominatim policy max; safe everywhere else.

_last_request_per_host: dict[str, float] = defaultdict(float)
_robots_cache: dict[str, RobotFileParser] = {}


class RobotsForbidden(httpx.HTTPError):
    """robots.txt disallows our User-Agent for this URL."""


def _get_robots(host: str) -> RobotFileParser:
    """Return a cached RobotFileParser for the given host; fail-open on errors.

    We fetch robots.txt with httpx using our polite User-Agent rather than
    relying on `RobotFileParser.read()`, because many sites (e.g.
    fgfbrands.com) 403 the default `Python-urllib/x.y` UA which causes the
    parser to set `disallow_all=True` -- masking a robots.txt that is
    actually fully permissive. Using our real UA gives us the same view
    of the rules that applies to our subsequent requests.
    """
    if host in _robots_cache:
        return _robots_cache[host]
    rp = RobotFileParser()
    rp.set_url(f"https://{host}/robots.txt")
    try:
        with httpx.Client(timeout=DEFAULT_TIMEOUT, follow_redirects=True) as client:
            resp = client.get(
                f"https://{host}/robots.txt",
                headers={"User-Agent": USER_AGENT},
            )
        if resp.status_code == 200:
            rp.parse(resp.text.splitlines())
        elif 400 <= resp.status_code < 500:
            # Per RFC 9309 section 2.3.1.3: any "Unavailable" status (4xx) on
            # robots.txt means "fully allowed". Notably this covers 401/403,
            # which Python's stdlib RobotFileParser misinterprets as
            # disallow_all -- a problem on Cloudflare-fronted sites that
            # 403 unfamiliar User-Agents on the robots.txt URL itself even
            # when the actual policy file is permissive.
            rp.allow_all = True
        else:
            # 5xx -- per RFC 9309 treat as "fully disallowed". Conservative.
            rp.disallow_all = True
    except httpx.HTTPError:
        # Network blip on robots.txt fetch: fail open. We're a low-volume
        # polite client (1 RPS, identifiable UA) so this is acceptable for
        # a seed script and prevents transient blips from blocking work.
        rp.parse([])
    _robots_cache[host] = rp
    return rp


def can_fetch(url: str) -> bool:
    """Return True if robots.txt permits our User-Agent to fetch `url`."""
    parsed = urlparse(url)
    rp = _get_robots(parsed.netloc)
    return rp.can_fetch(USER_AGENT, url)


def _wait_for_rate_limit(host: str) -> None:
    """Block until at least RATE_LIMIT_PER_HOST_SECONDS has elapsed since
    the last request to this host."""
    last = _last_request_per_host[host]
    elapsed = time.monotonic() - last
    if elapsed < RATE_LIMIT_PER_HOST_SECONDS:
        time.sleep(RATE_LIMIT_PER_HOST_SECONDS - elapsed)
    _last_request_per_host[host] = time.monotonic()


def get(url: str, *, max_retries: int = 3, check_robots: bool = True, **kwargs) -> httpx.Response:
    """GET with polite headers, per-host rate limit, and retry on transient
    failures.

    By default honors robots.txt (raises `RobotsForbidden` if disallowed).
    Pass `check_robots=False` for documented public APIs whose usage is
    governed by an explicit API-terms page rather than robots.txt -- e.g.
    OpenStreetMap Nominatim, which disallows `/search` for HTML crawlers
    in robots.txt while inviting API consumers to use `/search` at 1 RPS
    per their published Nominatim Usage Policy.

    Retries are attempted on:
      - network errors (connect / timeout)
      - 5xx HTTP responses

    4xx responses are returned to the caller without retry (they're
    typically permanent).
    """
    if check_robots and not can_fetch(url):
        raise RobotsForbidden(f"robots.txt forbids {USER_AGENT} from fetching {url}")

    parsed = urlparse(url)
    _wait_for_rate_limit(parsed.netloc)

    headers = {"User-Agent": USER_AGENT, **kwargs.pop("headers", {})}
    last_exc: Exception | None = None

    for attempt in range(max_retries + 1):
        try:
            with httpx.Client(timeout=DEFAULT_TIMEOUT, follow_redirects=True) as client:
                resp = client.get(url, headers=headers, **kwargs)
            if resp.status_code < 500:
                return resp  # 2xx and 4xx both come back without retry
            last_exc = httpx.HTTPStatusError(
                f"server error {resp.status_code}",
                request=resp.request,
                response=resp,
            )
        except (httpx.ConnectError, httpx.TimeoutException, httpx.ReadError) as e:
            last_exc = e

        if attempt < max_retries:
            time.sleep(2**attempt)  # 1s, 2s, 4s

    assert last_exc is not None  # unreachable if retries exhausted, kept for type-checker
    raise last_exc
