import { hashPassword } from '@vibecore/auth';
import { describe, expect, it } from 'vitest';

import { buildApiApp } from '../app.js';
import type { EmailProvider } from '../email.js';
import type { ProjectFile, ProjectStorage } from '../project-storage.js';
import { TestApiStore } from './test-api-store.js';

/*
 * END-TO-END proof that the remaining import CONNECTORS execute the full secure
 * state machine — RECEIVED → STAGING_ISOLATED → SCANNING → (findings?) →
 * COMMITTING → COMMITTED — through the REAL Fastify app (`buildApiApp`), with a
 * disposable staging map, no target write before the atomic commit, provider
 * security hardening, and honest BLOCKED for external-api providers.
 *
 * Providers covered here (the ones that had no executing path before):
 *   spreadsheet · bolt · lovable · base44 · previous-agent-export  → PROVEN
 *   vercel · figma · claude                                        → BLOCKED (424)
 */

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

/** In-memory target storage. writeFiles is the ONLY target touch we assert on. */
class MemoryProjectStorage implements ProjectStorage {
  readonly files = new Map<string, Map<string, string>>();
  writeCalls: string[] = [];

  async writeFiles(projectId: string, files: Array<{ path: string; content: string }>) {
    this.writeCalls.push(projectId);

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

  async readFile() {
    return undefined;
  }
  async deleteFiles() {}
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
    return { storageKey: 'snap', byteLength: 0, createdAt: new Date().toISOString() };
  }
  async getSnapshotFiles() {
    return [];
  }
  async restoreSnapshot() {
    return [];
  }
}

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

async function setup() {
  const store = new TestApiStore();
  const projectStorage = new MemoryProjectStorage();
  const app = await buildApiApp({ store, projectStorage, emailProvider: new QuietEmailProvider() });

  const user = await store.createUser({
    email: 'conn@example.com',
    name: 'Conn',
    passwordHash: hashPassword('password123'),
  });

  const org = await store.createOrganization({ name: 'Conn Org', slug: 'conn-org', ownerUserId: user.id });
  await store.createSession({ userId: user.id, token: 'conn-token', expiresAt: new Date(Date.now() + 3600_000) });

  return { app, store, projectStorage, org };
}

// Secret-shaped but NOT a real token (keeps push-protection quiet).
const IMPORTED_SECRET = 'Zx9Q7wE3rT5yU8iO1pA6sD2fG4hJ0kL0mN';

