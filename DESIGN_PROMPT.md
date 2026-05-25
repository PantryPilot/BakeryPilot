# BakeryPilot — UI/UX Design Brief

## Product overview

BakeryPilot is an agentic AI operations copilot for FGF Brands, an industrial bakery
running **four Canadian plants**, hundreds of SKUs, and thousands of tonnes of perishable
ingredients every week. It combines two modes of interaction:

1. **Operational dashboards** — structured views for inventory, suppliers, production
   schedules, yield, and ESG performance. Data-dense, scannable, actionable.
2. **AI copilot** — a conversational agent (Claude) that answers questions, diagnoses
   problems, and proposes actions. Every action requires explicit human confirmation
   before it commits to the database.
3. **FlowSight** — a live PixiJS strategy-game map of the entire supply network
   (suppliers → plants → retailers), overlaid with operational data from all the
   dashboards. This is the flagship "wow" view.

All three modes are always one click away from each other. The chat copilot is
accessible from every page. The design must be **dark-mode only**.

---

## Tech stack

- **Framework:** Next.js 15, React 19, TypeScript, Tailwind CSS
- **Map canvas:** PixiJS + @pixi/react (2D WebGL)
- **Graph view:** react-flow (lot genealogy / recall traceability)
- **Charts:** Recharts (forecast bands, yield curves, demand bars)
- **Chat streaming:** native EventSource (SSE) — no polling, no spinners
- **Package manager:** npm (frontend), uv (Python backend + agent)

---

## Global shell

**Left sidebar (persistent, collapsible):**

| Icon | Label | Route |
|---|---|---|
| Map grid | FlowSight | `/facilities` |
| Boxes | Inventory | `/materials` |
| Truck | Suppliers | `/scorecard#suppliers` |
| Calendar | Schedule | `/schedule` |
| Bar chart | Scorecard | `/scorecard` |
| Chat bubble | Copilot | `/chat` |

**Top bar:**
- App name / logo left
- Active facility selector (dropdown: All Plants / Plant 1 Ontario / Plant 2 BC / Plant 3 Alberta / Plant 4 Quebec)
- Live status indicator: green dot "LIVE" or amber "DELAYED" for the event stream
- Notification bell: unsent negotiation drafts, expiry alerts, disruption signals

**Bottom status strip (all pages):**
Four always-visible live counters:
- `Waste avoided: $21,340` (green)
- `CO2e saved: 1.9 t` (green)
- `Active disruptions: 2` (amber if >0, red if critical)
- `MOQ-tax YTD: $1,840` (amber)

**Chat drawer:**
Collapsed by default (icon + "Ask copilot" label in bottom-right corner). Expanding
it opens a right-side drawer (400 px wide) without leaving the current page. The
drawer shows the full chat thread and ActionCards from the current session.

---

## Page 1 — `/facilities` (FlowSight)

The flagship view. A full-viewport 2D canvas rendered with PixiJS showing the entire
FGF supply network as a live, interactive map.

### Canvas layout

```
[Supplier rail]    [Canada map — four plant nodes]    [Retailer rail]
   Supplier A              Plant 1 (ON)                  Costco
   Supplier B              Plant 2 (BC)                  Walmart
   Supplier C              Plant 3 (AB)                  Loblaws
   Supplier D              Plant 4 (QC)                  Whole Foods
   Supplier E
```

Nodes are connected by animated arcs. Truck sprites travel along arcs on confirmed
transfers and deliveries. Pan/zoom via mouse/trackpad.

### Node types

**Supplier node:**
- Circle with supplier name below
- Outer animated **reliability halo**: green (≥95% on-time), amber (85–94%), red (<85% or active disruption signal)
- Halo pulses faster when a disruption is active
- **MOQTaxBadge** docked to bottom of node: hidden when $0, amber pill when >$0, red pulsing pill when over the $3 K negotiation threshold
- Small status pill: "PO en route", "Awaiting confirmation", "At risk"

**Plant node:**
- Larger hexagon or rounded square; facility name + city label
- Segmented ring showing storage utilisation: frozen (blue segment), refrigerated (teal), dry (grey)
- Ring border colour: green (all OK), amber (one or more alerts), red (critical — stockout imminent or line down)
- Flashing border animation when the node needs attention
- Clicking opens the **FactoryView** slide-in panel (see below)

