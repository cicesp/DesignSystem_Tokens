import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const reportPath = path.join(repoRoot, 'analysis', 'fluent-delta-report.json');
const generatedDir = path.join(repoRoot, 'generated', 'fluent');
const overridesJsonPath = path.join(generatedDir, 'fluent-theme-overrides.json');
const overridesTsPath = path.join(generatedDir, 'fluent-theme-overrides.ts');
const updatePlanPath = path.join(repoRoot, 'analysis', 'fluent-update-plan.json');

if (!fs.existsSync(reportPath)) {
  console.error('Missing analysis/fluent-delta-report.json. Run: npm run analyze:fluent-deltas');
  process.exit(1);
}

const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

if (!report.mappedThemes?.light || !report.mappedThemes?.dark) {
  console.error('Report does not include mapped themes. Re-run: npm run analyze:fluent-deltas');
  process.exit(1);
}

if (!fs.existsSync(generatedDir)) {
  fs.mkdirSync(generatedDir, { recursive: true });
}

function toPascalCase(raw) {
  return String(raw)
    .split(/[\s.-]+/)
    .filter(Boolean)
    .map(word => word[0].toUpperCase() + word.slice(1))
    .join('');
}

function toCssString(value) {
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value === 'number') {
    return String(value);
  }
  return String(value);
}

function toCustomTokenKey(tokenPath) {
  const parts = tokenPath.split('.').slice(1);
  return `cic${parts.map(toPascalCase).join('')}`;
}

function buildCustomModeValues(mode) {
  const entries = (report.unmappedModePaths ?? []).filter(item => item.mode === mode);
  const customValues = {};
  const customMetadata = {};

  for (const item of entries) {
    const customKey = toCustomTokenKey(item.tokenPath);
    const value = toCssString(item.resolvedValue ?? item.value);
    customValues[customKey] = value;
    customMetadata[customKey] = {
      tokenPath: item.tokenPath,
      value,
    };
  }

  return { customValues, customMetadata };
}

const lightCustom = buildCustomModeValues('light');
const darkCustom = buildCustomModeValues('dark');

const lightMerged = { ...report.mappedThemes.light, ...lightCustom.customValues };
const darkMerged = { ...report.mappedThemes.dark, ...darkCustom.customValues };

const overridesJson = {
  generatedAt: new Date().toISOString(),
  sourceReport: 'analysis/fluent-delta-report.json',
  fluentThemePackage: report.fluentThemePackage,
  modes: {
    light: lightMerged,
    dark: darkMerged,
  },
  customModes: {
    light: lightCustom.customMetadata,
    dark: darkCustom.customMetadata,
  },
};

fs.writeFileSync(overridesJsonPath, `${JSON.stringify(overridesJson, null, 2)}\n`, 'utf8');

function toTsObjectLiteral(obj) {
  return JSON.stringify(obj, null, 2).replace(/"([^"]+)":/g, '$1:');
}

const tsSource = `import type { Theme } from '@fluentui/react-theme';
import { webLightTheme, webDarkTheme } from '@fluentui/react-theme';

// Generated from token source-of-truth files. Do not hand-edit.
export type TokenExtendedTheme = Theme & Record<string, string>;
export const tokenLightThemeOverrides: Record<string, string> = ${toTsObjectLiteral(lightMerged)};
export const tokenDarkThemeOverrides: Record<string, string> = ${toTsObjectLiteral(darkMerged)};

export const tokenLightTheme: TokenExtendedTheme = { ...webLightTheme, ...tokenLightThemeOverrides };
export const tokenDarkTheme: TokenExtendedTheme = { ...webDarkTheme, ...tokenDarkThemeOverrides };
`;

fs.writeFileSync(overridesTsPath, tsSource, 'utf8');

function getEditTarget(mode, tokenKey) {
  if (tokenKey.startsWith('font') || tokenKey.startsWith('lineHeight')) {
    return '.cache/fluentui_sparse/packages/tokens/src/global/fonts.ts';
  }
  if (tokenKey.startsWith('spacing')) {
    return '.cache/fluentui_sparse/packages/tokens/src/global/spacings.ts';
  }
  if (tokenKey.startsWith('borderRadius')) {
    return '.cache/fluentui_sparse/packages/tokens/src/global/borderRadius.ts';
  }
  if (tokenKey.startsWith('strokeWidth')) {
    return '.cache/fluentui_sparse/packages/tokens/src/global/strokeWidths.ts';
  }
  if (tokenKey.startsWith('color')) {
    return mode === 'light'
      ? '.cache/fluentui_sparse/packages/tokens/src/alias/lightColor.ts + lightColorPalette.ts'
      : '.cache/fluentui_sparse/packages/tokens/src/alias/darkColor.ts + darkColorPalette.ts';
  }
  return 'Unknown target';
}

function buildDeltaTargets(modeDeltas, mode) {
  const targetMap = new Map();
  for (const delta of modeDeltas) {
    const target = getEditTarget(mode, delta.tokenKey);
    const list = targetMap.get(target) ?? [];
    list.push(delta);
    targetMap.set(target, list);
  }
  return [...targetMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([targetFile, deltas]) => ({
      targetFile,
      deltaCount: deltas.length,
      deltas,
    }));
}

const updatePlan = {
  generatedAt: new Date().toISOString(),
  sourceReport: 'analysis/fluent-delta-report.json',
  fluentThemePackage: report.fluentThemePackage,
  summary: report.summary,
  updateTargets: {
    brand: {
      targetFile: '.cache/fluentui_sparse/packages/tokens/src/global/brandColors.ts',
      deltaCount: report.deltas.brand.length,
      deltas: report.deltas.brand,
    },
    light: buildDeltaTargets(report.deltas.light.deltas, 'light'),
    dark: buildDeltaTargets(report.deltas.dark.deltas, 'dark'),
  },
  unmappedModePaths: report.unmappedModePaths,
  unresolvedReferences: report.unresolvedReferences,
  mappingConflicts: report.mappingConflicts,
};

fs.writeFileSync(updatePlanPath, `${JSON.stringify(updatePlan, null, 2)}\n`, 'utf8');

console.log('Generated:');
console.log(`- ${path.relative(repoRoot, overridesJsonPath)}`);
console.log(`- ${path.relative(repoRoot, overridesTsPath)}`);
console.log(`- ${path.relative(repoRoot, updatePlanPath)}`);
