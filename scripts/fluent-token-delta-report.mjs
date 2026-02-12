import fs from 'node:fs';
import path from 'node:path';
import reactTheme from '@fluentui/react-theme';

const repoRoot = process.cwd();
const tokenDir = 'tokens';
const tokenFiles = ['brand.json', 'global.json', 'layout.json', 'mode.json'].map(fileName =>
  path.join(tokenDir, fileName),
);
const tokenIndex = new Map();
const resolvedCache = new Map();
const unresolvedRefs = [];
const mappingConflicts = [];
const unmappedPaths = [];
const duplicateTokenPaths = [];

const brandSteps = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160];
const baseSizes = ['100', '200', '300', '400', '500', '600'];
const heroSizes = ['700', '800', '900', '1000'];

const outputDir = path.join(repoRoot, 'analysis');
const outputPath = path.join(outputDir, 'fluent-delta-report.json');

const fluentThemes = {
  light: reactTheme.webLightTheme,
  dark: reactTheme.webDarkTheme,
};

const byMode = {
  light: new Map(),
  dark: new Map(),
};

function readJson(fileName) {
  const filePath = path.join(repoRoot, fileName);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function isLeafToken(node) {
  return node && typeof node === 'object' && Object.prototype.hasOwnProperty.call(node, 'value');
}

function flattenTokens(node, pathParts, sourceFile) {
  if (!node || typeof node !== 'object') {
    return;
  }

  if (isLeafToken(node)) {
    const tokenPath = pathParts.join('.');
    const nextToken = {
      sourceFile,
      tokenPath,
      value: node.value,
      type: node.type ?? 'unknown',
    };

    if (tokenIndex.has(tokenPath)) {
      duplicateTokenPaths.push({
        tokenPath,
        keptSourceFile: tokenIndex.get(tokenPath).sourceFile,
        ignoredSourceFile: sourceFile,
      });
      return;
    }

    tokenIndex.set(tokenPath, nextToken);
    return;
  }

  for (const [key, value] of Object.entries(node)) {
    flattenTokens(value, pathParts.concat(key), sourceFile);
  }
}

for (const fileName of tokenFiles) {
  flattenTokens(readJson(fileName), [], fileName);
}

function isReferenceValue(value) {
  return typeof value === 'string' && value.startsWith('{') && value.endsWith('}');
}

function resolveTokenPath(tokenPath, stack = []) {
  if (resolvedCache.has(tokenPath)) {
    return resolvedCache.get(tokenPath);
  }

  if (stack.includes(tokenPath)) {
    unresolvedRefs.push({
      type: 'circular',
      tokenPath,
      stack,
    });
    return undefined;
  }

  const token = tokenIndex.get(tokenPath);
  if (!token) {
    unresolvedRefs.push({
      type: 'missing',
      tokenPath,
      stack,
    });
    return undefined;
  }

  let resolved = token.value;
  if (isReferenceValue(token.value)) {
    const refPath = token.value.slice(1, -1);
    resolved = resolveTokenPath(refPath, stack.concat(tokenPath));
  }

  resolvedCache.set(tokenPath, resolved);
  return resolved;
}

function toPascalCase(raw) {
  return raw
    .split(/[\s-]+/)
    .filter(Boolean)
    .map(word => word[0].toUpperCase() + word.slice(1))
    .join('');
}

function normalizeTokenValue(tokenKey, value) {
  if (value === undefined || value === null) {
    return value;
  }

  if (typeof value === 'number') {
    if (
      tokenKey.startsWith('spacing') ||
      tokenKey.startsWith('borderRadius') ||
      tokenKey.startsWith('strokeWidth') ||
      tokenKey.startsWith('fontSize') ||
      tokenKey.startsWith('lineHeight')
    ) {
      return `${value}px`;
    }
    return String(value);
  }

  if (typeof value !== 'string') {
    return String(value);
  }

  let normalized = value.trim();

  if (/^fontWeight/.test(tokenKey)) {
    const mappedWeight = {
      regular: '400',
      medium: '500',
      semibold: '600',
      bold: '700',
    }[normalized.toLowerCase()];
    if (mappedWeight) {
      normalized = mappedWeight;
    }
  }

  if (
    (/^spacing|^borderRadius|^strokeWidth|^fontSize|^lineHeight/.test(tokenKey) &&
      /^-?\d+(\.\d+)?$/.test(normalized)) ||
    tokenKey === 'fontSizeBase100'
  ) {
    normalized = `${normalized}px`;
  }

  return normalized;
}

function toAlphaString(alpha) {
  if (Number.isNaN(alpha)) {
    return '0';
  }
  return parseFloat(alpha.toFixed(4)).toString();
}

function normalizeColor(value) {
  const raw = String(value).trim().toLowerCase();
  if (raw === 'transparent') {
    return 'rgba(0,0,0,0)';
  }

  const hex8 = raw.match(/^#([0-9a-f]{8})$/);
  if (hex8) {
    const channel = hex8[1];
    const red = parseInt(channel.slice(0, 2), 16);
    const green = parseInt(channel.slice(2, 4), 16);
    const blue = parseInt(channel.slice(4, 6), 16);
    const alpha = toAlphaString(parseInt(channel.slice(6, 8), 16) / 255);
    return `rgba(${red},${green},${blue},${alpha})`;
  }

  const hex6 = raw.match(/^#([0-9a-f]{6})$/);
  if (hex6) {
    const channel = hex6[1];
    const red = parseInt(channel.slice(0, 2), 16);
    const green = parseInt(channel.slice(2, 4), 16);
    const blue = parseInt(channel.slice(4, 6), 16);
    return `rgb(${red},${green},${blue})`;
  }

  const rgba = raw.match(/^rgba?\(([^)]+)\)$/);
  if (rgba) {
    const channels = rgba[1].split(',').map(part => part.trim());
    if (channels.length === 3) {
      return `rgb(${Number(channels[0])},${Number(channels[1])},${Number(channels[2])})`;
    }
    if (channels.length === 4) {
      return `rgba(${Number(channels[0])},${Number(channels[1])},${Number(channels[2])},${toAlphaString(Number(channels[3]))})`;
    }
  }

  return raw.replace(/\s+/g, '');
}

function canonicalForToken(tokenKey, value) {
  if (value === undefined || value === null) {
    return '';
  }

  const raw = String(value).trim().toLowerCase();

  if (tokenKey.startsWith('color')) {
    return normalizeColor(raw);
  }

  if (/^(spacing|borderRadius|strokeWidth|fontSize|lineHeight)/.test(tokenKey)) {
    const match = raw.match(/^(-?\d+(?:\.\d+)?)(px)?$/);
    if (match) {
      return String(Number(match[1]));
    }
  }

  if (tokenKey.startsWith('fontWeight')) {
    const mappedWeight = {
      regular: '400',
      medium: '500',
      semibold: '600',
      bold: '700',
    }[raw];
    if (mappedWeight) {
      return mappedWeight;
    }
  }

  return raw.replace(/\s+/g, '');
}

function canonical(value) {
  return String(value).trim().toLowerCase().replace(/\s+/g, '');
}

function addMappedToken(mode, tokenKey, value, sourcePath) {
  if (!tokenKey) {
    return;
  }
  const normalized = normalizeTokenValue(tokenKey, value);
  if (normalized === undefined) {
    return;
  }

  const current = byMode[mode].get(tokenKey);
  if (!current) {
    byMode[mode].set(tokenKey, {
      value: normalized,
      sourcePath,
    });
    return;
  }

  if (canonicalForToken(tokenKey, current.value) !== canonicalForToken(tokenKey, normalized)) {
    mappingConflicts.push({
      mode,
      tokenKey,
      existingValue: current.value,
      existingSource: current.sourcePath,
      incomingValue: normalized,
      incomingSource: sourcePath,
    });
  }
}

function stateSuffix(rawState) {
  if (!rawState || rawState === 'Rest') {
    return '';
  }
  if (rawState === 'Hover') {
    return 'Hover';
  }
  if (rawState === 'Pressed') {
    return 'Pressed';
  }
  if (rawState === 'Selected') {
    return 'Selected';
  }
  return null;
}

function withState(baseToken, rawState) {
  const suffix = stateSuffix(rawState);
  if (suffix === null) {
    return null;
  }
  return `${baseToken}${suffix}`;
}

function mapModePathToFluent(pathParts) {
  const [group, family, ...rest] = pathParts;

  if (group === 'Neutral') {
    if (family === 'Background') {
      const [a, b, c] = rest;
      if (/^[1-8]$/.test(a)) return withState(`colorNeutralBackground${a}`, b);
      if (a === 'Inverted' && b === 'Disabled') return withState('colorNeutralBackgroundInvertedDisabled', c);
      if (a === 'Inverted') return withState('colorNeutralBackgroundInverted', b);
      if (a === 'Static') return withState('colorNeutralBackgroundStatic', b);
      if (a === 'Alpha' && b === '1') return withState('colorNeutralBackgroundAlpha', c);
      if (a === 'Alpha' && b === '2') return withState('colorNeutralBackgroundAlpha2', c);
      if (a === 'Subtle' && b === 'Light alpha') return withState('colorSubtleBackgroundLightAlpha', c);
      if (a === 'Subtle' && b === 'Inverted') return withState('colorSubtleBackgroundInverted', c);
      if (a === 'Subtle') return withState('colorSubtleBackground', b);
      if (a === 'Transparent') return withState('colorTransparentBackground', b);
      if (a === 'Disabled') return withState('colorNeutralBackgroundDisabled', b);
      if (a === 'Stencil' && b === '1' && c === 'Alpha') return 'colorNeutralStencil1Alpha';
      if (a === 'Stencil' && b === '2' && c === 'Alpha') return 'colorNeutralStencil2Alpha';
      if (a === 'Stencil' && b === '1') return 'colorNeutralStencil1';
      if (a === 'Stencil' && b === '2') return 'colorNeutralStencil2';
      if (a === 'Overlay' && b === 'Scrollbar') return 'colorScrollbarOverlay';
      if (a === 'Overlay') return 'colorBackgroundOverlay';
      return null;
    }

    if (family === 'Foreground') {
      const [a, b, c] = rest;
      if (/^[1-5]$/.test(a) && b === 'Brand') return withState(`colorNeutralForeground${a}Brand`, c);
      if (/^[1-5]$/.test(a) && b === 'Link') return withState(`colorNeutralForeground${a}Link`, c);
      if (/^[1-5]$/.test(a)) return withState(`colorNeutralForeground${a}`, b);
      if (a === 'Disabled') return withState('colorNeutralForegroundDisabled', b);
      if (a === 'Static' && b === 'Inverted') return withState('colorNeutralForegroundStaticInverted', c);
      if (a === 'Static') return withState('colorNeutralForeground1Static', b);
      if (a === 'Inverted' && b === '1') return withState('colorNeutralForegroundInverted', c);
      if (a === 'Inverted' && b === '2') return withState('colorNeutralForegroundInverted2', c);
      if (a === 'Inverted' && b === 'Disabled') return withState('colorNeutralForegroundInvertedDisabled', c);
      if (a === 'Inverted' && b === 'Link') return withState('colorNeutralForegroundInvertedLink', c);
      if (a === 'On Brand') return withState('colorNeutralForegroundOnBrand', b);
      return null;
    }

    if (family === 'Stroke') {
      const [a, b, c] = rest;
      if (/^[1-4]$/.test(a)) return withState(`colorNeutralStroke${a}`, b);
      if (a === 'Accessible') return withState('colorNeutralStrokeAccessible', b);
      if (a === 'on Brand' && b === '1') return withState('colorNeutralStrokeOnBrand', c);
      if (a === 'on Brand' && b === '2') return withState('colorNeutralStrokeOnBrand2', c);
      if (a === 'Subtle') return withState('colorNeutralStrokeSubtle', b);
      if (a === 'Focus' && b === '1') return withState('colorStrokeFocus1', c);
      if (a === 'Focus' && b === '2') return withState('colorStrokeFocus2', c);
      if (a === 'Transparent' && b === 'Interactive') return withState('colorTransparentStrokeInteractive', c);
      if (a === 'Transparent' && b === 'Disabled') return withState('colorTransparentStrokeDisabled', c);
      if (a === 'Transparent') return withState('colorTransparentStroke', b);
      if (a === 'Disabled' && b === 'Inverted') return withState('colorNeutralStrokeInvertedDisabled', c);
      if (a === 'Disabled') return withState('colorNeutralStrokeDisabled', b);
      if (a === 'Alpha' && b === '1') return withState('colorNeutralStrokeAlpha', c);
      if (a === 'Alpha' && b === '2') return withState('colorNeutralStrokeAlpha2', c);
      return null;
    }
  }

  if (group === 'Brand') {
    const [a, b, c] = rest;
    if (family === 'Background') {
      if (a === '1') return withState('colorBrandBackground', b);
      if (a === '2') return withState('colorBrandBackground2', b);
      if (a === 'Inverted') return withState('colorBrandBackgroundInverted', b);
      if (a === 'Compound') return withState('colorCompoundBrandBackground', b);
      if (a === 'Static' && b === '1') return withState('colorBrandBackgroundStatic', c);
      if (a === 'Static' && b === '3') return withState('colorBrandBackground3Static', c);
      if (a === 'Static' && b === '4') return withState('colorBrandBackground4Static', c);
      return null;
    }
    if (family === 'Foreground') {
      if (a === '1') return withState('colorBrandForeground1', b);
      if (a === '2') return withState('colorBrandForeground2', b);
      if (a === 'Link') return withState('colorBrandForegroundLink', b);
      if (a === 'Inverted') return withState('colorBrandForegroundInverted', b);
      if (a === 'On Light') return withState('colorBrandForegroundOnLight', b);
      if (a === 'Compound') return withState('colorCompoundBrandForeground1', b);
      return null;
    }
    if (family === 'Stroke') {
      if (a === '1') return withState('colorBrandStroke1', b);
      if (a === '2' && b === 'Contrast') return withState('colorBrandStroke2Contrast', c);
      if (a === '2') return withState('colorBrandStroke2', b);
      if (a === 'Compound') return withState('colorCompoundBrandStroke', b);
      return null;
    }
  }

  if (group === 'Status') {
    const status = {
      Danger: 'Danger',
      Success: 'Success',
      Warning: 'Warning',
    }[family];

    if (!status) {
      return null;
    }

    const [a, b, c] = rest;
    if (a === 'Background' && /^[1-3]$/.test(b)) return withState(`colorStatus${status}Background${b}`, c);
    if (a === 'Foreground' && b === 'Inverted') return withState(`colorStatus${status}ForegroundInverted`, c);
    if (a === 'Foreground' && b === '3' && (c === 'Hover' || c === 'Pressed')) {
      return withState(`colorStatus${status}Background3`, c);
    }
    if (a === 'Foreground' && /^[1-3]$/.test(b)) return withState(`colorStatus${status}Foreground${b}`, c);
    if (a === 'Stroke' && b === '1') return withState(`colorStatus${status}Border1`, c);
    if (a === 'Stroke' && b === '2') return withState(`colorStatus${status}Border2`, c);
    return null;
  }

  if (group === 'Palette') {
    const paletteName = toPascalCase(family);
    const [a, b, c] = rest;
    if (a === 'Background' && /^[1-3]$/.test(b)) return withState(`colorPalette${paletteName}Background${b}`, c);
    if (a === 'Foreground' && b === 'Inverted') return withState(`colorPalette${paletteName}ForegroundInverted`, c);
    if (a === 'Foreground' && /^[1-3]$/.test(b)) return withState(`colorPalette${paletteName}Foreground${b}`, c);
    if (a === 'Stroke' && b === 'Active') return withState(`colorPalette${paletteName}BorderActive`, c);
    if (a === 'Stroke' && b === '1') return withState(`colorPalette${paletteName}Border1`, c);
    if (a === 'Stroke' && b === '2') return withState(`colorPalette${paletteName}Border2`, c);
    return null;
  }

  if (group === 'Shadow') {
    const mapped = {
      Ambient: 'colorNeutralShadowAmbient',
      'Ambient lighter': 'colorNeutralShadowAmbientLighter',
      'Ambient darker': 'colorNeutralShadowAmbientDarker',
      Key: 'colorNeutralShadowKey',
      'Key lighter': 'colorNeutralShadowKeyLighter',
      'Key darker': 'colorNeutralShadowKeyDarker',
      'Brand ambient': 'colorBrandShadowAmbient',
      'Brand key': 'colorBrandShadowKey',
    }[family];
    return mapped ?? null;
  }

  return null;
}

function addStaticMappings() {
  const applyBothModes = [];

  const spacingTokens = [
    ['Spacing.Horizontal.None', 'spacingHorizontalNone'],
    ['Spacing.Horizontal.XXS', 'spacingHorizontalXXS'],
    ['Spacing.Horizontal.XS', 'spacingHorizontalXS'],
    ['Spacing.Horizontal.SNudge', 'spacingHorizontalSNudge'],
    ['Spacing.Horizontal.S', 'spacingHorizontalS'],
    ['Spacing.Horizontal.MNudge', 'spacingHorizontalMNudge'],
    ['Spacing.Horizontal.M', 'spacingHorizontalM'],
    ['Spacing.Horizontal.L', 'spacingHorizontalL'],
    ['Spacing.Horizontal.XL', 'spacingHorizontalXL'],
    ['Spacing.Horizontal.XXL', 'spacingHorizontalXXL'],
    ['Spacing.Horizontal.XXXL', 'spacingHorizontalXXXL'],
    ['Spacing.Vertical.None', 'spacingVerticalNone'],
    ['Spacing.Vertical.XXS', 'spacingVerticalXXS'],
    ['Spacing.Vertical.XS', 'spacingVerticalXS'],
    ['Spacing.Vertical.SNudge', 'spacingVerticalSNudge'],
    ['Spacing.Vertical.S', 'spacingVerticalS'],
    ['Spacing.Vertical.MNudge', 'spacingVerticalMNudge'],
    ['Spacing.Vertical.M', 'spacingVerticalM'],
    ['Spacing.Vertical.L', 'spacingVerticalL'],
    ['Spacing.Vertical.XL', 'spacingVerticalXL'],
    ['Spacing.Vertical.XXL', 'spacingVerticalXXL'],
    ['Spacing.Vertical.XXXL', 'spacingVerticalXXXL'],
  ];

  const borderTokens = [
    ['Corner radius.None', 'borderRadiusNone'],
    ['Corner radius.Small', 'borderRadiusSmall'],
    ['Corner radius.Medium', 'borderRadiusMedium'],
    ['Corner radius.Large', 'borderRadiusLarge'],
    ['Corner radius.X-Large', 'borderRadiusXLarge'],
    ['Corner radius.Circular', 'borderRadiusCircular'],
  ];

  const strokeTokens = [
    ['Stroke width.10', 'strokeWidthThin'],
    ['Stroke width.20', 'strokeWidthThick'],
    ['Stroke width.30', 'strokeWidthThicker'],
    ['Stroke width.40', 'strokeWidthThickest'],
  ];

  const fontFamilyTokens = [['Typography.Font family.Base', 'fontFamilyBase']];

  const weightTokens = [
    ['Typography.Weight.Regular', 'fontWeightRegular'],
    ['Typography.Weight.Semibold', 'fontWeightSemibold'],
    ['Typography.Weight.Bold', 'fontWeightBold'],
  ];

  for (const [size, tokenName] of baseSizes.map(size => [size, `fontSizeBase${size}`])) {
    applyBothModes.push([`Typography.Font size.${size}`, tokenName]);
  }
  for (const [size, tokenName] of heroSizes.map(size => [size, `fontSizeHero${size}`])) {
    applyBothModes.push([`Typography.Font size.${size}`, tokenName]);
  }
  for (const [size, tokenName] of baseSizes.map(size => [size, `lineHeightBase${size}`])) {
    applyBothModes.push([`Typography.Line height.${size}`, tokenName]);
  }
  for (const [size, tokenName] of heroSizes.map(size => [size, `lineHeightHero${size}`])) {
    applyBothModes.push([`Typography.Line height.${size}`, tokenName]);
  }

  for (const [pathKey, tokenKey] of [
    ...spacingTokens,
    ...borderTokens,
    ...strokeTokens,
    ...fontFamilyTokens,
    ...weightTokens,
    ...applyBothModes,
  ]) {
    const sourcePath = pathKey.includes('Typography') || pathKey.includes('Stroke width') ? `global.${pathKey}` : `layout.${pathKey}`;
    const resolved = resolveTokenPath(pathKey);
    addMappedToken('light', tokenKey, resolved, sourcePath);
    addMappedToken('dark', tokenKey, resolved, sourcePath);
  }
}

addStaticMappings();

for (const [tokenPath, token] of tokenIndex.entries()) {
  if (path.basename(token.sourceFile) !== 'mode.json') {
    continue;
  }

  const pathParts = tokenPath.split('.');
  const [mode] = pathParts;
  if (mode !== 'light' && mode !== 'dark') {
    continue;
  }

  const fluentToken = mapModePathToFluent(pathParts.slice(1));
  if (!fluentToken) {
    const resolved = resolveTokenPath(tokenPath);
    unmappedPaths.push({
      mode,
      tokenPath,
      sourceFile: token.sourceFile,
      value: token.value,
      resolvedValue: resolved,
      reason: 'No Fluent token mapping',
    });
    continue;
  }

  const resolved = resolveTokenPath(tokenPath);
  addMappedToken(mode, fluentToken, resolved, tokenPath);
}

function parseFluentBrandDefaults() {
  const brandFilePath = path.join(
    repoRoot,
    '.cache',
    'fluentui_sparse',
    'packages',
    'tokens',
    'src',
    'global',
    'brandColors.ts',
  );

  if (!fs.existsSync(brandFilePath)) {
    return {};
  }

  const source = fs.readFileSync(brandFilePath, 'utf8');
  const match = source.match(/export const brandWeb:[\s\S]*?=\s*{([\s\S]*?)^};/m);
  if (!match) {
    return {};
  }

  const values = {};
  const lineRegex = /^\s*(\d+):\s*`?(#[0-9a-fA-F]{6})`?,?$/gm;
  let current;
  while ((current = lineRegex.exec(match[1])) !== null) {
    values[current[1]] = current[2].toLowerCase();
  }
  return values;
}

const fluentBrandDefaults = parseFluentBrandDefaults();
const brandDeltas = [];
for (const step of brandSteps) {
  const tokenPath = `Brand-${step}`;
  const designValue = resolveTokenPath(tokenPath);
  const normalizedDesign = canonical(designValue ?? '');
  const normalizedFluent = canonical(fluentBrandDefaults[String(step)] ?? '');
  if (!normalizedDesign || !normalizedFluent) {
    continue;
  }
  if (normalizedDesign !== normalizedFluent) {
    brandDeltas.push({
      token: tokenPath,
      designValue,
      fluentDefault: fluentBrandDefaults[String(step)],
      suggestedFile: '.cache/fluentui_sparse/packages/tokens/src/global/brandColors.ts',
    });
  }
}

function buildModeDelta(mode) {
  const mapped = byMode[mode];
  const theme = fluentThemes[mode];
  const deltas = [];
  const unknownThemeKeys = [];

  for (const [tokenKey, mapping] of mapped.entries()) {
    const fluentValue = theme[tokenKey];
    if (fluentValue === undefined) {
      unknownThemeKeys.push({
        tokenKey,
        value: mapping.value,
        sourcePath: mapping.sourcePath,
      });
      continue;
    }

    if (canonicalForToken(tokenKey, mapping.value) !== canonicalForToken(tokenKey, fluentValue)) {
      deltas.push({
        tokenKey,
        sourcePath: mapping.sourcePath,
        designValue: mapping.value,
        fluentDefault: fluentValue,
      });
    }
  }

  deltas.sort((a, b) => a.tokenKey.localeCompare(b.tokenKey));
  unknownThemeKeys.sort((a, b) => a.tokenKey.localeCompare(b.tokenKey));

  return {
    mappedTokenCount: mapped.size,
    themeTokenCount: Object.keys(theme).length,
    deltaCount: deltas.length,
    deltas,
    unknownThemeKeys,
  };
}

const lightDelta = buildModeDelta('light');
const darkDelta = buildModeDelta('dark');

function mapToSortedObject(map) {
  return Object.fromEntries(
    [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, value]) => [key, value.value]),
  );
}

