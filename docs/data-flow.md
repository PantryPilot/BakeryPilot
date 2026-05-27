# Data Flow

End-to-end sequence diagrams for the key user-visible flows. The walking
skeleton (flow 1) is the foundation; everything else is a variant of the same
shape with different tools and side effects.

## Flow 1 — Walking skeleton: shortage question → confirmed PO

The canonical demo. A user asks what to do about a shortage; the agent
recommends a substitution and drafts a procurement order; the user confirms;
the order persists.

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant FE as Next.js /chat
    participant API as FastAPI
    participant AG as LangGraph
    participant LLM as Claude
    participant DB as Postgres
    participant SAP as SAP (mock)

    U->>FE: "What can we bake if blueberries are short?"
    FE->>API: POST /api/chat (text/event-stream)
    API->>AG: stream(message, thread_id)

    AG->>LLM: classify_intent(message)
    LLM-->>AG: "inventory"

    Note over AG: route to InventoryAgent

    AG->>API: GET /api/lots?facility_id=plant-toronto (tool call)
    API->>DB: SELECT ingredient_lots ORDER BY spoilage_risk_score DESC
    DB-->>API: rows
    API-->>AG: [{lot_id, ingredient_id, quantity_kg, expiry_date, ...}]

    AG->>API: GET /api/substitution_candidates?sku=sku-ace-baguette-classic
    API-->>AG: [{sku_id: sku-wonder-classic-white-loaf, achievable: 5000}, ...]

    Note over AG: route to ProcurementAgent

    AG->>API: POST /api/orders/draft (tool call)<br/>{supplier_id, items, delivery_date}
    API->>API: services/landed_cost.py
    API->>DB: INSERT action_cards (state='pending', payload=draft)
    DB-->>API: card_id
    API-->>AG: {action_card_id, landed_cost_breakdown}

    AG-->>API: SSE: event=message  data=narration chunks
    API-->>FE: forward SSE chunks
    AG-->>API: SSE: event=action_card  data={action_card_id}
    API-->>FE: forward action_card event
    AG-->>API: SSE: event=done
    API-->>FE: forward done

    FE->>U: render ActionCard with Confirm

    Note over U,DB: User reviews unit price + MOQ overage + holding cost

    U->>FE: click Confirm
    FE->>API: POST /api/action_cards/{id}/confirm
    API->>DB: SELECT action_cards WHERE card_id=...
    DB-->>API: row with state='pending'
    API->>DB: UPDATE action_cards SET state='confirmed', decided_at=now()
    API->>SAP: create_po(payload)
    SAP-->>API: {po_number: "PO-2026-...", confirmed_delivery_date}
    API->>DB: INSERT supplier_orders (status='confirmed', external_po_number, action_card_id)
    DB-->>API: order_id
    API-->>FE: 200 (confirmed ActionCard with order_id reference)

    FE->>FE: dismiss card, mark assistant msg as decided
    FE->>API: GET /api/lots (refresh /materials view)
```

## Flow 2 — Retailer PO arrives → schedule re-tile

A new retailer order triggers a fresh schedule proposal. Same HITL shape as
flow 1; the tool and side effect change.

```mermaid
sequenceDiagram
    autonumber
    participant Buyer as Retailer (or operator)
    participant FE as Next.js /schedule
    participant API as FastAPI
    participant SCH as scheduler service (OR-Tools)
    participant DB as Postgres
    participant MES as MES (mock)

    Buyer->>FE: enter "Costco, 12000 muffins, 2026-05-28"
    FE->>API: POST /api/retailer_orders<br/>{retailer_id, sku_id, quantity, requested_delivery_date}
    API->>DB: INSERT retailer_orders
    API->>SCH: solve(facility_id, horizon=7d)
    SCH->>DB: SELECT production_formulas, ingredient_lots, demand_forecasts, allergen_changeovers
    DB-->>SCH: inputs
    SCH-->>API: suggested schedule (list of runs)
    API->>DB: INSERT action_cards (kind='schedule_change', payload={schedule_diff, narration})
    DB-->>API: card_id
    API-->>FE: {order_id, action_card_id}

    FE->>API: GET /api/schedules/{id}/diff
    API-->>FE: {before[], after[], changes[]}
    FE->>FE: render ScheduleDiff side-by-side
    FE->>FE: render ActionCard with Confirm

    Note over Buyer: Operator reviews diff narration

    Buyer->>FE: Confirm
    FE->>API: POST /api/action_cards/{id}/confirm
    API->>DB: UPDATE action_cards SET state='confirmed'
    API->>DB: INSERT production_schedules (status='approved', action_card_id)
    API->>MES: post_schedule(payload)
    MES-->>API: {ack_id, accepted_at}
    API-->>FE: 200
    FE->>FE: refresh diff (after becomes new before)
