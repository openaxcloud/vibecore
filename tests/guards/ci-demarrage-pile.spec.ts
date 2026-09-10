import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseDocument } from 'yaml';

/*
 * BUG-CI-008 — la porte E2E meurt AVANT le moindre test.
 *
 * MESURÉ, pas supposé (run E2E 1828, sha `dcfb310f`, 2026-09-09, 49 s) :
 * l'étape « Install Playwright browsers » échoue sur
 *   `Err:10 https://dl.google.com/linux/chrome-stable/deb … Hash Sum mismatch`
 * — l'index amont a été réécrit PENDANT le run (publié 09:41, run 17:16).
 * `--with-deps` déclenche un `apt-get update`, et rien ne le retentait :
 * `Start local dependencies`, `Prepare database`, `Start API` sont restées
 * SKIPPED. Aucun test exécuté, aucun rapport, et la porte de livraison lit
 * « non vert » (déploiement 1581 refusé).
 *
 * Deux choses se défont ici sans qu'aucun test ne rougisse — c'est exactement
 * la « garde manquante » de la règle 15 :
 *   • la boucle de reprise autour de l'installation des navigateurs ;
 *   • la seconde tentative de démarrage de la pile.
 *
 * ⚠️ Les assertions portent sur la CHAÎNE `run:` de l'étape, jamais sur les
 * commentaires qui l'entourent (règle 5) : un test qui lit la prose passe au
 * vert quand on reformule la prose.
 */

const RACINE = join(__dirname, '..', '..');

const WORKFLOWS = [
  '.github/workflows/e2e.yml',
  '.github/workflows/e2e-runtime.yml',
  '.github/workflows/i18n-live-audit.yml',
] as const;

/** Toutes les valeurs `run:` d'un workflow, commentaires retirés. */
function etapesRun(chemin: string): string[] {
  const document = parseDocument(readFileSync(join(RACINE, chemin), 'utf8'));
  const runs: string[] = [];

  const parcourir = (valeur: unknown) => {
    if (Array.isArray(valeur)) {
      valeur.forEach(parcourir);
      return;
    }

    if (!valeur || typeof valeur !== 'object') {
      return;
    }

    const objet = valeur as Record<string, unknown>;

    if (typeof objet.run === 'string') {
      runs.push(
        objet.run
          .split('\n')
          .filter((ligne) => !ligne.trimStart().startsWith('#'))
          .join('\n'),
      );
    }

    Object.values(objet).forEach(parcourir);
  };

  parcourir(document.toJS());

  return runs;
}

describe('BUG-CI-008 — la pile E2E se remet d’un amont qui hoquette', () => {
  it.each(WORKFLOWS)('%s expose bien des étapes `run` (règle 14 : la lecture a lu quelque chose)', (chemin) => {
    /* Un « 0 résultat » n'informe que si la recherche a tourné sur la bonne cible. */
    expect(etapesRun(chemin).length).toBeGreaterThan(3);
  });

  it.each(WORKFLOWS)('%s retente l’installation des navigateurs, de façon bornée', (chemin) => {
    const etape = etapesRun(chemin).find((run) => run.includes('playwright install'));

    expect(etape, 'aucune étape n’installe les navigateurs').toBeDefined();

    /* Une boucle de reprise… */
    expect(etape).toMatch(/for attempt in/);

    /* …BORNÉE, et qui échoue franchement à la dernière (jamais un `|| true` final). */
    expect(etape).toMatch(/exit 1/);

    /*
     * La purge de l'index apt est ce qui RÉPARE un Hash Sum mismatch : sans
     * elle, la reprise réutilise l'index périmé et échoue à l'identique — une
     * reprise qui ne peut pas réussir n'est qu'un rouge trois fois plus lent.
     */
    expect(etape).toContain('/var/lib/apt/lists/');
  });

  it.each(WORKFLOWS)('%s laisse la sortie d’erreur visible sur la commande dont on lit le résultat', (chemin) => {
    const etape = etapesRun(chemin).find((run) => run.includes('playwright install'))!;

    /* Règle 13 : masquer stderr transforme un échec en résultat vide. */
    expect(etape).not.toMatch(/playwright install[^\n]*2>\/dev\/null/);
  });

  it.each(WORKFLOWS)('%s attend la SANTÉ de la pile et lui laisse une seconde tentative', (chemin) => {
    const etape = etapesRun(chemin).find((run) => run.includes('docker compose') && run.includes('up -d'));

    expect(etape, 'aucune étape ne démarre la pile').toBeDefined();

    /*
     * `--wait` bloque jusqu'aux healthchecks : sans lui, l'attente ne teste que
     * l'OUVERTURE DU PORT, or postgres ouvre son port avant d'accepter des
     * requêtes et répond `FATAL: the database system is starting up`.
     */
    expect(etape).toContain('--wait');

    /* La seconde tentative, avec un volume propre — et seulement en cas d'échec. */
    expect(etape).toContain('down -v');
    expect((etape!.match(/up -d --wait/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});

/*
 * L'AUTRE MOITIÉ (règle 6). L'assertion `--wait` ci-dessus ne garantit quelque
 * chose que si les services déclarent un healthcheck : sans lui, `--wait`
 * n'attend que « running » et l'assertion passerait à vide. Les deux moitiés
 * doivent donc rougir ensemble, et vivre dans le même fichier.
 */
describe('BUG-CI-008 — ce sur quoi `--wait` s’appuie existe (règle 10)', () => {
  const compose = parseDocument(readFileSync(join(RACINE, 'docker-compose.dev.yml'), 'utf8')).toJS() as {
    services?: Record<string, { healthcheck?: { test?: unknown } }>;
  };

  it.each(['postgres', 'redis', 'mailpit'])('le service %s déclare un healthcheck', (service) => {
    expect(compose.services?.[service], `service ${service} absent`).toBeDefined();
    expect(compose.services?.[service]?.healthcheck?.test, `healthcheck ${service} absent`).toBeTruthy();
  });
});
