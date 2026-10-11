import { createServer, type Server } from 'node:http';
import { planByKey, type PlanKey } from '@vibecore/billing';
import { workspacePod, type WorkspacePlan } from '@vibecore/k8s-client';
import { afterEach, describe, expect, it } from 'vitest';

import { buildApiApp } from '../app.js';
import { TestApiStore } from './test-api-store.js';

/**
 * UN ESPACE DE TRAVAIL N'A QU'UN SEUL GABARIT, QUEL QUE SOIT LE CHEMIN QUI LE DÉMARRE.
 *
 * Mesuré en production le 2026-10-11 : deux chemins démarraient le même espace
 * avec deux gabarits différents.
 *  - A, la lecture qui trouve l'agent injoignable (`provisionWorkspaceOnDemand`) :
 *    `plan: WORKSPACE_DEFAULT_PLAN ?? 'free'`, SANS droits — donc les ressources
 *    par défaut du forfait GRATUIT, même pour un client Enterprise ;
 *  - B, le démarrage et le redémarrage : le forfait réel ET ses droits.
 * Les ressources d'un conteneur sont immuables : chaque passage de l'un sur le
 * pod de l'autre faisait supprimer et recréer le pod. Relevé toutes les 2 s :
 * 250m/512Mi ↔ 375m/256Mi, un pod neuf toutes les 5 à 15 s. Sur 7 jours, 1
 * démarrage sur 5 suivi d'une recréation, 4 espaces clients Enterprise sur 5.
 *
 * Ces cas font tourner la vraie API contre un faux manager qui ENREGISTRE le
 * corps de chaque démarrage, puis construisent le pod réel (`workspacePod`) que
 * le manager appliquerait. Ils ne lisent pas la source.
 */

type CorpsDeDemarrage = { plan: WorkspacePlan; resourceLimits?: Record<string, number> };

async function demarrerFauxRuntime(etatConnuDuManager: { status: string; updatedAt?: string } = { status: 'STOPPED' }) {
  /* Agent injoignable : la lecture doit demander un démarrage (chemin A). */
  const agent = createServer((_request, response) => response.writeHead(503).end('{}'));
  await new Promise<void>((resolve) => agent.listen(0, '127.0.0.1', resolve));

  const agentPort = (agent.address() as { port: number }).port;
  await new Promise<void>((resolve) => agent.close(() => resolve()));

  const recus: Array<{ chemin: string; corps: CorpsDeDemarrage }> = [];

  const manager = createServer((request, response) => {
    const chemin = new URL(request.url ?? '/', 'http://manager.local').pathname;

    let brut = '';
    request.on('data', (morceau) => (brut += morceau));
    request.on('end', () => {
      response.setHeader('content-type', 'application/json');

      if (
        request.method === 'POST' &&
        (chemin === '/workspaces/start' || /^\/workspaces\/[^/]+\/restart$/.test(chemin))
      ) {
        recus.push({ chemin, corps: JSON.parse(brut || '{}') });
        response.end(JSON.stringify({ status: 'RUNNING' }));

        return;
      }

      response.end(JSON.stringify(chemin.endsWith('/agent-token') ? { token: 'jeton-test' } : etatConnuDuManager));
    });
  });

  await new Promise<void>((resolve) => manager.listen(0, '127.0.0.1', resolve));

  const precedent = { manager: process.env.WORKSPACE_MANAGER_URL, agent: process.env.WORKSPACE_AGENT_URL_TEMPLATE };
  process.env.WORKSPACE_MANAGER_URL = `http://127.0.0.1:${(manager.address() as { port: number }).port}`;
  process.env.WORKSPACE_AGENT_URL_TEMPLATE = `http://127.0.0.1:${agentPort}`;

  return {
    recus,
    async close() {
      process.env.WORKSPACE_MANAGER_URL = precedent.manager;
      process.env.WORKSPACE_AGENT_URL_TEMPLATE = precedent.agent;
      await new Promise<void>((resolve) => (manager as Server).close(() => resolve()));
    },
  };
}

