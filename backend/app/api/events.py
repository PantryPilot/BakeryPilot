"""Events router: SSE channel for live FlowSight overlays (mock).

Replaces the real Redis pubsub fan-out during mock mode. Streams a small
deterministic sequence of yield / risk / shelf-life events then ends.
"""

import asyncio
import json
from datetime import datetime
from typing import AsyncGenerator

from fastapi import APIRouter
from sse_starlette.sse import EventSourceResponse

router = APIRouter(prefix="/api/events", tags=["events"])


_EVENTS = [
    ("yield", {"line_id": "line_2", "facility_id": "plant_1", "dollar_leak_delta": 3.5}),
    ("risk", {"supplier_id": "sup_d", "severity": 0.74, "message": "Saskatchewan drought update"}),
    ("shelf_life", {"facility_id": "plant_2", "pallets_red": 12, "pallets_amber": 8}),
    ("yield", {"line_id": "line_2", "facility_id": "plant_1", "dollar_leak_delta": 2.1}),
    ("forecast", {"sku_id": "sku_naan", "retailer_id": "ret_walmart", "delta_pct": 0.35}),
]


@router.get("")
async def event_stream():
    async def stream() -> AsyncGenerator[dict, None]:
        for kind, payload in _EVENTS:
            yield {
                "event": kind,
                "data": json.dumps({**payload, "observed_at": datetime.utcnow().isoformat()}),
            }
            await asyncio.sleep(1.0)
        yield {"event": "done", "data": "{}"}

    return EventSourceResponse(stream())
