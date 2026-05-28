"""FGF Brands contact-page scraper.

Source: https://www.fgfbrands.com/contact/
TTL:    7 days (a corporate contact page changes rarely; weekly refresh
        is more than enough)

The contact page renders the head-office address as a single line:

    1295 Ormont Drive Toronto, Ontario, Canada M9L 2W6

This module finds that line by locating the first text node containing
a Canadian postal code and parses it into:

    {
      "street":      "1295 Ormont Drive",
      "city":        "Toronto",
      "province":    "Ontario",
      "postal_code": "M9L 2W6",
      "phone":       "(905) 761-3333",
    }

If the page redesigns and we can no longer find a postal-code line we
raise ValueError -- the framework will then fall back to the cached
snapshot and warn loudly so a maintainer notices.
"""

from __future__ import annotations

import re
from typing import Any

from bs4 import BeautifulSoup

from . import http
from .base import Fetcher

FGF_CONTACT_URL = "https://www.fgfbrands.com/contact/"

# Canadian postal pattern: A1A 1A1 with optional space.
POSTAL_RE = re.compile(r"\b([A-Z]\d[A-Z])\s?(\d[A-Z]\d)\b")

# Common Canadian/US street-type suffixes used to split "<street> <city>".
STREET_SUFFIX_RE = re.compile(
    r"\b(Drive|Street|Road|Avenue|Boulevard|Court|Way|Lane|Place|Crescent|Trail|Highway|Parkway)\b",
    re.IGNORECASE,
)

# North American phone -- captures (905) 761-3333, 905-761-3333, 905.761.3333.
PHONE_RE = re.compile(r"\(?\b\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4}\b")


class FgfContactFetcher(Fetcher):
    source = "fgf_contact"

    def fetch_live(self, key: str) -> tuple[dict[str, Any], str]:
        # `key` is a stable cache discriminator; only one canonical key
        # ("default") is used since this is a single-page scraper.
        resp = http.get(FGF_CONTACT_URL, check_robots=self.respects_robots)
        resp.raise_for_status()

        soup = BeautifulSoup(resp.text, "html.parser")
        text = soup.get_text(separator="\n")
        lines = [ln.strip() for ln in text.splitlines() if ln.strip()]

        # The address line is the first text node containing a Canadian
        # postal code. Looking only inside structured HTML elements would
        # be more brittle to layout changes than this text-level scan.
        address_line = next((ln for ln in lines if POSTAL_RE.search(ln)), None)
        if not address_line:
            raise ValueError(
                "Could not find a Canadian postal code on fgfbrands.com/contact -- "
                "the page may have been redesigned."
            )

        m = POSTAL_RE.search(address_line)
        assert m is not None  # guarded by the next() above
        postal_code = f"{m.group(1)} {m.group(2)}"

        head = address_line[: m.start()].strip().rstrip(",")
        # Split "1295 Ormont Drive Toronto, Ontario, Canada" -> three parts
        parts = [p.strip() for p in head.split(",") if p.strip()]
        if not parts:
            raise ValueError(f"Unparseable address line: {address_line!r}")

        street_and_city = parts[0]
        province = parts[1] if len(parts) > 1 else ""

        # Split "1295 Ormont Drive Toronto" using a street-suffix anchor.
        suffix_match = STREET_SUFFIX_RE.search(street_and_city)
        if suffix_match:
            street = street_and_city[: suffix_match.end()].strip()
            city = street_and_city[suffix_match.end() :].strip()
        else:
            # Fallback: whole thing is street, no city extracted.
            street = street_and_city
            city = ""

        phone_match = PHONE_RE.search(text)
        phone = phone_match.group(0) if phone_match else None

        return (
            {
                "street": street,
                "city": city,
                "province": province,
                "postal_code": postal_code,
                "phone": phone,
            },
            FGF_CONTACT_URL,
        )


def fgf_contact_address() -> dict[str, Any]:
    """Convenience wrapper -- live-then-cache-fallback FGF contact details."""
    return FgfContactFetcher().get("default").data
