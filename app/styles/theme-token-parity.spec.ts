import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * Measured on the live login page at 390px, light theme: the four stat tiles
 * ("21 AI providers", "29+ Languages", "99.9% Uptime", "SOC2") rendered a dark
 * grey card under dark text — 1.78:1, far under the 4.5:1 of WCAG AA.
 *
 * The cause was a single missing declaration. `.vc-auth-page` declares the dark
 * palette, `:root[data-theme='light'] .vc-auth-page` overrides it, and
 * `--vc-auth-card-solid` existed only in the dark block. The light theme then
 * inherited #191c1f while its text token stayed near-black.
 *
 * The class of defect matters more than the one token: any literal colour that
 * a themed block declares and its light counterpart forgets is invisible in
 * review and shows up as unreadable text in production. So the guard is
 * structural — it walks every `[data-theme='light']` override in the stylesheet.
 */
const STYLESHEET = readFileSync(join(__dirname, 'index.scss'), 'utf8');

type Declarations = Map<string, string>;

/**
 * Custom properties declared directly by a selector. Only top-level blocks are
 * read (the palettes live there); nested at-rules contribute no palette tokens.
 */
function declarationsBySelector(source: string): Map<string, Declarations> {
  const blocks = new Map<string, Declarations>();

  for (const match of source.matchAll(/(?:^|\n)([^\n{}]+)\{([^{}]*)\}/g)) {
    const selector = match[1].trim();
    const declarations = blocks.get(selector) ?? new Map<string, string>();

    for (const property of match[2].matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
      declarations.set(property[1], property[2].trim());
    }

    if (declarations.size > 0) {
      blocks.set(selector, declarations);
    }
  }

  return blocks;
}

/*
 * A value that is derived from another token — `var(--x)` or a `color-mix()`
 * over one — already follows the theme, so the light block has nothing to
 * restate. Only a hard-coded colour has to be repeated.
 */
function isLiteralColour(value: string) {
  return !/var\(/.test(value) && /#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i.test(value);
}

const BLOCKS = declarationsBySelector(STYLESHEET);

const LIGHT_OVERRIDES = [...BLOCKS.keys()]
  .filter((selector) => selector.startsWith(":root[data-theme='light']"))
  .map((selector) => ({ light: selector, dark: selector.replace(/^:root\[data-theme='light'\]\s*/, '') }))
  .filter((pair) => BLOCKS.has(pair.dark));

describe('light-theme palettes override every hard-coded colour of their dark block', () => {
  it('found the themed palette blocks to check', () => {
    expect(LIGHT_OVERRIDES.length).toBeGreaterThan(0);
  });

  it.each(LIGHT_OVERRIDES)('$dark', ({ light, dark }) => {
    const darkDeclarations = BLOCKS.get(dark)!;
    const lightDeclarations = BLOCKS.get(light)!;

    const missing = [...darkDeclarations]
      .filter(([property, value]) => isLiteralColour(value) && !lightDeclarations.has(property))
      .map(([property, value]) => `${property} (dark: ${value})`);

    expect(missing, `${dark} leaks these dark colours into the light theme`).toEqual([]);
  });

  it('keeps the login stat tiles on a light card, the token that regressed', () => {
    expect(BLOCKS.get(":root[data-theme='light'] .vc-auth-page")?.get('--vc-auth-card-solid')).toBe('#ffffff');
  });
});

/*
 * Structure is only half of it: a token can exist in both palettes and still be
 * unreadable. These are the pairs the live sweep at 390/768/1440 caught below
 * WCAG AA — the login stat tiles (1.78:1 in light) and the tertiary grey the
 * dark marketing pages use for their secondary line (4.05:1 on the home page,
 * 4.16:1 on pricing).
 */
function channel(value: number) {
  const srgb = value / 255;

  return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));

  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(foreground: string, background: string) {
  const [a, b] = [luminance(foreground), luminance(background)];

  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function token(selector: string, property: string) {
  const value = BLOCKS.get(selector)?.get(property);

  expect(value, `${selector} { ${property} }`).toMatch(/^#[0-9a-f]{6}$/i);

  return value!;
}

const AA_BODY_TEXT = 4.5;

describe('the palettes that failed the live contrast sweep now clear WCAG AA', () => {
  it('reads the login stat tiles in the light theme', () => {
    const tile = token(":root[data-theme='light'] .vc-auth-page", '--vc-auth-card-solid');

    // The tile paints the value in --vc-auth-text and its caption in --vc-auth-muted.
    expect(contrast(token(":root[data-theme='light'] .vc-auth-page", '--vc-auth-text'), tile)).toBeGreaterThanOrEqual(
      AA_BODY_TEXT,
    );
    expect(contrast(token(":root[data-theme='light'] .vc-auth-page", '--vc-auth-muted'), tile)).toBeGreaterThanOrEqual(
      AA_BODY_TEXT,
    );
  });

  it('reads the dark tertiary grey on both dark surfaces it lands on', () => {
    const muted = token(":root[data-theme='dark']", '--vc-ide-text-muted');

    for (const surface of ['--vc-ide-bg-app', '--vc-ide-bg-panel'] as const) {
      expect(contrast(muted, token(":root[data-theme='dark']", surface)), surface).toBeGreaterThanOrEqual(AA_BODY_TEXT);
    }
  });

  /*
   * The admin app ships its own copy of the palette (apps/admin/src/styles.css),
   * dark-only and on the same #0a0f1c surface. It carried the same 4.16:1 grey,
   * so the two copies have to move together or the fix is half-applied.
   */
  it('keeps the admin copy of the palette on the same tertiary grey', () => {
    const adminStylesheet = readFileSync(join(__dirname, '..', '..', 'apps', 'admin', 'src', 'styles.css'), 'utf8');
    const admin = declarationsBySelector(adminStylesheet).get(':root')?.get('--vc-ide-text-muted');

    expect(admin).toBe(token(":root[data-theme='dark']", '--vc-ide-text-muted'));
  });

  it('keeps the tertiary grey visibly quieter than the secondary text', () => {
    const background = token(":root[data-theme='dark']", '--vc-ide-bg-app');
    const muted = contrast(token(":root[data-theme='dark']", '--vc-ide-text-muted'), background);
    const secondary = contrast(token(":root[data-theme='dark']", '--vc-ide-text-secondary'), background);

    expect(secondary).toBeGreaterThan(muted * 1.5);
  });
});