```

## Flow 3 — Live disruption signal → bridge PO drafted

The agent reacts proactively to a Redis-published supplier risk event. The user
sees a new action card without having typed anything.

```mermaid
sequenceDiagram
    autonumber
    participant FEED as commodity / news feed
    participant ES as event_stream.py
    participant RDS as Redis
    participant SUB as backend SSE subscriber
    participant API as FastAPI
    participant AG as LangGraph (ProcurementAgent)
    participant DB as Postgres
    participant FE as Next.js (any page)

    FEED->>ES: weather / news / commodity update
    ES->>RDS: PUBLISH disruption_signals {supplier_id, severity, source, message}
    RDS->>SUB: SUBSCRIBE delivery

    SUB->>DB: INSERT disruption_signals
    SUB->>API: services/disruption_risk.py — recompute score
    alt score >= threshold
        API->>AG: invoke ProcurementAgent.draft_bridge_po(supplier_id)
        AG->>API: build_order_draft(alternate_supplier, items, ...)
        API->>DB: INSERT action_cards (kind='supplier_order')
        DB-->>API: card_id

        Note over API: action_card available
        API-->>FE: SSE on /api/events: {type: 'action_card_created', card_id}
        FE->>FE: badge appears in nav; FlowSight supplier halo flips red
    end
```

This flow is Phase 3. The publisher (`infra/event_stream.py`) runs as a separate
process started by `make seed.events`.

## SSE event types

The chat endpoint emits three event types over a single stream:

| Event | `data:` payload | Frontend handler |
| --- | --- | --- |
| `message` | `{"content": "<chunk>"}` | Append chunk to last assistant message |
| `action_card` | `{"action_card_id": "<uuid>"}` | Fetch card via `GET /api/action_cards/{id}`, render `<ActionCard>` |
| `done` | `{}` | End-of-stream; release the EventSource |

Other event types reserved for future use:

| Event | When emitted | Source |
| --- | --- | --- |
| `tool_call` | Before each agent tool call | Phase 2 — for tool-breadcrumb UI |
| `intent` | After classify_intent | Optional — show "InventoryAgent thinking..." |
| `error` | On any unrecoverable error | Always |

For non-chat overlays (FlowSight live updates), the dedicated endpoint
`/api/events` will multiplex risk / yield / shelf-life / forecast events on a
single persistent SSE connection per session (planned, F5.10).

## HITL gate — invariants

Every state-changing flow upholds these:

1. **The agent never writes directly.** A tool that ultimately mutates state
   returns an `action_card_id` — never a write-success boolean. Audited by
   `NF.R.2`.
2. **The user's click is the commit.** `POST /api/action_cards/{id}/confirm` is
   the single chokepoint for applying any payload to the system.
3. **Idempotent confirm.** Calling `/confirm` twice on the same card returns the
   existing side-effect row id and does not double-write. Enforced by checking
   `state` before mutating.
4. **Reject leaves an audit trace.** Rejected cards stay in the table with
   `state='rejected'` + `decided_at` + `decided_by`. Nothing is deleted.
5. **Confirm fires the integration.** The mock SAP / MES / CMMS client is the
   last hop before the row lands in `supplier_orders` / `production_schedules` /
   work orders. Swapping mock for real is one env var.

## Failure modes and what the user sees

| Failure | User-visible behavior |
| --- | --- |
| Backend down | `streamChat` falls back to `mockReply()` — canned demo response, no card persisted |
| Agent throws mid-stream | `event: error` sent; frontend renders an inline error notice and keeps the partial message |
| `/confirm` 409 (already decided) | Frontend treats as success and dismisses the card |
| `/confirm` 404 (card expired or never existed) | Inline error: "this decision is no longer available" |
| SAP mock fails | `/confirm` rolls back the `action_cards` state mutation in a transaction, returns 502 with detail |

## Cross-references

- The SSE wire format is consumed by `frontend/src/lib/api.ts::streamChat`.
- The `action_card` payload shape is fixed by
  [`shared/schemas/action_card.schema.json`](../shared/schemas/action_card.schema.json).
- For the LangGraph node-by-node detail behind step "intent → route → agent →
  tool", see [agents.md](agents.md#graph-topology).
