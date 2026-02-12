# Fluent Token Sync Quickstart

Use this when you want to remap Fluent token values to match `brand.json`, `global.json`, `layout.json`, and `mode.json`.

## 1. Prerequisites

- Run from this repo root.
- Node + npm installed.
- Fluent repo cloned locally (if you want to patch Fluent source).

## 2. Install

```powershell
npm install
```

## 3. Point to Fluent repo (optional but recommended)

If you want to patch a Fluent clone outside this repo:

```powershell
$env:FLUENT_REPO_PATH='C:\work\fluentui'
```

If omitted, sync targets `.cache/fluentui_sparse`.

## 4. Run full sync

```powershell
npm run sync:fluent-source
```

This will:

1. Analyze token vs Fluent deltas.
2. Generate remap artifacts.
3. Verify sync rules.
4. Patch Fluent source values.

## 5. Files patched in Fluent

- `packages/tokens/src/global/brandColors.ts`
- `packages/tokens/src/global/spacings.ts`
- `packages/tokens/src/global/borderRadius.ts`
- `packages/tokens/src/global/strokeWidths.ts`
- `packages/tokens/src/global/fonts.ts`
- `packages/tokens/src/themes/web/designTokenOverrides.ts`
- `packages/tokens/src/themes/web/lightTheme.ts`
- `packages/tokens/src/themes/web/darkTheme.ts`

## 6. Commit in Fluent repo

Commit the patched files above in your Fluent clone.

## 7. App-level (no Fluent fork) option

Use generated overrides directly:

- `generated/fluent/fluent-theme-overrides.ts`

It exports `tokenLightTheme` and `tokenDarkTheme` for `FluentProvider`.