async function preparer(planKey: PlanKey, statutInitial: 'STOPPED' | 'STARTING' = 'STOPPED') {
  const store = new TestApiStore();
  const app = await buildApiApp({ store });

  const auth = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      email: `gabarit-${Math.random().toString(36).slice(2, 10)}@example.com`,
      password: 'password123',
      name: 'Gabarit',
      organizationName: 'Gabarit Org',
    },
  });
  expect(auth.statusCode).toBe(201);

  const token = auth.json().token as string;
  const organizationId = auth.json().organization.id as string;

  if (planKey !== 'free') {
    await store.upsertSubscription({ organizationId, planKey, status: 'ACTIVE' });
  }

  const project = await app.inject({
    method: 'POST',
    url: `/orgs/${organizationId}/projects`,
    headers: { authorization: `Bearer ${token}` },
    payload: { name: 'Gabarit Project' },
  });
  expect(project.statusCode).toBe(201);

  const workspace = await store.createWorkspace({
    projectId: project.json().project.id as string,
    name: 'gabarit',
    runtimeMode: 'remote-kubernetes',
  });
  await store.updateWorkspaceStatus({ workspaceId: workspace.id, status: statutInitial });

  return {
    app,
    workspaceId: workspace.id,
    lire: () =>
      app.inject({
        method: 'GET',
        url: `/api/runtime/workspaces/${workspace.id}/files/read?path=tree`,
        headers: { authorization: `Bearer ${token}` },
      }),
    redemarrer: () =>
      app.inject({
        method: 'POST',
        url: `/api/runtime/workspaces/${workspace.id}/restart`,
        headers: { authorization: `Bearer ${token}` },
      }),
  };
}

/** Le pod que le manager appliquerait pour ce corps — ses seules ressources nous intéressent. */
function ressourcesDuPod(corps: CorpsDeDemarrage) {
  const pod = workspacePod({
    namespace: 'workspaces',
    orgId: 'org',
    projectId: 'projet',
    workspaceId: 'ws-test',
    image: 'image',
    pvcName: 'pvc-ws-test',
    agentTokenSecretName: 'agent-token-ws-test',
    env: {},
    secretEnv: {},
    plan: corps.plan,
    resourceLimits: corps.resourceLimits,
  }) as unknown as { spec: { containers: Array<{ name: string; resources: unknown }> } };

  return pod.spec.containers.find((conteneur) => conteneur.name === 'workspace-agent')?.resources;
}

