import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApiApp, type ApiAppOptions } from '../app.js';
import { TestApiStore } from './test-api-store.js';
import type { EmailProvider } from '../email.js';
import type { GitProvider } from '../project-storage.js';

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

class QuietGitProvider implements GitProvider {
  async importRepository(input: { repositoryUrl: string; branch?: string }) {
    return { defaultBranch: input.branch ?? 'main', remoteUrl: input.repositoryUrl, files: [] };
  }
  async status() {
    return { branch: 'main', changedFiles: [], ahead: 0, behind: 0 };
  }
  async commit(input: { message: string }) {
    return { sha: 'q', message: input.message };
  }
  async push(input: { branch: string }) {
    return { pushed: true, branch: input.branch };
  }
  async pull(input: { branch: string }) {
    return { pulled: true, branch: input.branch, changedFiles: [] };
  }
  async listBranches() {
    return ['main'];
  }
  async checkoutBranch(input: { branch: string }) {
    return { branch: input.branch };
  }
  async stashPush() {
    return { stashed: true, output: '' };
  }
  async stashList() {
    return [];
  }
  async stashApply() {
    return { applied: true, output: '' };
  }
  async cherryPick() {
    return { picked: true, output: '' };
  }
  async discard(_input: { projectId: string; workspaceId?: string; filePaths?: string[] }) {
    return { discarded: true, filePaths: [] as string[] };
  }

  async resolveConflict(input: { filePath: string; strategy: 'ours' | 'theirs' }) {
    return { resolved: true, filePath: input.filePath, strategy: input.strategy };
  }
  async logGraph() {
    return [];
  }
  async diff() {
    return '';
  }
  async blame() {
    return [];
  }
  async branchCreate(input: { branch: string }) {
    return { branch: input.branch };
  }
  async branchDelete(input: { branch: string }) {
    return { branch: input.branch, deleted: true };
  }
  async tagList() {
    return [];
  }
  async tagCreate(input: { tag: string }) {
    return { tag: input.tag };
  }
  async fetch() {
    return { fetched: true };
  }
  async reset() {
    return { reset: true };
  }
  async revert() {
    return { reverted: true };
  }
  async rebase() {
    return { rebased: true };
  }
  async merge() {
    return { merged: true };
  }
  async createPullRequest(input: { title: string }) {
    return { number: 1, url: 'https://example.com/pr/1', title: input.title };
  }
  async listPullRequests() {
    return [];
  }
}

function buildTestApiApp(options: ApiAppOptions = {}) {
  return buildApiApp({
    gitProvider: new QuietGitProvider(),
    emailProvider: new QuietEmailProvider(),
    ...options,
  });
}

const WEBHOOK_SECRET = 'github-webhook-spec-secret-do-not-ship';

function signGithubBody(body: string, secret = WEBHOOK_SECRET) {
  const digest = createHmac('sha256', secret).update(body).digest('hex');

  return `sha256=${digest}`;
}

describe('POST /webhooks/github', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.INTEGRATION_GITHUB_WEBHOOK_SIGNING_SECRET = WEBHOOK_SECRET;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns 503 when the signing secret is not configured', async () => {
    delete process.env.INTEGRATION_GITHUB_WEBHOOK_SIGNING_SECRET;

    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });

    const body = JSON.stringify({ action: 'opened' });
    const response = await app.inject({
      method: 'POST',
      url: '/webhooks/github',
      headers: {
        'content-type': 'application/json',
        'x-github-event': 'pull_request',
        'x-github-delivery': 'delivery-1',
        'x-hub-signature-256': signGithubBody(body, WEBHOOK_SECRET),
      },
      payload: body,
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ code: 'WEBHOOK_NOT_CONFIGURED' });
    await app.close();
  });

  it('returns 401 when the X-Hub-Signature-256 header is missing', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });

    const response = await app.inject({
      method: 'POST',
      url: '/webhooks/github',
      headers: {
        'content-type': 'application/json',
        'x-github-event': 'pull_request',
        'x-github-delivery': 'delivery-1',
      },
      payload: JSON.stringify({ action: 'opened' }),
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: 'WEBHOOK_SIGNATURE_MISSING' });
    await app.close();
  });

  it('returns 401 when the signature is computed with the wrong secret', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });

    const body = JSON.stringify({ action: 'opened' });
    const response = await app.inject({
      method: 'POST',
      url: '/webhooks/github',
      headers: {
        'content-type': 'application/json',
        'x-github-event': 'pull_request',
        'x-github-delivery': 'delivery-1',
        'x-hub-signature-256': signGithubBody(body, 'a-totally-different-secret'),
      },
      payload: body,
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: 'WEBHOOK_SIGNATURE_INVALID' });
    await app.close();
  });

  it('returns 200 and records an audit entry on a valid push event', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });

    const body = JSON.stringify({
      action: 'opened',
      installation: { id: 4242 },
      repository: { full_name: 'octo/hello' },
      sender: { login: 'octocat' },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/webhooks/github',
      headers: {
        'content-type': 'application/json',
        'x-github-event': 'pull_request',
        'x-github-delivery': 'd-7777',
        'x-hub-signature-256': signGithubBody(body),
      },
      payload: body,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      received: true,
      provider: 'github',
      eventType: 'pull_request',
      deliveryId: 'd-7777',
    });

    const log = store.auditLogs.find((entry) => entry.action === 'connector.webhook.received');
    expect(log).toBeTruthy();
    expect(log?.metadata).toMatchObject({
      provider: 'github',
      eventType: 'pull_request',
      deliveryId: 'd-7777',
      installationId: 4242,
      repository: 'octo/hello',
      sender: 'octocat',
    });
    await app.close();
  });

  it('returns 400 when the body is not valid JSON', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });

    const body = 'not json at all';
    const response = await app.inject({
      method: 'POST',
      url: '/webhooks/github',
      headers: {
        'content-type': 'text/plain',
        'x-github-event': 'pull_request',
        'x-github-delivery': 'delivery-1',
        'x-hub-signature-256': signGithubBody(body),
      },
      payload: body,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'WEBHOOK_BODY_INVALID' });
    await app.close();
  });
});
