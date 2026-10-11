import { createServer, type Server } from 'node:http';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { buildApiApp } from '../app.js';
import { TestApiStore } from './test-api-store.js';

/*
 * RELECTURE de fix/retour-ne-recule-plus — deux cas limites (Claude, 2026-10-06).
 *
 * Mesuré en production le 2026-10-06 (projet cmuwept5d…) : l'utilisateur
 * enregistre `src/App.tsx` à 08:24:45 (`files/write`, l'entrée du manifeste
 * porte sa ligne) ; trois `PUT ide-state` de 46 Ko — la conversation — suivent
 * à 08:24:48 et 08:24:55, et le manifeste revient à la version de l'agent. À la
 * réouverture, le pod est réécrit depuis ce manifeste : la ligne de
 * l'utilisateur disparaît, sur le même appareil comme sur un appareil neuf. Et
 * quand le ramassage détruit le disque (24 h), le manifeste est la SEULE copie.
 *
 * Cause : `PUT /projects/:id/ide-state` extrayait toutes les écritures de
 * fichiers historiques de la conversation (`projectFilesFromIdeStateRoot`) et
 * les posait PAR-DESSUS le manifeste, à chaque envoi.
 *
 * Harnais repris de manifeste-crud-durable.spec.ts : API RÉELLE, archive et
 * manifeste lus par l'API, jamais le pod.
 */