async function attendre(condition: () => boolean, delaiMs = 3000) {
  const fin = Date.now() + delaiMs;

  while (!condition() && Date.now() < fin) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

let runtime: Awaited<ReturnType<typeof demarrerFauxRuntime>> | undefined;

afterEach(async () => {
  await runtime?.close();
  runtime = undefined;
});

describe('un seul gabarit par espace, quel que soit le chemin qui le démarre', () => {
  for (const planKey of ['free', 'pro', 'team', 'enterprise'] as const) {
    it(`forfait ${planKey} : la lecture (A) et le redémarrage (B) demandent le MÊME pod`, async () => {
      runtime = await demarrerFauxRuntime();

      const banc = await preparer(planKey);

      await banc.lire();
      await attendre(() => runtime!.recus.some((x) => x.chemin === '/workspaces/start'));

      const a = runtime.recus.find((x) => x.chemin === '/workspaces/start');
      expect(a, 'la lecture sur un espace éteint doit demander un démarrage').toBeDefined();

      expect((await banc.redemarrer()).statusCode).toBeLessThan(300);

      const b = runtime.recus.find((x) => x.chemin.endsWith('/restart'));
      expect(b, 'le redémarrage doit appeler le manager').toBeDefined();

      /* Le forfait RÉEL, sur les deux chemins. */
      expect(a!.corps.plan).toBe(planKey);
      expect(b!.corps.plan).toBe(planKey);

      /* Les mêmes droits. */
      expect(a!.corps.resourceLimits).toEqual(b!.corps.resourceLimits);

      /* Et donc le même pod : rien d'immuable ne diffère, pas de recréation. */
      expect(ressourcesDuPod(a!.corps)).toEqual(ressourcesDuPod(b!.corps));
    });
  }

  for (const planKey of ['starter', 'core'] as const) {
    it(`forfait ${planKey} (inconnu du manager) : nom accepté par le manager, droits RÉELS, même pod sur A et B`, async () => {
      runtime = await demarrerFauxRuntime();

      const banc = await preparer(planKey);

      await banc.lire();
      await attendre(() => runtime!.recus.some((x) => x.chemin === '/workspaces/start'));
      expect((await banc.redemarrer()).statusCode).toBeLessThan(300);

      const a = runtime.recus.find((x) => x.chemin === '/workspaces/start')!;
      const b = runtime.recus.find((x) => x.chemin.endsWith('/restart'))!;
      const droits = planByKey(planKey).limits as Record<string, number>;

      for (const corps of [a.corps, b.corps]) {
        /* Le manager refuse tout autre nom (`z.enum(['free','pro','team','enterprise'])`). */
        expect(['free', 'pro', 'team', 'enterprise']).toContain(corps.plan);
        expect(corps.resourceLimits).toEqual({
          cpuMillicores: droits['workspace.cpuMillicores'],
          ramMb: droits['workspace.ramMb'],
          storageGb: droits['storage.gb'],
        });
      }

      expect(ressourcesDuPod(a.corps)).toEqual(ressourcesDuPod(b.corps));
    });
  }

  it('une lecture pendant un démarrage DÉJÀ EN COURS (selon le manager) ne rappelle pas le manager', async () => {
    runtime = await demarrerFauxRuntime({ status: 'STARTING', updatedAt: new Date().toISOString() });
    const banc = await preparer('enterprise', 'STARTING');

    await banc.lire();
    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(runtime.recus.filter((x) => x.chemin === '/workspaces/start')).toHaveLength(0);
  });

  it('un démarrage PÉRIMÉ (STARTING depuis plus de 10 min selon le manager) est relancé par la lecture', async () => {
    runtime = await demarrerFauxRuntime({
      status: 'STARTING',
      updatedAt: new Date(Date.now() - 11 * 60_000).toISOString(),
    });
    const banc = await preparer('enterprise', 'STARTING');

    await banc.lire();
    await attendre(() => runtime!.recus.some((x) => x.chemin === '/workspaces/start'));

    expect(runtime.recus.filter((x) => x.chemin === '/workspaces/start')).toHaveLength(1);
  });

  it('une ligne STARTING que le manager ne connaît pas comme démarrage en cours est relancée', async () => {
    runtime = await demarrerFauxRuntime({ status: 'STOPPED' });
    const banc = await preparer('enterprise', 'STARTING');

    await banc.lire();
    await attendre(() => runtime!.recus.some((x) => x.chemin === '/workspaces/start'));

    expect(runtime.recus.filter((x) => x.chemin === '/workspaces/start')).toHaveLength(1);
  });

  it('contre-épreuve : une lecture sur un espace ÉTEINT le démarre toujours', async () => {
    runtime = await demarrerFauxRuntime();

    const banc = await preparer('enterprise', 'STOPPED');

    await banc.lire();
    await attendre(() => runtime!.recus.some((x) => x.chemin === '/workspaces/start'));

    expect(runtime.recus.filter((x) => x.chemin === '/workspaces/start')).toHaveLength(1);
  });
});

describe('aucun forfait payant ne perd de ressources', () => {
  const quantite = (valeur: string) => {
    const m = /^([\d.]+)(m|Mi|Gi)?$/.exec(valeur);

    if (!m) {
      throw new Error(`quantité illisible : ${valeur}`);
    }

    const n = Number(m[1]);

    return m[2] === 'm' ? n / 1000 : m[2] === 'Gi' ? n * 1024 : n;
  };

  for (const planKey of ['pro', 'team', 'enterprise'] as const) {
    it(`forfait ${planKey} : chaque ressource du gabarit unique ≥ ce que donnait chacun des deux anciens chemins`, async () => {
      runtime = await demarrerFauxRuntime();

      const banc = await preparer(planKey);

      expect((await banc.redemarrer()).statusCode).toBeLessThan(300);

      const apres = ressourcesDuPod(runtime.recus.find((x) => x.chemin.endsWith('/restart'))!.corps) as {
        requests: Record<string, string>;
        limits: Record<string, string>;
      };

      /* Ancien chemin A : forfait gratuit, sans droits. */
      const ancienA = ressourcesDuPod({ plan: 'free' }) as typeof apres;

      /* Ancien chemin B, recalculé INDÉPENDAMMENT depuis le catalogue : forfait réel + ses droits. */
      const droits = planByKey(planKey).limits as Record<string, number>;

      const ancienB = ressourcesDuPod({
        plan: planKey,
        resourceLimits: {
          cpuMillicores: droits['workspace.cpuMillicores'],
          ramMb: droits['workspace.ramMb'],
          storageGb: droits['storage.gb'],
        },
      }) as typeof apres;

      for (const famille of ['requests', 'limits'] as const) {
        for (const cle of ['cpu', 'memory']) {
          expect(quantite(apres[famille][cle]), `${famille}.${cle}`).toBeGreaterThanOrEqual(
            quantite(ancienA[famille][cle]),
          );
          expect(apres[famille][cle]).toBe(ancienB[famille][cle]);
        }
      }
    });
  }
});