**Retailer node:**
- Rectangle with retailer logo / name
- Current PO volume vs. forecast ratio shown as a thin bar below the node
- Shelf-life risk badge: green / amber / red based on pallet expiry at that retailer

**Truck units:**
- Animated sprite travelling a bezier arc from origin to destination
- Cargo label on hover: ingredient name, quantity, ETA
- Colour: blue (inbound supplier → plant), orange (outbound plant → retailer), grey (plant → plant transfer)

### Layer toggles

A floating panel (top-right of canvas). Eight toggleable layers; each shows a count
badge of active items:

| # | Layer | What it shows |
|---|---|---|
| 1 | Risk | Supplier halo colours + disruption news ticker at canvas bottom |
| 2 | Yield | Plant node glow intensity = yield variance; red glow = line anomaly |
| 3 | Shelf-life | Heat overlay on plant + retailer nodes showing expiry urgency |
| 4 | Forecast | Demand band arcs from retailers back to plants |
| 5 | Procurement | PO status arcs from plants to suppliers |
| 6 | ESG | Waste-avoided dollar counter on each plant node |
| 7 | Schedule | Active production run tiles shown inside plant nodes |
| 8 | Network | Min-cost-flow transfer arcs between plants (cross-facility balancing) |

Active layers are bright; inactive layers are dimmed but remain visible.

### Time scrubber

Fixed to canvas bottom. Replays the last 24 hours of events.

- Timeline bar with event markers (vertical ticks coloured by type: red=disruption, orange=expiry, blue=PO confirmed, green=schedule approved)
- Draggable playhead
- Play / Pause / 2× / 5× fast-forward controls
- "LIVE" pill (glowing green) when at head; click to jump to live

### News ticker

Shown only when Risk layer is on. Scrolling strip at the very bottom of the canvas,
below the scrubber. Streams disruption signals over SSE in real time.

### FactoryView slide-in

Triggered by clicking a plant node. A panel slides in from the right (600 px wide),
leaving the canvas visible at reduced size.

**Inside the panel:**
- Plant name + city header
- Sub-canvas (PixiJS): top-down floor view of the plant
  - Horizontal lane per production line (4–8 lines)
  - Active batch tiles on each lane: SKU name, quantity, expiry countdown of the
    lot being consumed
  - Near-expiry lot tiles: amber border. Expired/critical: red border
- **YieldCounter** per active line (see component spec below)
- Storage utilisation bars: frozen / refrigerated / dry (kg used / kg capacity)
- "Ask copilot about this plant" shortcut button → opens chat drawer pre-filled
  with the plant context

---

## Page 2 — `/chat` (Copilot)

Full-page conversational interface with the AI agent (Claude). Workers ask questions,
managers get recommendations, agents propose and confirm actions.

### Layout

- **Left (65%):** message thread
- **Right (35%):** context panel — shows the most recent ActionCard, SupplierCard,
  or ScheduleDiff that the last agent response produced; updates as the conversation
  progresses

### ChatBox component (bottom of thread)

- Single-line text input that expands to multiline
- **Microphone button** (right of input): triggers VoiceLog recording overlay
- Send button
- Above input: a "suggested prompts" chip strip that fades after first message:
  *"What can we bake?"* / *"Which lots expire today?"* / *"Show supplier risk"* /
  *"Optimise tomorrow's schedule"*

### Message rendering

- User messages: right-aligned, dark pill
- Agent messages: left-aligned, no bubble — text renders directly
- **Streaming:** tokens appear one by one via SSE; no spinner-then-dump
- **Agent thinking indicator:** subtle animated ellipsis with specialist agent label:
  *"InventoryAgent thinking…"* → *"ProcurementAgent thinking…"*
- **Tool-call breadcrumbs:** collapsible pills above each response showing the chain
  of tools called: `[substitution_engine]` → `[compute_landed_cost]` → `[optimize_delivery_window]`
- **Inline ActionCards:** every state-changing response renders an ActionCard directly
  in the thread (not just in the right panel). The card is full-width, visually prominent,
  impossible to scroll past without noticing.

### VoiceLog overlay

Triggered by the microphone button. A modal overlay:

- Live waveform animation while recording
- Stop button
- On stop: audio sends to the backend (faster-whisper STT) → transcript appears
  in the input field for review and edit before sending
