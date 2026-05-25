# Contributing to BakeryPilot

## Schema-freeze policy (NF.S.2)

The cross-service contracts live in two places:

- **SQL DDL:** [`infra/supabase/schema.sql`](infra/supabase/schema.sql)
- **JSON Schemas:** [`shared/schemas/*.schema.json`](shared/schemas) — declared as JSON Schema draft 2020-12; each has a non-empty `$id` and a top-level `version` integer.

M3 owns both. They were frozen by lunch on Day 1 of the hackathon, and everything downstream (agents, frontend, integration mocks) is built against them. The rules below keep the contract stable without blocking depth work in later phases.

### What you can do at any time (additive changes — no approval needed)

- Add a new table.
- Add a new optional column (`NOT NULL` with a default counts as optional).
- Add a new index, CHECK, or trigger.
- Add a new optional field to a JSON Schema (do not add it to `required`).
- Add a new `kind` to a discriminated union (e.g. `action_card.kind`).
- Add a new value to an `enum` that consumers treat as open-set.

When you make an additive change to a JSON Schema, **bump its `version` field by 1** and note the change in your PR description.

### What needs full-team agreement (breaking changes)

- Rename a table, column, JSON field, or enum value.
- Drop a column or table.
- Tighten a CHECK constraint or change a column type.
- Move a field from optional to `required` in a JSON Schema.
- Remove an enum value.

The path: open a PR titled `[schema-break] …`, post in the team channel, get explicit thumbs-up from each owner whose code reads the field, then merge. Update every consumer in the same PR.

### What is never allowed

- Editing the meaning of an existing column or field without a rename. ("This used to mean kg, now it's grams" with no rename is a silent break.)
- `UPDATE` or `DELETE` on append-only tables (`inventory_events`, and later `waste_events`, `moq_tax_ledger`). The `raise_append_only()` trigger enforces this — corrections are new rows.
- Editing migrations in place. `schema.sql` itself is append-only after Day 1: new tables are added to the bottom; new columns to existing tables go in clearly marked `-- ALTER TABLE …` blocks at the end.

## Why these rules exist

The walking skeleton (chat → tool → action card → confirm → DB write) must stay green every evening from Day 1 onward. Five engineers building in parallel against shifting contracts is how hackathons die. Additive-only is the cheapest way to let everyone move fast without stepping on each other.

See [README#key-engineering-rules](README.md#key-engineering-rules) for the broader engineering rule set.
