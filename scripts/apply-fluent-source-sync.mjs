import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const fluentRepoPath = path.resolve(process.env.FLUENT_REPO_PATH ?? path.join(repoRoot, '.cache', 'fluentui_sparse'));
const overridesPath = path.join(repoRoot, 'generated', 'fluent', 'fluent-theme-overrides.json');
const reportPath = path.join(repoRoot, 'analysis', 'fluent-delta-report.json');
const tokenDir = path.join(repoRoot, 'tokens');
const brandPath = path.join(tokenDir, 'brand.json');

for (const requiredPath of [overridesPath, reportPath, brandPath]) {
  if (!fs.existsSync(requiredPath)) {
    console.error(`Missing required file: ${path.relative(repoRoot, requiredPath)}`);
    console.error('Run: npm run generate:fluent-sync');
    process.exit(1);
  }
}

if (!fs.existsSync(fluentRepoPath)) {
  console.error(`Fluent repo path not found: ${fluentRepoPath}`);
  console.error('Set FLUENT_REPO_PATH or clone Fluent into .cache/fluentui_sparse');
  process.exit(1);
}

const overrides = JSON.parse(fs.readFileSync(overridesPath, 'utf8'));
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const brand = JSON.parse(fs.readFileSync(brandPath, 'utf8'));

const tokensRoot = path.join(fluentRepoPath, 'packages', 'tokens', 'src');

