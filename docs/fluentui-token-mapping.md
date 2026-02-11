# Fluent UI Token Mapping Notes

## Scope

This document captures how the local Figma-exported token JSON maps to Fluent UI React v9 tokens and where to edit Fluent if you choose to fork it.

- Fluent source snapshot used for structure review: `.cache/fluentui_sparse` at commit `75fd73137fdf2f00e679c23568cad3d876a00799` (2026-02-10).
- Fluent runtime package used for default-value comparison: `@fluentui/react-theme@9.2.1`.

## Fluent code structure (token pipeline)

Core token composition in Fluent:

- Token assembly:
  - `.cache/fluentui_sparse/packages/tokens/src/utils/createLightTheme.ts`
  - `.cache/fluentui_sparse/packages/tokens/src/utils/createDarkTheme.ts`
- Generated semantic and palette aliases:
  - `.cache/fluentui_sparse/packages/tokens/src/alias/lightColor.ts`
  - `.cache/fluentui_sparse/packages/tokens/src/alias/darkColor.ts`
  - `.cache/fluentui_sparse/packages/tokens/src/alias/lightColorPalette.ts`
  - `.cache/fluentui_sparse/packages/tokens/src/alias/darkColorPalette.ts`
- Global scales/primitives:
  - `.cache/fluentui_sparse/packages/tokens/src/global/brandColors.ts`
  - `.cache/fluentui_sparse/packages/tokens/src/global/colors.ts`
  - `.cache/fluentui_sparse/packages/tokens/src/global/spacings.ts`
  - `.cache/fluentui_sparse/packages/tokens/src/global/borderRadius.ts`
  - `.cache/fluentui_sparse/packages/tokens/src/global/strokeWidths.ts`
  - `.cache/fluentui_sparse/packages/tokens/src/global/fonts.ts`
- Provider CSS var injection:
  - `.cache/fluentui_sparse/packages/react-components/react-provider/library/src/components/FluentProvider/createCSSRuleFromTheme.ts`

## Local token mapping model

Implemented in `scripts/fluent-token-delta-report.mjs`:

- `brand.json` -> Fluent `brandWeb` ramp (`Brand-10` to `Brand-160`).
- `layout.json` -> spacing, corner radius, stroke width theme tokens.
- `global.json` -> typography and stroke width theme tokens.
- `mode.json` -> light/dark semantic colors, brand colors, status colors, palette colors, shadows.

Special handling included:

- `Status.Danger.Foreground.3.Hover/Pressed` mapped to Fluent `colorStatusDangerBackground3Hover/Pressed`.
- Value normalization handles:
  - hex and `rgba(...)` equivalence,
  - `0` vs `0px`,
  - semantic weight names (`Regular`, `Semibold`, `Bold`) vs numeric Fluent weights.

## Latest delta run

Read the current run metadata from `analysis/fluent-delta-report.json` (`generatedAt` + `summary`).

Current summary snapshot (after `npm run sync:fluent-source`):

- `lightMappedTokens`: 396
- `darkMappedTokens`: 396
- `lightDeltas`: 138
- `darkDeltas`: 134
- `brandDeltas`: 0 (brand ramp was synced into Fluent source)
- `unmappedModePaths`: 38
- `unresolvedReferences`: 0
- `mappingConflicts`: 0
- `duplicateTokenPaths`: 2 (intentional duplicate names in global/layout for corner radius)

Unmapped paths are concentrated in:

- `Status.Severe` (not part of Fluent status token set)
- `Status.Oof`, `Status.Away`, `Status.Available` (custom statuses)
- `Material.Acrylic.*` (custom acrylic tokens)
- `Palette.Marigold.Foreground.1.Rest 2` (duplicate variant name not present in Fluent schema)

These are now ported as custom `cic*` CSS variables in generated Fluent overrides (`generated/fluent/fluent-theme-overrides.json` -> `customModes`).

## Source-of-truth sync process (repeatable)

When token files change, run this workflow in order:

1. `npm run analyze:fluent-deltas`
2. `npm run generate:fluent-sync`
3. `npm run verify:fluent-sync`
4. `npm run sync:fluent-source`

Artifacts produced:

- `analysis/fluent-delta-report.json`: Full mapping + delta report.
- `analysis/fluent-update-plan.json`: Grouped update targets by Fluent file.
- `generated/fluent/fluent-theme-overrides.json`: Machine-readable light/dark overrides.
- `generated/fluent/fluent-theme-overrides.ts`: Drop-in TypeScript theme overrides.
- `.cache/fluentui_sparse/packages/tokens/src/themes/web/designTokenOverrides.ts`: Fluent source-level override map used by web themes.