- After submission, the resulting ActionCard shows a **verification level badge**:
  - 🟢 Auto-commit — small routine update, high confidence
  - 🟡 Peer verify — another worker must confirm on their device
  - 🟠 Supervisor sign-off — manager must approve
  - 🔴 Dual sign-off — two senior staff must confirm
- Verification chain shown in the ActionCard detail (who approved, timestamp, confidence score)

---

## Page 3 — `/materials` (Inventory Dashboard)

Operational dashboard for all ingredient lots across all four plants.

### Header controls

- Facility filter chips: All / Plant 1 / Plant 2 / Plant 3 / Plant 4
- Storage type filter: All / Frozen / Refrigerated / Dry
- Risk level filter: All / OK / At Risk / Critical / Expired
- Ingredient category filter (dropdown)
- Sort: Spoilage Risk (default) / Expiry Date / Quantity / Facility
- Search bar (ingredient name or lot ID)
- "Ask copilot about inventory" button → opens chat drawer

### Lot table

Columns:

| Lot ID | Ingredient | Facility | Qty (kg) | Expiry | Days Left | Storage | Risk Score | Status | Actions |
|---|---|---|---|---|---|---|---|---|---|

- **Risk Score:** colour-coded horizontal bar (0–1); green < 0.4, amber 0.4–0.7, red > 0.7
- **Status pill:** OK (grey) / At Risk (amber) / Critical (red) / Expired (dark red struck)
- **Actions column:** "Substitute" button (opens substitution panel), "Transfer" button
  (opens transfer ActionCard), "Write off" (opens confirmation ActionCard)
- Row click → opens lot detail slide-in

### Lot detail slide-in

- Full lot record at the top
- **Substitution candidates panel:**
  - Ranked list of alternative lots/ingredients that could substitute this one
  - Each candidate row: ingredient name, facility, qty available, yield compatibility %, allergen flag, spoilage priority rank
  - "Use this substitute" button → ActionCard for schedule + procurement change
- **LotGenealogyGraph** (react-flow):
  - Directed graph tracing lot → production run(s) → finished-goods pallet(s)
  - Backward trace: lot ← receipt event ← supplier order
  - Node colours: blue=lot, grey=production run, green=pallet, red=recalled/written-off
  - Hover a node to see full record; click to navigate to that entity
  - Used for recall simulation: "which pallets does this lot affect?"

### Stock horizon panel (below table)

Per-ingredient strip chart: days of stock remaining at current consumption rate.
Bars coloured by urgency. Supplier order lead-time shown as a red "reorder now" marker.

---

## Page 4 — `/scorecard` (Supplier Dashboard + ESG + Performance)

Two tabs: **Suppliers** and **Performance**.

---

### Tab 1 — Suppliers

A full supplier management dashboard.

**Summary cards (top row):**
- Total active suppliers: N
- Suppliers at risk: N (amber/red halo)
- Pending negotiation drafts: N
- Contracts expiring in 60 days: N

**Supplier table:**

| Supplier | Tier | On-time rate | Fill rate | Window compliance | Price vs. benchmark | MOQ-tax (QTD) | Contract expiry | Status | Actions |
|---|---|---|---|---|---|---|---|---|---|

- Rows sortable by any column
- Row colour: white (healthy), amber row (1+ metric below threshold), red row (active disruption or contract expiring < 30 days)
- **Actions column:**
  - "View draft" → opens NegotiationDraft modal if one is pending
  - "Renew" / "Terminate" → ActionCard if within 60-day contract window
  - "Place PO" → opens procurement flow in chat drawer

**SupplierCard expanded view (clicking a row):**
Opens a slide-in panel with the full **SupplierCard** component:

- Supplier name + tier + reliability halo (animated ring)
- **MOQTaxBadge**: quarterly over-ordering cost with tooltip breakdown
  (overage kg × holding cost/kg/day × days held = $ per order × orders this quarter)
- Performance timeline chart (Recharts): on-time rate, fill rate, window compliance
  over last 12 weeks — three lines on one chart
- Price vs. commodity benchmark chart: supplier price per kg vs. index price per kg,
  last 6 months
- Active orders list: PO ID, ingredient, qty, status, delivery window, chosen delivery day
- Contract details: start date, expiry, payment terms, discount tiers
- **Negotiation history log:** past drafts, sent date, outcome
- Pending negotiation draft (if any): subject + body preview with "Send" / "Edit" / "Discard" buttons

