import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

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
   * duré 20,5 min et le job entier a été tué par son budget de 75 min — « cancelled »,
   * PR bloquée. Depuis la découpe en tranches (#605), l'étape vit dans la tranche 1
   * et le canari iOS dans son propre job (garde tests/guards/ci-canari-borne.spec.ts).
   * Un canari non bloquant doit porter son plafond, tenir dans le budget de sa
   * tranche, et un bilan doit imprimer son sort — un canari tué en silence ne
   * vaut rien. Garde sur la STRUCTURE (règle 5), pas sur les commentaires.
   */
  it('le canari mobile porte son propre plafond, reste non bloquant, tient dans sa tranche, et son sort est imprimé', () => {
    const jobs = Object.values(parse(workflow).jobs ?? {});
    const jobDuCanari = jobs.find((job) => (job.steps ?? []).some((etape) => etape.id === 'mobile_viewport'));
    const canari = (jobDuCanari?.steps ?? []).find((etape) => etape.id === 'mobile_viewport');

    expect(canari, 'étape mobile_viewport introuvable : la garde ne mesure rien').toBeDefined();
    expect(canari['continue-on-error'], 'le canari doit rester non bloquant').toBe(true);
    expect(canari['timeout-minutes'], 'sans plafond, le canari consomme le budget de la tranche').toBeGreaterThan(0);
    expect(canari['timeout-minutes']).toBeLessThanOrEqual(20);

    /* ~35 min de flux principaux mesurés + 5 de mise en place, puis le canari. */
    expect(jobDuCanari['timeout-minutes'], 'budget de la tranche').toBeGreaterThanOrEqual(
      40 + canari['timeout-minutes'],
    );

    const bilan = (jobDuCanari.steps ?? []).find((etape) =>
      (etape.run ?? '').includes('steps.mobile_viewport.outcome'),
    );
    expect(bilan, 'aucune étape n’imprime le sort du canari mobile').toBeDefined();
    expect(String(bilan.if ?? ''), 'le bilan doit tourner même si le canari est tué').toContain('always()');
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
