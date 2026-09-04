import { describe, expect, it } from 'vitest';

import { comparerValeurs, formaterEcarts } from './garde-derive-valeurs.mjs';

/** Le cas réel : #375 fusionnée le 02/09, jamais appliquée avant le 04/09. */
const FICHIER_375 = {
  services: {
    api: { resources: { requests: { cpu: '500m', memory: '512Mi' }, limits: { cpu: '2', memory: '1Gi' } } },
  },
};

describe('garde contre la dérive silencieuse des valeurs', () => {
  // DISCRIMINANT — doit échouer sur le défaut, passer une fois corrigé.
  it('crie quand la production applique une limite plus basse que le fichier', () => {
    const release = {
      services: {
        api: { resources: { requests: { cpu: '100m', memory: '256Mi' }, limits: { cpu: '500m', memory: '512Mi' } } },
      },
    };

    const ecarts = comparerValeurs(FICHIER_375, release);

    expect(ecarts).toHaveLength(4);
    expect(formaterEcarts(ecarts)).toContain('le fichier demande 2, la production applique 500m');
    expect(formaterEcarts(ecarts)).toContain('--set services.api.resources.limits.cpu=2');
  });

  // DISCRIMINANT — l'état après ma correction du 04/09 doit être muet.
  it('se tait quand la production applique ce que le fichier demande', () => {
    const release = { services: { api: FICHIER_375.services.api } };

    expect(comparerValeurs(FICHIER_375, release)).toEqual([]);
  });

  // DISCRIMINANT — le cas le plus dangereux : le champ n'a jamais été transmis.
  it("crie quand le champ est absent des valeurs de la release", () => {
    const ecarts = comparerValeurs(FICHIER_375, { services: { api: {} } });

    expect(ecarts).toEqual([
      { service: 'api', chemin: 'resources', demande: expect.any(String), applique: 'ABSENT des valeurs de la release' },
    ]);
  });

  // GARDE ASSUMÉE — passe des deux côtés À DESSEIN : elle protège contre le
  // troc inverse, un garde si bruyant qu'on finirait par le désactiver.
  it("ne crie pas sur '2' contre 2 : --set stocke un nombre, le YAML une chaîne", () => {
    const release = {
      services: {
        api: { resources: { requests: { cpu: '500m', memory: '512Mi' }, limits: { cpu: 2, memory: '1Gi' } } },
      },
    };

    expect(comparerValeurs(FICHIER_375, release)).toEqual([]);
  });

  // GARDE ASSUMÉE — un service éteint n'a pas de valeurs à comparer.
  it('ignore un service désactivé', () => {
    const fichier = { services: { admin: { enabled: false, replicas: 2 } } };

    expect(comparerValeurs(fichier, { services: {} })).toEqual([]);
  });
});

/**
 * Le garde ne doit PAS refermer les écarts tout seul.
 *
 * Mesuré le 2026-09-04 : sur les 9 écarts de la révision 1127, deux voulaient
 * ramener la mémoire du screenshotter de 2Gi à 1Gi. La production était plus
 * haute que le fichier parce qu'un `--set` d'hier corrigeait un OOM. Un garde
 * qui ré-applique le fichier aurait recassé ce qu'un humain avait réparé.
 */
describe("le détecteur signale, il n'agit pas", () => {
  it('crie aussi quand la production est PLUS haute que le fichier', () => {
    const fichier = { services: { screenshotter: { resources: { limits: { memory: '1Gi' } } } } };
    const release = { services: { screenshotter: { resources: { limits: { memory: '2Gi' } } } } };

    const ecarts = comparerValeurs(fichier, release);

    expect(ecarts).toEqual([
      { service: 'screenshotter', chemin: 'resources.limits.memory', demande: '1Gi', applique: '2Gi' },
    ]);
  });

  it("n'émet aucune commande exécutable sur la sortie standard", async () => {
    const source = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('./detecter-derive-valeurs.mjs', import.meta.url), 'utf8'),
    );

    // console.log = ce que le shell capture et pourrait passer à helm.
    expect(source).not.toContain('console.log');
  });
});
