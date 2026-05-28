#!/usr/bin/env -S uv run --quiet
# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "psycopg[binary]>=3.1",
# ]
# ///
"""Seed real Toronto / GTA bakery-ingredient suppliers into the suppliers table.

Twelve public Toronto-area wholesale suppliers, mapped onto the existing
personality_tag taxonomy (reliable / cheap_late / high_moq / disrupted / new).
The synthetic five from infra/supabase/seed.sql (sup-northgrain etc.) are left
alone unless --replace is passed.

Public source attribution (URLs are the suppliers' own sites):
  - Albion Bakery Supplies  -- albionbakerysupplies.ca   25 Connell Ct, Etobicoke
  - Sysco Canada Toronto    -- sysco.ca/location/toronto
  - Baker's & Us            -- bakersandus.ca            GTA wholesale
  - DairyCentral            -- dairycentral.ca           Ontario dairy wholesale
  - A1 Cash and Carry       -- a1cashandcarry.com        8 GTA locations
  - BulkMart                -- bulkmart.ca               Mississauga
  - Olympic Wholesale       -- olympicwholesale.ca       GTA industrial bakery
  - North American Impex    -- naimpex.ca                Ontario, baking items
  - 100km Foods             -- 100kmfoods.com            Toronto local / seasonal
  - CJR Wholesale           -- cjrwholesale.com          Ontario, 6,000+ products
  - Baker's Pantry          -- bakerspantry.ca           Toronto specialty
  - L&M Bakers Supply       -- lmbakersupply.com         Toronto decorating

Contact emails use the .example TLD (RFC 2606) so re-running the seed never
sends mail to a real inbox. personality_tag is author judgment based on each
supplier's public profile; payment_terms / contract_expiry_days are plausible
defaults, not commercial fact. City lives in the name field for now because
the suppliers schema has no city/province column -- when that migration lands,
update this script to populate the new columns and drop the parenthetical.

Usage:
  uv run infra/seed_toronto_suppliers.py             # additive insert
  uv run infra/seed_toronto_suppliers.py --replace   # drop synthetic seed first
  uv run infra/seed_toronto_suppliers.py --dry-run   # print, do not write
"""

from __future__ import annotations

import argparse
import os
from collections import Counter
from datetime import date, timedelta

import psycopg

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://bakery:bakery@localhost:5432/bakery",
)

# Synthetic supplier IDs from infra/supabase/seed.sql -- only removed with --replace.
SYNTHETIC_SUPPLIER_IDS = (
    "sup-northgrain",
    "sup-valleydairy",
    "sup-prairiebulk",
    "sup-coastalberry",
    "sup-newleaf",
)

