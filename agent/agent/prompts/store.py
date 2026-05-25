from __future__ import annotations

import time
from pathlib import Path
from typing import Any

from pymongo import MongoClient
from pymongo.errors import PyMongoError

from agent.config import MONGODB_URL, MONGODB_DB, PROMPT_CACHE_TTL_SECONDS

_PROMPTS_DIR = Path(__file__).parent
_COLLECTION = "prompts"


class PromptStore:
    def __init__(self) -> None:
        self._cache: dict[str, tuple[str, float]] = {}
        try:
            self._client: MongoClient[Any] = MongoClient(MONGODB_URL, serverSelectionTimeoutMS=2000)
            self._col = self._client[MONGODB_DB][_COLLECTION]
            self._client.admin.command("ping")
            self._mongo_ok = True
        except PyMongoError:
            self._mongo_ok = False

    def get(self, name: str) -> str:
        cached_body, cached_at = self._cache.get(name, ("", 0.0))
        if cached_body and (time.monotonic() - cached_at) < PROMPT_CACHE_TTL_SECONDS:
            return cached_body

        body = self._fetch_from_mongo(name) if self._mongo_ok else None
        if body is None:
            body = self._fetch_from_file(name)

        self._cache[name] = (body, time.monotonic())
        return body

    def _fetch_from_mongo(self, name: str) -> str | None:
        try:
            doc = self._col.find_one({"name": name}, {"body": 1})
            return doc["body"] if doc else None
        except PyMongoError:
            self._mongo_ok = False
            return None

    def _fetch_from_file(self, name: str) -> str:
        path = _PROMPTS_DIR / f"{name}.md"
        if not path.exists():
            raise FileNotFoundError(f"Prompt '{name}' not found in MongoDB or {path}")
        return path.read_text()

    def invalidate(self, name: str) -> None:
        self._cache.pop(name, None)


_store: PromptStore | None = None


def get_prompt_store() -> PromptStore:
    global _store
    if _store is None:
        _store = PromptStore()
    return _store
