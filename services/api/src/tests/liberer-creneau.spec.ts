import { describe, expect, it } from 'vitest';

import { libererUnCreneauPourPublier, type DependancesDeLiberation, type EspaceActif } from '../liberer-creneau.js';

/*
 * Les deux cas que le test d'intégration (deploiement-refus-quota.spec.ts) ne
 * peut pas provoquer à coup sûr : un tour qui démarre ENTRE la lecture et l'arrêt,
 * et un build en cours dans l'autre espace. L'horloge est celle du test : on
 * mesure la décision, pas une attente réelle.
 */

const autre: EspaceActif = { workspaceId: 'ws_a', projectId: 'proj_a', nomDuProjet: 'Projet A' };

function banc(surcharges: Partial<DependancesDeLiberation>) {
  let horloge = 0;
  const annonces: string[] = [];
  const misesEnVeille: number[] = [];

  const deps: DependancesDeLiberation = {
    attenteMaxMs: 60_000,
    intervalleMs: 5_000,
    maintenant: () => horloge,
    dormir: async (ms) => {
      horloge += ms;
    },
    autresEspacesActifs: async () => [autre],
    toursEnCours: async () => 0,
    agentOccupe: async () => false,
    mettreEnVeilleEtReserver: async () => {
      misesEnVeille.push(horloge);

      return 'fait';
    },
    annoncer: (evenement) => annonces.push(evenement.type),
    ...surcharges,
  };

  return { deps, annonces, misesEnVeille, horloge: () => horloge };
}

describe('libérer un créneau pour publier', () => {
  it('un tour qui démarre pendant la mise en veille (revérifié sous le verrou) : rien n’est annoncé comme mis en veille', async () => {
    const { deps, annonces } = banc({ mettreEnVeilleEtReserver: async () => 'tour-apparu' });

    const issue = await libererUnCreneauPourPublier(deps);

    expect(issue.etat).toBe('occupe');
    expect(annonces).not.toContain('veille');
  });

  it('un BUILD en cours dans l’autre espace compte comme du travail en cours : on attend, on n’arrête pas', async () => {
    let appels = 0;
    const { deps, annonces, misesEnVeille } = banc({ agentOccupe: async () => ++appels <= 2 });

    const issue = await libererUnCreneauPourPublier(deps);

    expect(issue.etat).toBe('libere');
    expect(annonces).toEqual(['attente', 'veille']);
    expect(misesEnVeille).toEqual([10_000]);
  });

  it('la borne est tenue : au-delà, on rend la main au client sans avoir rien arrêté', async () => {
    const { deps, misesEnVeille, horloge } = banc({ toursEnCours: async () => 1 });

    const issue = await libererUnCreneauPourPublier(deps);

    expect(issue).toEqual({ etat: 'occupe', espaces: [autre] });
    expect(misesEnVeille).toEqual([]);
    expect(horloge()).toBe(60_000);
  });

  it('état des tours illisible : « inconnu », sans même sonder l’agent', async () => {
    let sondes = 0;
    const { deps, misesEnVeille } = banc({
      toursEnCours: async () => null,
      agentOccupe: async () => {
        sondes += 1;

        return false;
      },
    });

    expect(await libererUnCreneauPourPublier(deps)).toEqual({ etat: 'inconnu', raison: 'tours-illisibles' });
    expect(misesEnVeille).toEqual([]);
    expect(sondes).toBe(0);
  });
});
