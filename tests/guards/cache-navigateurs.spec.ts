import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

/*
 * LE CACHE DES NAVIGATEURS NE DOIT PAS DEVENIR UN CACHE QUI MENT.
 *
 * Pourquoi il existe : mesuré le 2026-09-30 sur la tranche 1 de l'E2E de
 * `1fb51f092a`, « Install Playwright browsers » coûte 10 min 33 s, sur le
 * chemin critique de la porte de release — donc de chaque mise en production.
 *
 * Deux façons de le casser sans que rien ne rougisse, et ce garde les interdit :
 *
 * 1. UNE CLÉ CONSTANTE. Si la clé perd la version de Playwright, le cache rend
 *    des binaires d'une AUTRE version que celle du lockfile. Playwright refuse
 *    alors de démarrer, ou pire, teste avec un moteur qui n'est pas celui qu'on
 *    croit. Un cache qui rend la mauvaise chose est pire qu'absent.
 * 2. SAUTER L'INSTALLATION SUR SUCCÈS DU CACHE. La tentation est d'ajouter
 *    `if: cache-hit != 'true'`. Un cache partiel ou corrompu deviendrait alors
 *    une suite qui s'exécute sans navigateur, et l'erreur apparaîtrait très loin
 *    de sa cause. L'installation doit TOUJOURS tourner : sur succès elle ne fait
 *    rien, et sur cache abîmé elle répare.
 */
const workflow = readFileSync(join(__dirname, '..', '..', '.github/workflows/e2e.yml'), 'utf8');
const analyse = parse(workflow) as { jobs: Record<string, { steps?: Array<Record<string, unknown>> }> };

const etapes = Object.values(analyse.jobs).flatMap((job) => job.steps ?? []);
const etapeCache = etapes.find((e) => String(e.uses ?? '').startsWith('actions/cache@'));
const etapeInstall = etapes.find((e) => String(e.name ?? '') === 'Install Playwright browsers');

describe('le cache des navigateurs Playwright', () => {
  it('TÉMOIN — les deux étapes existent, sinon la garde ne mesure rien', () => {
    expect(etapeCache, "aucune étape `actions/cache` dans e2e.yml : le cache a disparu").toBeDefined();
    expect(etapeInstall, "l'étape « Install Playwright browsers » a été renommée ou retirée").toBeDefined();
  });

  it('LA CLÉ PORTE LA VERSION — sinon le cache rend les binaires d’une autre version', () => {
    const cle = String((etapeCache?.with as Record<string, unknown>)?.key ?? '');

    expect(cle, 'clé de cache vide').not.toBe('');
    expect(
      cle,
      `la clé « ${cle} » ne référence pas la version de Playwright. Une clé constante fait servir ` +
        "des binaires d'une autre version que le lockfile — un cache qui rend la mauvaise chose est " +
        'pire qu’un cache absent.',
    ).toMatch(/version_playwright\.outputs\.version/u);
  });

  it('le chemin mis en cache est bien celui où Playwright pose ses navigateurs', () => {
    const chemin = String((etapeCache?.with as Record<string, unknown>)?.path ?? '');

    expect(chemin, `chemin mis en cache inattendu : « ${chemin} »`).toMatch(/ms-playwright/u);
  });

  it('L’INSTALLATION N’EST JAMAIS SAUTÉE — un cache abîmé doit être réparé, pas contourné', () => {
    expect(
      etapeInstall?.if,
      "l'étape d'installation a gagné une condition : sur cache partiel ou corrompu, la suite " +
        "tournerait sans navigateur et l'erreur apparaîtrait loin de sa cause.",
    ).toBeUndefined();
  });

  it('la version se lit dans package.json et l’étape ÉCHOUE si elle est introuvable', () => {
    /*
     * Une clé construite sur une variable vide est une clé constante : le cas 1
     * ci-dessus, par une autre porte. L'étape doit donc refuser, pas continuer.
     */
    const lecture = etapes.find((e) => String(e.id ?? '') === 'version_playwright');

    expect(lecture, "l'étape de lecture de la version a disparu").toBeDefined();
    expect(String(lecture?.run ?? ''), 'elle ne lit pas @playwright/test dans package.json').toMatch(
      /@playwright\/test/u,
    );
    expect(
      String(lecture?.run ?? ''),
      'elle ne refuse pas une version introuvable : la clé deviendrait constante en silence',
    ).toMatch(/exit 1/u);
  });

  it('le succès du cache est JOURNALISÉ, pour qu’on puisse mesurer ce qu’il économise', () => {
    expect(
      String(etapeInstall?.run ?? ''),
      "sans trace du succès du cache dans le journal, on ne peut pas distinguer « le cache a servi » " +
        "de « le cache a raté » — et donc pas mesurer l'économie réelle.",
    ).toMatch(/cache-hit/u);
  });
});
