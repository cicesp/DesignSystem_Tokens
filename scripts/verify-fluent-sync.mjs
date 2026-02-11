import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const reportPath = path.join(repoRoot, 'analysis', 'fluent-delta-report.json');
const overridesPath = path.join(repoRoot, 'generated', 'fluent', 'fluent-theme-overrides.json');
const allowlistPath = path.join(repoRoot, 'scripts', 'fluent-sync-allowlist.json');

for (const requiredPath of [reportPath, allowlistPath]) {
  if (!fs.existsSync(requiredPath)) {
    console.error(`Missing required file: ${path.relative(repoRoot, requiredPath)}`);
    process.exit(1);
  }
}

const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const allowlist = JSON.parse(fs.readFileSync(allowlistPath, 'utf8'));

if (!fs.existsSync(overridesPath)) {
  console.error('Missing generated/fluent/fluent-theme-overrides.json. Run: npm run generate:fluent-sync');
  process.exit(1);
}
const overrides = JSON.parse(fs.readFileSync(overridesPath, 'utf8'));

function canonical(value) {
  return String(value).trim().toLowerCase().replace(/\s+/g, '');
}

const failures = [];

if (!report.mappedThemes?.light || !report.mappedThemes?.dark) {
  failures.push('Report missing mappedThemes; run npm run analyze:fluent-deltas');
}

if ((report.summary?.unresolvedReferences ?? 0) > 0) {
  failures.push(`Unresolved token references: ${report.summary.unresolvedReferences}`);
}
if ((report.summary?.mappingConflicts ?? 0) > 0) {
  failures.push(`Mapping conflicts: ${report.summary.mappingConflicts}`);
}

const allowedDuplicatePaths = new Set(allowlist.allowedDuplicateTokenPaths ?? []);
for (const duplicate of report.duplicateTokenPaths ?? []) {
  if (!allowedDuplicatePaths.has(duplicate.tokenPath)) {
    failures.push(`Unexpected duplicate token path: ${duplicate.tokenPath}`);
  }
}

function isAllowedUnmapped(tokenPath) {
  if ((allowlist.allowedUnmappedExact ?? []).includes(tokenPath)) {
    return true;
  }
  return (allowlist.allowedUnmappedPrefixes ?? []).some(prefix => tokenPath.startsWith(prefix));
}

for (const unmapped of report.unmappedModePaths ?? []) {
  if (!isAllowedUnmapped(unmapped.tokenPath)) {
    failures.push(`Unmapped token path not allowlisted: ${unmapped.tokenPath}`);
  }
}

for (const mode of ['light', 'dark']) {
  const expectedTheme = report.mappedThemes?.[mode] ?? {};
  const generatedTheme = overrides.modes?.[mode] ?? {};
  const expectedKeys = Object.keys(expectedTheme).sort();

  for (const key of expectedKeys) {
    if (!(key in generatedTheme)) {
      failures.push(`${mode} override missing key: ${key}`);
      continue;
    }
    if (canonical(expectedTheme[key]) !== canonical(generatedTheme[key])) {
      failures.push(
        `${mode} override value mismatch for ${key}: expected "${expectedTheme[key]}", found "${generatedTheme[key]}"`,
      );
    }
  }
}

for (const mode of ['light', 'dark']) {
  const unmapped = (report.unmappedModePaths ?? []).filter(item => item.mode === mode);
  const customMode = overrides.customModes?.[mode] ?? {};
  const byTokenPath = new Map();
  for (const [customKey, meta] of Object.entries(customMode)) {
    byTokenPath.set(meta.tokenPath, { customKey, value: meta.value });
  }

  for (const item of unmapped) {
    const mapped = byTokenPath.get(item.tokenPath);
    if (!mapped) {
      failures.push(`${mode} unmapped token path not ported to custom override: ${item.tokenPath}`);
      continue;
    }

    const expectedValue = item.resolvedValue ?? item.value;
    if (canonical(mapped.value) !== canonical(expectedValue)) {
      failures.push(
        `${mode} custom override mismatch for ${item.tokenPath}: expected "${expectedValue}", found "${mapped.value}"`,
      );
    }

    const generatedThemeValue = overrides.modes?.[mode]?.[mapped.customKey];
    if (canonical(generatedThemeValue) !== canonical(expectedValue)) {
      failures.push(
        `${mode} custom key missing or wrong in overrides.modes.${mode}: ${mapped.customKey} expected "${expectedValue}"`,
      );
    }
  }
}

if (failures.length) {
  console.error('Fluent token sync verification failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Fluent token sync verification passed.');
console.log(
  `Mapped tokens: light=${report.summary.lightMappedTokens}, dark=${report.summary.darkMappedTokens}. Unmapped allowlisted: ${report.summary.unmappedModePaths}.`,
);
