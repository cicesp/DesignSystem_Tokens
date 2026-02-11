# Design System Tokens

This repo contains design tokens exported from Figma as JSON.

## Source of truth

- **Export tool:** Tokens are exported from Figma using the **W3C Tokens Export** plugin.
- **Base library:** Tokens originate from the **Fluent Official Figma Library**.
- **Brand colors:** The `brand.json` palette was created by **CIC** in **February 2026**.

> The JSON files in this repo are treated as generated artifacts. If something looks wrong, fix it in Figma and re-export.

## Token format

Tokens are stored as JSON objects using common W3C design-token fields:

- `value`: A literal (for example `"#0065b4"`) or an alias/reference (for example `"{Colors.Neutral.White}"`).
- `type`: The token type. This repo currently includes `color`, `number`, and `fontFamily`.
- `prefix`: A namespace/group identifier emitted during export (often matching the filename). Consumers can ignore this if they don't need it.

### References (aliases)

References use a `{Path.To.Token}` syntax. Consumers must resolve these aliases when building platform outputs (CSS variables, iOS/Android resources, etc.).

### Naming

Token names/keys may include spaces and punctuation exactly as authored in Figma (for example `"Grey 10"` or `"Brand-120"`). Treat token paths as case-sensitive and do not assume keys are normalized.

## Files

All token sets live at the repo root:

- `global.json`: Global primitives (for example color ramps and base values).
- `mode.json`: Theme/mode-specific semantic tokens (for example `light` and `dark`).
- `layout.json`: Shared layout primitives (spacing, corner radius, stroke widths, etc.).
- `brand.json`: Brand palette (CIC, Feb 2026).
- `*.json` (other files): Component- or pattern-specific token sets (cards, dividers, avatars, menus, etc.).

## Updating tokens

1. Open the source Figma file/library (Fluent Official Figma Library + any local brand additions).
2. Run the **W3C Tokens Export** plugin.
3. Export the token sets to JSON, keeping filenames stable.
4. Commit the updated JSON files.

## Using these tokens

This repo intentionally ships only the exported token JSON. Typical usage is:

- Import these JSON files into your token build pipeline (for example Style Dictionary or a custom transformer).
- Resolve `{...}` references.
- Emit platform outputs (CSS variables, TypeScript constants, Android XML, iOS Swift, etc.).

## Notes

- Color values are hex strings; some include alpha (for example `#00000033`).
- Numeric values are unitless in JSON; interpret them in your platform context (commonly px/dp).

## Fluent UI Mapping Analysis

This repo includes a repeatable Fluent sync workflow:

1. Install dependencies: `npm install`
2. Analyze token deltas: `npm run analyze:fluent-deltas`
3. Generate sync artifacts: `npm run generate:fluent-sync`
4. Verify token-driven sync: `npm run verify:fluent-sync`
5. Apply updates into Fluent source clone: `npm run sync:fluent-source`

Key outputs:

- `analysis/fluent-delta-report.json`: mapped coverage + per-token deltas.
- `analysis/fluent-update-plan.json`: grouped file targets for Fluent fork edits.
- `generated/fluent/fluent-theme-overrides.ts`: app-level Fluent theme overrides from token values.
- `.cache/fluentui_sparse/packages/tokens/src/themes/web/designTokenOverrides.ts`: Fluent source override map generated from tokens.

For a full reusable handoff workflow (what files to copy, how to target another Fluent clone, and what to commit), see `docs/fluentui-token-mapping.md`.
