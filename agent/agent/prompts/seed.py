from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from pymongo import MongoClient

from agent.config import MONGODB_URL, MONGODB_DB

_PROMPTS_DIR = Path(__file__).parent
_COLLECTION = "prompts"


def seed_prompts(force: bool = False) -> None:
    client: MongoClient = MongoClient(MONGODB_URL)
    col = client[MONGODB_DB][_COLLECTION]

    for md_file in sorted(_PROMPTS_DIR.glob("*.md")):
        name = md_file.stem
        existing = col.find_one({"name": name})
        if existing and not force:
            continue

        body = md_file.read_text()
        col.update_one(
            {"name": name},
            {
                "$setOnInsert": {"version": 1, "created_at": datetime.now(timezone.utc)},
                "$set": {"body": body, "updated_at": datetime.now(timezone.utc)},
            },
            upsert=True,
        )
        print(f"  upserted: {name}")

    client.close()


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true", help="overwrite existing prompts")
    args = parser.parse_args()
    seed_prompts(force=args.force)
    print("done")
