import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/*
 * Audit UX/UI marketing (chore/marketing-ux-audit) — verrous de non-régression.
 *
 * Comme footer-column-gap.spec.ts, ces tests lisent la SOURCE : UnoCSS est
 * absent de l'environnement de test, donc un montage React + getComputedStyle
 * serait vert quoi qu'il arrive (le faux vert déjà produit par SCR-009).
 *
 * Chaque bloc verrouille un correctif précis, constaté sur main avant fix :
 *  1. Liens morts /agent (AI.tsx) et /docs/deployments (Deployments) → 404 réels
 *     (aucune route, aucune page de surface ; les chemins multi-segments tombent
 *     dans le splat $.tsx qui répond 404).
 *  2. Pied de page : le titre Newsletter gardait tracking-[0.3em] alors que
 *     SCR-009 a resserré les titres de colonnes à 0.12em.
 *  3. Famille légale : Subprocessors/StudentDPA affichaient un h1 à 60px
 *     (text-4xl md:text-6xl) et LegalArticle/CommercialAgreement un 36px figé,
 *     là où Terms/Privacy/DPA utilisent text-responsive-2xl (24→30→36→48px).
 *  4. Forum : h1 text-4xl figé là où les hubs ressources utilisent mkt-h1.
 *  5. Cible tactile : les boutons de prompt d'AI.tsx étaient à min-h-9 (36px),
 *     sous les 44px imposés partout ailleurs (min-h-11).
 */

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');

describe('liens morts corrigés', () => {
  it('AI.tsx ne pointe plus vers /agent (404) et route les prompts vers /projects/new', () => {
    const source = read('./pages/AI.tsx');

    expect(source).not.toMatch(/href=\{?["'`]\/agent["'`?]/);
    expect(source).not.toMatch(/["'`]\/agent\?prompt=/);
    expect(source).toMatch(/\/projects\/new\?prompt=/);
    expect(source).toMatch(/href="\/projects\/new"/);
  });

  it('les pages Deployments ne pointent plus vers /docs/deployments (splat 404)', () => {
    const page = read('./pages/PublicDeploymentsPage.tsx');
    const sections = read('./pages/PublicDeploymentsSections.tsx');

    // Sur les attributs href uniquement — le chemin mort reste cité en commentaire.
    expect(page).not.toMatch(/href=["'`{]+\/docs\/deployments/);
    expect(sections).not.toMatch(/href=["'`{]+\/docs\/deployments/);
    expect(page).toMatch(/href="\/docs"/);
    expect(sections).toMatch(/href="\/docs"/);
  });
});

describe('pied de page — titre Newsletter aligné sur SCR-009', () => {
  it('plus aucun tracking-[0.3em] dans les classes du shell (titres du pied de page à 0.12em)', () => {
    const source = read('./EcodeExactShell.tsx');

    // Sur les className uniquement — 0.3em reste cité dans le commentaire SCR-009.
    const classNames = source.match(/className="[^"]*"/g) ?? [];

    expect(classNames.some((cls) => cls.includes('tracking-[0.3em]'))).toBe(false);
    expect(classNames.filter((cls) => cls.includes('tracking-[0.12em]')).length).toBeGreaterThanOrEqual(2);
  });
});

describe('échelle des h1 — familles cohérentes', () => {
  const familleLegale = ['./pages/Subprocessors.tsx', './pages/StudentDPA.tsx', './pages/CommercialAgreement.tsx'];

  it.each(familleLegale)('%s : h1 en text-responsive-2xl, sans text-6xl ni text-4xl figé', (rel) => {
    const source = read(rel);
    const h1 = /<h1[^>]*className="([^"]+)"/.exec(source)?.[1] ?? '';

    expect(h1).toContain('text-responsive-2xl');
    expect(h1).not.toMatch(/\btext-4xl\b|\btext-6xl\b|md:text-6xl/);
    expect(h1).toContain('break-words');
  });

  it('Forum : h1 en mkt-h1 comme les autres hubs ressources', () => {
    const h1 = /<h1[^>]*className="([^"]+)"/.exec(read('./pages/Forum.tsx'))?.[1] ?? '';

    expect(h1).toContain('mkt-h1');
    expect(h1).not.toMatch(/\btext-4xl\b/);
  });
});

describe('cibles tactiles — boutons de prompt AI', () => {
  it('AI.tsx : plus de min-h-9 (36px) sur les boutons de prompt, min-h-11 (44px) requis', () => {
    const source = read('./pages/AI.tsx');

    expect(source).not.toMatch(/\bmin-h-9\b/);
    expect(source).toMatch(/min-h-11 justify-start/);
  });
});
