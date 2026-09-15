import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Le chemin d'écriture doit RÉPARER un espace de travail absent, pas seulement
 * le constater.
 *
 * Mesuré en production le 2026-08-30, sur un projet créé la minute d'avant :
 * `PUT /api/runtime/workspaces/<projet>/files/write` répondait 425 en UNE
 * seconde, sans qu'aucune demande n'atteigne le workspace-manager. Vingt-cinq
 * minutes plus tard, toujours aucune ligne `Workspace` en base.
 *
 * La cause : `agentRequest` distingue deux codes pour la même situation — le pod
 * n'est pas joignable.
 *
 *   WORKSPACE_AGENT_REQUEST_FAILED  le pod ne répond pas
 *   WORKSPACE_NOT_STARTED           son nom DNS ne résout pas encore
 *
 * Le second a été introduit pour que l'IDE affiche « démarrage » plutôt qu'une
 * erreur serveur pendant la propagation kube-dns. Mais `agentMutateEnsuring` ne
 * relançait le provisionnement que sur le premier : un pod qui n'a JAMAIS existé
 * ne résout jamais, donc n'était jamais créé.
 *
 * CE QUE CE TEST PROUVE, ET CE QU'IL NE PROUVE PAS. Il lit la source : les deux
 * codes doivent conduire au provisionnement. Il ne rejoue pas un échec DNS — le
 * harnais d'intégration parle à un vrai serveur HTTP local, dont le nom résout
 * toujours. C'est donc un garde-fou sur l'INVARIANT, pas une reproduction.
 */

const APP = readFileSync(join(__dirname, 'app.ts'), 'utf8');

/** Le corps de `agentMutateEnsuring`, isolé du reste du fichier. */
function ensuringBody(): string {
  const start = APP.indexOf('const agentMutateEnsuring = async');
  expect(start, '`agentMutateEnsuring` est introuvable').toBeGreaterThan(-1);

  const end = APP.indexOf('const agentFileRead = async', start);
  expect(end).toBeGreaterThan(start);

  return APP.slice(start, end);
}

/**
 * Le corps SANS ses commentaires.
 *
 * Les cas positionnels ci-dessous comparent des emplacements dans le code : une
 * prose qui cite `ensureWorkspaceReachable` pour l'expliquer fausserait leur
 * verdict. Le premier jet de ce test est tombé exactement là-dessus.
 */
function ensuringCode(): string {
  return ensuringBody()
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

describe('démarrage à froid — le chemin d’écriture provisionne au lieu de constater', () => {
  it('traite les DEUX codes « pod injoignable » comme déclencheurs', () => {
    /*
     * `ensuringCode()` et non `ensuringBody()` : la prose qui explique le défaut
     * CITE les deux codes. Lue telle quelle, elle faisait passer ce cas même
     * après avoir retiré le second du garde — la contre-épreuve l'a montré.
     */
    const code = ensuringCode();

    expect(code).toContain('WORKSPACE_AGENT_REQUEST_FAILED');
    expect(code).toContain('WORKSPACE_NOT_STARTED');
  });

  it('tente le provisionnement avant de relancer l’erreur', () => {
    const body = ensuringCode();

    /*
     * L'ordre compte : sortir avant `ensureWorkspaceReachable` reproduirait le
     * défaut, quels que soient les codes cités plus haut.
     */
    const guard = body.indexOf('throw error;');
    const ensure = body.indexOf('ensureWorkspaceReachable');

    expect(ensure).toBeGreaterThan(-1);
    expect(ensure).toBeGreaterThan(guard);
  });

  it('réessaie la requête une fois l’espace de travail joignable', () => {
    const body = ensuringCode();
    const ensure = body.indexOf('ensureWorkspaceReachable');
    const retry = body.lastIndexOf('agentRequest<T>');

    expect(retry).toBeGreaterThan(ensure);
  });

  it('laisse passer les erreurs qui ne sont PAS un pod injoignable', () => {
    /*
     * Une erreur d'autorisation ou de validation ne doit pas déclencher un
     * provisionnement : elle ne serait pas résolue par un pod de plus.
     */
    const body = ensuringCode();

    expect(body).toMatch(/if \([^)]*failureCode[^)]*\)\s*\{\s*throw error;/s);
  });

  it('n’élargit pas le budget d’attente au passage', () => {
    /*
     * La correction porte sur le DÉCLENCHEMENT, pas sur la patience : un
     * démarrage réellement lent doit toujours finir en 425.
     */
    expect(APP).toMatch(/statusCode: 425,\s*\n\s*code: 'WORKSPACE_NOT_STARTED'/);
  });
});
