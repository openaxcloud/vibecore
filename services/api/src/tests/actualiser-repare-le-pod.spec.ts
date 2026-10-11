import { createServer, type Server } from 'node:http';
import { describe, expect, it } from 'vitest';
import { buildApiApp } from '../app.js';
import { TestApiStore } from './test-api-store.js';

/*
 * BUG-IDE-007 — « Actualiser les fichiers » ne réparait pas l'arbre.
 *
 * Mesuré le 2026-08-15 : Bibliothèque « 9 fichiers », clic sur Actualiser →
 * « 10 », pendant que Git en comptait 20 et que `GET /projects/<id>/files` en
 * rendait 20. La réconciliation stockage → pod n'était déclenchée qu'UNE fois
 * par workspace, à l'ouverture ; une désynchronisation survenue APRÈS n'était
 * jamais réparée, et chaque clic relisait le pod amputé.
 *
 * Ces cas passent par l'API RÉELLE (`app.inject`) contre un faux agent dont on
 * peut AMPUTER l'arbre après coup, et qui COMPTE les écritures reçues. C'est la
 * seule mesure qui distingue « a relu » de « a réparé ».
 *
 * Harnais calqué sur `manifeste-crud-durable.spec.ts` : DEUX serveurs (le
 * gestionnaire qui frappe le jeton d'agent, et l'agent), sinon l'API rend 502.
 */
async function demarrerRuntime() {
  const fichiers = new Map<string, string>();
  const appels: string[] = [];

  const agent = createServer((requete, reponse) => {
    const url = new URL(requete.url ?? '/', 'http://agent.local');
    appels.push(`${requete.method} ${url.pathname}`);

    let brut = '';
    requete.on('data', (morceau) => {
      brut += morceau.toString();
    });
    requete.on('end', () => {
      const charge = brut ? (JSON.parse(brut) as Record<string, string>) : {};
      reponse.setHeader('content-type', 'application/json');

      if (requete.method === 'GET' && url.pathname === '/files/tree') {
        reponse.end(JSON.stringify([...fichiers.keys()].map((path) => ({ path, type: 'file' }))));
      } else if (requete.method === 'GET' && url.pathname === '/files/read') {
        reponse.end(JSON.stringify({ content: fichiers.get(url.searchParams.get('path') ?? '') ?? '' }));
      } else if (requete.method === 'POST' && (url.pathname === '/files/write' || url.pathname === '/files/create')) {
        fichiers.set(charge.path!, charge.content ?? '');
        reponse.end(JSON.stringify({ ok: true }));
      } else {
        reponse.end(JSON.stringify({ ok: true }));
      }
    });
  });

  await new Promise<void>((resoudre) => agent.listen(0, '127.0.0.1', () => resoudre()));

  const gestionnaire = createServer((requete, reponse) => {
    const url = new URL(requete.url ?? '/', 'http://manager.local');
    reponse.setHeader('content-type', 'application/json');
    reponse.end(
      JSON.stringify(url.pathname.endsWith('/agent-token') ? { token: 'runtime-token' } : { status: 'RUNNING' }),
    );
  });

  await new Promise<void>((resoudre) => gestionnaire.listen(0, '127.0.0.1', () => resoudre()));

  const precedentGestionnaire = process.env.WORKSPACE_MANAGER_URL;
  const precedentAgent = process.env.WORKSPACE_AGENT_URL_TEMPLATE;
  process.env.WORKSPACE_MANAGER_URL = `http://127.0.0.1:${(gestionnaire.address() as { port: number }).port}`;
  process.env.WORKSPACE_AGENT_URL_TEMPLATE = `http://127.0.0.1:${(agent.address() as { port: number }).port}`;

  return {
    fichiers,
    appels,
    ecrituresRecues: () => appels.filter((appel) => appel === 'POST /files/write').length,
    async fermer() {
      process.env.WORKSPACE_MANAGER_URL = precedentGestionnaire;
      process.env.WORKSPACE_AGENT_URL_TEMPLATE = precedentAgent;
      await Promise.all(
        [agent, gestionnaire].map(
          (serveur: Server) => new Promise<void>((resoudre) => serveur.close(() => resoudre())),
        ),
      );
    },
  };
}