const mappedThemes = {
  light: mapToSortedObject(byMode.light),
  dark: mapToSortedObject(byMode.dark),
};

const packageJsonPath = path.join(repoRoot, 'node_modules', '@fluentui', 'react-theme', 'package.json');
const fluentPackageVersion = fs.existsSync(packageJsonPath)
  ? JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')).version
  : 'unknown';

const report = {
  generatedAt: new Date().toISOString(),
  fluentThemePackage: {
    name: '@fluentui/react-theme',
    version: fluentPackageVersion,
  },
  summary: {
    lightMappedTokens: lightDelta.mappedTokenCount,
    darkMappedTokens: darkDelta.mappedTokenCount,
    lightDeltas: lightDelta.deltaCount,
    darkDeltas: darkDelta.deltaCount,
    unmappedModePaths: unmappedPaths.length,
    unresolvedReferences: unresolvedRefs.length,
    mappingConflicts: mappingConflicts.length,
    duplicateTokenPaths: duplicateTokenPaths.length,
    brandDeltas: brandDeltas.length,
  },
  deltas: {
    light: lightDelta,
    dark: darkDelta,
    brand: brandDeltas,
  },
  mappedThemes,
  unmappedModePaths: unmappedPaths.sort((a, b) => a.tokenPath.localeCompare(b.tokenPath)),
  unresolvedReferences: unresolvedRefs,
  mappingConflicts,
  duplicateTokenPaths,
  fluentStructure: {
    tokenAssembly: [
      '.cache/fluentui_sparse/packages/tokens/src/utils/createLightTheme.ts',
      '.cache/fluentui_sparse/packages/tokens/src/utils/createDarkTheme.ts',
    ],
    generatedAliasFiles: [
      '.cache/fluentui_sparse/packages/tokens/src/alias/lightColor.ts',
      '.cache/fluentui_sparse/packages/tokens/src/alias/darkColor.ts',
      '.cache/fluentui_sparse/packages/tokens/src/alias/lightColorPalette.ts',
      '.cache/fluentui_sparse/packages/tokens/src/alias/darkColorPalette.ts',
    ],
    globalScales: [
      '.cache/fluentui_sparse/packages/tokens/src/global/brandColors.ts',
      '.cache/fluentui_sparse/packages/tokens/src/global/colors.ts',
      '.cache/fluentui_sparse/packages/tokens/src/global/spacings.ts',
      '.cache/fluentui_sparse/packages/tokens/src/global/borderRadius.ts',
      '.cache/fluentui_sparse/packages/tokens/src/global/strokeWidths.ts',
      '.cache/fluentui_sparse/packages/tokens/src/global/fonts.ts',
    ],
    providerInjection: [
      '.cache/fluentui_sparse/packages/react-components/react-provider/library/src/components/FluentProvider/createCSSRuleFromTheme.ts',
    ],
  },
};

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

console.log(`Wrote ${path.relative(repoRoot, outputPath)}`);
console.log(
  `Light deltas: ${lightDelta.deltaCount}, Dark deltas: ${darkDelta.deltaCount}, Brand deltas: ${brandDeltas.length}, Unmapped mode paths: ${unmappedPaths.length}`,
);
