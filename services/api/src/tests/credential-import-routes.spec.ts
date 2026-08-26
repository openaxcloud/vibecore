import { hashPassword } from '@vibecore/auth';
import { encryptJson } from '@vibecore/security';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildApiApp } from '../app.js';
import type { EmailProvider } from '../email.js';
import type { ProjectFile, ProjectStorage } from '../project-storage.js';
import { TestApiStore } from './test-api-store.js';

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

class MemoryProjectStorage implements ProjectStorage {
  readonly files = new Map<string, Map<string, string>>();

  async writeFiles(projectId: string, files: Array<{ path: string; content: string }>) {
    const bucket = this.files.get(projectId) ?? new Map<string, string>();

    for (const file of files) {
      bucket.set(file.path, file.content);
    }

    this.files.set(projectId, bucket);
    return this.listFiles(projectId);
  }

  async listFiles(projectId: string): Promise<ProjectFile[]> {
    const bucket = this.files.get(projectId) ?? new Map<string, string>();
    const updatedAt = new Date().toISOString();

    return [...bucket.entries()].map(([path, content]) => ({ path, content, updatedAt }));
  }

  async readFile(projectId: string, path: string) {
    const content = this.files.get(projectId)?.get(path);
    return content === undefined ? undefined : { path, content, updatedAt: new Date().toISOString() };
  }

  async deleteFiles() {}
  async deleteProjectFiles(projectId: string) {
    this.files.delete(projectId);
  }
  async exportZip() {
    return { storageKey: 'export', byteLength: 0, base64: '', createdAt: new Date().toISOString() };
  }
  async importZip() {
    return [];
  }
  async writeObject() {}
  async readObject() {
    return undefined;
  }
  async deleteObject() {}
  async createSnapshot() {
    return { storageKey: 'snapshot', byteLength: 0, createdAt: new Date().toISOString() };
  }
  async getSnapshotFiles() {
    return [];
  }
  async restoreSnapshot() {
    return [];
  }
}

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

async function setup(logLines?: string[]) {
  const store = new TestApiStore();
  const projectStorage = new MemoryProjectStorage();
  const app = await buildApiApp({
    store,
    projectStorage,
    emailProvider: new QuietEmailProvider(),
    ...(logLines ? { loggerStream: { write: (line: string) => logLines.push(line) } } : {}),
  });
  const user = await store.createUser({
    email: 'credential-import@example.com',
    name: 'Importer',
    passwordHash: hashPassword('password123'),
  });
  const organization = await store.createOrganization({
    name: 'Credential Import Org',
    slug: 'credential-import-org',
    ownerUserId: user.id,
  });
  await store.createSession({
    userId: user.id,
    token: 'credential-import-session',
    expiresAt: new Date(Date.now() + 3_600_000),
  });

  return { app, store, projectStorage, user, organization };
}

