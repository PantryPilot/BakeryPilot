---
name: add-translation
description: Add or update a UI string translation in BakeryPilot's i18n dictionary (English + French). Use this skill whenever someone asks to "translate", "add a string in French", "add French copy", "add a translation key", "update i18n", "make the UI bilingual", or "translate the [page/component] to French". Also use it proactively when introducing a new UI label that should be available in both languages.
---

# add-translation

Add or change a translated UI string in BakeryPilot. Translations live in a single typed dictionary at [frontend/src/lib/i18n.ts](frontend/src/lib/i18n.ts) and are consumed via the `t(key)` helper exposed on `useApp()`.

## When to use

- A user asks: "translate X to French", "add a French label for Y", "the [page] needs to be bilingual"
- A user adds a new UI label, button text, page heading, placeholder, or error message that should also be available in French
- A user wants to enable a new language (third locale beyond `en` and `fr`) — that is a structural change; still use this skill to scaffold it

If the request is about translating ONE-OFF agent output (LLM responses), that is NOT this skill — those should be handled by changing the agent's system prompt, not the i18n dictionary.

## Invocation

Arguments are pairs of `<key>` and `<phrase>`, plus optional `--fr "<phrase>"` to provide the French copy in the same call. Examples:

- `add-translation sidebar.reports "Reports" --fr "Rapports"`
- `add-translation copilot.error "Something went wrong" --fr "Une erreur s'est produite"`
- `add-translation btn.export "Export"` (no `--fr`: skill will prompt for the French copy or call out that it's missing so a francophone teammate can fill it in)

If invoked with no arguments, ask which UI element should be translated (a screenshot or component path is helpful) and what the English copy is. Do not invent translations silently.

## What to do

1. **Read [frontend/src/lib/i18n.ts](frontend/src/lib/i18n.ts).** Confirm the file structure: two dictionaries `en` and `fr`, the `Dictionary` type derives keys from `en` (so French entries are type-checked against the English set).

2. **Decide the key.** Follow the existing namespacing convention:
   - `sidebar.*` — left navigation
   - `topbar.*` — header controls and live badges
   - `bottom.*` — bottom-strip KPI labels
   - `btn.*` — generic button labels reused across the app
   - `copilot.*` — chat / copilot strings
   - `status.*` — short status pills (healthy / attention / critical)
   - For a new page, use a new namespace named after the route: `production.*`, `materials.*`, `schedule.*`, etc.

3. **Insert the new entry in BOTH dictionaries.** The `en` dictionary's keys define the type — adding a key to `en` REQUIRES adding the same key to `fr`, otherwise TypeScript will error. Use one Edit call per dictionary, inserted in the appropriate namespace block (not appended to the end).

4. **Replace the hardcoded string in the component.** Find the component file that owns the original English string (commonly `frontend/src/components/Shell.tsx`, the page under `frontend/src/app/<route>/page.tsx`, or `frontend/src/components/ChatDrawer.tsx`). Destructure `t` from `useApp()` if it isn't already, then swap the literal string for `{t("namespace.key")}`. Do NOT leave the English literal behind — the whole point is to remove the hardcoded copy.

5. **Type-check.** Run `cd frontend && npx tsc --noEmit` and confirm there are no new errors. The most common failure is a typo'd key (TypeScript will tell you the closest match) or forgetting to add the French entry.

6. **Verify the toggle works.** Open `/facilities` (or any page) in the browser, click the `EN`/`FR` button in the top bar, and confirm the new string switches. The `data-lang` attribute on `<html>` should change and the choice persists in `localStorage` under `bakerypilot.language`.

7. **Report back.** Concise summary:
   ```
   Added:
     sidebar.reports
       en: Reports
       fr: Rapports
   Used in:
     frontend/src/components/Shell.tsx:18
   ```

## Constraints

- Never invent a French translation. If the user only provides English, add the key in `en` and put a `TODO_FR:` prefix on the French value, then list the placeholder in the report so a francophone reviewer can fix it. Example:
  ```ts
  "btn.export": "TODO_FR: Export",
  ```
  This is intentionally ugly so it's obvious in the UI that a string isn't translated yet.
- Don't add a new namespace without a reason. Reuse existing ones first.
- Don't replace strings that come from the backend (supplier names, SKU names, error messages from the API) — those are data, not UI labels, and translating them belongs in the agent layer or backend, not the dictionary.
- Don't translate file names, route segments, or test IDs.
- Don't bypass the `t()` helper by reading `language` directly and switching on it — that defeats the type-checked dictionary.

## Adding a new locale

If asked to add a third language (e.g. Spanish):
1. Add the language code to `SUPPORTED_LANGUAGES` and `Language` type in `i18n.ts`.
2. Add a new `LANGUAGE_LABEL` and `LANGUAGE_NAME` entry.
3. Add a `const es: Dictionary = { ... }` block that mirrors all keys in `en`.
4. Add it to `DICTIONARIES`.
5. Update the language toggle button in [Shell.tsx](frontend/src/components/Shell.tsx) — the current button cycles `en ⇄ fr`; with three+ locales swap it for a dropdown.

## Example session

User: `add-translation production.title "Production runs" --fr "Lancements de production"`

Skill behavior:
1. Reads `frontend/src/lib/i18n.ts`.
2. Inserts `"production.title": "Production runs"` into the `en` dict under a new `// Production page` comment.
3. Inserts `"production.title": "Lancements de production"` into the `fr` dict at the matching location.
4. Greps for the literal string `"Production runs"` in `frontend/src/app/production/`, finds the heading, replaces it with `{t("production.title")}`.
5. Destructures `t` from `useApp()` at the top of the production page component if missing.
6. Runs `npx tsc --noEmit` to confirm.
7. Reports:
   ```
   Added:
     production.title
       en: Production runs
       fr: Lancements de production
   Used in:
     frontend/src/app/production/page.tsx:14
   ```
