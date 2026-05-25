---
name: update-tasks
description: Update TASKS.md to mark atomic tasks as `in_progress`, `done`, or `todo` as features get built. Use when the user finishes or starts a task listed in TASKS.md (e.g. F1.1, NF.R.5, S.3), or asks to "mark X done", "update task status", "flip task to in progress", or "track progress on TASKS.md". Accepts one or more task IDs and a status keyword.
---

# update-tasks

Update `TASKS.md` so it reflects what's actually shipped vs. in flight vs. not started.

## When to use

- The user finished a task -> mark it `done`
- The user just started a task -> mark it `in_progress`
- A task is being pulled back into the queue -> mark it `todo`

If the user is building a feature and the matching task in `TASKS.md` hasn't been flipped yet, invoke this skill rather than editing `TASKS.md` by hand.

## Invocation

Arguments are task IDs followed by a status keyword. The status is the last token; everything before it is treated as one or more IDs.

- `update-tasks F1.1 done`
- `update-tasks F1.1 F1.2 F1.3 in_progress`
- `update-tasks NF.R.5,NF.R.6 done`
- `update-tasks S.1 in_progress`

Status values: `todo`, `in_progress`, `done`.

If invoked with no args, ask the user which task IDs and what status before doing anything.

## What to do

1. **Read `TASKS.md`** at the repo root (`D:\Projects\BakeryPilot\TASKS.md` on this machine; just `TASKS.md` if working elsewhere).

2. **Locate each task body.** Tasks are level-3 headings:
   ```
   ### F1.1 [M3] Define `ingredient_lots` table
   ```
   Match by the ID that appears immediately after `### ` and before the ` [`. Co-owned tasks like `F1.20 [M2+M3]` use the same match -- the ID is just `F1.20`.

3. **Update the status line in each task body.** Each task body should have `**Status:** <value>` as its first content line, right after the heading. Cases:
   - **Already present:** replace the value (e.g. `**Status:** todo` becomes `**Status:** in_progress`).
   - **Missing:** insert `**Status:** <value>` on its own line immediately after the heading's blank line, before the existing `**What:**` line.

4. **Update the master index table** (under the heading `# Master task index`):
   - If the header is still `| ID | Owner | Title |`, extend the header row to `| ID | Owner | Title | Status |`. Also extend the alignment row to add a column. For every existing data row, append ` | todo |` so the columns stay aligned. Do this exactly once -- on first invocation.
   - For each updated task, set its row's Status cell to the new value.
   - **Do not reorder rows.** They're sequenced deliberately.

5. **Report back** in a compact summary:
   ```
   Updated:
     F1.1 -> done
     F1.2 -> in_progress
   Not found:
     F9.9
   ```

## Constraints

- Don't touch any other content in `TASKS.md`. No reformatting, no reordering, no fixing typos.
- Never mark a task `done` if all its acceptance criteria checkboxes are still `[ ]` (empty). If that's the case, ask the user to either confirm (override) or to tick the relevant boxes first.
- Stretch goals (`S.1`-`S.6`) follow the same shape -- update their `Status:` line and master-index row the same way.
- Use one `Edit` call per task body (with `replace_all=false`). Don't rewrite the whole file with `Write`.
- If a status value is unrecognized (e.g. `complete`, `wip`, `blocked`), reject it and list the three valid values. Don't guess.

## Status conventions

| Status | Meaning |
| --- | --- |
| `todo` | Default. Not started. |
| `in_progress` | Work has begun; relevant files are being edited or a PR is open. |
| `done` | All acceptance criteria met and merged to `main`. |

`done` is a one-way trip in normal flow. Rolling back requires an explicit invocation with `todo` or `in_progress` and is fine -- the skill should not refuse it.

## Example session

User: `update-tasks F1.1 F1.2 done`

Skill behavior:
1. Reads `TASKS.md`.
2. Finds `### F1.1 [M3] Define ...` -- inserts `**Status:** done` after the heading.
3. Finds `### F1.2 [M3] Define ...` -- inserts `**Status:** done` after the heading.
4. Notices the master index lacks a Status column -- adds it (header + alignment + ` | todo |` on every existing data row).
5. Updates rows for F1.1 and F1.2 to show `done` in the Status cell.
6. Prints:
   ```
   Updated:
     F1.1 -> done
     F1.2 -> done
   ```
