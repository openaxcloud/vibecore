import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildDeploymentUrl, deployProviderConfigError, serverDeployHost, serverDeployDomain } from '~/deployments.js';
import type { DeploymentRecord, ProjectRecord } from '~/store.js';

/*
 * A server deployment (Replit-parity durable runtime) is served at
 * `https://d-<deploymentId>.<previewDomain>` — a public host covered by the
 * existing preview wildcard cert + ingress, routed by the preview-proxy. The URL
 * is persisted on the row and shown as the live app URL, so it must resolve to
 * the deployment id exactly.
 */
const SAVED = {
  SERVER_DEPLOY_DOMAIN: process.env.SERVER_DEPLOY_DOMAIN,
  PREVIEW_DOMAIN: process.env.PREVIEW_DOMAIN,
  WORKSPACE_MANAGER_URL: process.env.WORKSPACE_MANAGER_URL,
  WORKSPACE_MANAGER_SHARED_SECRET: process.env.WORKSPACE_MANAGER_SHARED_SECRET,
  NODE_ENV: process.env.NODE_ENV,
};

beforeEach(() => {
  delete process.env.SERVER_DEPLOY_DOMAIN;
  delete process.env.PREVIEW_DOMAIN;
  delete process.env.WORKSPACE_MANAGER_URL;
  delete process.env.WORKSPACE_MANAGER_SHARED_SECRET;
});

afterEach(() => {
  for (const [key, value] of Object.entries(SAVED)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe('server deployment URL + provider config', () => {
  it('defaults the deploy domain to the preview wildcard, honouring PREVIEW_DOMAIN then SERVER_DEPLOY_DOMAIN', () => {
    expect(serverDeployDomain()).toBe('preview.e-code.ai');

    process.env.PREVIEW_DOMAIN = 'preview.staging.example.com';
    expect(serverDeployDomain()).toBe('preview.staging.example.com');

    process.env.SERVER_DEPLOY_DOMAIN = 'apps.e-code.ai';
    expect(serverDeployDomain()).toBe('apps.e-code.ai');
  });

  it('builds a `d-<id>` host + https URL for a server deployment', () => {
    expect(serverDeployHost('clr8x9abc123')).toBe('d-clr8x9abc123.preview.e-code.ai');

    const project = { id: 'proj_1', slug: 'demo' } as ProjectRecord;
    const deployment = { id: 'clr8x9abc123', provider: 'server', environment: 'production' } as DeploymentRecord;

    expect(buildDeploymentUrl(project, deployment)).toBe('https://d-clr8x9abc123.preview.e-code.ai');
  });

  it('reports the server provider as unconfigured until the workspace-manager env is present', () => {
    process.env.NODE_ENV = 'production';

    // Missing manager env → honest config error (never a fake READY URL).
    expect(deployProviderConfigError('server')).toMatchObject({ error: 'PROVIDER_NOT_CONFIGURED' });

    process.env.WORKSPACE_MANAGER_URL = 'http://manager.vibecore.svc.cluster.local:3010';
    process.env.WORKSPACE_MANAGER_SHARED_SECRET = 'secret';
    expect(deployProviderConfigError('server')).toBeNull();
  });
});
