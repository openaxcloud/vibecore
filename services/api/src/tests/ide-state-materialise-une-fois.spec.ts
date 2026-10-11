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
  const app = await buildApiApp({ store: new TestApiStore(), projectStorage: new LocalProjectStorage() });

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

    return (await archive.file(CHEMIN)?.async('string'))?.trim();
  };

  return { app, poserEtat, enregistrerCommeLUtilisateur, copieServeur };
}

describe('ide-state — un message de l’agent n’est matérialisé qu’une fois', () => {
  it('l’agent écrit, l’utilisateur enregistre par-dessus, puis un PUT qui ne porte que l’interface : la version de l’utilisateur reste', async () => {
    const { app, poserEtat, enregistrerCommeLUtilisateur, copieServeur } = await banc();

    await poserEtat({ chat: { messages: [messageAgent('a1', '// VERSION-AGENT')] } });
    expect(await copieServeur(), 'témoin : le tour de l’agent est bien matérialisé').toBe('// VERSION-AGENT');

    await enregistrerCommeLUtilisateur('// VERSION-UTILISATEUR\n');
    expect(await copieServeur(), 'témoin : l’enregistrement de l’utilisateur est sur le serveur').toBe(
      '// VERSION-UTILISATEUR',
    );

    await poserEtat({ ui: { ongletOuvert: CHEMIN } });

    // Mesuré AVANT correctif : « // VERSION-AGENT ».
    expect(await copieServeur()).toBe('// VERSION-UTILISATEUR');

    await app.close();
  });

  it('le même fil renvoyé par un autre appareil à la réouverture : la version de l’utilisateur reste', async () => {
    const { app, poserEtat, enregistrerCommeLUtilisateur, copieServeur } = await banc();
    const fil = [{ id: 'u1', role: 'user', content: 'Fais une app.' }, messageAgent('a1', '// VERSION-AGENT')];

    await poserEtat({ chat: { messages: fil } });
    await enregistrerCommeLUtilisateur('// VERSION-UTILISATEUR\n');

    await poserEtat({ chat: { messages: fil } });

    expect(await copieServeur()).toBe('// VERSION-UTILISATEUR');

    await app.close();
  });

  it('contre-épreuve — un NOUVEAU tour de l’agent écrit toujours ses fichiers, par-dessus la version de l’utilisateur', async () => {
    const { app, poserEtat, enregistrerCommeLUtilisateur, copieServeur } = await banc();
    const premier = messageAgent('a1', '// VERSION-AGENT');

    await poserEtat({ chat: { messages: [premier] } });
    await enregistrerCommeLUtilisateur('// VERSION-UTILISATEUR\n');

    await poserEtat({ chat: { messages: [premier, messageAgent('a2', '// VERSION-AGENT-NOUVELLE')] } });

    expect(await copieServeur()).toBe('// VERSION-AGENT-NOUVELLE');

    await app.close();
  });

  it('contre-épreuve — un message PROLONGÉ (flux en cours) écrit sa nouvelle version', async () => {
    const { app, poserEtat, copieServeur } = await banc();

    await poserEtat({ chat: { messages: [{ id: 'a1', role: 'assistant', content: 'Je commence…' }] } });
    await poserEtat({ chat: { messages: [messageAgent('a1', '// VERSION-AGENT-FIN-DE-FLUX')] } });

    expect(await copieServeur()).toBe('// VERSION-AGENT-FIN-DE-FLUX');

    await app.close();
  });
});
