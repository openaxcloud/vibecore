import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/*
 * BUG-BUILD-002 : le tier `admin` était INCONSTRUCTIBLE, et le défaut était
 * invisible en local.
 *
 * `apps/admin` importe la source de l'application web via l'alias `~/*` du
 * workspace (`src/i18n.ts` -> `~/lib/i18n/catalogs/admin` et
 * `~/lib/i18n/language`, et `vite.config` alias `~` vers `../../app`). Or le
 * Dockerfile partagé ne copiait que `apps`, `packages` et `services` : dans le
 * conteneur, `app/` n'existait pas et `tsc --noEmit` échouait sur deux TS2307,
 * cassant `pnpm build`. En local le dépôt entier est présent, donc tout passait —
 * seul le build d'image révélait le problème, et l'image admin de production est
 * restée gelée pendant ce temps.
 *
 * Ce test lie les deux faits : TANT QUE l'admin importe `~/…`, le Dockerfile
 * DOIT copier `app/`. Il échoue si l'un des deux change sans l'autre.
 */

const DOCKERFILE = 'infra/docker/node-service.Dockerfile';

function repoFile(relative: string): string {
  // Les specs tournent depuis la racine du dépôt (vitest workspace).
  return readFileSync(new URL(`../../../${relative}`, import.meta.url), 'utf8');
}

describe('contexte de build du tier admin', () => {
  it('copie `app/` tant que la source admin dépend de l’alias `~/`', () => {
    const adminSources = ['apps/admin/src/i18n.ts'].map((file) => repoFile(file));
    const dependsOnWebApp = adminSources.some((source) => /from '~\//.test(source));

    if (!dependsOnWebApp) {
      /*
       * Si un jour l'admin devient autonome, ce garde n'a plus de raison d'être —
       * mais il ne doit pas échouer pour autant.
       */
      return;
    }

    const dockerfile = repoFile(DOCKERFILE);

    expect(dockerfile).toMatch(/^COPY app \.\/app$/mu);
  });

  it('ne copie `app/` que dans l’étage de build, pas dans l’image finale', () => {
    const dockerfile = repoFile(DOCKERFILE);
    const runtimeStage = dockerfile.slice(dockerfile.indexOf('AS runtime'));

    /*
     * L'étage runtime ne doit reprendre que `/runtime` (sortie de `pnpm deploy`).
     * Copier `app/` jusque dans l'image finale gonflerait les six services qui
     * partagent ce Dockerfile sans aucun bénéfice.
     */
    expect(runtimeStage).not.toMatch(/^COPY app /mu);
    expect(runtimeStage).toMatch(/COPY --from=build \/runtime \/runtime/u);
  });
});
