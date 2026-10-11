import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { platformMetricDefinitions } from './index.js';

/*
 * Garde : toute métrique incrémentée doit être déclarée ici.
 *
 * Le registre lève sur un nom inconnu. Sur `workspace_runtime_reseed_total`,
 * l'appel était fait sans déclaration : la levée retombait dans le `catch` de la
 * réconciliation et CHAQUE reseed réussi était journalisé
 * « runtime reseed reconciliation failed ». Constaté en réel sur l'env d'audit
 * pendant la chasse aux défauts de création — un journal qui dit l'inverse de ce
 * qui s'est passé coûte plus cher que pas de journal du tout.
 *
 * Ce test relit les sources et compare les littéraux aux déclarations, pour que
 * l'oubli soit rattrapé au commit et pas six mois plus tard dans un journal.
 */

const RACINE = new URL('../../..', import.meta.url).pathname;
const DOSSIERS = ['services/api/src', 'services/workspace-manager/src', 'services/preview-proxy/src'];

function nomsDeMetriques(source: string): string[] {
  const noms: string[] = [];
  const arbre = ts.createSourceFile('service.ts', source, ts.ScriptTarget.Latest, true);

  const visiter = (noeud: ts.Node) => {
    if (ts.isCallExpression(noeud) && ts.isPropertyAccessExpression(noeud.expression)) {
      const appel = noeud.expression;
      const receveur = appel.expression;

      const nomReceveur = ts.isIdentifier(receveur)
        ? receveur.text
        : ts.isPropertyAccessExpression(receveur)
          ? receveur.name.text
          : undefined;

      const argument = noeud.arguments[0];

      if (
        ['metrics', 'observabilityMetrics'].includes(nomReceveur ?? '') &&
        ['increment', 'observe', 'set'].includes(appel.name.text) &&
        argument &&
        (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument))
      ) {
        noms.push(argument.text);
      }
    }

    ts.forEachChild(noeud, visiter);
  };
  visiter(arbre);

  return noms;
}

function fichiersTypeScript(racine: string): string[] {
  const trouves: string[] = [];

  const descendre = (dossier: string) => {
    for (const entree of readdirSync(dossier)) {
      const complet = join(dossier, entree);

      if (statSync(complet).isDirectory()) {
        if (entree !== 'node_modules' && entree !== 'dist') {
          descendre(complet);
        }

        continue;
      }

      if (entree.endsWith('.ts') && !entree.endsWith('.spec.ts')) {
        trouves.push(complet);
      }
    }
  };

  descendre(racine);

  return trouves;
}

describe('métriques déclarées', () => {
  it('lit les appels réels, y compris optionnels, sans lire les commentaires et chaînes ordinaires', () => {
    expect(
      nomsDeMetriques(`
      metrics.increment('plain', {});
      this.metrics?.observe?.("optional", 1);
      request.observabilityMetrics?.increment?.('tenant', {});
      metrics.set(\`literal\`, 1);
      // metrics.increment('comment', {});
      const example = "metrics.increment('example', {})";
      unrelated.increment('other', {});
    `),
    ).toEqual(['plain', 'optional', 'tenant', 'literal']);
  });
  it('déclare toute métrique référencée par un littéral dans les services', () => {
    const declarees = new Set(platformMetricDefinitions.map((d) => d.name));
    const manquantes = new Map<string, string>();
    const vues = new Set<string>();

    for (const dossier of DOSSIERS) {
      const fichiers = fichiersTypeScript(join(RACINE, dossier));
      expect(fichiers.length, `sources examinées dans ${dossier}`).toBeGreaterThan(0);

      for (const fichier of fichiers) {
        const source = readFileSync(fichier, 'utf8');

        for (const nom of nomsDeMetriques(source)) {
          vues.add(nom);

          if (!declarees.has(nom)) {
            manquantes.set(nom, fichier.slice(RACINE.length));
          }
        }
      }
    }

    expect(vues.size, 'appels de métriques effectivement examinés').toBeGreaterThan(0);
    expect(vues.has('workspace_runtime_reseed_total'), 'témoin de la métrique historiquement omise').toBe(true);
    expect(Object.fromEntries(manquantes)).toEqual({});
  });

  it('ne déclare pas deux fois le même nom', () => {
    const noms = platformMetricDefinitions.map((d) => d.name);

    expect(noms.length).toBe(new Set(noms).size);
  });
});
