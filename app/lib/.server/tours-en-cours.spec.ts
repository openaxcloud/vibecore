import { describe, expect, it } from 'vitest';

import {
  attendreLesTours,
  avecSuiviDuTour,
  DUREE_MAX_D_UN_TOUR_MS,
  ouvrirUnTour,
  registreDesTours,
  toursVivants,
  type RegistreDesTours,
} from './tours-en-cours';

/* Horloge et sommeil simulés : l'attente se mesure sans attendre. */
function horloge() {
  let t = 1_000_000;

  return { maintenant: () => t, dormir: async (ms: number) => void (t += ms) };
}

describe('le registre des tours en cours', () => {
  it('un tour est ouvert tant que son travail court, et fermé après — même sur exception', async () => {
    const registre = registreDesTours();
    registre.clear();

    let pendant = -1;

    const ok = avecSuiviDuTour('chat:p1', async () => {
      pendant = registre.size;
      return 'fini';
    });

    expect(await ok()).toBe('fini');
    expect(pendant).toBe(1);
    expect(registre.size).toBe(0);

    const echec = avecSuiviDuTour('chat:p2', async () => {
      throw new Error('fournisseur');
    });

    await expect(echec()).rejects.toThrow('fournisseur');
    expect(registre.size).toBe(0);
  });

  it('un tour plus vieux que la borne est oublié : il ne bloque jamais un arrêt', () => {
    const registre: RegistreDesTours = new Map([[1, { debut: 0, etiquette: 'oublie' }]]);

    expect(toursVivants(registre, DUREE_MAX_D_UN_TOUR_MS + 1)).toEqual([]);
  });
});

describe('l’attente des tours à l’arrêt', () => {
  it('sans tour en cours, rend la main tout de suite', async () => {
    const h = horloge();
    const r = await attendreLesTours({ maxMs: 60_000, registre: new Map(), ...h, journal: () => {} });

    expect(r).toEqual({ restants: 0, attenteMs: 0 });
  });

  it('attend qu’un tour en cours se termine, et journalise ce qu’il lit à chaque tour', async () => {
    const h = horloge();
    const registre: RegistreDesTours = new Map();
    const fermer = ouvrirUnTour('chat:p1', registre);
    const journal: Array<Record<string, unknown>> = [];

    let tours = 0;

    const r = await attendreLesTours({
      maxMs: 60_000,
      intervalleMs: 5_000,
      registre,
      maintenant: h.maintenant,
      dormir: async (ms) => {
        await h.dormir(ms);

        if (++tours === 3) {
          fermer();
        }
      },
      journal: (e) => journal.push(e),
    });

    expect(r).toEqual({ restants: 0, attenteMs: 15_000 });
    expect(journal.map((e) => e.enCours)).toEqual([1, 1, 1, 0]);
  });

  it('s’arrête à la borne, et le dit', async () => {
    const h = horloge();
    const registre: RegistreDesTours = new Map();
    ouvrirUnTour('chat:bloque', registre);

    const journal: Array<Record<string, unknown>> = [];

    const r = await attendreLesTours({
      maxMs: 20_000,
      intervalleMs: 5_000,
      registre,
      ...h,
      journal: (e) => journal.push(e),
    });

    expect(r).toEqual({ restants: 1, attenteMs: 20_000 });
    expect(journal.at(-1)).toMatchObject({ event: 'arret.borne-atteinte', restants: 1 });
  });
});

describe('câblage', () => {
  it('le tour de chat reste ouvert tant qu’`execute` court (api.chat.ts)', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync('app/routes/api.chat.ts', 'utf8');

    /*
     * `avecSuiviDuTourPartage` compose `avecSuiviDuTour` (registre local, arrêt
     * propre) et l'annonce partagée lue par l'API — composition tenue par
     * tours-partages.spec.ts (« l'enveloppe du chat… dans le registre local »).
     */
    expect(source).toMatch(/createDataStream\(\{[\s\S]{0,400}execute: avecSuiviDuTour(?:Partage)?\(/);
  });
});
