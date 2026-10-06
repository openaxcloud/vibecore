import { createServer, type Server } from 'node:http';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { buildApiApp } from '../app.js';
import { TestApiStore } from './test-api-store.js';

/*
 * P0 — REVENIR SUR UN PROJET FAIT PERDRE LA MODIFICATION DE L'UTILISATEUR.
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

const AGENT = 'export default function App() {\n  return <h1>Titre de l’agent</h1>;\n}\n';
const UTILISATEUR = `${AGENT}// MARQUEUR-UTILISATEUR\n`;

const conversation = (contenu: string) => ({
  chat: {
    messages: [
      { id: 'u1', role: 'user', content: 'Change le titre.' },
      {
        id: 'a1',
        role: 'assistant',
        content: `<boltArtifact id="app" title="App">\n<boltAction type="file" filePath="src/App.tsx">\n${contenu}</boltAction>\n</boltArtifact>`,
      },
    ],
  },
});

describe('P0 — la version de l’utilisateur survit à la synchronisation de l’état de l’IDE', () => {
  it('après un enregistrement, l’envoi de l’état (conversation comprise) ne ramène PAS la version de l’agent', async () => {
    const c = await contexte();

    try {
      const envoyerEtat = (state: Record<string, unknown>) =>
        c.app.inject({
          method: 'PUT',
          url: `/projects/${c.projectId}/ide-state`,
          headers: { authorization: `Bearer ${c.token}` },
          payload: { state },
        });

      /* Le tour de l'agent est dans la conversation, et son fichier dans le manifeste. */
      expect((await envoyerEtat(conversation(AGENT))).statusCode).toBe(200);
      expect((await c.ecrire('src/App.tsx', AGENT)).statusCode).toBeLessThan(300);

      /* L'utilisateur enregistre. */
      expect((await c.ecrire('src/App.tsx', UTILISATEUR)).statusCode).toBeLessThan(300);
      expect(await c.contenuDuManifeste('src/App.tsx')).toBe(UTILISATEUR);

      /*
       * La page synchronise son état, conversation comprise, toutes les quelques
       * secondes — DEUX fois ici : la seconde lit le manifeste que la première a
       * reconstruit, ce qui tient la conservation de la marque d'écriture.
       */
      expect((await envoyerEtat({ ...conversation(AGENT), ui: { panneau: 'agent' } })).statusCode).toBe(200);
      expect((await envoyerEtat({ ...conversation(AGENT), ui: { panneau: 'fichiers' } })).statusCode).toBe(200);

      expect(await c.contenuDuManifeste('src/App.tsx')).toBe(UTILISATEUR);
      expect(await c.contenuDeLArchive('src/App.tsx')).toBe(UTILISATEUR);
    } finally {
      await c.fermer();
    }
  });

  it('TÉMOIN — un fichier de la conversation ABSENT du manifeste y est toujours récupéré', async () => {
    const c = await contexte();

    try {
      const reponse = await c.app.inject({
        method: 'PUT',
        url: `/projects/${c.projectId}/ide-state`,
        headers: { authorization: `Bearer ${c.token}` },
        payload: {
          state: {
            chat: {
              messages: [
                {
                  id: 'a2',
                  role: 'assistant',
                  content:
                    '<boltArtifact id="x" title="X">\n<boltAction type="file" filePath="src/nouveau.ts">\nexport const nouveau = 1;\n</boltAction>\n</boltArtifact>',
                },
              ],
            },
          },
        },
      });

      expect(reponse.statusCode).toBe(200);
      expect(await c.contenuDuManifeste('src/nouveau.ts')).toContain('export const nouveau = 1;');
    } finally {
      await c.fermer();
    }
  });

  it('un import de fin d’artefact n’est pas défait par une conversation plus ANCIENNE', async () => {
    const c = await contexte();

    try {
      const ANCIENNE = 'export const version = 1;\n';
      const RECENTE = 'export const version = 2;\n';

      /* Tour 1 : sa conversation est enregistrée. */
      const etat = {
        chat: {
          messages: [
            {
              id: 'a1',
              role: 'assistant',
              content: `<boltArtifact id="v" title="V">\n<boltAction type="file" filePath="src/version.ts">\n${ANCIENNE}</boltAction>\n</boltArtifact>`,
            },
          ],
        },
      };
      await c.app.inject({
        method: 'PUT',
        url: `/projects/${c.projectId}/ide-state`,
        headers: { authorization: `Bearer ${c.token}` },
        payload: { state: etat },
      });

      /* Un tour suivant ferme son artefact : l'arbre du pod est importé (version 2). */
      const zip = new JSZip();
      zip.file('src/version.ts', RECENTE);

      const zipBase64 = (await zip.generateAsync({ type: 'nodebuffer' })).toString('base64');

      const importe = await c.app.inject({
        method: 'POST',
        url: `/projects/${c.projectId}/files/import/zip`,
        headers: { authorization: `Bearer ${c.token}` },
        payload: { zipBase64 },
      });
      expect(importe.statusCode).toBeLessThan(300);

      /* La page renvoie la conversation, qui porte encore l'écriture du tour 1. */
      await c.app.inject({
        method: 'PUT',
        url: `/projects/${c.projectId}/ide-state`,
        headers: { authorization: `Bearer ${c.token}` },
        payload: { state: etat },
      });

      expect(await c.contenuDuManifeste('src/version.ts')).toBe(RECENTE);
    } finally {
      await c.fermer();
    }
  });
});
