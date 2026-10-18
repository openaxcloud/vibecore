import { createServer } from 'node:http';
import { planByKey, type PlanKey } from '@vibecore/billing';
import { workspacePod, type WorkspacePlan } from '@vibecore/k8s-client';
import { afterEach, describe, expect, it } from 'vitest';
// eslint-disable-next-line no-restricted-imports -- NodeNext API tests do not use the web application's ~ alias.
import { buildApiApp } from '../app.js';
import { TestApiStore } from './test-api-store.js';

/*
 * Adapted from PR #708. These are isolated API/HTTP contract tests, not a
 * Kubernetes rollout or a production collision measurement. The HTTP recorder
 * deliberately never provisions a pod or calls a billing provider.
 */
type StartBody = { plan: WorkspacePlan; resourceLimits?: Record<string, number> };

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    await cleanup();
  }
});

async function setup(planKey: PlanKey, status: 'STOPPED' | 'RUNNING' = 'STOPPED') {
  const starts: StartBody[] = [];
  const restarts: StartBody[] = [];

  /*
   * A broken transport triggers cold provisioning. An agent HTTP 503 is a
   * different, already-reachable path and must not be used as this fixture.
   */
  const agent = createServer((request) => request.socket.destroy());
  await new Promise<void>((resolve) => agent.listen(0, '127.0.0.1', resolve));

  const agentPort = (agent.address() as { port: number }).port;

  const manager = createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => (body += chunk));
    request.on('end', () => {
      response.setHeader('content-type', 'application/json');

      if (request.url === '/workspaces/start') {
        starts.push(JSON.parse(body));
      } else if (request.url?.endsWith('/restart')) {
        restarts.push(JSON.parse(body));
      }

      response.end(
        JSON.stringify(request.url?.endsWith('/agent-token') ? { token: 'local-test' } : { status: 'RUNNING' }),
      );
    });
  });
  await new Promise<void>((resolve) => manager.listen(0, '127.0.0.1', resolve));

  const previous = {
    WORKSPACE_MANAGER_URL: process.env.WORKSPACE_MANAGER_URL,
    WORKSPACE_AGENT_URL_TEMPLATE: process.env.WORKSPACE_AGENT_URL_TEMPLATE,
  };
  process.env.WORKSPACE_MANAGER_URL = `http://127.0.0.1:${(manager.address() as { port: number }).port}`;
  process.env.WORKSPACE_AGENT_URL_TEMPLATE = `http://127.0.0.1:${agentPort}`;
  cleanups.push(async () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }

    await Promise.all([agent, manager].map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  });

  const store = new TestApiStore();
  const app = await buildApiApp({ store });
  cleanups.push(() => app.close());

  const auth = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      email: `resources-${crypto.randomUUID()}@local.test`,
      password: 'Password123!',
      name: 'Resources',
      organizationName: 'Resources',
    },
  });
  expect(auth.statusCode).toBe(201);

  const { token, organization } = auth.json();
  const headers = { authorization: `Bearer ${token}` };

  if (planKey !== 'free') {
    await store.upsertSubscription({ organizationId: organization.id, planKey, status: 'ACTIVE' });
  }

  const project = await app.inject({
    method: 'POST',
    url: `/orgs/${organization.id}/projects`,
    headers,
    payload: { name: 'Resources' },
  });
  expect(project.statusCode).toBe(201);

  const projectId = project.json().project.id as string;
  const workspace = await store.createWorkspace({ projectId, name: 'resources', runtimeMode: 'remote-kubernetes' });
  await store.updateWorkspaceStatus({ workspaceId: workspace.id, status });

  return {
    store,
    starts,
    restarts,
    workspace,
    read: () =>
      app.inject({ method: 'GET', url: `/api/runtime/workspaces/${workspace.id}/files/read?path=tree`, headers }),
    start: () =>
      app.inject({
        method: 'POST',
        url: '/api/runtime/workspaces',
        headers,
        payload: { projectId, workspaceId: workspace.id },
      }),
    restart: () => app.inject({ method: 'POST', url: `/api/runtime/workspaces/${workspace.id}/restart`, headers }),
  };
}

function podResources(body: StartBody) {
  const pod = workspacePod({
    namespace: 'workspaces',
    orgId: 'org',
    projectId: 'project',
    workspaceId: 'workspace',
    image: 'local-test',
    pvcName: 'pvc',
    agentTokenSecretName: 'local-test',
    env: {},
    secretEnv: {},
    ...body,
  }) as unknown as { spec: { containers: Array<{ name: string; resources: unknown }> } };

  return pod.spec.containers.find((container) => container.name === 'workspace-agent')!.resources;
}

describe('workspace resource contract across provisioning paths', () => {
  for (const plan of ['free', 'pro', 'team', 'enterprise'] as const) {
    it(`${plan}: automatic read, explicit start and restart request identical subscribed resources`, async () => {
      const runtime = await setup(plan);
      await runtime.read();
      await expect.poll(() => runtime.starts.length).toBe(1);
      expect((await runtime.start()).statusCode).toBeLessThan(300);
      expect((await runtime.restart()).statusCode).toBeLessThan(300);

      const limits = planByKey(plan).limits;

      const expected: StartBody = {
        plan,
        resourceLimits: {
          cpuMillicores: limits['workspace.cpuMillicores'],
          ramMb: limits['workspace.ramMb'],
          storageGb: limits['storage.gb'],
        },
      };
      expect(runtime.starts).toHaveLength(2);
      expect(runtime.restarts).toHaveLength(1);

      for (const body of [...runtime.starts, ...runtime.restarts]) {
        expect(body).toMatchObject(expected);
        expect(podResources(body)).toEqual(podResources(expected));
      }
    });
  }

  it('automatic provisioning preserves organization catalog overrides', async () => {
    const runtime = await setup('pro');
    await runtime.store.upsertBillingPlan({
      key: 'pro',
      name: 'Pro',
      monthlyCents: 2900,
      limits: {
        'workspace.cpuMillicores': 3200,
        'workspace.ramMb': 6400,
        'storage.gb': 40,
      },
    });
    await runtime.read();
    await expect.poll(() => runtime.starts.length).toBe(1);
    expect(runtime.starts[0]).toMatchObject({
      plan: 'pro',
      resourceLimits: { cpuMillicores: 3200, ramMb: 6400, storageGb: 40 },
    });
  });

  for (const plan of ['starter', 'core'] as const) {
    it(`${plan}: preserves the existing automatic-start contract until manager and metering support migrate together`, async () => {
      const runtime = await setup(plan);
      await runtime.read();
      await expect.poll(() => runtime.starts.length).toBe(1);
      expect(runtime.starts[0].plan).toBe(process.env.WORKSPACE_DEFAULT_PLAN ?? 'free');
      expect(runtime.starts[0].resourceLimits).toBeUndefined();
    });
  }

  for (const status of ['STOPPED', 'RUNNING'] as const) {
    it(`${status}: unavailable billing cannot downgrade a workspace or claim a new active slot`, async () => {
      const runtime = await setup('enterprise', status);

      let billingReads = 0;

      runtime.store.getBillingPlan = async () => {
        billingReads++;
        throw new Error('local billing outage');
      };
      await runtime.read();
      await expect.poll(() => billingReads).toBeGreaterThan(0);
      expect(runtime.starts).toHaveLength(0);
      expect((await runtime.store.getWorkspace(runtime.workspace.id))?.status).toBe(status);
    });
  }
});
