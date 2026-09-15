import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * PANEL-PERF — deux propriétés de la route de panneaux, tenues sur la SOURCE
 * parce que le loader Remix n'est pas injectable ici (convention déjà suivie
 * par `panel-uniformization-lot4`).
 *
 * 1. Le panneau Base de données ne doit plus expédier les manifestes.
 *    Mesuré en production le 2026-09-08 (web `a1d61a48…`, Helm rev. 1186),
 *    projet de 355 instantanés : `ide-panel/database` rendait **1 282 Ko** en
 *    3,54 à 3,68 s, contre **1 Ko en 0,66 à 0,80 s** sur un projet sans
 *    instantané — et `ide-panel/packages`, qui n'appelle pas `/snapshots`,
 *    restait à 0,84 s. Ce que les lents partagent, c'est cet appel.
 *
 *    ⚠️ L'appel n'est PAS retiré : la chaîne BaseChat → DatabaseWorkbench →
 *    DatabaseSettings → DatabaseRollbackPanel lit bien `data.snapshots`. Elle
 *    n'en lit que cinq champs, jamais le manifeste — d'où `fields=summary`.
 *
 * 2. Aucune branche du fan-out partagé ne doit pouvoir emporter l'enveloppe.
 *    `apiRequest` abandonne à 30 s ; sous cinq appels concurrents la liste
 *    d'instantanés montait à 13,6 s. Sans garde, un seul amont lent fait
 *    basculer tout le panneau en erreur.
 */

const SOURCE = readFileSync(join(__dirname, 'api.projects.$projectId.ide-panel.$panel.ts'), 'utf8');

/**
 * Extrait le corps du `Promise.all` qui suit un repère UNIQUE.
 *
 * ⚠️ Le premier jet ancrait sur `const workspaceCtx =`, présent dans plusieurs
 * blocs : le test mesurait un autre fan-out que celui visé, et rougissait pour
 * une raison fausse. L'unicité du repère est donc vérifiée ici même.
 */
function fanOut(repere: string): string {
  expect(SOURCE.split(repere).length - 1, `repère « ${repere} » non unique`).toBe(1);

  const ouverture = SOURCE.indexOf('await Promise.all([', SOURCE.indexOf(repere));
  expect(ouverture, 'aucun Promise.all après le repère').toBeGreaterThan(-1);

  return SOURCE.slice(ouverture, SOURCE.indexOf(']);', ouverture));
}

const FAN_OUT_PARTAGE = 'const [dashboard, envVars, deployments, snapshots] = await Promise.all([';

/* Ancre de CODE, pas de prose : `if (panel === 'database')` apparait aussi dans un commentaire et dans un `else if`. */
const FAN_OUT_DATABASE = 'const [dashboard, databases, envVars, secrets, snapshots] = await Promise.all([';

describe('PANEL-PERF — transport et robustesse de la route de panneaux', () => {
  it('témoin : la source est bien lue et porte les deux fan-outs visés', () => {
    /* Sans ce témoin, un chemin cassé rendrait « 0 occurrence » et tout le reste passerait à vide. */
    expect(SOURCE.length).toBeGreaterThan(10_000);
    expect(fanOut(FAN_OUT_DATABASE)).toContain('/databases');
    expect(fanOut(FAN_OUT_PARTAGE)).toContain('/deployments');
  });

  it('le panneau Base de données demande la projection sommaire des instantanés', () => {
    const bloc = fanOut(FAN_OUT_DATABASE);

    expect(bloc, 'l’appel aux instantanés est conservé — le panneau les affiche').toContain('/snapshots');
    expect(bloc, 'mais sans manifeste : fields=summary').toContain('/snapshots?fields=summary');
  });

  it('aucune LECTURE de liste d’instantanés ne part sans projection depuis cette route', () => {
    /*
     * Uniquement les GET : `apiRequest(request, `…/snapshots…`)` refermé
     * immédiatement. Sont donc hors périmètre, à raison :
     *  - la table d'endpoints du panneau Instantanés, qui doit garder le
     *    manifeste complet (`snapshotFiles` en dépend) ;
     *  - les POST de création et de restauration.
     */
    const lectures = [...SOURCE.matchAll(/apiRequest\(request, `\/projects\/\$\{projectId\}\/snapshots([^`]*)`\)/g)];

    expect(lectures.length, 'témoin : la route porte bien des lectures de liste').toBeGreaterThan(0);
    expect(
      lectures.filter((m) => !m[1].includes('fields=')).map((m) => m[0]),
      'lecture de liste sans projection',
    ).toEqual([]);
  });

  it('CHAQUE branche du fan-out partagé porte sa propre garde', () => {
    const bloc = fanOut(FAN_OUT_PARTAGE);
    const branches = bloc.split('apiRequest(request,').slice(1);

    expect(branches.length, 'témoin : le fan-out a bien plusieurs branches').toBeGreaterThan(2);

    for (const branche of branches) {
      const jusquAuBout = branche.slice(0, branche.indexOf('\n', branche.indexOf(')')) + 1);
      expect(`${jusquAuBout}${branche.slice(0, 200)}`, `branche sans .catch : ${branche.slice(0, 60)}`).toContain(
        '.catch(',
      );
    }
  });
});
