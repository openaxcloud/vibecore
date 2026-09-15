import { hashPassword } from '@vibecore/auth';
import { describe, expect, it } from 'vitest';

import { buildApiApp } from '../app.js';
import type { EmailProvider } from '../email.js';
import { TestApiStore } from './test-api-store.js';

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

/**
 * PANEL-PERF — `GET /projects/:id/snapshots` renvoyait TOUTES les lignes avec
 * TOUTES les colonnes, `manifest` compris.
 *
 * Mesuré en production le 2026-09-08 (web `a1d61a48…`, Helm rev. 1186), sur un
 * projet d'Avi créé le jour même :
 *
 *   355 instantanés  →  1 281 Ko de JSON  →  3,38 à 5,67 s (isolé)
 *                                            12,72 et 13,60 s à 5 en parallèle
 *   SQL brut correspondant : 29 / 36 / 47 ms
 *
 * Ni la base NI le calcul serveur ne sont le goulot — c'est le TRANSPORT.
 * Séparation mesurée sur le même point de terminaison :
 *
 *   n=355 : TTFB 0,43 à 1,09 s   total 2,85 à 4,41 s  → transfert ≈ 80-85 %
 *   n=0   : TTFB 0,28 à 0,46 s   total 0,28 à 0,47 s  → transfert ≈ 0
 *
 * Sérialisation JSON des 355 lignes : 14,1 ms (1,6 ms en projection sommaire).
 * Le levier est donc la TAILLE de la réponse, et elle traverse le réseau deux
 * fois (api → web → navigateur).
 *
 * Composition mesurée sur ces 355 lignes :
 *
 *   complet ................ 1 281 Ko
 *   manifeste sans `files` ..   142 Ko   (−88,9 %)
 *   sans manifeste ..........   127 Ko   (−90,1 %)
 *
 * `files` pèse donc 1 139 Ko à lui seul. Et 0 ligne sur 355 porte
 * `manifest.checkpoint` — l'appariement au chat passe par les colonnes
 * `conversationId` / `turnIndex` depuis la migration 0046.
 *
 * ⚠️ LE CONTRAT PAR DÉFAUT NE CHANGE PAS. `BaseChat.tsx` lit `manifest.files`
 * dans `snapshotFiles()` (liste des fichiers d'un instantané, et diff entre
 * deux instantanés). Retirer `manifest` par défaut casserait cet écran. Les
 * projections sont donc OPT-IN, et le premier test ci-dessous verrouille le
 * défaut.
 */

async function setup(nombre: number) {
  const store = new TestApiStore();
  const app = await buildApiApp({ store, emailProvider: new QuietEmailProvider() });

  const user = await store.createUser({
    email: 'snap@example.com',
    name: 'Snap',
    passwordHash: hashPassword('password123'),
  });
  const org = await store.createOrganization({ name: 'Snap Org', slug: 'snap-org', ownerUserId: user.id });
  await store.createSession({ userId: user.id, token: 'snap-token', expiresAt: new Date(Date.now() + 3600_000) });

  const project = await store.createProject({ organizationId: org.id, name: 'Snap Project', slug: 'snap-project' });

  /* Les instantanés sont créés du plus ANCIEN au plus RÉCENT : la liste doit les rendre à l'envers. */
  for (let index = 0; index < nombre; index += 1) {
    await store.createSnapshot({
      projectId: project.id,
      label: `point-${index}`,
      kind: 'before-ai-change',
      byteLength: 1000 + index,
      manifest: {
        checkpoint: { messageId: `msg-${index}` },
        files: Array.from({ length: 20 }, (_, f) => ({ path: `src/f${f}.ts`, sizeBytes: 100 + f })),
      },
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)),
    } as never);
  }

  return { app, project, store };
}

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

async function lister(app: Awaited<ReturnType<typeof setup>>['app'], projectId: string, query = '') {
  const res = await app.inject({
    method: 'GET',
    url: `/projects/${projectId}/snapshots${query}`,
    headers: auth('snap-token'),
  });
  expect(res.statusCode, `GET /snapshots${query}`).toBe(200);

  return res.json() as { snapshots: Array<Record<string, any>>; nextCursor?: string };
}