describe('Import connectors — E2E secure state machine', () => {
  it('SPREADSHEET: CSV → derived static project, clean scan → COMMITTED (target written only at commit)', async () => {
    const { app, org, projectStorage } = await setup();

    const created = await app.inject({
      method: 'POST',
      url: `/orgs/${org.id}/imports`,
      headers: auth('conn-token'),
      payload: {
        provider: 'spreadsheet',
        name: 'Sales',
        sourceText: 'region,revenue\nEMEA,120\nAMER,340\n',
      },
    });

    expect(created.statusCode).toBe(201);

    const body = created.json();
    expect(body.import.state).toBe('SCANNING');
    expect(body.import.requiresConsent).toBe(false);
    expect(body.import.stagedFileCount).toBe(3); // index.html + data.json + README.md
    expect(projectStorage.writeCalls).toEqual([]); // I-IMP-2: nothing written yet

    const committed = await app.inject({
      method: 'POST',
      url: `/orgs/${org.id}/imports/${body.import.importJobId}/commit`,
      headers: auth('conn-token'),
      payload: { consent: {} },
    });

    expect(committed.statusCode).toBe(201);

    const proj = committed.json().project as { id: string };
    expect(committed.json().import.state).toBe('COMMITTED');

    // Target now holds the derived project.
    const bucket = projectStorage.files.get(proj.id)!;
    expect([...bucket.keys()].sort()).toEqual(['README.md', 'data.json', 'index.html']);

    const data = JSON.parse(bucket.get('data.json')!);
    expect(data.rows).toEqual([
      { region: 'EMEA', revenue: '120' },
      { region: 'AMER', revenue: '340' },
    ]);
  });

  it.each(['bolt', 'lovable', 'base44', 'previous-agent-export'])(
    '%s: export bundle → wrapper stripped, clean scan → COMMITTED',
    async (provider) => {
      const { app, org, projectStorage } = await setup();

      const created = await app.inject({
        method: 'POST',
        url: `/orgs/${org.id}/imports`,
        headers: auth('conn-token'),
        payload: {
          provider,
          files: [
            { path: 'my-app/src/index.ts', content: 'console.log("hi")\n' },
            { path: 'my-app/package.json', content: '{"name":"my-app"}\n' },
          ],
        },
      });

      expect(created.statusCode).toBe(201);

      const body = created.json();
      expect(body.import.stagedFileCount).toBe(2);

      const committed = await app.inject({
        method: 'POST',
        url: `/orgs/${org.id}/imports/${body.import.importJobId}/commit`,
        headers: auth('conn-token'),
        payload: { consent: {} },
      });

      expect(committed.statusCode).toBe(201);

      const proj = committed.json().project as { id: string };

      // Wrapper dir stripped: files land at the project root.
      const bucket = projectStorage.files.get(proj.id)!;
      expect([...bucket.keys()].sort()).toEqual(['package.json', 'src/index.ts']);
    },
  );

  it('BOLT with a secret → QUARANTINED (202); commit with per-finding consent redacts ONLY that line → COMMITTED', async () => {
    const { app, org, projectStorage } = await setup();

    const created = await app.inject({
      method: 'POST',
      url: `/orgs/${org.id}/imports`,
      headers: auth('conn-token'),
      payload: {
        provider: 'bolt',
        files: [
          { path: 'app/src/main.ts', content: 'export const x = 1\n' },
          { path: 'app/.env', content: `PORT=3000\nAPI_SECRET=${IMPORTED_SECRET}\n` },
        ],
      },
    });

    expect(created.statusCode).toBe(202);

    const body = created.json();
    expect(body.import.state).toBe('AWAITING_USER_ACTION');
    expect(body.import.requiresConsent).toBe(true);

    // Redacted preview only — never the raw secret.
    expect(JSON.stringify(body.import.findings)).not.toContain(IMPORTED_SECRET);

    const finding = body.import.findings.find((f: { path: string }) => f.path === '.env');
    expect(finding).toBeTruthy();
    expect(projectStorage.writeCalls).toEqual([]); // nothing written while quarantined

    // Commit with explicit 'redact' consent for the finding.
    const committed = await app.inject({
      method: 'POST',
      url: `/orgs/${org.id}/imports/${body.import.importJobId}/commit`,
      headers: auth('conn-token'),
      payload: { consent: { [`${finding.path}:${finding.line}`]: 'redact' } },
    });

    expect(committed.statusCode).toBe(201);

    const proj = committed.json().project as { id: string };
    const env = projectStorage.files.get(proj.id)!.get('.env')!;
    expect(env).not.toContain(IMPORTED_SECRET); // redacted
    expect(env).toContain('PORT=3000'); // non-secret line intact
  });

  it('BOLT with a secret, commit WITHOUT consent → 409 blocked, no target write', async () => {
    const { app, org, projectStorage } = await setup();

    const created = await app.inject({
      method: 'POST',
      url: `/orgs/${org.id}/imports`,
      headers: auth('conn-token'),
      payload: {
        provider: 'bolt',
        files: [{ path: '.env', content: `API_SECRET=${IMPORTED_SECRET}\n` }],
      },
    });
    expect(created.statusCode).toBe(202);

    const blocked = await app.inject({
      method: 'POST',
      url: `/orgs/${org.id}/imports/${created.json().import.importJobId}/commit`,
      headers: auth('conn-token'),
      payload: { consent: {} },
    });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().code).toBe('IMPORT_UNRESOLVED_FINDINGS');
    expect(projectStorage.writeCalls).toEqual([]);
  });

  describe('security hardening rejects a hostile bundle BEFORE staging (no job, no target)', () => {
    it.each([
      ['path traversal', [{ path: '../../etc/passwd', content: 'x' }], 'IMPORT_PATH_TRAVERSAL'],
      [
        'symlink',
        [{ path: 'link', content: '', type: 'symlink', linkTarget: '/etc/passwd' }],
        'IMPORT_SYMLINK_REJECTED',
      ],
    ])('rejects %s → 422', async (_label, files, code) => {
      const { app, org, projectStorage } = await setup();

      const res = await app.inject({
        method: 'POST',
        url: `/orgs/${org.id}/imports`,
        headers: auth('conn-token'),
        payload: { provider: 'bolt', files },
      });
      expect(res.statusCode).toBe(422);
      expect(res.json().code).toBe(code);
      expect(projectStorage.writeCalls).toEqual([]);
    });

    it('rejects an archive bomb (too many files) → 422', async () => {
      const { app, org } = await setup();
      const files = Array.from({ length: 5001 }, (_, i) => ({ path: `f${i}.txt`, content: 'x' }));

      const res = await app.inject({
        method: 'POST',
        url: `/orgs/${org.id}/imports`,
        headers: auth('conn-token'),
        payload: { provider: 'base44', files },
      });
      expect(res.statusCode).toBe(422);
      expect(res.json().code).toBe('IMPORT_TOO_MANY_FILES');
    });
  });

  describe('external-api connectors are honestly BLOCKED (424), never faked', () => {
    it.each(['vercel', 'figma', 'claude'])(
      '%s → 424 CONNECTOR_CREDENTIAL_REQUIRED, no project created',
      async (provider) => {
        const { app, org, projectStorage } = await setup();

        const res = await app.inject({
          method: 'POST',
          url: `/orgs/${org.id}/imports`,
          headers: auth('conn-token'),
          payload: { provider, files: [] },
        });
        expect(res.statusCode).toBe(424);

        const body = res.json();
        expect(body.code).toBe('CONNECTOR_CREDENTIAL_REQUIRED');
        expect(body.blocked).toBe(true);
        expect(body.provider).toBe(provider);
        expect(typeof body.reason).toBe('string');
        expect(projectStorage.writeCalls).toEqual([]);
      },
    );
  });
});
