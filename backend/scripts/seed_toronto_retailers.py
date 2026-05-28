#!/usr/bin/env -S uv run --quiet
# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "psycopg[binary]>=3.1",
# ]
# ///
"""Seed the real Canadian / GTA grocery roster into the retailers table.

The four chains already in infra/supabase/seed.sql (Costco, Walmart, Loblaws,
Whole Foods) are real names -- this script keeps those IDs and adds the rest
of the realistic GTA wholesale-customer mix across Loblaw, Empire, Metro, and
independent specialty banners.

Public source attribution (every banner has an open store directory):
  Loblaw Companies     -- loblaws.ca / loblaw.ca
    * Loblaws, No Frills, Real Canadian Superstore, Shoppers Drug Mart, T&T
  Empire Co. (Sobeys)  -- corporate.sobeys.com
    * Sobeys, FreshCo, Farm Boy, Longo's, Foodland
  Metro Inc.           -- corpo.metro.ca
    * Metro, Food Basics
  Independents (GTA)
    * Pusateri's Fine Foods, McEwan Fine Foods, Highland Farms
  National / US-owned
    * Costco Wholesale Canada, Walmart Canada, Whole Foods Market Canada

The retailers schema has only retailer_id / name / edi_endpoint, so parent
company is captured in a code comment per banner -- it does not land in the DB.
EDI endpoints follow the existing mock pattern (https://edi-mock.local/<id>).

Usage:
  uv run infra/seed_toronto_retailers.py             # additive insert
  uv run infra/seed_toronto_retailers.py --dry-run   # print, do not write
"""

from __future__ import annotations

import argparse
import os
from collections import Counter

import psycopg

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://bakery:bakery@localhost:5432/bakery",
)

# Parent company per banner for the demo narrative -- not stored in the DB,
# kept here so future joins / filters can be added easily.
GTA_RETAILERS: list[dict] = [
    # --- Loblaw Companies Ltd. ---
    {
        "retailer_id":  "loblaws",
        "name":         "Loblaws Companies Ltd.",
        "edi_endpoint": "https://edi-mock.local/loblaws",
        "parent":       "Loblaw",
    },
    {
        "retailer_id":  "no-frills",
        "name":         "No Frills",
        "edi_endpoint": "https://edi-mock.local/no-frills",
        "parent":       "Loblaw",
    },
    {
        "retailer_id":  "superstore",
        "name":         "Real Canadian Superstore",
        "edi_endpoint": "https://edi-mock.local/superstore",
        "parent":       "Loblaw",
    },
    {
        "retailer_id":  "shoppers",
        "name":         "Shoppers Drug Mart",
        "edi_endpoint": "https://edi-mock.local/shoppers",
        "parent":       "Loblaw",
    },
    {
        "retailer_id":  "tt-supermarket",
        "name":         "T&T Supermarket",
        "edi_endpoint": "https://edi-mock.local/tt-supermarket",
        "parent":       "Loblaw",
    },

    # --- Empire Company Ltd. (Sobeys) ---
    {
        "retailer_id":  "sobeys",
        "name":         "Sobeys",
        "edi_endpoint": "https://edi-mock.local/sobeys",
        "parent":       "Empire",
    },
    {
        "retailer_id":  "freshco",
        "name":         "FreshCo",
        "edi_endpoint": "https://edi-mock.local/freshco",
        "parent":       "Empire",
    },
    {
        "retailer_id":  "farm-boy",
        "name":         "Farm Boy",
        "edi_endpoint": "https://edi-mock.local/farm-boy",
        "parent":       "Empire",
    },
    {
        "retailer_id":  "longos",
        "name":         "Longo's",
        "edi_endpoint": "https://edi-mock.local/longos",
        "parent":       "Empire",
    },
    {
        "retailer_id":  "foodland",
        "name":         "Foodland",
        "edi_endpoint": "https://edi-mock.local/foodland",
        "parent":       "Empire",
    },

    # --- Metro Inc. ---
    {
        "retailer_id":  "metro",
        "name":         "Metro",
        "edi_endpoint": "https://edi-mock.local/metro",
        "parent":       "Metro",
    },
    {
        "retailer_id":  "food-basics",
        "name":         "Food Basics",
        "edi_endpoint": "https://edi-mock.local/food-basics",
        "parent":       "Metro",
    },

    # --- Independents / specialty (GTA) ---
    {
        "retailer_id":  "pusateris",
        "name":         "Pusateri's Fine Foods",
        "edi_endpoint": "https://edi-mock.local/pusateris",
        "parent":       "Independent",
    },
    {
        "retailer_id":  "mcewan",
        "name":         "McEwan Fine Foods",
        "edi_endpoint": "https://edi-mock.local/mcewan",
        "parent":       "Independent",
    },
    {
        "retailer_id":  "highland-farms",
        "name":         "Highland Farms",
        "edi_endpoint": "https://edi-mock.local/highland-farms",
        "parent":       "Independent",
    },

    # --- National / US-owned ---
    {
        "retailer_id":  "costco",
        "name":         "Costco Wholesale Canada",
        "edi_endpoint": "https://edi-mock.local/costco",
        "parent":       "National",
    },
    {
        "retailer_id":  "walmart",
        "name":         "Walmart Canada",
        "edi_endpoint": "https://edi-mock.local/walmart",
        "parent":       "National",
    },
    {
        "retailer_id":  "wholefoods",
        "name":         "Whole Foods Market Canada",
        "edi_endpoint": "https://edi-mock.local/wholefoods",
        "parent":       "National",
    },
]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Print the retailers that would be inserted and exit.",
    )
    args = parser.parse_args()

    if args.dry_run:
        _print_plan()
        return 0

    ids = [r["retailer_id"] for r in GTA_RETAILERS]

    with psycopg.connect(DATABASE_URL, autocommit=False) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT retailer_id FROM retailers WHERE retailer_id = ANY(%s)",
                (ids,),
            )
            already_present = {r[0] for r in cur.fetchall()}
            to_insert = [r for r in GTA_RETAILERS if r["retailer_id"] not in already_present]

            if not to_insert:
                print(f"[seed_toronto_retailers] All {len(GTA_RETAILERS)} retailers already present, nothing to do.")
                return 0

            rows = [
                {
                    "retailer_id":  r["retailer_id"],
                    "name":         r["name"],
                    "edi_endpoint": r["edi_endpoint"],
                }
                for r in to_insert
            ]

            cur.executemany(
                """
                INSERT INTO retailers (retailer_id, name, edi_endpoint)
                VALUES (%(retailer_id)s, %(name)s, %(edi_endpoint)s)
                ON CONFLICT (retailer_id) DO NOTHING
                """,
                rows,
            )

        conn.commit()

    skipped = len(already_present)
    print(
        f"[seed_toronto_retailers] Inserted {len(to_insert)} retailers"
        + (f" ({skipped} already present, skipped)" if skipped else "")
        + "."
    )
    _summarize_by_parent()
    return 0


def _print_plan() -> None:
    print(f"[seed_toronto_retailers] Dry run -- {len(GTA_RETAILERS)} retailers:")
    for r in GTA_RETAILERS:
        print(f"  {r['retailer_id']:18s}  {r['parent']:12s}  {r['name']}")
    _summarize_by_parent()


def _summarize_by_parent() -> None:
    counts = Counter(r["parent"] for r in GTA_RETAILERS)
    line = "  ".join(f"{parent}={n}" for parent, n in sorted(counts.items()))
    print(f"[seed_toronto_retailers] By parent: {line}")


if __name__ == "__main__":
    raise SystemExit(main())
