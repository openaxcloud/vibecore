import { describe, expect, it } from 'vitest';

import { TestApiStore } from './test-api-store.js';

/**
 * LE QUOTA D'INSTANTANÉS EST UNE ALLOCATION PAR PÉRIODE, PAS UN PLAFOND À VIE.
 *
 * Il comptait TOUS les instantanés de l'organisation, depuis toujours. Une fois
 * le plafond du plan atteint, le retour arrière disparaissait DÉFINITIVEMENT —
 * y compris dans un projet neuf à zéro instantané, puisque le compte porte sur
 * l'organisation entière.
 *
 * Mesuré en production le 2026-09-06 : **125 organisations sur 303** au plafond
 * de 5 ou au-dessus, dont une à 3 451 instantanés. Sur une plateforme où l'agent
 * réécrit le code, c'était supprimer le retour arrière après cinq usages.
 *
 * Le même défaut avait été diagnostiqué et corrigé pour `deployments.count`,
 * avec le commentaire qui le nomme (« permanently locked out ») — il n'avait pas
 * été reporté sur la clé voisine.
 */

const JOUR = 24 * 60 * 60 * 1000;

async function organisationAvecInstantanes(ages: readonly number[]) {
  const store = new TestApiStore();
  const proprietaire = await store.createUser({
    email: `q-${Math.random().toString(36).slice(2, 8)}@example.com`,
    passwordHash: 'x',
  });
  const org = await store.createOrganization({
    name: 'Org quota',
    slug: `org-${Math.random().toString(36).slice(2, 8)}`,
    ownerUserId: proprietaire.id,
  });
  const project = await store.createProject({ organizationId: org.id, name: 'Projet', slug: 'projet' });

  for (const joursEnArriere of ages) {
    const snapshot = await store.createSnapshot({ projectId: project.id, label: `s-${joursEnArriere}`, manifest: {} });
    const stocke = store.snapshots.get(snapshot.id)!;
    store.snapshots.set(snapshot.id, {
      ...stocke,
      createdAt: new Date(Date.now() - joursEnArriere * JOUR).toISOString(),
    });
  }

  return { store, org };
}

describe('quota d’instantanés : allocation par période', () => {
  it('SANS fenêtre, tout compte — c’est le comportement fautif, gardé comme référence', async () => {
    const { store, org } = await organisationAvecInstantanes([200, 150, 100, 60, 40, 2]);

    expect(await store.countSnapshots(org.id)).toBe(6);
  });

  it('AVEC fenêtre, seuls les instantanés de la période comptent', async () => {
    const { store, org } = await organisationAvecInstantanes([200, 150, 100, 60, 40, 2]);
    const debutPeriode = new Date(Date.now() - 30 * JOUR);

    /*
     * Cinq instantanés anciens ne doivent plus condamner l'organisation : ils
     * sont hors période. C'est exactement le cas des 125 organisations mesurées.
     */
    expect(await store.countSnapshots(org.id, debutPeriode)).toBe(1);
  });

  it('une organisation qui dépasse RÉELLEMENT sur la période reste comptée', async () => {
    const { store, org } = await organisationAvecInstantanes([5, 4, 3, 2, 1, 0]);
    const debutPeriode = new Date(Date.now() - 30 * JOUR);

    /*
     * L'autre sens de la contre-épreuve : la fenêtre ne doit pas supprimer le
     * plafond, seulement cesser de le rendre définitif. Six instantanés pris
     * dans la période comptent bien pour six.
     */
    expect(await store.countSnapshots(org.id, debutPeriode)).toBe(6);
  });

  it('une organisation neuve part de zéro sur la période', async () => {
    const { store, org } = await organisationAvecInstantanes([365, 200]);

    expect(await store.countSnapshots(org.id, new Date(Date.now() - 30 * JOUR))).toBe(0);
  });

  it('la borne est INCLUSIVE — un instantané pile au début de période compte', async () => {
    const { store, org } = await organisationAvecInstantanes([30]);

    /*
     * La borne est prise EXACTEMENT à l'horodatage de l'instantané. Une première
     * version plaçait la borne une seconde avant : `>` et `>=` rendaient alors le
     * même résultat, et le cas restait vert même en rendant la borne exclusive.
     * Il faut viser l'égalité stricte pour que ce test mesure quelque chose.
     */
    const instantane = [...store.snapshots.values()][0];
    const debutPeriode = new Date(instantane.createdAt);

    expect(await store.countSnapshots(org.id, debutPeriode)).toBe(1);
  });
});