async function contexte() {
  const runtime = await demarrerRuntime();
  const store = new TestApiStore();
  const app = await buildApiApp({ store });

  const inscription = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      email: `actualiser-${Math.random().toString(36).slice(2, 10)}@example.com`,
      password: 'password123',
      name: 'Actualiser',
      organizationName: 'Actualiser Org',
    },
  });

  const token = inscription.json().token as string;
  const organizationId = inscription.json().organization.id as string;

  const projet = await app.inject({
    method: 'POST',
    url: `/orgs/${organizationId}/projects`,
    headers: { authorization: `Bearer ${token}` },
    payload: { name: 'Actualiser répare' },
  });

  const projectId = projet.json().project.id as string;
  const entetes = { authorization: `Bearer ${token}` };

  return {
    runtime,

    /** Un collaborateur en LECTURE SEULE sur ce projet, membre d'aucune organisation du propriétaire. */
    async lecteur() {
      const inscription = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: `lecteur-${Math.random().toString(36).slice(2, 10)}@example.com`,
          password: 'password123',
          name: 'Lecteur',
          organizationName: 'Lecteur Org',
        },
      });

      await store.addProjectCollaborator({
        projectId,
        userId: inscription.json().user.id as string,
        roleKey: 'viewer',
      });

      return { authorization: `Bearer ${inscription.json().token as string}` };
    },
    listerEnTantQue: async (entetesDuLecteur: { authorization: string }, reparer = false) => {
      const reponse = await app.inject({
        method: 'GET',
        url: `/api/runtime/workspaces/${projectId}/files?path=.${reparer ? '&reparer=1' : ''}`,
        headers: entetesDuLecteur,
      });

      return { statut: reponse.statusCode, chemins: (reponse.json() as Array<{ path: string }>).map((n) => n.path) };
    },
    ecrire: (path: string, content: string) =>
      app.inject({
        method: 'PUT',
        url: `/api/runtime/workspaces/${projectId}/files/write`,
        headers: entetes,
        payload: { path, content },
      }),
    lister: async (reparer = false) => {
      const reponse = await app.inject({
        method: 'GET',
        url: `/api/runtime/workspaces/${projectId}/files?path=.${reparer ? '&reparer=1' : ''}`,
        headers: entetes,
      });

      expect(reponse.statusCode).toBe(200);

      return (reponse.json() as Array<{ path: string }>).map((noeud) => noeud.path).sort();
    },
    fermer: async () => {
      await app.close();
      await runtime.fermer();
    },
  };
}

/** Laisse la réconciliation d'OUVERTURE (en arrière-plan) se terminer avant d'amputer le pod. */
const laisserRespirer = () => new Promise((resoudre) => setTimeout(resoudre, 400));