**MOQ-tax ledger panel (below table):**
Grouped by supplier. Shows per-order overage: order ID, ingredient, qty ordered,
qty needed, overage kg, holding cost breakdown, total overage $. Quarter total per
supplier with a progress bar toward the $3 K negotiation threshold.

---

### Tab 2 — Performance (ESG + Operations)

**Four KPI tiles (large numbers):**

1. **Waste Avoided** — $ this quarter + sparkline trend
2. **CO2e Saved** — tonnes, with methodology tooltip
3. **MOQ-Tax YTD** — total over-ordering cost attributed to MOQ floors
4. **Disruptions Caught** — count caught before plant impact + avg lead time (hours)

**Demand forecast chart (Recharts):**
- Per-SKU 14-day forecast with shaded confidence bands
- Actuals as a solid line overlaid
- Retailer PO markers as vertical dashed lines
- SKU selector dropdown; facility toggle

**Yield performance chart (Recharts):**
- Actual vs. theoretical yield % per production line per shift, last 7 days
- Lines below 95% of theoretical shown in red
- Anomaly event markers with tooltips: cause + work order number

**Waste events log (append-only):**
Table: timestamp, lot ID, ingredient, qty (kg), $ value, reason (expired /
allergen conflict / quality reject), "avoided" flag (green check if waste was
avoided by agent action). Exportable to CSV. Immutable — no edit, no delete.

**Scope 3 PDF download:**
Button triggers a backend job. Progress shown inline (generating → ready →
download link). PDF covers waste avoided per SKU, CO2e saved, and methodology.

---

## Page 5 — `/schedule` (Production Schedule)

Production schedule view and optimiser interface for all four plants.

### Schedule header

- Plant selector tabs: All Plants / Plant 1 / Plant 2 / Plant 3 / Plant 4
- Date range picker (default: today + 2 days)
- "Ask copilot to optimise" button → opens chat drawer with schedule context
- "Run what-if" button → opens what-if simulator panel

### Gantt-style schedule (main view)

- Horizontal lanes per production line (grouped by plant)
- Each tile = one production run:
  - SKU name
  - Quantity (units)
  - Start–end time
  - Allergen badge (e.g., "Contains: Nuts") if applicable
  - Amber left-border if a near-expiry lot is consumed in this run
  - Red left-border if expiry is within 24 hours

Between runs of different allergen profiles: vertical **changeover divider** showing
required cleaning time (e.g., "Nut → nut-free: 90 min") and allergen pair. The
OR-Tools optimizer minimises these.

Hovering a tile shows: ingredient lots being consumed (lot IDs + expiry), yield
forecast for this run, line-specific notes.

### ScheduleDiff component

Appears when the agent proposes a schedule change (after shortage, PO change, or
what-if). Renders below the current Gantt or as an overlay toggle:

- **Side-by-side before/after** view: tiles that moved are highlighted in blue,
  removed tiles struck through, new tiles have a dashed border
- **Change list** below: each change with a narration
  (e.g., *"Line 2 blueberry muffin moved 14:00→16:00 — consumes expiring lemon lot,
  saves $1,200 write-off"*)
- **Impact summary bar:** waste avoided (kg + $), changeover count delta, capacity
  delta
- **Accept / Reject buttons** → Accept generates an ActionCard before committing

### What-if simulator panel (right side, toggled by "Run what-if")

Input fields:
- Change a retailer PO quantity (SKU, new quantity)
- Remove a supplier lot (lot ID or ingredient)
- Block a production line (line ID, time range)

"Run simulation" → calls OR-Tools via the agent and streams back a ScheduleDiff
without committing. Multiple what-ifs can be stacked and compared.

---

## Page 6 — `/` (Home)

For first-time visitors: a brief orientation screen with the four operational
loops BakeryPilot covers (Inbound / Production / Outbound / Network) as
clickable cards that navigate to the relevant page.

For returning users: auto-redirect to `/facilities` (stored in localStorage).

---

## Component specifications

### ActionCard

The human-in-the-loop confirmation UI. Appears inline in the chat thread and in
the chat drawer's context panel. Every state-changing agent action (PO, schedule
change, transfer, negotiation send) produces one. It must be visually prominent
and impossible to skip.

Structure:
- **Header row:** action type icon + label (e.g., "Purchase Order — Supplier A")
  + agent name badge (e.g., "ProcurementAgent")
