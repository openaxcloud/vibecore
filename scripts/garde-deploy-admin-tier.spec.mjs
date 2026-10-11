import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

/**
 * BUG-BUILD-003 / AUDX-173 — l'image admin doit être construite par la chaîne
 * continue, comme les trois autres étages.
 *
 * Mesuré le 2026-09-07 (#483) : l'image servie datait du 2026-07-12, 56 jours
 * et 1 415 commits de retard, parce que `deploy-main.yml` n'invoquait jamais
 * l'étape qui savait la construire et qu'`apps/admin/` ne correspondait à
 * aucun motif de détection. Le déploiement était VERT pendant tout ce temps.
 *
 * Un workflow n'a pas de test : ce fichier en tient lieu. Il lit le YAML et
 * exige les trois pièces qui, ensemble, font que l'admin se reconstruit —
 * retirer l'une d'elles ramène le silence de juillet.
 */
const WORKFLOW = '.github/workflows/deploy-main.yml';

describe('deploy-main.yml — le tier admin est détecté, construit, et bloquant', () => {
  const yaml = readFileSync(WORKFLOW, 'utf8');

  it('un changement sous apps/admin/ (ou de sa config Cloud Build) marque le tier à construire', () => {
    expect(yaml).toMatch(/grep -Eq '\^\(apps\/admin\/\|infra\/cloudbuild\/admin-tier\\\.yaml\)' && ADMIN=true/);
  });

  it('la sortie `admin` est publiée et l’étape de build s’y conditionne', () => {
    expect(yaml).toContain('echo "admin=${ADMIN}" >> "$GITHUB_OUTPUT"');
    expect(yaml).toContain("if: steps.tiers.outputs.admin == 'true'");
  });

  it('l’étape construit bien la config admin-tier, en `set -euo pipefail` — un échec fait échouer le déploiement', () => {
    const debut = yaml.indexOf('- name: Build admin tier (Cloud Build)');

    expect(debut).toBeGreaterThan(-1);

    const etape = yaml.slice(debut, yaml.indexOf('- name: Set up Helm', debut));

    expect(etape).toContain('set -euo pipefail');
    expect(etape).toContain('--config=infra/cloudbuild/admin-tier.yaml');
    expect(etape).not.toContain('continue-on-error');
  });

  it('les entrées PARTAGÉES (packages/, lockfile, Dockerfile…) reconstruisent TOUS les étages, admin compris', () => {
    /*
     * Le repli « rien de détecté → web+runtime » est délibérément sans admin :
     * il ne couvre que des fichiers qui ne correspondent à AUCUN motif (CI,
     * scripts, tests), et l'admin n'en dépend pas. Ce qui doit tenir, c'est
     * l'autre branche : une entrée partagée laisse les quatre drapeaux à `true`.
     */
    const partage = yaml.match(
      /grep -Eq '\^\(packages\/\|pnpm-lock[^']*' && ADMIN=true\b[\s\S]*?echo "Shared\/base input changed -> build ALL tiers"|Shared\/base input changed -> build ALL tiers/,
    );

    expect(partage, 'la branche « entrée partagée → tout construire » doit exister').not.toBeNull();

    const avant = yaml.slice(0, yaml.indexOf('Shared/base input changed -> build ALL tiers'));
    const derniereInit = avant.lastIndexOf('RUNTIME=true; WEB=true; WSAGENT=true; ADMIN=true');

    expect(derniereInit, 'les quatre drapeaux doivent être initialisés à true avant la détection').toBeGreaterThan(-1);
  });

  it('l’admin ne dépend d’aucun paquet du monorepo — sinon son motif de détection est trop étroit', () => {
    /*
     * Le motif `apps/admin/` suffit tant que l'admin est autonome. Le jour où
     * `apps/admin/package.json` prend une dépendance `workspace:`, un changement
     * dans ce paquet ne reconstruira PAS l'admin : ce test rougit pour le dire.
     */
    const pkg = readFileSync('apps/admin/package.json', 'utf8');

    expect(pkg).not.toContain('workspace:');
  });
});
