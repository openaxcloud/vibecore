import { createServer, type Server } from 'node:http';
import { Redis } from 'ioredis';
import { afterEach, describe, expect, it } from 'vitest';

import { buildApiApp } from '../app.js';
import { cleDesToursDuProjet, type LecteurRedisDesTours } from '../tours-partages.js';
import { TestApiStore } from './test-api-store.js';

/**
 * OUVRIR UN SECOND PROJET MET L'AUTRE EN VEILLE — décision d'Avi du 2026-10-11.
 *
 * Mesuré en production : un client gratuit (un seul espace actif) ouvre un
 * DEUXIÈME projet ; l'espace est refusé pour quota, l'agent « termine »… et aucun
 * fichier n'arrive. Le client croit que son application existe.
 *
 * Vraie API, vrai chemin d'ouverture puis d'écriture (rien de remplacé), contre
 * un manager et un agent HTTP locaux qui disent quels pods vivent et reçoivent
 * réellement les écritures. Redis RÉEL pour l'état des tours (celui de la CI).
 */

let fermetures: Array<() => Promise<void>> = [];

afterEach(async () => {
  for (const fermer of fermetures.reverse()) {
    await fermer();
  }

  fermetures = [];
});

const redisUrl = process.env.REDIS_URL;

if (process.env.CI && !redisUrl) {
  throw new Error('REDIS_URL absent en CI : les cas « tours lisibles » ne mesureraient rien.');
}

async function redisReel(): Promise<Redis> {
  const client = new Redis(redisUrl!, { lazyConnect: true, maxRetriesPerRequest: 1 });
  await client.connect();
  fermetures.push(async () => {
    client.disconnect();
  });

  return client;
}

async function ecouter(serveur: Server) {
  await new Promise<void>((resolve) => serveur.listen(0, '127.0.0.1', resolve));
  fermetures.push(() => new Promise<void>((resolve) => serveur.close(() => resolve())));

  return (serveur.address() as { port: number }).port;
}