describe('PANEL-PERF — projection et bornage de la liste d’instantanés', () => {
  it('TÉMOIN + contrat par défaut : sans paramètre, la réponse porte TOUT le manifeste, `files` compris', async () => {
    const { app, project } = await setup(3);
    const { snapshots, nextCursor } = await lister(app, project.id);

    /* Témoin positif : sans lui, une route cassée rendrait « 0 instantané » et tous les tests suivants passeraient à vide. */
    expect(snapshots).toHaveLength(3);
    expect(snapshots[0].manifest, 'le manifeste reste servi par défaut').toBeDefined();
    expect(Array.isArray(snapshots[0].manifest.files), '`files` reste servi par défaut (snapshotFiles en dépend)').toBe(
      true,
    );
    expect(snapshots[0].manifest.files).toHaveLength(20);
    expect(nextCursor, 'aucune troncature quand aucune limite n’est demandée').toBeUndefined();
  });

  it('`fields=summary` retire le manifeste et garde exactement ce que le panneau de restauration lit', async () => {
    const { app, project } = await setup(3);
    const { snapshots } = await lister(app, project.id, '?fields=summary');

    expect(snapshots).toHaveLength(3);

    for (const snapshot of snapshots) {
      expect(snapshot.manifest, 'aucun manifeste en projection sommaire').toBeUndefined();

      /* Les cinq champs lus par DatabaseRollbackPanel (id, label, kind, sizeBytes/byteLength, createdAt). */
      expect(snapshot.id).toBeTruthy();
      expect(snapshot.label).toBeTruthy();
      expect(snapshot.kind).toBe('before-ai-change');
      expect(typeof snapshot.byteLength).toBe('number');
      expect(snapshot.createdAt).toBeTruthy();
    }
  });

  it('`fields=list` garde le manifeste MAIS retire `files` — les 1 139 Ko mesurés', async () => {
    const { app, project } = await setup(3);
    const { snapshots } = await lister(app, project.id, '?fields=list');

    for (const snapshot of snapshots) {
      expect(snapshot.manifest, 'le manifeste reste présent').toBeDefined();
      expect(snapshot.manifest.files, '`files` est retiré').toBeUndefined();
      expect(snapshot.manifest.checkpoint, 'le reste du manifeste est intact').toEqual({
        messageId: expect.any(String),
      });
    }
  });

  it('`limit` borne la page et annonce la suite', async () => {
    const { app, project } = await setup(5);
    const { snapshots, nextCursor } = await lister(app, project.id, '?limit=2');

    expect(snapshots).toHaveLength(2);
    expect(nextCursor, 'la suite est annoncée').toBeTruthy();
  });

  it('CONTRE-ÉPREUVE — au-delà de la première page, TOUS les anciens restent atteignables', async () => {
    const { app, project } = await setup(7);

    const attendus = (await lister(app, project.id)).snapshots.map((s) => s.id);
    expect(attendus, 'témoin : la liste complète en porte bien 7').toHaveLength(7);

    const vus: string[] = [];
    let cursor: string | undefined;
    let pages = 0;

    for (let page = 0; page < 10; page += 1) {
      const q = `?limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
      const { snapshots, nextCursor } = await lister(app, project.id, q);
      vus.push(...snapshots.map((s) => s.id));
      cursor = nextCursor;
      pages += 1;

      if (!cursor) {
        break;
      }
    }

    /* Ni perte, ni doublon, ni réordonnancement : la pagination doit être une découpe exacte. */
    /* Non-vacuité : sans ça, une route qui IGNORE `limit` rendrait tout en une page et ce test passerait à vide. */
    expect(pages, 'la pagination a bien été exercée sur plusieurs pages').toBeGreaterThan(1);
    expect(vus, 'aucun instantané perdu ni dupliqué').toEqual(attendus);
    expect(new Set(vus).size, 'aucun doublon').toBe(7);
    expect(cursor, 'la dernière page ne promet pas de suite').toBeUndefined();
  });

  it('LE BORNAGE ATTEINT LA BASE — le magasin est interrogé avec `take`, pas filtré après coup', async () => {
    /*
     * Cette garde vient d'une contre-épreuve MUETTE : en retirant
     * `take: limit + 1` de la route, les cinq tests précédents restaient VERTS.
     * Et pour cause — sans `take`, la route récupérait toutes les lignes puis
     * les tronquait avec `slice()` : le contrat tenait, la borne avait disparu,
     * et c'est la borne qui est le correctif. Un test de forme ne peut pas
     * remplacer un test de bornage.
     */
    const { app, project, store } = await setup(5);
    const appels: Array<Record<string, unknown> | undefined> = [];
    const original = store.listSnapshots.bind(store);

    (store as { listSnapshots: unknown }).listSnapshots = (projectId: string, options?: Record<string, unknown>) => {
      appels.push(options);

      return original(projectId, options as never);
    };

    await lister(app, project.id, '?limit=2');

    expect(appels, 'témoin : le magasin a bien été appelé').toHaveLength(1);
    expect(appels[0]?.take, 'la page est demandée à la base, pas découpée après').toBe(3);

    appels.length = 0;
    await lister(app, project.id);
    expect(appels[0]?.take, 'sans limite, aucun bornage — contrat historique').toBeUndefined();
  });

  it('une limite absurde ne peut pas faire exploser la réponse', async () => {
    const { app, project } = await setup(3);
    const { snapshots } = await lister(app, project.id, '?limit=99999');

    expect(snapshots.length).toBeLessThanOrEqual(3);
  });
});