- **Summary row:** 2–3 key numbers in large type (quantity, total landed cost, delivery day)
- **Detail accordion (collapsed by default):** full cost breakdown
  - Unit price × qty
  - MOQ overage: N kg × $X/kg/day × Y days = $Z holding cost
  - Total landed cost = all components summed
- **Risk flags** (inline, not hidden): any amber/red flags
  (e.g., "MOQ overage 350 kg — holding cost $693")
- **Action buttons (full-width row at bottom):**
  - **Confirm** (green, primary)
  - **Edit** (ghost button) — opens parameters for adjustment
  - **Reject** (red text link)
- **State after action:**
  - Confirmed: card turns grey with a green checkmark; action details remain visible
  - Rejected: card struck through; reason field optionally appears
- Cards are **never auto-dismissed**. They persist in thread history.

### SupplierCard

Used in: supplier table expanded view (slide-in), FlowSight supplier node pop-over,
chat thread when a supplier is discussed.

- Supplier name + tier badge (Tier 1 / Tier 2 / Trial)
- **Reliability halo:** animated ring; colour and pulse speed map to reliability
- **MOQTaxBadge:** (see below)
- Stats grid: fill rate, on-time rate, window compliance (day chosen vs. window),
  avg delivery latency
- Contract: start / expiry dates + days remaining chip (green > 90d, amber 30–90d, red < 30d)
- Active PO count + pending negotiation draft count (orange pill)

### MOQTaxBadge

A compact, self-contained pill used on SupplierCards and FlowSight nodes.

- Displays: "MOQ-tax: $1,840" in amber on dark amber background
- Tooltip on hover: full breakdown per order, total this quarter, threshold, progress bar
- When over $3 K threshold: pill turns red and pulses; inline "Draft negotiation" CTA appears
- When $0: badge is hidden

### YieldCounter

Shown in the FactoryView slide-in panel, one per active production line.

- Large number: actual yield % (e.g., "93.4%") — red if below target (default 95%)
- Subtitle: "Target: 97.1% | Variance: −3.7 pp"
- Dollar counter: "$2,341 lost this shift" — ticking up in red in real time
- Anomaly badge: if agent has diagnosed a cause → *"⚠ Dough divider drift"* + "View work order" link
- 8-hour sparkline of yield %

### ScheduleDiff

(See `/schedule` page spec above for full detail.)

Reusable component — also appears in the chat thread when the SchedulerAgent proposes
a schedule and in the FactoryView panel for the relevant plant.

### LotGenealogyGraph

react-flow directed graph. Reused in the `/materials` lot detail slide-in.

- Node types: ingredient lot (blue), production run (grey), finished-goods pallet (green),
  at-risk lot (amber border), recalled / written-off (red)
- Edges labelled with kg consumed
- Pan/zoom; selected node highlights its full connected path
- Recall simulation mode: user selects a lot; graph highlights all downstream pallets

### TimeScrubber

Fixed to the bottom of the FlowSight canvas only.

- 24-hour timeline bar with coloured event markers
- Draggable playhead
- Play / Pause / 2× / 5× controls
- "LIVE" pill; clicking jumps to head

### LayerToggle

Floating panel on FlowSight canvas. Eight rows, each with:
- Icon
- Layer name
- Count badge (active items on that layer)
- Toggle switch

### ChatBox

Used on both `/chat` (full-page) and in the chat drawer (all other pages).

- Expandable text input
- Microphone button → VoiceLog overlay
- Suggested prompts chips (fade after first message)
- Tool-call breadcrumb pills above responses

---

## Key interaction flows

### Flow A — Shortage response

1. Plant 1 flashes amber on FlowSight (Risk layer on).
2. User clicks plant → FactoryView slides in.
3. Agent streams: *"0.8 kg blueberries on hand; 12 kg needed. Substitutes:
   lemon poppy seed (full capacity, 98% compat), chocolate chip (95% compat)."*
4. ActionCard with two choices. User confirms substitution.
5. Schedule re-tiles in Gantt view; truck spawns from Supplier B on canvas;
   waste counter in bottom strip increments.

### Flow B — Supplier disruption → negotiation draft

1. Risk layer fires: Supplier C halo turns red, news ticker fires.
2. Agent surfaces a bridge PO to Supplier A as an ActionCard.
3. User confirms → arc animates on canvas.
4. MOQTaxBadge on Supplier A increments. If > $3 K: badge pulses red, inline
   "Draft negotiation" CTA appears.