async function preparer(options: { toursPartages?: LecteurRedisDesTours | null } = {}) {
  const podsVivants = new Set<string>();
  const arretsDemandes: string[] = [];
  const ecrituresRecues: Array<{ espace: string; path: string; content: string }> = [];

  const lireCorps = (requete: import('node:http').IncomingMessage) =>
    new Promise<string>((resolve) => {
      let corps = '';
      requete.on('data', (morceau) => (corps += morceau));
      requete.on('end', () => resolve(corps));
    });

  // L'agent de CHAQUE espace : ne répond que si son pod vit, et garde ce qu'on lui écrit.
  const agent = createServer(async (requete, reponse) => {
    const [, espace, ...reste] = new URL(requete.url ?? '/', 'http://agent.local').pathname.split('/');
    const chemin = `/${reste.join('/')}`;
    const corps = await lireCorps(requete);

    reponse.setHeader('content-type', 'application/json');

    if (!podsVivants.has(espace)) {
      reponse.writeHead(503).end('{}');

      return;
    }

    if (chemin === '/files/write' && requete.method === 'POST') {
      const { path, content } = JSON.parse(corps) as { path: string; content: string };
      ecrituresRecues.push({ espace, path, content });
    }

    reponse.end(chemin === '/busy' ? JSON.stringify({ busy: false }) : '{}');
  });

  const manager = createServer(async (requete, reponse) => {
    const chemin = new URL(requete.url ?? '/', 'http://manager.local').pathname;
    const corps = await lireCorps(requete);

    reponse.setHeader('content-type', 'application/json');

    if (requete.method === 'POST' && chemin === '/workspaces/start') {
      const { workspaceId } = JSON.parse(corps) as { workspaceId: string };
      podsVivants.add(workspaceId);
      reponse.end(JSON.stringify({ id: workspaceId, status: 'RUNNING' }));

      return;
    }

    const arret = /^\/workspaces\/([^/]+)\/stop$/.exec(chemin)?.[1];

    if (requete.method === 'POST' && arret) {
      arretsDemandes.push(arret);
      podsVivants.delete(arret);
      reponse.end(JSON.stringify({ id: arret, status: 'STOPPED' }));

      return;
    }

    if (chemin.endsWith('/agent-token')) {
      reponse.end(JSON.stringify({ token: 'jeton-test' }));

      return;
    }

    const identifiant = /^\/workspaces\/([^/]+)$/.exec(chemin)?.[1];

    if (identifiant && podsVivants.has(identifiant)) {
      reponse.end(JSON.stringify({ id: identifiant, status: 'RUNNING' }));

      return;
    }

    reponse.writeHead(404).end(JSON.stringify({ code: 'WORKSPACE_NOT_FOUND' }));
  });

  const portAgent = await ecouter(agent);
  const portManager = await ecouter(manager);

  const precedent = {
    WORKSPACE_MANAGER_URL: process.env.WORKSPACE_MANAGER_URL,
    WORKSPACE_AGENT_URL_TEMPLATE: process.env.WORKSPACE_AGENT_URL_TEMPLATE,
    INTERNAL_API_SHARED_SECRET: process.env.INTERNAL_API_SHARED_SECRET,
    WORKSPACE_COLD_START_BUDGET_MS: process.env.WORKSPACE_COLD_START_BUDGET_MS,
  };

  process.env.WORKSPACE_MANAGER_URL = `http://127.0.0.1:${portManager}`;
  process.env.WORKSPACE_AGENT_URL_TEMPLATE = `http://127.0.0.1:${portAgent}/{workspaceId}`;
  process.env.INTERNAL_API_SHARED_SECRET = 'secret-interne-test';
  process.env.WORKSPACE_COLD_START_BUDGET_MS = '5000';

  const store = new TestApiStore();
  const app = await buildApiApp({ store, toursPartages: options.toursPartages ?? null });

  fermetures.push(async () => {
    await app.close();

    for (const [cle, valeur] of Object.entries(precedent)) {
      if (valeur === undefined) {
        delete process.env[cle];
      } else {
        process.env[cle] = valeur;
      }
    }
  });

  const inscription = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      email: `ouverture-${Math.random().toString(36).slice(2, 10)}@example.com`,
      password: 'password123',
      name: 'Gratuit',
      organizationName: 'Gratuit Org',
    },
  });

  expect(inscription.statusCode).toBe(201);

  const { token, organization } = inscription.json() as { token: string; organization: { id: string } };
  const auth = { authorization: `Bearer ${token}` };

  const creerProjet = async (name: string) => {
    const reponse = await app.inject({
      method: 'POST',
      url: `/orgs/${organization.id}/projects`,
      headers: auth,
      payload: { name },
    });

    expect(reponse.statusCode).toBe(201);

    return reponse.json().project.id as string;
  };

  /** Ce que fait l'IDE au montage (`ProjectWorkspaceProvider`) — ou, sans `ouverture`, l'auto-réparation d'un onglet. */
  const ouvrir = (projectId: string, ouverture = true) =>
    app.inject({
      method: 'POST',
      url: '/api/runtime/workspaces',
      headers: auth,
      payload: { workspaceId: projectId, metadata: { projectId, ...(ouverture ? { ouverture: true } : {}) } },
    });

  // Le projet A tient le créneau gratuit : ouvert, espace RUNNING, pod vivant.
  const projetA = await creerProjet('Projet A');
  const ouvertureA = await ouvrir(projetA);

  expect(ouvertureA.statusCode, ouvertureA.body).toBe(200);

  const espaceA = ouvertureA.json().id as string;

  expect(podsVivants.has(espaceA)).toBe(true);

  const projetB = await creerProjet('Projet B');

  /** Ce que fait l'agent quand il crée un fichier dans le projet ouvert. */
  const ecrire = (espace: string, path: string, content: string) =>
    app.inject({
      method: 'PUT',
      url: `/api/runtime/workspaces/${encodeURIComponent(espace)}/files/write`,
      headers: auth,
      payload: { path, content },
    });

  const etatDe = async (espace: string) => (await store.getWorkspace(espace))?.status;

  return { ouvrir, ecrire, etatDe, projetA, projetB, espaceA, arretsDemandes, ecrituresRecues, podsVivants };
}

describe('ouvrir un second projet sans pouvoir mettre l’autre en veille : le refus reste', () => {
  it('état des tours ILLISIBLE : rien n’est arrêté — « on ne sait pas » n’est pas « inactif »', async () => {
    const { ouvrir, projetB, espaceA, arretsDemandes, etatDe } = await preparer({ toursPartages: null });

    const reponse = await ouvrir(projetB);

    expect(reponse.statusCode).toBe(429);
    expect(arretsDemandes).toEqual([]);
    expect(await etatDe(espaceA)).toBe('RUNNING');
  }, 30_000);
});