TORONTO_SUPPLIERS: list[dict] = [
    {
        # Long-established broad catalog (flours, sugars, mixes, chocolate, yeast).
        # 25 Connell Court Unit 8, Etobicoke M8Z 1E8 -- phone 416-252-4660.
        "supplier_id":          "sup-albion",
        "name":                 "Albion Bakery Supplies (Etobicoke, ON)",
        "contact_email":        "orders@albion.example",
        "payment_terms":        "net-30",
        "contract_expiry_days": 270,
        "personality_tag":      "reliable",
    },
    {
        # National distributor -- best on-time, premium pricing.
        "supplier_id":          "sup-sysco-toronto",
        "name":                 "Sysco Canada (Toronto, ON)",
        "contact_email":        "toronto.orders@sysco.example",
        "payment_terms":        "net-30",
        "contract_expiry_days": 365,
        "personality_tag":      "reliable",
    },
    {
        # Full-service GTA wholesale distribution for bakery and pastry.
        "supplier_id":          "sup-bakers-and-us",
        "name":                 "Baker's & Us (GTA)",
        "contact_email":        "sales@bakersandus.example",
        "payment_terms":        "net-30",
        "contract_expiry_days": 200,
        "personality_tag":      "reliable",
    },
    {
        # Dairy specialist (milk, butter, cream) + pantry staples. Short shelf life.
        "supplier_id":          "sup-dairycentral",
        "name":                 "DairyCentral (Ontario)",
        "contact_email":        "orders@dairycentral.example",
        "payment_terms":        "net-30",
        "contract_expiry_days": 180,
        "personality_tag":      "reliable",
    },
    {
        # Cash-and-carry pricing model -- lowest unit cost, inconsistent windows.
        "supplier_id":          "sup-a1-cashcarry",
        "name":                 "A1 Cash and Carry (GTA, 8 locations)",
        "contact_email":        "ops@a1cashcarry.example",
        "payment_terms":        "2/10 net-30",
        "contract_expiry_days": 150,
        "personality_tag":      "cheap_late",
    },
    {
        # Restaurant-supply scale -- competitive prices, unpredictable bulk timing.
        "supplier_id":          "sup-bulkmart",
        "name":                 "BulkMart (Mississauga, ON)",
        "contact_email":        "sales@bulkmart.example",
        "payment_terms":        "2/10 net-30",
        "contract_expiry_days": 220,
        "personality_tag":      "cheap_late",
    },
    {
        # Mid-to-large industrial bakeries -- large bulk-order minimums.
        "supplier_id":          "sup-olympic-wholesale",
        "name":                 "Olympic Wholesale (GTA)",
        "contact_email":        "po@olympicwholesale.example",
        "payment_terms":        "net-45",
        "contract_expiry_days": 300,
        "personality_tag":      "high_moq",
    },
    {
        # Industrial bakery channel -- baking items, nuts, spices in large lots.
        "supplier_id":          "sup-naimpex",
        "name":                 "North American Impex (Ontario)",
        "contact_email":        "wholesale@naimpex.example",
        "payment_terms":        "net-45",
        "contract_expiry_days": 280,
        "personality_tag":      "high_moq",
    },
    {
        # Local / seasonal Ontario producers -- supply varies with harvest, weather.
        "supplier_id":          "sup-100km-foods",
        "name":                 "100km Foods (Toronto, ON)",
        "contact_email":        "chefs@100kmfoods.example",
        "payment_terms":        "net-30",
        "contract_expiry_days": 90,
        "personality_tag":      "disrupted",
    },
    {
        # 6,000-product catalog across many origins -- exposed to import disruption.
        "supplier_id":          "sup-cjr-wholesale",
        "name":                 "CJR Wholesale (Ontario)",
        "contact_email":        "orders@cjrwholesale.example",
        "payment_terms":        "net-30",
        "contract_expiry_days": 160,
        "personality_tag":      "disrupted",
    },
    {
        # Specialty (enzymes, stabilizers) -- newer relationship channel.
        "supplier_id":          "sup-bakers-pantry",
        "name":                 "Baker's Pantry / Novelty Fine Foods (Toronto, ON)",
        "contact_email":        "hello@bakerspantry.example",
        "payment_terms":        "1/15 net-60",
        "contract_expiry_days": 380,
        "personality_tag":      "new",
    },
    {
        # Decorating / specialty (fondants, colors, sprinkles) -- small-batch entrant.
        "supplier_id":          "sup-lm-bakers-supply",
        "name":                 "L&M Bakers Supply Co. (Toronto, ON)",
        "contact_email":        "support@lmbakers.example",
        "payment_terms":        "1/15 net-60",
        "contract_expiry_days": 365,
        "personality_tag":      "new",
    },
]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--replace", action="store_true",
        help="Delete synthetic seed suppliers (sup-northgrain etc.) before insert.",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Print the suppliers that would be inserted and exit.",
    )
    args = parser.parse_args()

    if args.dry_run:
        _print_plan()
        return 0

    today = date.today()
    ids = [s["supplier_id"] for s in TORONTO_SUPPLIERS]

    with psycopg.connect(DATABASE_URL, autocommit=False) as conn:
        with conn.cursor() as cur:
            if args.replace:
                cur.execute(
                    "DELETE FROM suppliers WHERE supplier_id = ANY(%s)",
                    (list(SYNTHETIC_SUPPLIER_IDS),),
                )
                print(f"[seed_toronto] Deleted {cur.rowcount} synthetic supplier rows.")

            cur.execute(
                "SELECT supplier_id FROM suppliers WHERE supplier_id = ANY(%s)",
                (ids,),
            )
            already_present = {r[0] for r in cur.fetchall()}
            to_insert = [s for s in TORONTO_SUPPLIERS if s["supplier_id"] not in already_present]

            if not to_insert:
                print(f"[seed_toronto] All {len(TORONTO_SUPPLIERS)} suppliers already present, nothing to do.")
                return 0

            rows = [
                {
                    "supplier_id":          s["supplier_id"],
                    "name":                 s["name"],
                    "contact_email":        s["contact_email"],
                    "payment_terms":        s["payment_terms"],
                    "contract_expiry_date": today + timedelta(days=s["contract_expiry_days"]),
                    "personality_tag":      s["personality_tag"],
                }
                for s in to_insert
            ]

            cur.executemany(
                """
                INSERT INTO suppliers
                    (supplier_id, name, contact_email, payment_terms,
                     contract_expiry_date, personality_tag)
                VALUES
                    (%(supplier_id)s, %(name)s, %(contact_email)s, %(payment_terms)s,
                     %(contract_expiry_date)s, %(personality_tag)s)
                ON CONFLICT (supplier_id) DO NOTHING
                """,
                rows,
            )

        conn.commit()

    skipped = len(already_present)
    print(
        f"[seed_toronto] Inserted {len(to_insert)} Toronto suppliers"
        + (f" ({skipped} already present, skipped)" if skipped else "")
        + "."
    )
    _summarize_by_personality()
    return 0


def _print_plan() -> None:
    print(f"[seed_toronto] Dry run -- {len(TORONTO_SUPPLIERS)} suppliers:")
    for s in TORONTO_SUPPLIERS:
        print(f"  {s['supplier_id']:25s}  {s['personality_tag']:10s}  {s['name']}")
    _summarize_by_personality()


def _summarize_by_personality() -> None:
    counts = Counter(s["personality_tag"] for s in TORONTO_SUPPLIERS)
    line = "  ".join(f"{tag}={n}" for tag, n in sorted(counts.items()))
    print(f"[seed_toronto] By personality: {line}")


if __name__ == "__main__":
    raise SystemExit(main())