function quoteString(value) {
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function replaceObjectEntries(source, objectName, replacements) {
  const objectRegex = new RegExp(
    `((?:export\\s+)?const\\s+${objectName}[^=]*=\\s*\\{)([\\s\\S]*?)(\\n\\};)`,
    'm',
  );
  const match = source.match(objectRegex);
  if (!match) {
    throw new Error(`Could not find object "${objectName}"`);
  }

  const body = match[2];
  const updatedBody = body.replace(
    /^(\s*)(['"]?[A-Za-z0-9]+['"]?):\s*(.+),(\s*(?:\/\/.*)?)$/gm,
    (line, indent, rawKey, oldValue, suffix) => {
    const normalizedKey = rawKey.replace(/['"]/g, '');
    if (!(normalizedKey in replacements)) {
      return line;
    }
    return `${indent}${rawKey}: ${replacements[normalizedKey]},${suffix}`;
  },
  );

  return source.replace(objectRegex, `${match[1]}${updatedBody}${match[3]}`);
}

function writeFile(filePath, contents) {
  fs.writeFileSync(filePath, contents, 'utf8');
}

function updateBrandWeb() {
  const filePath = path.join(tokensRoot, 'global', 'brandColors.ts');
  let source = fs.readFileSync(filePath, 'utf8');
  const replacements = {};
  for (const [key, token] of Object.entries(brand)) {
    const step = key.replace('Brand-', '');
    replacements[step] = quoteString(token.value);
  }
  source = replaceObjectEntries(source, 'brandWeb', replacements);
  writeFile(filePath, source);
}

function updateGlobalPrimitives() {
  const light = overrides.modes.light;

  const spacingFile = path.join(tokensRoot, 'global', 'spacings.ts');
  let spacingSource = fs.readFileSync(spacingFile, 'utf8');
  spacingSource = replaceObjectEntries(spacingSource, 'spacings', {
    none: quoteString(light.spacingHorizontalNone ?? '0'),
    xxs: quoteString(light.spacingHorizontalXXS ?? '2px'),
    xs: quoteString(light.spacingHorizontalXS ?? '4px'),
    sNudge: quoteString(light.spacingHorizontalSNudge ?? '6px'),
    s: quoteString(light.spacingHorizontalS ?? '8px'),
    mNudge: quoteString(light.spacingHorizontalMNudge ?? '10px'),
    m: quoteString(light.spacingHorizontalM ?? '12px'),
    l: quoteString(light.spacingHorizontalL ?? '16px'),
    xl: quoteString(light.spacingHorizontalXL ?? '20px'),
    xxl: quoteString(light.spacingHorizontalXXL ?? '24px'),
    xxxl: quoteString(light.spacingHorizontalXXXL ?? '32px'),
  });
  writeFile(spacingFile, spacingSource);

  const radiusFile = path.join(tokensRoot, 'global', 'borderRadius.ts');
  let radiusSource = fs.readFileSync(radiusFile, 'utf8');
  radiusSource = replaceObjectEntries(radiusSource, 'borderRadius', {
    borderRadiusNone: quoteString(light.borderRadiusNone ?? '0'),
    borderRadiusSmall: quoteString(light.borderRadiusSmall ?? '2px'),
    borderRadiusMedium: quoteString(light.borderRadiusMedium ?? '4px'),
    borderRadiusLarge: quoteString(light.borderRadiusLarge ?? '6px'),
    borderRadiusXLarge: quoteString(light.borderRadiusXLarge ?? '8px'),
    borderRadiusCircular: quoteString(light.borderRadiusCircular ?? '10000px'),
  });
  writeFile(radiusFile, radiusSource);

  const strokeFile = path.join(tokensRoot, 'global', 'strokeWidths.ts');
  let strokeSource = fs.readFileSync(strokeFile, 'utf8');
  strokeSource = replaceObjectEntries(strokeSource, 'strokeWidths', {
    strokeWidthThin: quoteString(light.strokeWidthThin ?? '1px'),
    strokeWidthThick: quoteString(light.strokeWidthThick ?? '2px'),
    strokeWidthThicker: quoteString(light.strokeWidthThicker ?? '3px'),
    strokeWidthThickest: quoteString(light.strokeWidthThickest ?? '4px'),
  });
  writeFile(strokeFile, strokeSource);

  const fontsFile = path.join(tokensRoot, 'global', 'fonts.ts');
  let fontsSource = fs.readFileSync(fontsFile, 'utf8');
  fontsSource = replaceObjectEntries(fontsSource, 'fontSizes', {
    fontSizeBase100: quoteString(light.fontSizeBase100),
    fontSizeBase200: quoteString(light.fontSizeBase200),
    fontSizeBase300: quoteString(light.fontSizeBase300),
    fontSizeBase400: quoteString(light.fontSizeBase400),
    fontSizeBase500: quoteString(light.fontSizeBase500),
    fontSizeBase600: quoteString(light.fontSizeBase600),
    fontSizeHero700: quoteString(light.fontSizeHero700),
    fontSizeHero800: quoteString(light.fontSizeHero800),
    fontSizeHero900: quoteString(light.fontSizeHero900),
    fontSizeHero1000: quoteString(light.fontSizeHero1000),
  });
  fontsSource = replaceObjectEntries(fontsSource, 'lineHeights', {
    lineHeightBase100: quoteString(light.lineHeightBase100),
    lineHeightBase200: quoteString(light.lineHeightBase200),
    lineHeightBase300: quoteString(light.lineHeightBase300),
    lineHeightBase400: quoteString(light.lineHeightBase400),
    lineHeightBase500: quoteString(light.lineHeightBase500),
    lineHeightBase600: quoteString(light.lineHeightBase600),
    lineHeightHero700: quoteString(light.lineHeightHero700),
    lineHeightHero800: quoteString(light.lineHeightHero800),
    lineHeightHero900: quoteString(light.lineHeightHero900),
    lineHeightHero1000: quoteString(light.lineHeightHero1000),
  });
  fontsSource = replaceObjectEntries(fontsSource, 'fontWeights', {
    fontWeightRegular: light.fontWeightRegular ?? '400',
    fontWeightSemibold: light.fontWeightSemibold ?? '600',
    fontWeightBold: light.fontWeightBold ?? '700',
  });
  fontsSource = replaceObjectEntries(fontsSource, 'fontFamilies', {
    fontFamilyBase: quoteString(light.fontFamilyBase),
  });
  writeFile(fontsFile, fontsSource);
}

function toTsObjectLiteral(obj) {
  return JSON.stringify(obj, null, 2).replace(/"([^"]+)":/g, '$1:');
}

function writeFluentThemeOverrides() {
  const filePath = path.join(tokensRoot, 'themes', 'web', 'designTokenOverrides.ts');
  const source = `// Generated by scripts/apply-fluent-source-sync.mjs
// Source of truth: token JSON files in this repository.
export const designTokenLightOverrides: Record<string, string> = ${toTsObjectLiteral(overrides.modes.light)};

export const designTokenDarkOverrides: Record<string, string> = ${toTsObjectLiteral(overrides.modes.dark)};
`;
  writeFile(filePath, source);
}

function patchWebThemeFiles() {
  const lightThemePath = path.join(tokensRoot, 'themes', 'web', 'lightTheme.ts');
  const darkThemePath = path.join(tokensRoot, 'themes', 'web', 'darkTheme.ts');

  const lightSource = `import { createLightTheme } from '../../utils/createLightTheme';
import { brandWeb } from '../../global/brandColors';
import type { Theme } from '../../types';
import { designTokenLightOverrides } from './designTokenOverrides';

export const webLightTheme: Theme = { ...createLightTheme(brandWeb), ...designTokenLightOverrides } as Theme;
`;

  const darkSource = `import { createDarkTheme } from '../../utils/createDarkTheme';
import { brandWeb } from '../../global/brandColors';
import type { Theme } from '../../types';
import { designTokenDarkOverrides } from './designTokenOverrides';

export const webDarkTheme: Theme = { ...createDarkTheme(brandWeb), ...designTokenDarkOverrides } as Theme;
`;

  writeFile(lightThemePath, lightSource);
  writeFile(darkThemePath, darkSource);
}

updateBrandWeb();
updateGlobalPrimitives();
writeFluentThemeOverrides();
patchWebThemeFiles();

console.log(`Applied token sync to Fluent source at: ${fluentRepoPath}`);
console.log('Updated files:');
console.log('- packages/tokens/src/global/brandColors.ts');
console.log('- packages/tokens/src/global/spacings.ts');
console.log('- packages/tokens/src/global/borderRadius.ts');
console.log('- packages/tokens/src/global/strokeWidths.ts');
console.log('- packages/tokens/src/global/fonts.ts');
console.log('- packages/tokens/src/themes/web/designTokenOverrides.ts');
console.log('- packages/tokens/src/themes/web/lightTheme.ts');
console.log('- packages/tokens/src/themes/web/darkTheme.ts');
console.log(
  `Synced mapped theme tokens: light=${report.summary.lightMappedTokens}, dark=${report.summary.darkMappedTokens}.`,
);
