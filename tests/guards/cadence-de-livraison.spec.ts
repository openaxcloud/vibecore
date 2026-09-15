import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseDocument } from 'yaml';

/*
 * BUG-DEPLOY-CADENCE-001 — LA PORTE DE LIVRAISON PEUT ÊTRE AFFAMÉE SANS QU'UN
 * SEUL CONTRÔLE NE ROUGISSE.
 *
 * Le mécanisme, mesuré deux fois : `cancel-in-progress: false` protège le run
 * EN COURS, mais GitHub annule les runs EN ATTENTE d'un même groupe dès qu'un
 * plus récent arrive. Avec un groupe commun à toutes les poussées sur `main`,
 * une cadence soutenue évince les contrôles AVANT qu'ils ne démarrent.
 *
 *   - 2026-09-06 : le CI de `b987b79e98` créé à 11:27, annulé à 11:38, SANS
 *     AVOIR LANCÉ UN SEUL JOB. Trois déploiements refusés dans la journée sur
 *     des contrôles qui n'avaient pas échoué — seulement été évincés.
 *   - 2026-09-10 : je me le suis fait à moi-même. Cinq poussées en une heure
 *     sur une branche, aucun run E2E mené à terme (1899 annulé, 1904 en
 *     attente). C'est ce qui m'a fait ARRÊTER de pousser.
 *
 * La porte lit un run annulé comme « non vert » et refuse le déploiement. Or
 * rien n'a échoué : le correctif de 2026-09-06 (un groupe par SHA sur `main`)
 * tient dans une EXPRESSION, et une expression se « simplifie » en une ligne de
 * revue sans qu'aucun test ne rougisse. Le défaut reviendrait tel quel.
 *
 * LA RÈGLE, PAS L'OCCURRENCE (règle 7). La garde ne fige pas trois fichiers
 * nommés à la main : elle lit la POLITIQUE que la porte lit elle-même
 * (`scripts/release-gate/required-checks.json`, consommée par
 * `verify-required-checks.mjs`) et vaut donc pour le cinquième workflow requis
 * qu'on ajoutera demain, sans avoir à y penser.
 *
 * DEUX FORMES SONT SÛRES, et la garde accepte les deux :
 *   - AUCUN bloc `concurrency` — sans groupe, GitHub n'évince rien (c'est le
 *     cas de `security.yaml` aujourd'hui) ;
 *   - un groupe qui VARIE PAR COMMIT sur `main`, avec l'annulation désactivée
 *     là-bas (`ci.yml`, `e2e.yml`, `quality.yaml`).
 * La forme qui affame est celle du milieu : un groupe constant par branche qui
 * met les poussées en file.
 */

const RACINE = join(__dirname, '..', '..');
const POLITIQUE = join(RACINE, 'scripts', 'release-gate', 'required-checks.json');

type Politique = { requiredWorkflows?: Array<{ path?: string; displayName?: string }> };

function workflowsRequis(): Array<{ chemin: string; nom: string }> {
  const politique = JSON.parse(readFileSync(POLITIQUE, 'utf8')) as Politique;

  return (politique.requiredWorkflows ?? [])
    .filter((entree): entree is { path: string; displayName: string } => Boolean(entree.path))
    .map((entree) => ({ chemin: entree.path, nom: entree.displayName ?? entree.path }));
}

/**
 * Le verdict porté sur un bloc `concurrency`, isolé de toute lecture de fichier
 * pour qu'on puisse lui montrer les deux formes et vérifier qu'il les DISTINGUE.
 */
export function grouperParCommitSurMain(concurrence: { group?: unknown; 'cancel-in-progress'?: unknown } | undefined): {
  sur: boolean;
  pourquoi: string;
} {
  if (concurrence === undefined) {
    return { sur: true, pourquoi: 'aucun groupe : GitHub n’évince rien' };
  }

  const groupe = String(concurrence.group ?? '');

  if (!groupe.includes('github.sha')) {
    return { sur: false, pourquoi: `le groupe « ${groupe} » ne varie pas par commit : les poussées font la file` };
  }

  const annulation = String(concurrence['cancel-in-progress'] ?? 'false');

  if (annulation.trim() === 'true') {
    return { sur: false, pourquoi: 'l’annulation est inconditionnelle : une poussée tue le run du commit précédent' };
  }

  return { sur: true, pourquoi: 'un groupe par commit sur `main`, sans annulation là-bas' };
}

function concurrenceDe(chemin: string) {
  const fichier = join(RACINE, chemin);
  expect(existsSync(fichier), `${chemin} est requis par la porte mais n’existe pas`).toBe(true);

  const document = parseDocument(readFileSync(fichier, 'utf8'));

  return document.toJS()?.concurrency as { group?: unknown; 'cancel-in-progress'?: unknown } | undefined;
}

describe('BUG-DEPLOY-CADENCE-001 — les contrôles requis ne peuvent pas être évincés sur `main`', () => {
  it('la politique de livraison est lisible et nomme bien des workflows', () => {
    /*
     * Règle 14 : un « 0 résultat » n'informe que si la recherche a porté. Une
     * politique vide ferait passer la boucle suivante sans rien vérifier —
     * exactement le vert creux qu'on cherche à éviter (règle 14 bis).
     */
    const requis = workflowsRequis();

    expect(requis.length, 'aucun workflow requis lu : la garde ne mesurerait rien').toBeGreaterThanOrEqual(4);
    expect(requis.map((w) => w.chemin)).toContain('.github/workflows/ci.yml');
    expect(requis.map((w) => w.chemin)).toContain('.github/workflows/e2e.yml');
  });

  it.each(workflowsRequis())('$nom ne met pas les poussées de `main` en file', ({ chemin }) => {
    const verdict = grouperParCommitSurMain(concurrenceDe(chemin));

    expect(verdict.sur, `${chemin} : ${verdict.pourquoi}`).toBe(true);
  });

  it('le verdict DISTINGUE les deux formes — sans quoi il dirait « sûr » à tout', () => {
    /*
     * Un prédicat qui rend toujours vrai passerait la boucle ci-dessus quoi
     * qu'il arrive aux workflows. On lui montre donc la forme qui affame, dans
     * son écriture EXACTE d'avant le correctif du 2026-09-06.
     */
    expect(grouperParCommitSurMain({ group: '${{ github.workflow }}-${{ github.ref }}' }).sur).toBe(false);
    expect(grouperParCommitSurMain({ group: 'production-ci-${{ github.ref }}', 'cancel-in-progress': false }).sur).toBe(
      false,
    );
    expect(
      grouperParCommitSurMain({ group: 'production-ci-${{ github.sha }}', 'cancel-in-progress': true }).sur,
      'une annulation inconditionnelle tue le run du commit précédent, groupe par SHA ou non',
    ).toBe(false);

    // Et les deux formes sûres restent acceptées.
    expect(grouperParCommitSurMain(undefined).sur).toBe(true);
    expect(
      grouperParCommitSurMain({
        group: "production-ci-${{ github.ref == 'refs/heads/main' && github.sha || github.ref }}",
        'cancel-in-progress': "${{ github.ref != 'refs/heads/main' }}",
      }).sur,
    ).toBe(true);
  });
});