Verification gates:

- Fails on unresolved token references.
- Fails on mapping conflicts.
- Fails when generated overrides drift from token-derived values.
- Fails on new unmapped token paths unless allowlisted in `scripts/fluent-sync-allowlist.json`.
- Fails when any allowlisted unmapped token path is not ported into generated custom overrides.

This gives a deterministic loop for repeated updates: edit/export tokens, regenerate, verify, ship.

## Approach A (recommended): app-level theme override

Keep Fluent upstream unchanged; apply your brand + token deltas in your app:

1. Consume `generated/fluent/fluent-theme-overrides.ts`.
2. Use `tokenLightTheme` / `tokenDarkTheme` with `FluentProvider`.
3. Re-run `npm run verify:fluent-sync` after every token update.

This avoids maintaining a Fluent fork and survives Fluent upgrades.

## Approach B: fork Fluent tokens

If you need library-level defaults to match your design system:

1. Read grouped edit targets from `analysis/fluent-update-plan.json`.
2. Update brand ramp in `.cache/fluentui_sparse/packages/tokens/src/global/brandColors.ts`.
3. Update primitive scales in:
   - `.cache/fluentui_sparse/packages/tokens/src/global/spacings.ts`
   - `.cache/fluentui_sparse/packages/tokens/src/global/borderRadius.ts`
   - `.cache/fluentui_sparse/packages/tokens/src/global/strokeWidths.ts`
   - `.cache/fluentui_sparse/packages/tokens/src/global/fonts.ts`
4. Update semantic/palette mappings in alias generation sources (not hand-editing generated files unless you also own regeneration).
5. Run `npm run sync:fluent-source` to apply token-derived values directly into Fluent source files.
6. Rebuild your Fluent fork, then re-run `npm run analyze:fluent-deltas` against that build until deltas are as expected.

Important: alias files include `DO NOT EDIT` banners in Fluent. If you fork Fluent, make sure changes are made in the true source for those generated artifacts.

## Extending Fluent for custom statuses/material

For `Severe`, `Oof`, `Away`, `Available`, and acrylic material tokens:

- Add new tokens to Fluent theme type + token object if you want first-class token support.
- Or keep them as app-level custom CSS variables/theme extensions outside Fluent core token type.

## Using this as a reusable tool

If another engineer wants to take this toolkit and apply your brand/tokens to any Fluent clone, use this process.

### Files to take

Minimum files to copy:

- Token source files:
  - `brand.json`
  - `global.json`
  - `layout.json`
  - `mode.json`
- Sync scripts:
  - `scripts/fluent-token-delta-report.mjs`
  - `scripts/generate-fluent-sync-artifacts.mjs`
  - `scripts/verify-fluent-sync.mjs`
  - `scripts/apply-fluent-source-sync.mjs`
  - `scripts/fluent-sync-allowlist.json`
- `package.json` script entries + `@fluentui/react-theme` dev dependency.

### One-time setup

1. Clone Fluent repo locally (for example `C:\work\fluentui`).
2. In this token repo, run `npm install`.
3. Set Fluent target path for sync:
   - PowerShell: `$env:FLUENT_REPO_PATH='C:\work\fluentui'`
   - Or rely on default `.cache/fluentui_sparse`.

### Update Fluent from tokens (repeatable)

Run one command:

1. `npm run sync:fluent-source`

This performs:

1. Delta analysis from token files.
2. Generated remap artifacts under `generated/fluent/`.
3. Direct source patching in Fluent:
   - `packages/tokens/src/global/brandColors.ts`
   - `packages/tokens/src/global/spacings.ts`
   - `packages/tokens/src/global/borderRadius.ts`
   - `packages/tokens/src/global/strokeWidths.ts`
   - `packages/tokens/src/global/fonts.ts`
   - `packages/tokens/src/themes/web/designTokenOverrides.ts`
   - `packages/tokens/src/themes/web/lightTheme.ts`
   - `packages/tokens/src/themes/web/darkTheme.ts`

### What to commit in Fluent

In the Fluent clone, commit the files changed by `npm run sync:fluent-source` (see list above).  
That commit is the token->Fluent remap for your current brand/version.

### Generated file for app-level usage

If you do not want to fork Fluent, use this generated file directly in your app:

- `generated/fluent/fluent-theme-overrides.ts`

It exports:

- `tokenLightTheme`
- `tokenDarkTheme`

Use those in `FluentProvider` to remap Fluent runtime theme values to your tokens without changing Fluent source.
