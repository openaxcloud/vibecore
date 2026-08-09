/**
 * BUG-MKT-010 — contraste WCAG AA des surfaces portant du texte sur un fond de marque.
 *
 * Deux défauts distincts ont été MESURÉS LIVE sur la prod (2026-08-09) :
 *
 *  1. `LanguageSwitch` figeait `text-white` sur `bg-[var(--vc-action-primary)]`.
 *     Ce token vaut l'orange de marque `#f26207` dans le scope marketing et le
 *     bleu d'action `#006fd6` ailleurs — le blanc figé mesurait **3,22:1** sur
 *     l'orange, sous le seuil AA de 4,5:1 (14 px / poids 600).
 *
 *  2. Les badges héros de `/about` et `/careers` forçaient `color:'#F26207'` sur
 *     le fond ambre `bg-secondary` (`rgb(251,175,35)`) → **1,73:1** mesuré.
 *
 * Dans les deux cas le correctif ne repeint AUCUNE couleur de marque : il rend
 * simplement au foreground apparié (token, ou défaut du composant) le droit de
 * s'appliquer. Ce spec verrouille le contrat de contraste ET l'absence de
 * réintroduction des deux anti-patterns.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(__dirname, '..', '..');

function readSource(relativePath: string) {
  return readFileSync(join(REPO_ROOT, relativePath), 'utf8');
}

function channelLuminance(channel: number) {
  const c = channel / 255;

  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function relativeLuminance([r, g, b]: readonly [number, number, number]) {
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

function hexToRgb(hex: string): readonly [number, number, number] {
  const value = hex.replace('#', '');

  return [parseInt(value.slice(0, 2), 16), parseInt(value.slice(2, 4), 16), parseInt(value.slice(4, 6), 16)] as const;
}

/** Ratio de contraste WCAG 2.1 (1..21). */
function contrastRatio(foreground: string, background: string) {
  const lighter = Math.max(relativeLuminance(hexToRgb(foreground)), relativeLuminance(hexToRgb(background)));
  const darker = Math.min(relativeLuminance(hexToRgb(foreground)), relativeLuminance(hexToRgb(background)));

  return (lighter + 0.05) / (darker + 0.05);
}

/** Seuil AA pour du texte normal (< 18,66 px gras / < 24 px). */
const AA_NORMAL_TEXT = 4.5;

// Valeurs relevées sur la prod le 2026-08-09 (getComputedStyle, pas des constantes recopiées).
const BRAND_ACCENT_ORANGE = '#f26207';
const ACTION_BLUE = '#006fd6';
const ACCENT_CONTRAST = '#111827';
const SECONDARY_AMBER = '#fbaf23';
const SECONDARY_FOREGROUND = '#000000';

describe('contraste des sondes mesurées (BUG-MKT-010)', () => {
  it('reproduit les deux défauts mesurés live — contrôle négatif', () => {
    // Sans le correctif, ces deux combinaisons étaient réellement servies.
    expect(contrastRatio('#ffffff', BRAND_ACCENT_ORANGE)).toBeLessThan(AA_NORMAL_TEXT);
    expect(contrastRatio(BRAND_ACCENT_ORANGE, SECONDARY_AMBER)).toBeLessThan(AA_NORMAL_TEXT);
  });

  it('la pastille de langue passe AA dans les DEUX scopes du token', () => {
    // Scope marketing : --vc-action-primary = orange de marque.
    expect(contrastRatio(ACCENT_CONTRAST, BRAND_ACCENT_ORANGE)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);

    // Scope app/IDE : --vc-action-primary = bleu d'action, foreground blanc.
    expect(contrastRatio('#ffffff', ACTION_BLUE)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  it('le badge secondaire passe AA avec son foreground par défaut', () => {
    expect(contrastRatio(SECONDARY_FOREGROUND, SECONDARY_AMBER)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });
});

describe('anti-régression sur la source (BUG-MKT-010)', () => {
  it('LanguageSwitch ne fige plus le blanc sur le fond action-primary', () => {
    const source = readSource('app/components/i18n/LanguageSwitch.tsx');

    expect(source).toContain('bg-[var(--vc-action-primary)] text-[var(--vc-action-primary-foreground)]');
    expect(source).not.toContain('bg-[var(--vc-action-primary)] text-white');
  });

  it('les badges héros ne forcent plus l’accent sur le fond secondaire', () => {
    for (const file of [
      'app/components/marketing/ecode-exact/pages/About.tsx',
      'app/components/marketing/ecode-exact/pages/Careers.tsx',
    ]) {
      const source = readSource(file);

      expect(source, `${file} force encore l'accent en couleur de texte`).not.toMatch(/color:\s*'#[Ff]26207'/);
    }
  });
});