async function connect(
  store: TestApiStore,
  userId: string,
  provider: 'vercel' | 'figma' | 'claude',
  credential: string,
) {
  return store.upsertUserConnection({
    userId,
    provider,
    externalAccountId: `${provider}-account`,
    externalAccountLabel: `${provider} account`,
    accessTokenEncrypted: encryptJson({ value: credential }),
    scopes: [],
    createdByUserId: userId,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('credential-backed import routes', () => {
  it('fails closed without the caller’s own active connection and never calls the provider', async () => {
    const { app, store, organization } = await setup();
    const otherUser = await store.createUser({
      email: 'other-importer@example.com',
      name: 'Other',
      passwordHash: hashPassword('password123'),
    });
    await connect(store, otherUser.id, 'vercel', 'other-user-credential');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const response = await app.inject({
      method: 'POST',
      url: `/orgs/${organization.id}/imports`,
      headers: auth('credential-import-session'),
      payload: {
        provider: 'vercel',
        sourceRef: 'acme-web',
        idempotencyKey: 'credential-import-no-link',
        files: [{ path: 'forged.ts', content: 'must be ignored' }],
      },
    });

    expect(response.statusCode).toBe(424);
    expect(response.json()).toMatchObject({ code: 'IMPORT_CONNECTOR_NOT_LINKED' });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(await store.listProjects(organization.id)).toHaveLength(0);
    await app.close();
  });

  it('fails closed when the stored credential cannot be decrypted', async () => {
    const { app, store, user, organization } = await setup();
    await store.upsertUserConnection({
      userId: user.id,
      provider: 'figma',
      externalAccountId: 'figma-account',
      externalAccountLabel: 'Figma account',
      accessTokenEncrypted: 'not-an-encrypted-envelope',
      scopes: [],
      createdByUserId: user.id,
    });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const response = await app.inject({
      method: 'POST',
      url: `/orgs/${organization.id}/imports`,
      headers: auth('credential-import-session'),
      payload: {
        provider: 'figma',
        sourceRef: 'FigmaKey_123',
        idempotencyKey: 'credential-import-corrupt-token',
      },
    });

    expect(response.statusCode).toBe(424);
    expect(response.json()).toMatchObject({ code: 'IMPORT_CONNECTOR_CREDENTIAL_UNAVAILABLE' });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(await store.listProjects(organization.id)).toHaveLength(0);
    await app.close();
  });

  it('stages a real Vercel preview, then creates exactly the sanitized configuration snapshot', async () => {
    const { app, store, projectStorage, user, organization } = await setup();
    const credential = 'vercel-import-credential';
    await connect(store, user.id, 'vercel', credential);
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      expect(String(input)).toBe('https://api.vercel.com/v9/projects/acme-web');
      expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${credential}`);

      return Response.json({
        id: 'project-real-1',
        name: 'acme-web',
        framework: 'nextjs',
        link: { type: 'github', org: 'acme', repo: 'web', credential: 'provider-private-field' },
        environment: [{ key: 'PRIVATE', value: 'provider-secret-value' }],
      });
    });

    const staged = await app.inject({
      method: 'POST',
      url: `/orgs/${organization.id}/imports`,
      headers: auth('credential-import-session'),
      payload: {
        provider: 'vercel',
        sourceRef: 'acme-web',
        idempotencyKey: 'credential-import-vercel-success',
        files: [{ path: 'forged.ts', content: 'must be ignored' }],
      },
    });

    expect(staged.statusCode).toBe(201);
    expect(staged.json().import).toMatchObject({
      state: 'READY_TO_COMMIT',
      provider: 'vercel',
      stagedFileCount: 1,
      preview: {
        provider: 'vercel',
        title: 'acme-web',
        paths: ['.e-code/import/vercel-project.json'],
      },
    });
    expect(staged.body).not.toContain(credential);
    expect(staged.body).not.toContain('provider-private-field');
    expect(staged.body).not.toContain('provider-secret-value');

    const importJobId = staged.json().import.importJobId as string;
    const committed = await app.inject({
      method: 'POST',
      url: `/orgs/${organization.id}/imports/${importJobId}/commit`,
      headers: auth('credential-import-session'),
      payload: { consent: {} },
    });

    expect(committed.statusCode).toBe(201);
    expect(committed.json().project.sourceType).toBe('vercel');
    const projectId = committed.json().project.id as string;
    const content = projectStorage.files.get(projectId)?.get('.e-code/import/vercel-project.json') ?? '';
    expect(content).toContain('project-real-1');
    expect(content).not.toContain('forged.ts');
    expect(content).not.toContain(credential);
    expect(content).not.toContain('provider-secret-value');
    await app.close();
  });

  it('quarantines secret-shaped Claude source, exposes only a redacted finding, and commits explicit redaction', async () => {
    const { app, store, projectStorage, user, organization } = await setup();
    await connect(store, user.id, 'claude', 'claude-import-credential');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({ data: [{ id: 'claude-model-id', display_name: 'Claude verified model' }] }),
    );
    const sourceSecret = 'Zx9Q7wE3rT5yU8iO1pA6sD2fG4hJ0kL0mN';
    const sourcePayload = `export const endpoint = 'safe';\nAPI_SECRET=${sourceSecret}\n`;
    const staged = await app.inject({
      method: 'POST',
      url: `/orgs/${organization.id}/imports`,
      headers: auth('credential-import-session'),
      payload: {
        provider: 'claude',
        sourceRef: 'Explicit artifact',
        sourcePayload,
        targetPath: 'src/artifact.ts',
        idempotencyKey: 'credential-import-claude-quarantine',
      },
    });

    expect(staged.statusCode).toBe(202);
    expect(staged.json().import).toMatchObject({
      state: 'AWAITING_USER_ACTION',
      requiresConsent: true,
      preview: { provider: 'claude', paths: ['src/artifact.ts'] },
    });
    expect(staged.body).not.toContain(sourceSecret);
    const finding = staged.json().import.findings[0] as { path: string; line: number };
    const importJobId = staged.json().import.importJobId as string;

    const blocked = await app.inject({
      method: 'POST',
      url: `/orgs/${organization.id}/imports/${importJobId}/commit`,
      headers: auth('credential-import-session'),
      payload: { consent: {} },
    });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json()).toMatchObject({ code: 'IMPORT_UNRESOLVED_FINDINGS' });

    const committed = await app.inject({
      method: 'POST',
      url: `/orgs/${organization.id}/imports/${importJobId}/commit`,
      headers: auth('credential-import-session'),
      payload: { consent: { [`${finding.path}:${finding.line}`]: 'redact' } },
    });
    expect(committed.statusCode).toBe(201);
    expect(committed.json().project.sourceType).toBe('claude');
    const content = projectStorage.files.get(committed.json().project.id)?.get('src/artifact.ts') ?? '';
    expect(content).toContain('API_SECRET=');
    expect(content).not.toContain(sourceSecret);
    await app.close();
  });

  it('configures Figma and Claude credentials against their real validation contracts without returning a token', async () => {
    const { app, store, user } = await setup();
    const providerResponses = [
      Response.json({ id: 'figma-user-1', handle: 'Design account' }),
      Response.json({ data: [{ id: 'claude-model-id', display_name: 'Claude verified model' }] }),
    ];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => providerResponses.shift()!);

    const figma = await app.inject({
      method: 'POST',
      url: '/api/integrations/api-key/figma/configure',
      headers: auth('credential-import-session'),
      payload: { apiKey: 'figma-credential-to-encrypt' },
    });
    const claude = await app.inject({
      method: 'POST',
      url: '/api/integrations/api-key/claude/configure',
      headers: auth('credential-import-session'),
      payload: { apiKey: 'claude-credential-to-encrypt' },
    });

    expect(figma.statusCode).toBe(200);
    expect(figma.json()).toMatchObject({ provider: 'figma', accountLabel: 'Design account' });
    expect(claude.statusCode).toBe(200);
    expect(claude.json()).toMatchObject({ provider: 'claude', accountLabel: 'Claude verified model' });
    expect(`${figma.body}${claude.body}`).not.toContain('credential-to-encrypt');

    const connections = await store.listUserConnectionsByUser(user.id);
    expect(
      connections.filter((connection) => connection.provider === 'figma' || connection.provider === 'claude'),
    ).toHaveLength(2);
    expect(connections.every((connection) => connection.accessTokenEncrypted !== 'figma-credential-to-encrypt')).toBe(
      true,
    );
    await app.close();
  });

  it('redacts upstream diagnostics from both the response and request logs', async () => {
    const logLines: string[] = [];
    const { app, store, user, organization } = await setup(logLines);
    await connect(store, user.id, 'figma', 'figma-import-credential');
    const providerDiagnostic = 'provider diagnostic with private account detail';
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(providerDiagnostic, { status: 503 }));

    const response = await app.inject({
      method: 'POST',
      url: `/orgs/${organization.id}/imports`,
      headers: auth('credential-import-session'),
      payload: {
        provider: 'figma',
        sourceRef: 'FigmaKey_123',
        idempotencyKey: 'credential-import-upstream-failure',
      },
    });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toMatchObject({ code: 'IMPORT_CONNECTOR_UPSTREAM_UNAVAILABLE' });
    expect(response.body).not.toContain(providerDiagnostic);
    expect(logLines.join('\n')).not.toContain(providerDiagnostic);
    expect(logLines.join('\n')).not.toContain('figma-import-credential');
    await app.close();
  });
});