/** Faux gestionnaire + faux agent, calqués sur `critical-paths.spec.ts`. */
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
      } else if (requete.method === 'POST' && url.pathname === '/files/delete') {
        for (const cle of [...fichiers.keys()]) {
          if (cle === charge.path || cle.startsWith(`${charge.path}/`)) {
            fichiers.delete(cle);
          }
        }

        reponse.end(JSON.stringify({ ok: true }));
      } else if (requete.method === 'POST' && url.pathname === '/files/rename') {
        fichiers.set(charge.to!, fichiers.get(charge.from!) ?? '');
        fichiers.delete(charge.from!);
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

  const portAgent = (agent.address() as { port: number }).port;
  const portGestionnaire = (gestionnaire.address() as { port: number }).port;
  const precedentGestionnaire = process.env.WORKSPACE_MANAGER_URL;
  const precedentAgent = process.env.WORKSPACE_AGENT_URL_TEMPLATE;
  process.env.WORKSPACE_MANAGER_URL = `http://127.0.0.1:${portGestionnaire}`;
  process.env.WORKSPACE_AGENT_URL_TEMPLATE = `http://127.0.0.1:${portAgent}`;

  return {
    fichiers,
    appels,
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
  const app = await buildApiApp({ store: new TestApiStore() });

  const inscription = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      email: `manifeste-${Math.random().toString(36).slice(2, 10)}@example.com`,
      password: 'password123',
      name: 'Manifeste',
      organizationName: 'Manifeste Org',
    },
  });

  const token = inscription.json().token as string;
  const organizationId = inscription.json().organization.id as string;

  const projet = await app.inject({
    method: 'POST',
    url: `/orgs/${organizationId}/projects`,
    headers: { authorization: `Bearer ${token}` },
    payload: { name: 'Manifeste durable' },
  });

  const projectId = projet.json().project.id as string;

  /*
   * Les entrées du MANIFESTE, telles qu'elles sont persistées — à ne pas
   * confondre avec l'archive. Mesuré : l'archive passe par `restoreSnapshot`
   * puis `walkFiles`, qui dédoublonne naturellement ; un doublon dans le
   * manifeste y est donc INVISIBLE. Une première version du test du renommage
   * par-dessus lisait l'archive et restait verte même sans le dédoublonnage :
   * elle ne gardait rien (règle 6).
   */
  const cheminsDuManifeste = async () => {
    const reponse = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/ide-state`,
      headers: { authorization: `Bearer ${token}` },
    });

    const charge = reponse.json() as {
      ideState?: { state?: { files?: { entries?: Array<{ path: string }> } } } | null;
    };

    return (charge.ideState?.state?.files?.entries ?? []).map((entree) => entree.path);
  };

  const versionDeLEtat = async () => {
    const reponse = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/ide-state`,
      headers: { authorization: `Bearer ${token}` },
    });

    return (reponse.json() as { ideState?: { version?: number } | null }).ideState?.version;
  };

  const cheminsDeLArchive = async () => {
    const reponse = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/files`,
      headers: { authorization: `Bearer ${token}` },
    });

    return (reponse.json().files as Array<{ path: string }>).map((fichier) => fichier.path).sort();
  };

  return {
    app,
    runtime,
    token,
    projectId,
    cheminsDeLArchive,
    cheminsDuManifeste,
    versionDeLEtat,

    /*
     * ⚠️ `ecrire` sème l'archive par la route qui était DÉJÀ durable avant ce
     * lot (`PUT /files/write`, BUG-CREATE-010). Les cas de suppression s'en
     * servent exprès : semés par `creer`, ils passaient au vert même sans le
     * correctif — si la création n'atteint pas l'archive, il n'y a rien à
     * supprimer et l'assertion « absent » est VIDE. Mesuré en contre-épreuve :
     * 3 rouges sur 5 seulement, les deux cas de suppression restant verts pour
     * la mauvaise raison (règle 6).
     */
    ecrire: (path: string, content: string) =>
      app.inject({
        method: 'PUT',
        url: `/api/runtime/workspaces/${projectId}/files/write`,
        headers: { authorization: `Bearer ${token}` },
        payload: { path, content },
      }),
    creer: (path: string, content: string) =>
      app.inject({
        method: 'POST',
        url: `/api/runtime/workspaces/${projectId}/files`,
        headers: { authorization: `Bearer ${token}` },
        payload: { path, content },
      }),
    supprimer: (path: string) =>
      app.inject({
        method: 'DELETE',
        url: `/api/runtime/workspaces/${projectId}/files?path=${encodeURIComponent(path)}`,
        headers: { authorization: `Bearer ${token}` },
      }),
    renommer: (path: string, newPath: string) =>
      app.inject({
        method: 'POST',
        url: `/api/runtime/workspaces/${projectId}/files/move`,
        headers: { authorization: `Bearer ${token}` },
        payload: { path, newPath },
      }),
    contenuDuManifeste: async (chemin: string) => {
      const reponse = await app.inject({
        method: 'GET',
        url: `/projects/${projectId}/ide-state`,
        headers: { authorization: `Bearer ${token}` },
      });

      const entrees =
        (
          reponse.json() as {
            ideState?: { state?: { files?: { entries?: Array<{ path: string; content: string }> } } } | null;
          }
        ).ideState?.state?.files?.entries ?? [];

      return entrees.find((e) => e.path === chemin)?.content;
    },

    /* L'archive telle que la réouverture la sert pour réensemencer le pod (`export/zip`). */
    contenuDeLArchive: async (chemin: string) => {
      const reponse = await app.inject({
        method: 'GET',
        url: `/projects/${projectId}/export/zip`,
        headers: { authorization: `Bearer ${token}` },
      });

      const base64 = (reponse.json() as { archive?: { base64?: string } }).archive?.base64;

      if (!base64) {
        return `INSTRUMENT : pas d’archive (HTTP ${reponse.statusCode})`;
      }

      const zip = await JSZip.loadAsync(Buffer.from(base64, 'base64'));

      return (await zip.file(chemin)?.async('string')) ?? 'ABSENT DE L’ARCHIVE';
    },
    fermer: async () => {
      await app.close();
      await runtime.fermer();
    },
  };
}

const msg = (id: string, chemin: string, contenu: string) => ({
  id,
  role: 'assistant',
  content: `<boltArtifact id="${id}" title="${id}">\n<boltAction type="file" filePath="${chemin}">\n${contenu}</boltAction>\n</boltArtifact>`,
});

const TOUR1 = 'export default function App() {\n  return <h1>Tour 1</h1>;\n}\n';
const UTILISATEUR = `${TOUR1}// MARQUEUR-UTILISATEUR\n`;

describe('relecture — cas limites', () => {
  it('TROU 1 — un second tour ferme son artefact (import qui VIDE le fil) : la synchronisation suivante ne rematérialise pas le tour 1', async () => {
    const c = await contexte();

    try {
      const etat = (messages: unknown[]) =>
        c.app.inject({
          method: 'PUT',
          url: `/projects/${c.projectId}/ide-state`,
          headers: { authorization: `Bearer ${c.token}` },
          payload: { state: { chat: { messages } } },
        });
      const importer = async (fichiers: Record<string, string>) => {
        const zip = new JSZip();

        for (const [p, t] of Object.entries(fichiers)) {
          zip.file(p, t);
        }

        const zipBase64 = (await zip.generateAsync({ type: 'nodebuffer' })).toString('base64');

        const r = await c.app.inject({
          method: 'POST',
          url: `/projects/${c.projectId}/files/import/zip`,
          headers: { authorization: `Bearer ${c.token}` },
          payload: { zipBase64, replaceExisting: true },
        });
        expect(r.statusCode).toBeLessThan(300);
      };

      /* Tour 1 sur App.tsx, son artefact se ferme (import du pod). */
      const t1 = msg('a1', 'src/App.tsx', TOUR1);
      await etat([t1]);
      await importer({ 'src/App.tsx': TOUR1 });
      await etat([t1]);

      /* L'utilisateur modifie App.tsx. */
      expect((await c.ecrire('src/App.tsx', UTILISATEUR)).statusCode).toBeLessThan(300);
      expect(await c.contenuDuManifeste('src/App.tsx')).toBe(UTILISATEUR);

      /* Tour 2 sur un AUTRE fichier ; son artefact se ferme : le pod (avec la version de l'utilisateur) est importé, et le fil vidé. */
      const t2 = msg('a2', 'src/autre.ts', 'export const autre = 2;\n');
      await etat([t1, t2]);
      await importer({ 'src/App.tsx': UTILISATEUR, 'src/autre.ts': 'export const autre = 2;\n' });
      expect(await c.contenuDuManifeste('src/App.tsx')).toBe(UTILISATEUR);

      /* La page resynchronise son état, fil complet. */
      await etat([t1, t2]);

      expect(await c.contenuDuManifeste('src/App.tsx')).toBe(UTILISATEUR);
      expect(await c.contenuDeLArchive('src/App.tsx')).toBe(UTILISATEUR);
    } finally {
      await c.fermer();
    }
  });

  it('TROU 2 — avec #667 : l’utilisateur enregistre PENDANT le tour, le message de l’agent arrive ensuite dans le fil', async () => {
    const c = await contexte();

    try {
      const etat = (messages: unknown[]) =>
        c.app.inject({
          method: 'PUT',
          url: `/projects/${c.projectId}/ide-state`,
          headers: { authorization: `Bearer ${c.token}` },
          payload: { state: { chat: { messages } } },
        });

      /* Avant le tour : App.tsx tel qu'au départ, déjà écrit. */
      expect((await c.ecrire('src/App.tsx', TOUR1)).statusCode).toBeLessThan(300);
      await etat([{ id: 'u1', role: 'user', content: 'Change le titre.' }]);

      /* Pendant le tour, l'utilisateur enregistre ; #667 garde SA version et met la proposition de l'agent en revue. */
      expect((await c.ecrire('src/App.tsx', UTILISATEUR)).statusCode).toBeLessThan(300);

      /* La réponse de l'agent arrive dans le fil (contenu NEUF), portant SA version d'App.tsx. */
      await etat([
        { id: 'u1', role: 'user', content: 'Change le titre.' },
        msg('a1', 'src/App.tsx', 'export default function App() {\n  return <h1>Titre de l’agent</h1>;\n}\n'),
      ]);

      expect(await c.contenuDuManifeste('src/App.tsx')).toBe(UTILISATEUR);
    } finally {
      await c.fermer();
    }
  });
});
