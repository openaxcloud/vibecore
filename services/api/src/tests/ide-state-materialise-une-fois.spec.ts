import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import JSZip from 'jszip';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApiApp } from '../app.js';
import { LocalProjectStorage } from '../project-storage.js';
import { TestApiStore } from './test-api-store.js';

/*
 * BUG-QA0929-IDE-STATE-HISTORIQUE-ECRASE — second chemin de
 * BUG-QA1001-RETOUR-PERD-LES-MODIFICATIONS.
 *
 * `PUT /projects/:id/ide-state` extrayait les fichiers de TOUTES les
 * `<boltAction type="file">` du fil fusionné et les écrivait dans le manifeste
 * de fichiers — celui que lisent l'export, git, la publication et le
 * réensemencement d'un espace recréé. Le fil fusionné garde le fil enregistré
 * même quand le client n'envoie que `ui` : le moindre `PUT` (un onglet ouvert)
 * remettait donc la version de l'agent par-dessus celle de l'utilisateur.
 *
 * Règle : un message n'est matérialisé qu'UNE fois. S'il était déjà dans l'état
 * enregistré avec le même contenu, le `PUT` qui l'y a mis l'a déjà matérialisé.
 * Un message NOUVEAU ou PROLONGÉ (flux en cours) écrit toujours ses fichiers :
 * c'est la seule voie par laquelle les écritures de l'agent atteignent le
 * stockage en mode WebContainer.
 */

const CHEMIN = 'src/App.tsx';

function messageAgent(id: string, version: string) {
  return {
    id,
    role: 'assistant',
    content:
      `<boltArtifact id="${id}" title="App">` +
      `<boltAction type="file" filePath="${CHEMIN}">${version}\n</boltAction>` +
      '</boltArtifact>',
  };
}

const previousProjectStorageDir = process.env.PROJECT_STORAGE_DIR;

beforeEach(async () => {
  process.env.PROJECT_STORAGE_DIR = await mkdtemp(join(tmpdir(), 'materialise-une-fois-'));
});

afterEach(() => {
  if (previousProjectStorageDir === undefined) {
    delete process.env.PROJECT_STORAGE_DIR;
  } else {
    process.env.PROJECT_STORAGE_DIR = previousProjectStorageDir;
  }
});