5. User clicks → NegotiationDraft appears in chat for review and send.

### Flow C — Retailer PO spike

1. Costco PO arrives 35% above forecast.
2. Agent offers 3 options as an ActionCard with an attached ScheduleDiff.
3. User picks "partial fulfil + negotiate" → NegotiationDraft email appears.

### Flow D — Yield anomaly → CMMS work order

1. YieldCounter on Line 2 turns red.
2. YieldAgent: *"Dough divider drift — last calibrated 47 days ago."*
3. ActionCard: "Draft CMMS work order — Dough Divider Line 2 — Priority High."
4. User confirms → work order posts; anomaly marker appears on timeline scrubber.

### Flow E — FEFO pallet recovery

1. Shelf-life layer on: Plant 3 warehouse shows 12 red pallets.
2. Agent ranks 3 recovery options per pallet group: reroute / donate / write off.
3. ActionCard per group with cost/credit breakdown. One click per group.

---

## Visual language

| Token | Value / guidance |
|---|---|
| Background | `#0a0d14` — near-black, not pure black |
| Surface cards | `bg-slate-800` / `bg-slate-900` |
| Borders | `border-slate-700` |
| Primary action | Electric blue `#3b82f6` (Tailwind `blue-500`) |
| Risk red | `#ef4444` (`red-500`), pulsing animation on critical states |
| Warning amber | `#f59e0b` (`amber-500`) |
| Success green | `#22c55e` (`green-500`) |
| Text primary | `text-slate-100` |
| Text secondary | `text-slate-400` |
| Text danger | `text-red-400` |
| Large metric numbers | Tabular-nums, 4xl–6xl, bold; never truncated |
| Node halos (canvas) | CSS/WebGL gaussian blur glow in halo colour; intensity ∝ severity |
| Transitions | `transition-all duration-200`; no janky layout shifts |
| Dark mode | Dark mode only — no light mode toggle |

**Fonts:** A clean sans-serif for prose; monospace or tabular-nums for all numbers,
IDs, quantities, and dollar amounts.

---

## Shared data contracts (from `shared/schemas/`)

Components receive these shapes from the backend. Design must accommodate all fields.

**ActionCard:** `type, action_id, agent, summary{}, details{}, risk_flags[], buttons[]`

**IngredientLot:** `lot_id, ingredient_name, facility_id, quantity_kg, expiry_date, days_until_expiry, storage_type, spoilage_risk_score (0–1), status`

**SupplierOrder (PO):** `order_id, supplier_id, ingredient, quantity_kg, unit_price, moq_overage_kg, holding_cost_per_kg_per_day, days_held, total_landed_cost, delivery_day, status`

**ScheduleDiff:** `diff_id, before[], after[], changes[]{run_id, change_type, narration}, waste_avoided_kg, waste_avoided_dollars, changeover_delta`

**NegotiationDraft:** `draft_id, supplier_id, trigger_type, subject, body, supporting_data{}, status (pending|sent|accepted|rejected)`

**VoiceUpdate:** `audio_ref, transcript, parsed_delta{ingredient, quantity_kg, direction}, verification_level, verification_chain[], confidence_score`

---

## Demo script (5 minutes — design must support this path)

| Time | Action | What the user sees |
|---|---|---|
| 0:00 | Open `/facilities` | Canada map; 4 plant nodes; supplier rail left; retailer rail right; 2 plants flashing amber |
| 0:30 | Click amber Plant 1 | FactoryView slides in; agent streams shortage alert; ActionCard appears |
| 1:15 | Confirm substitution | Schedule re-tiles; truck spawns; waste counter increments |
| 2:00 | Risk layer on — ticker fires | Supplier C halo turns red; bridge PO ActionCard appears |
| 2:30 | Chat: "How much are we over-ordering from Supplier A due to MOQs?" | "$1,840 this quarter. Threshold: $3,000." MOQTaxBadge shown |
| 3:00 | Navigate to `/scorecard` | Supplier table shows; Costco PO alert visible; negotiation draft pending |
| 3:45 | Navigate to `/schedule` | Gantt view; ScheduleDiff shown after yield anomaly triggers rescheduling |
| 4:30 | Shelf-life layer on | 12 red pallets in Plant 3; agent ranks FEFO recovery options |
| 4:50 | Bottom strip | $21 K waste avoided; 1.9 t CO2e; MOQ-tax $1,840 flagged; 3 disruptions caught |