describe.runIf(redisUrl)('décision d’Avi du 11/10 : ouvrir un second projet met l’autre en veille', () => {
  it('autre espace INACTIF : il est mis en veille, le second s’ouvre, et les fichiers de l’agent ARRIVENT', async () => {
    const redis = await redisReel();

    const { ouvrir, ecrire, projetB, espaceA, arretsDemandes, ecrituresRecues, etatDe } = await preparer({
      toursPartages: redis,
    });

    const avantOuverture = ecrituresRecues.length;
    const ouverture = await ouvrir(projetB);

    /*
     * Mesuré AVANT correctif : 429 « your plan allows one active workspace at a
     * time », et l'écriture de l'agent n'arrivait jamais.
     */
    expect(ouverture.statusCode, ouverture.body).toBe(200);

    const espaceB = ouverture.json().id as string;

    expect(arretsDemandes).toEqual([espaceA]);
    expect(await etatDe(espaceA)).toBe('STOPPED');
    expect(await etatDe(espaceB)).toBe('RUNNING');

    // Mention discrète : l'IDE sait quel projet a été mis en veille.
    expect(ouverture.json().metadata?.misEnVeille).toEqual(['Projet A']);

    // L'ouverture amorce aussi le squelette du projet neuf : on regarde l'écriture DE L'AGENT, par son contenu.
    const contenu = 'export default function App() { return <h1>Compteur</h1>; }';
    const ecriture = await ecrire(espaceB, 'src/App.tsx', contenu);

    expect(ecriture.statusCode, ecriture.body).toBeLessThan(300);
    expect(ecrituresRecues.filter((recue) => recue.content === contenu)).toEqual([
      { espace: espaceB, path: 'src/App.tsx', content: contenu },
    ]);

    // Depuis l'ouverture de B, rien n'est écrit dans l'espace mis en veille.
    expect(ecrituresRecues.slice(avantOuverture).filter((recue) => recue.espace === espaceA)).toEqual([]);
  }, 30_000);

  it('auto-réparation d’un onglet resté ouvert (sans « ouverture ») : l’autre espace n’est PAS arrêté — pas de ping-pong', async () => {
    /*
     * Tours LISIBLES et autre espace inactif : tout permettrait la mise en veille,
     * seule l'intention manque. Sans cette garde, deux onglets ouverts sur deux
     * projets s'endormiraient l'un l'autre à chaque auto-réparation.
     */
    const redis = await redisReel();
    const { ouvrir, projetB, espaceA, arretsDemandes, etatDe } = await preparer({ toursPartages: redis });

    const reponse = await ouvrir(projetB, false);

    expect(reponse.statusCode).toBe(429);
    expect(arretsDemandes).toEqual([]);
    expect(await etatDe(espaceA)).toBe('RUNNING');
  }, 30_000);

  it('autre espace avec un TOUR EN COURS : il n’est PAS arrêté, rien n’est perdu, le refus reste', async () => {
    const redis = await redisReel();
    const { ouvrir, projetA, projetB, espaceA, arretsDemandes, etatDe } = await preparer({ toursPartages: redis });

    await redis.zadd(cleDesToursDuProjet(projetA), Date.now() + 15 * 60_000, `tour-${projetA}`);
    fermetures.push(async () => {
      await redis.zrem(cleDesToursDuProjet(projetA), `tour-${projetA}`);
    });

    const reponse = await ouvrir(projetB);

    expect(reponse.statusCode).toBe(429);
    expect(arretsDemandes).toEqual([]);
    expect(await etatDe(espaceA)).toBe('RUNNING');
  }, 30_000);

  it('rouvrir A ensuite met B en veille à son tour : l’aller-retour d’un client marche dans les deux sens', async () => {
    const redis = await redisReel();
    const { ouvrir, projetA, projetB, espaceA, arretsDemandes, etatDe } = await preparer({ toursPartages: redis });

    const espaceB = (await ouvrir(projetB)).json().id as string;
    const retour = await ouvrir(projetA);

    expect(retour.statusCode, retour.body).toBe(200);
    expect(arretsDemandes).toEqual([espaceA, espaceB]);
    expect(await etatDe(espaceA)).toBe('RUNNING');
    expect(await etatDe(espaceB)).toBe('STOPPED');
  }, 30_000);
});