async function banc() {
  const store = new TestApiStore();
  const projectStorage = new LocalProjectStorage();
  const app = await buildApiApp({ store, projectStorage });

  const inscription = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      email: `materialise-${Date.now()}@example.com`,
      password: 'password123',
      name: 'Matérialise',
      organizationName: 'Matérialise',
    },
  });

  expect(inscription.statusCode, inscription.body).toBe(201);

  const { token, organization } = inscription.json() as { token: string; organization: { id: string } };
  const headers = { authorization: `Bearer ${token}` };

  const projet = await app.inject({
    method: 'POST',
    url: `/orgs/${organization.id}/projects`,
    headers,
    payload: { name: 'Retour' },
  });

  expect(projet.statusCode, projet.body).toBe(201);

  const projectId = projet.json().project.id as string;

  const poserEtat = async (state: Record<string, unknown>) => {
    const reponse = await app.inject({
      method: 'PUT',
      url: `/projects/${projectId}/ide-state`,
      headers,
      payload: { state },
    });

    expect(reponse.statusCode, reponse.body).toBe(200);
  };

  const enregistrerCommeLUtilisateur = async (contenu: string) => {
    const zip = new JSZip();
    zip.file(CHEMIN, contenu);

    const reponse = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/files/import/zip`,
      headers,
      payload: { zipBase64: (await zip.generateAsync({ type: 'nodebuffer' })).toString('base64') },
    });

    expect(reponse.statusCode, reponse.body).toBe(200);
  };

  // La copie SERVEUR telle que la lisent l'export, git et le réensemencement.
  const copieServeur = async () => {
    const reponse = await app.inject({ method: 'GET', url: `/projects/${projectId}/export/zip`, headers });

    expect(reponse.statusCode, reponse.body).toBe(200);

    const archive = await JSZip.loadAsync(Buffer.from(reponse.json().archive.base64, 'base64'));

    return archive.file(CHEMIN)?.async('string');
  };

  return { app, store, projectStorage, headers, projectId, poserEtat, enregistrerCommeLUtilisateur, copieServeur };
}

describe('écriture conditionnelle sur un manifeste existant', () => {
  it('accepte une première écriture dans un manifeste vide explicite', async () => {
    const { app, store, headers, projectId, copieServeur } = await banc();
    try {
      const before = await store.upsertProjectIdeState({ projectId, state: { files: { entries: [] } } });
      const zip = new JSZip().file(CHEMIN, 'Confirmé\n');
      const write = await app.inject({
        method: 'POST',
        url: '/projects/' + projectId + '/files/import/zip',
        headers,
        payload: {
          sourceVersion: before.version,
          previousContents: { [CHEMIN]: null },
          zipBase64: await zip.generateAsync({ type: 'base64' }),
        },
      });
      expect(write.statusCode).toBe(200);
      expect(await copieServeur()).toBe('Confirmé\n');
    } finally {
      await app.close();
    }
  });

  it.each([
    ['absent', {}],
    ['entries non tabulaire', { files: { entries: {} } }],
    ['entrée invalide', { files: { entries: [{ path: CHEMIN, content: 17 }] } }],
  ])('préserve la base et le disque avec un manifeste %s', async (cas, state) => {
    const { app, store, projectStorage, headers, projectId, enregistrerCommeLUtilisateur } = await banc();
    try {
      await enregistrerCommeLUtilisateur('Sentinelle\n');
      const before = await store.upsertProjectIdeState({ projectId, state });
      const disk = await projectStorage.listFiles(projectId);
      const edit = await app.inject({
        method: 'PUT',
        url: '/api/runtime/workspaces/' + projectId + '/files/write',
        headers,
        payload: { path: 'nouveau.txt', content: 'Agent\n' },
      });
      expect(edit.statusCode).toBe(409);
      expect(edit.json().persistence).toEqual({ runtime: 'not_applied', manifest: 'unconfirmed' });
      const zip = new JSZip().file('nouveau.txt', 'Agent\n');
      const base = '/projects/' + projectId;
      const write = await app.inject({
        method: 'POST',
        url: base + '/files/import/zip',
        headers,
        payload: {
          sourceVersion: before.version,
          previousContents: { 'nouveau.txt': null },
          zipBase64: await zip.generateAsync({ type: 'base64' }),
        },
      });
      expect(write.statusCode).toBe(500);
      const read = await app.inject({ method: 'GET', url: base + '/export/zip', headers });
      expect(read.statusCode).toBe(cas === 'absent' ? 200 : 500);
      expect(await store.getProjectIdeState(projectId)).toEqual(before);
      expect(await projectStorage.listFiles(projectId)).toEqual(disk);
    } finally {
      await app.close();
    }
  });
});

describe('ide-state — un message de l’agent n’est matérialisé qu’une fois', () => {
  it('l’agent écrit, l’utilisateur enregistre par-dessus, puis un PUT qui ne porte que l’interface : la version de l’utilisateur reste', async () => {
    const { app, poserEtat, enregistrerCommeLUtilisateur, copieServeur } = await banc();

    await poserEtat({ chat: { messages: [messageAgent('a1', '// VERSION-AGENT')] } });
    expect(await copieServeur(), 'témoin : le tour de l’agent est bien matérialisé').toBe('// VERSION-AGENT\n');

    await enregistrerCommeLUtilisateur('// VERSION-UTILISATEUR\n');
    expect(await copieServeur(), 'témoin : l’enregistrement de l’utilisateur est sur le serveur').toBe(
      '// VERSION-UTILISATEUR\n',
    );

    await poserEtat({ ui: { ongletOuvert: CHEMIN } });

    // Mesuré AVANT correctif : « // VERSION-AGENT ».
    expect(await copieServeur()).toBe('// VERSION-UTILISATEUR\n');

    await app.close();
  });

  it('le même fil renvoyé par un autre appareil à la réouverture : la version de l’utilisateur reste', async () => {
    const { app, poserEtat, enregistrerCommeLUtilisateur, copieServeur } = await banc();
    const fil = [{ id: 'u1', role: 'user', content: 'Fais une app.' }, messageAgent('a1', '// VERSION-AGENT')];

    await poserEtat({ chat: { messages: fil } });
    await enregistrerCommeLUtilisateur('// VERSION-UTILISATEUR\n');

    await poserEtat({ chat: { messages: fil } });

    expect(await copieServeur()).toBe('// VERSION-UTILISATEUR\n');

    await app.close();
  });

  /*
   * RELECTURE (Claude, 2026-10-06) — cette contre-épreuve vérifiait qu'un
   * nouveau tour gagne PAR LE SEUL FIL. Dans le produit, un nouveau tour atteint
   * la copie serveur par ses chemins réels (acceptation → `files/write`,
   * fermeture d'artefact → `files/import/zip`) ; le fil n'en est le seul porteur
   * que si l'onglet s'est fermé avant la fin du tour — et faire gagner l'agent en
   * silence sur un ENREGISTREMENT de l'utilisateur contredit la décision d'Avi
   * (#667 : ce que l'utilisateur enregistre fait foi, l'agent passe en revue).
   * La garantie est donc déplacée sur le chemin réel, et le cas du fil seul est
   * tenu dans l'autre sens.
   */
  it('contre-épreuve — un NOUVEAU tour de l’agent, en fermant son artefact, écrit toujours par-dessus la version de l’utilisateur', async () => {
    const { app, poserEtat, enregistrerCommeLUtilisateur, copieServeur } = await banc();
    const premier = messageAgent('a1', '// VERSION-AGENT');

    await poserEtat({ chat: { messages: [premier] } });
    await enregistrerCommeLUtilisateur('// VERSION-UTILISATEUR\n');

    await poserEtat({ chat: { messages: [premier, messageAgent('a2', '// VERSION-AGENT-NOUVELLE')] } });
    /* La fermeture de l'artefact du tour a2 importe l'arbre du pod (`#persistRuntimeFilesToProjectStorage`). */
    await enregistrerCommeLUtilisateur('// VERSION-AGENT-NOUVELLE\n');

    expect(await copieServeur()).toBe('// VERSION-AGENT-NOUVELLE\n');

    await app.close();
  });

  it('un nouveau tour connu SEULEMENT par le fil ne remplace pas en silence un enregistrement de l’utilisateur (#667)', async () => {
    const { app, poserEtat, enregistrerCommeLUtilisateur, copieServeur } = await banc();
    const premier = messageAgent('a1', '// VERSION-AGENT');

    await poserEtat({ chat: { messages: [premier] } });
    await enregistrerCommeLUtilisateur('// VERSION-UTILISATEUR\n');

    await poserEtat({ chat: { messages: [premier, messageAgent('a2', '// VERSION-AGENT-NOUVELLE')] } });

    expect(await copieServeur()).toBe('// VERSION-UTILISATEUR\n');

    await app.close();
  });

  it('contre-épreuve — un message PROLONGÉ (flux en cours) écrit sa nouvelle version', async () => {
    const { app, poserEtat, copieServeur } = await banc();

    await poserEtat({ chat: { messages: [{ id: 'a1', role: 'assistant', content: 'Je commence…' }] } });
    await poserEtat({ chat: { messages: [messageAgent('a1', '// VERSION-AGENT-FIN-DE-FLUX')] } });

    expect(await copieServeur()).toBe('// VERSION-AGENT-FIN-DE-FLUX\n');

    await app.close();
  });
});