describe('BUG-IDE-007 — un « Actualiser » demandé par l’utilisateur répare le pod, une relecture non', () => {
  it('SÉQUENCE COMPLÈTE : archive intacte, pod amputé, relecture muette, réparation sur demande, puis limitation', async () => {
    const c = await contexte();

    try {
      /* Trois fichiers écrits par la route durable : ils sont dans le pod ET dans l'archive. */
      for (const [path, content] of [
        ['src/App.tsx', 'export default function App() {}'],
        ['src/main.tsx', 'import App from "./App";'],
        ['src/index.css', 'body { margin: 0 }'],
      ] as const) {
        expect((await c.ecrire(path, content)).statusCode).toBe(204);
      }

      /*
       * Ouverture : le listing consomme la réconciliation « une fois ». Le projet
       * est né d'un gabarit, donc l'archive porte AUSSI ses fichiers de départ,
       * que le faux pod n'a jamais eus : cette première réconciliation les y
       * écrit (mesuré : 5 écritures de plus que mes 3). C'est la ligne de base,
       * pas le sujet du test — le sujet commence une fois le pod stabilisé.
       */
      expect(await c.lister()).toEqual(expect.arrayContaining(['src/App.tsx', 'src/index.css', 'src/main.tsx']));
      await laisserRespirer();

      const ecrituresApresOuverture = c.runtime.ecrituresRecues();
      expect(ecrituresApresOuverture, 'au moins mes trois écritures').toBeGreaterThanOrEqual(3);
      expect(c.runtime.fichiers.has('src/App.tsx') && c.runtime.fichiers.has('src/main.tsx')).toBe(true);

      /* Le pod perd deux fichiers — le cas du 15/08 : l'archive en a 3, le pod 1. */
      c.runtime.fichiers.delete('src/App.tsx');
      c.runtime.fichiers.delete('src/main.tsx');

      /*
       * CONTRÔLE — une relecture AUTOMATIQUE (sans `reparer`) rend le pod amputé
       * et ne réécrit rien : c'est le comportement mesuré le 15/08, et il doit
       * rester tel quel pour les ~55 relectures par session qui ne demandent
       * rien. Sans ce cas, le suivant passerait aussi avec une réconciliation à
       * chaque lecture — ce que la garde « une fois » interdit exprès.
       */
      const relecture = await c.lister();
      expect(relecture).toContain('src/index.css');
      expect(relecture, 'le pod amputé est rendu tel quel').not.toEqual(
        expect.arrayContaining(['src/App.tsx', 'src/main.tsx']),
      );
      await laisserRespirer();
      expect(c.runtime.ecrituresRecues(), 'une relecture automatique ne répare pas').toBe(ecrituresApresOuverture);

      /*
       * LE CORRECTIF — le clic de l'utilisateur force la réconciliation, l'ATTEND,
       * puis liste : la réponse porte déjà les trois fichiers, et le pod a reçu
       * exactement les deux écritures manquantes.
       */
      expect(await c.lister(true)).toEqual(expect.arrayContaining(['src/App.tsx', 'src/index.css', 'src/main.tsx']));
      expect(c.runtime.ecrituresRecues(), 'les deux fichiers manquants, réécrits AVANT la réponse').toBe(
        ecrituresApresOuverture + 2,
      );
      expect(c.runtime.fichiers.get('src/App.tsx')).toBe('export default function App() {}');

      /* LIMITATION — un second clic dans la foulée ne relit pas tout le projet. */
      c.runtime.fichiers.delete('src/main.tsx');
      expect(await c.lister(true)).not.toContain('src/main.tsx');
      expect(c.runtime.ecrituresRecues(), 'un double-clic ne force pas deux fois').toBe(ecrituresApresOuverture + 2);
    } finally {
      await c.fermer();
    }
  }, 30_000);

  /*
   * Revue de #559 (Codex, P1) : `reparer=1` sur une route de LECTURE déclenchait
   * des écritures dans le pod pour un collaborateur en lecture seule. Le lecteur
   * garde son listing ; la réparation, elle, exige le droit d'écrire.
   */
  it('un collaborateur en lecture seule obtient le listing, jamais la réparation ; le propriétaire, si', async () => {
    const c = await contexte();

    try {
      expect((await c.ecrire('src/App.tsx', 'export default function App() {}')).statusCode).toBe(204);
      expect(await c.lister()).toContain('src/App.tsx');

      /*
       * Le workspace d'exécution est PAR UTILISATEUR (`resolveProjectWorkspaceId`) :
       * la première lecture du lecteur ouvre le sien, avec SA réconciliation
       * d'ouverture — un comportement d'ouverture, pas une réparation. On la
       * laisse passer avant de prendre la ligne de base, sinon on la compterait.
       */
      const lecteur = await c.lecteur();
      expect((await c.listerEnTantQue(lecteur)).statut).toBe(200);
      await laisserRespirer();

      const ecrituresApresOuverture = c.runtime.ecrituresRecues();
      c.runtime.fichiers.delete('src/App.tsx');

      const vuParLeLecteur = await c.listerEnTantQue(lecteur, true);

      expect(vuParLeLecteur.statut, 'le listing reste dû au lecteur').toBe(200);
      expect(vuParLeLecteur.chemins, 'le pod amputé est rendu tel quel').not.toContain('src/App.tsx');
      await laisserRespirer();
      expect(c.runtime.ecrituresRecues(), 'un lecteur ne fait rien écrire dans le pod').toBe(ecrituresApresOuverture);

      /* Contrôle positif : la même demande par le propriétaire répare bien. */
      expect(await c.lister(true)).toContain('src/App.tsx');
      expect(c.runtime.ecrituresRecues(), 'le propriétaire déclenche la réécriture').toBe(ecrituresApresOuverture + 1);
    } finally {
      await c.fermer();
    }
  }, 30_000);
});
