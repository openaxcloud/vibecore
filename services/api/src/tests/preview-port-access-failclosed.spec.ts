import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildApiApp } from '../app.js';
import { TestApiStore } from './test-api-store.js';

/*
 * P0 — `/internal/preview/port-access` répondait « public » sur tous ses chemins
 * d'échec.
 *
 * Le proxy avait bien été rendu fail-closed, mais un `200 {"private":false}`
 * n'est pas une erreur pour lui : c'est une réponse valide qui AFFIRME que le
 * port est public. Une panne de base côté API se traduisait donc par une
 * autorisation — le fail-open était simplement déplacé d'un cran.
 *
 * Ces tests injectent de VRAIES pannes dans le store (rejet de la promesse,
 * JSON invalide) et vérifient la réponse. Rouges avant le correctif, verts après.
 */
const PROXY_SECRET = 'port-access-spec-secret-do-not-ship';

/** Store dont on peut casser individuellement chaque lecture. */
class BreakableStore extends TestApiStore {
  failWorkspace = false;
  failEnvVars = false;
  portsState: string | undefined;

  override async getWorkspace(id: string) {
    if (this.failWorkspace) {
      throw new Error('panne de base simulee: SELECT workspace');
    }

    // Un workspace minimal suffit : seul `projectId` est lu par la route.
    return { id, projectId: 'proj_1' } as Awaited<ReturnType<TestApiStore['getWorkspace']>>;
  }

  override async listProjectEnvVars(_projectId: string) {
    if (this.failEnvVars) {
      throw new Error('panne de base simulee: SELECT project_env_vars');
    }

    return this.portsState === undefined
      ? []
      : [{ id: 'v1', key: 'VIBECORE_PORTS_STATE', value: this.portsState } as never];
  }
}

describe('/internal/preview/port-access — fail-closed', () => {
  let store: BreakableStore;
  const previous: Record<string, string | undefined> = {};

  beforeEach(() => {
    store = new BreakableStore();
    previous.enabled = process.env.PREVIEW_PRIVATE_PORTS_ENABLED;
    previous.secret = process.env.PREVIEW_PROXY_SHARED_SECRET;
    process.env.PREVIEW_PRIVATE_PORTS_ENABLED = 'true';
    process.env.PREVIEW_PROXY_SHARED_SECRET = PROXY_SECRET;
  });

  afterEach(() => {
    process.env.PREVIEW_PRIVATE_PORTS_ENABLED = previous.enabled;
    process.env.PREVIEW_PROXY_SHARED_SECRET = previous.secret;
  });

  const ask = async () => {
    const app = await buildApiApp({ store });

    const response = await app.inject({
      method: 'GET',
      url: '/internal/preview/port-access?workspaceId=ws_1&port=5173',
      headers: { authorization: `Bearer ${PROXY_SECRET}` },
    });

    await app.close();

    return response;
  };

  it('DENIE quand la lecture du workspace echoue (panne DB)', async () => {
    store.failWorkspace = true;

    const response = await ask();

    expect(response.statusCode).toBe(200);
    expect(response.json().private).toBe(true);
    expect(response.json().reason).toBe('workspace-lookup-failed');
  });

  it('DENIE quand la lecture des variables de projet echoue (panne DB)', async () => {
    store.failEnvVars = true;

    const response = await ask();

    expect(response.json().private).toBe(true);
    expect(response.json().reason).toBe('env-lookup-failed');
  });

  it('DENIE quand VIBECORE_PORTS_STATE est un JSON invalide', async () => {
    store.portsState = '{ ceci-n-est-pas-du-json';

    const response = await ask();

    expect(response.json().private).toBe(true);
    expect(response.json().reason).toBe('ports-state-unparseable');
  });

  it('DENIE quand le champ visibility est malforme (chaine au lieu d objet)', async () => {
    store.portsState = JSON.stringify({ visibility: 'private' });

    const response = await ask();

    expect(response.json().private).toBe(true);
  });

  /*
   * Le pendant indispensable : sans ces cas, « tout refuser » passerait le test
   * tout en cassant la fonctionnalité. Un état lu avec succès est la SEULE preuve
   * qu'un port est public.
   */
  it('AUTORISE quand l etat est lu et ne marque pas ce port prive', async () => {
    store.portsState = JSON.stringify({ visibility: { '3000': 'private' } });

    const response = await ask();

    expect(response.json().private).toBe(false);
    expect(response.json().reason).toBe('ports-state-read');
  });

  it('AUTORISE quand aucun etat de ports n existe (cas normal, lecture reussie)', async () => {
    store.portsState = undefined;

    const response = await ask();

    expect(response.json().private).toBe(false);
    expect(response.json().reason).toBe('no-ports-state');
  });

  it('DENIE quand ce port precis est marque prive', async () => {
    store.portsState = JSON.stringify({ visibility: { '5173': 'private' } });

    const response = await ask();

    expect(response.json().private).toBe(true);
  });

  it('reste public quand la fonctionnalite est eteinte (fonction off, pas une incertitude)', async () => {
    process.env.PREVIEW_PRIVATE_PORTS_ENABLED = 'false';
    store.failWorkspace = true; // meme une panne ne doit pas activer une porte eteinte

    const response = await ask();

    expect(response.json().private).toBe(false);
    expect(response.json().reason).toBe('feature-disabled');
  });
});
