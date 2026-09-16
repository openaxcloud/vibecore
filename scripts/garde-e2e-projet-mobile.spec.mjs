import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * BUG-QA-CI-NO-MOBILE-COVERAGE-001 — l'étape « Playwright mobile viewport
 * tests » de e2e.yml lançait `--project=chromium` (Desktop Chrome) : les 16
 * assertions gardées par `!isMobile` / `isCompactIdeProject` étaient ignorées,
 * et « mobile » ne testait rien à une largeur de téléphone.
 *
 * Ce test tient les trois faits ensemble : l'étape existe, elle lance le projet
 * `mobile`, et ce projet est bien un téléphone dans playwright.config.ts.
 */
const workflow = readFileSync(join(process.cwd(), '.github/workflows/e2e.yml'), 'utf8');
const config = readFileSync(join(process.cwd(), 'playwright.config.ts'), 'utf8');

function etape(nom) {
  const debut = workflow.indexOf(`- name: ${nom}`);
  expect(debut, `étape « ${nom} » introuvable`).toBeGreaterThan(-1);

  const suite = workflow.slice(debut + nom.length + 8);
  const fin = suite.search(/\n\s*- name: /);

  return suite.slice(0, fin === -1 ? undefined : fin);
}

describe('BUG-QA-CI-NO-MOBILE-COVERAGE-001 — l’étape « mobile » du e2e tourne à une largeur de téléphone', () => {
  it('lance le projet `mobile`, pas Chromium desktop', () => {
    /* La commande `playwright test` seule : le commentaire de l'étape SUIVANTE cite `--project=chromium`. */
    const commande = etape('Playwright mobile viewport tests').match(/pnpm exec playwright test[^\n]*/)?.[0] ?? '';

    expect(commande).toContain('tests/e2e/responsive-ide.spec.ts');
    expect(commande).toContain('--project=mobile');
    expect(commande).not.toContain('--project=chromium');
  });

  it('le projet `mobile` de playwright.config.ts est un téléphone', () => {
    const debut = config.indexOf("name: 'mobile'");
    expect(debut).toBeGreaterThan(-1);

    const bloc = config.slice(debut, debut + 200);
    expect(bloc).toMatch(/devices\['(Pixel|iPhone|Galaxy)[^']*'\]/);
  });

  /*
   * Mesuré le 16/09 (run 35108180557) : sans plafond propre, l'étape mobile a
   * duré 20,5 min et le job entier a été tué par son budget de 75 min pendant
   * le canari iOS — « cancelled », PR bloquée. Un canari non bloquant doit
   * porter son plafond, et la somme des plafonds doit tenir dans le budget du
   * job avec les ~35 min des flux principaux.
   */
  it('chaque canari non bloquant porte son propre plafond, et le job garde une marge au-dessus', () => {
    const plafond = (nom) => Number(etape(nom).match(/timeout-minutes:\s*(\d+)/)?.[1] ?? 0);
    const mobile = plafond('Playwright mobile viewport tests');
    const ios = plafond('Canari iOS — Playwright WebKit iPhone (non bloquant)');
    const job = Number(workflow.match(/name: Playwright local stack[\s\S]*?timeout-minutes:\s*(\d+)/)?.[1] ?? 0);

    expect(mobile, 'plafond de l’étape mobile').toBeGreaterThan(0);
    expect(ios, 'plafond du canari iOS').toBeGreaterThan(0);
    expect(etape('Playwright mobile viewport tests')).toContain('continue-on-error: true');
    expect(etape('Canari iOS — Playwright WebKit iPhone (non bloquant)')).toContain('continue-on-error: true');

    /* 35 min de flux principaux mesurés + 5 de mise en place, puis les deux canaris. */
    expect(job, 'budget du job').toBeGreaterThanOrEqual(40 + mobile + ios);
    expect(workflow).toContain('steps.mobile_viewport.outcome');
    expect(workflow).toContain('steps.canari_ios.outcome');
  });

  it('les gardes des tests reconnaissent bien ce nom de projet (contrôle positif)', () => {
    const spec = readFileSync(join(process.cwd(), 'tests/e2e/responsive-ide.spec.ts'), 'utf8');

    expect(spec).toMatch(/project\.name === 'mobile'/);
    expect(
      (spec.match(/test\.skip\(!isMobile|test\.skip\(isCompactIdeProject|test\.skip\(!isCompactIdeProject/g) ?? [])
        .length,
    ).toBeGreaterThan(5);
  });
});
