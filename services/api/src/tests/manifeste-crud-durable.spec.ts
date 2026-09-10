import { createServer, type Server } from 'node:http';
import { describe, expect, it } from 'vitest';
import { buildApiApp } from '../app.js';
import { TestApiStore } from './test-api-store.js';

/*
 * BUG-RUNTIME-DIVERGENCE — « le pod et l'archive divergent ».
 *
 * MESURÉ sur la source avant d'écrire quoi que ce soit : la durabilité par
 * opération n'existait QUE sur `PUT /files/write`. Création, suppression et
 * renommage n'atteignaient que le pod. Conséquence au réamorçage suivant
 * (`app/lib/runtime/workspace-reseed.ts`) : `planReseedDeletions` supprime du
 * pod « ce qui manque à l'archive » — donc le fichier CRÉÉ est détruit — puis
 * `importZip` réécrit l'archive par-dessus — donc le fichier SUPPRIMÉ ressuscite
 * et le renommage revient en arrière. Le seul « tombstone » qui existait était
 * local au navigateur (`files.ts`, `localStorage`), donc inutile sur l'appareil
 * suivant : c'est exactement le cas signalé.
 *
 * Ces tests passent par l'API RÉELLE (`app.inject`) et lisent l'ARCHIVE
 * (`GET /projects/:id/files`), jamais le pod : c'est la seule mesure qui
 * distingue les deux mondes. Un test qui relit le pod serait vert dans les deux.
 *
 * ⚠️ Le faux runtime doit démarrer DEUX serveurs — le gestionnaire d'espaces
 * (qui frappe le jeton d'agent) ET l'agent — sinon l'API rend 502
 * `WORKSPACE_MANAGER_UNAVAILABLE` et les tests échouent pour la mauvaise raison.
 * Mesuré : une première version ne posait que `WORKSPACE_AGENT_BASE_URL` et
 * rendait cinq rouges qui ne disaient rien du correctif.
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
    fermer: async () => {
      await app.close();
      await runtime.fermer();
    },
  };
}

describe('BUG-RUNTIME-DIVERGENCE — l’archive suit création, renommage et suppression', () => {
  it('une création dans l’IDE atteint l’archive, pas seulement le pod', async () => {
    const c = await contexte();

    try {
      const avant = await c.cheminsDeLArchive();

      /* Règle 10 : le projet a bien une archive AVANT la mesure, sinon on ne mesure rien. */
      expect(avant.length).toBeGreaterThan(0);

      expect((await c.creer('src/cree.ts', 'export const a = 1;')).statusCode).toBe(204);

      const apres = await c.cheminsDeLArchive();

      expect(apres).toContain('src/cree.ts');

      /*
       * ET l'archive n'a pas été RÉDUITE à ce seul fichier. C'est le garde-fou
       * du manifeste autoritaire : une entrée unique fabriquée à partir de rien
       * ferait vider l'arbre au `restoreSnapshot` suivant.
       */
      for (const chemin of avant) {
        expect(apres, `${chemin} a disparu de l’archive`).toContain(chemin);
      }
    } finally {
      await c.fermer();
    }
  });

  it('un renommage suit dans l’archive, au lieu de revenir en arrière', async () => {
    const c = await contexte();

    try {
      await c.creer('src/avant.ts', 'export const a = 1;');
      expect((await c.renommer('src/avant.ts', 'src/apres.ts')).statusCode).toBe(204);

      const chemins = await c.cheminsDeLArchive();

      expect(chemins).toContain('src/apres.ts');
      expect(chemins).not.toContain('src/avant.ts');
    } finally {
      await c.fermer();
    }
  });

  it('une suppression suit dans l’archive, au lieu de ressusciter', async () => {
    const c = await contexte();

    try {
      await c.ecrire('src/jetable.ts', 'export const a = 1;');

      /* Témoin positif : le fichier EST dans l'archive avant la suppression. */
      expect(await c.cheminsDeLArchive()).toContain('src/jetable.ts');

      expect((await c.supprimer('src/jetable.ts')).statusCode).toBe(204);

      expect(await c.cheminsDeLArchive()).not.toContain('src/jetable.ts');
    } finally {
      await c.fermer();
    }
  });

  it('renommer PAR-DESSUS une cible existante ne laisse pas deux entrées au même chemin', async () => {
    const c = await contexte();

    try {
      await c.ecrire('src/source.ts', 'source');
      await c.ecrire('src/cible.ts', 'cible');

      expect((await c.renommer('src/source.ts', 'src/cible.ts')).statusCode).toBe(204);

      expect(await c.cheminsDeLArchive()).not.toContain('src/source.ts');

      /*
       * On lit le MANIFESTE, pas l'archive : c'est là que vit le doublon. Un
       * manifeste reversé tel quel dans le stockage avec deux entrées au même
       * chemin rend `projectFilesMatch` faux à CHAQUE lecture — il compare les
       * longueurs — et relance donc un `restoreSnapshot` complet à chaque fois.
       */
      const manifeste = await c.cheminsDuManifeste();

      expect(manifeste, 'le manifeste est vide — le test ne mesure rien (règle 10)').toContain('src/cible.ts');
      expect(manifeste.filter((chemin) => chemin === 'src/cible.ts')).toHaveLength(1);
      expect(manifeste).not.toContain('src/source.ts');
    } finally {
      await c.fermer();
    }
  });

  it('supprimer un fichier ABSENT du manifeste n’écrit pas et ne monte pas la version', async () => {
    const c = await contexte();

    try {
      await c.ecrire('src/reel.ts', 'reel');

      const avant = await c.versionDeLEtat();

      /* Règle 10 : sans version lisible, ce test ne mesure rien. */
      expect(avant, 'aucune version d’ide-state — le test ne mesure rien').toBeTypeOf('number');

      /* Ce chemin n'a jamais atteint le manifeste : il n'y a rien à en retirer. */
      expect((await c.supprimer('src/jamais-vu.ts')).statusCode).toBe(204);

      /*
       * `mutateProjectIdeState` écrit SANS comparer : un « rien à faire »
       * exprimé à l'intérieur ferait quand même monter la version. Or l'IDE
       * revalide ce blob par `If-None-Match` (AUDX-167) et il n'est pas borné
       * — une montée gratuite fait repayer le rechargement complet.
       */
      expect(await c.versionDeLEtat()).toBe(avant);
      expect(await c.cheminsDuManifeste()).toContain('src/reel.ts');
    } finally {
      await c.fermer();
    }
  });

  it('supprimer un DOSSIER retire tout son sous-arbre de l’archive', async () => {
    const c = await contexte();

    try {
      await c.ecrire('src/a.ts', 'a');
      await c.ecrire('src/profond/b.ts', 'b');

      const avant = await c.cheminsDeLArchive();

      /* Témoin positif : les deux sont dans l'archive avant la suppression. */
      expect(avant).toContain('src/a.ts');
      expect(avant).toContain('src/profond/b.ts');

      expect((await c.supprimer('src')).statusCode).toBe(204);

      const chemins = await c.cheminsDeLArchive();

      /* Un retrait par égalité stricte laisserait les enfants — donc les ferait ressusciter. */
      expect(chemins).not.toContain('src/a.ts');
      expect(chemins).not.toContain('src/profond/b.ts');
    } finally {
      await c.fermer();
    }
  });

  it('supprimer `src` n’emporte PAS `src-old` — le piège du préfixe mal ancré', async () => {
    const c = await contexte();

    try {
      await c.ecrire('src/a.ts', 'a');
      await c.ecrire('src-old/garder.ts', 'à garder');

      const avant = await c.cheminsDeLArchive();
      expect(avant).toContain('src/a.ts');
      expect(avant).toContain('src-old/garder.ts');

      await c.supprimer('src');

      const chemins = await c.cheminsDeLArchive();

      /*
       * Sur un manifeste AUTORITAIRE, un voisin retiré par erreur n'est pas un
       * affichage faux : c'est un fichier détruit sur tous les appareils au
       * réamorçage suivant. C'est le test le plus important du fichier.
       */
      expect(chemins, 'src-old/garder.ts a été emporté par la suppression de src').toContain('src-old/garder.ts');
      expect(chemins).not.toContain('src/a.ts');
    } finally {
      await c.fermer();
    }
  });
});
