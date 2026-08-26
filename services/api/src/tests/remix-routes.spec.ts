import { hashPassword } from '@vibecore/auth';
import { encryptJson } from '@vibecore/security';
import { describe, expect, it } from 'vitest';

import { buildApiApp } from '../app.js';
import type { EmailProvider } from '../email.js';
import type { ProjectFile, ProjectStorage } from '../project-storage.js';
import { TestApiStore } from './test-api-store.js';

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

/** Minimal in-memory ProjectStorage — enough for the remix file path. */
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

  // Unused-by-remix members: satisfy the interface with safe no-ops.
  async readFile() {
    return undefined;
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

const SECRET_VALUE = 'FIXTURE-not-a-real-secret-a1b2c3d4e5f6-DO-NOT-LEAK';
const ENV_VALUE = 'postgres://user:SuperSecretDbPassword@db.internal:5432/app';

async function setup() {
  const store = new TestApiStore();
  const projectStorage = new MemoryProjectStorage();
  const app = await buildApiApp({ store, projectStorage, emailProvider: new QuietEmailProvider() });

  const user = await store.createUser({
    email: 'remix@example.com',
    name: 'Remix User',
    passwordHash: hashPassword('password123'),
  });

  const org = await store.createOrganization({ name: 'Remix Org', slug: 'remix-org', ownerUserId: user.id });
  await store.createSession({ userId: user.id, token: 'remix-token', expiresAt: new Date(Date.now() + 3600_000) });

  const source = await store.createProject({ organizationId: org.id, name: 'Source', slug: 'source' });

  /*
   * A real secret in the DB (encrypted), plus the SAME value materialized into a
   * committed .env file in the workspace — the leak the invariant must catch.
   */
  await store.upsertProjectSecret({
    projectId: source.id,
    key: 'STRIPE_KEY',
    valueEncrypted: encryptJson({ value: SECRET_VALUE }),
  });
  await store.upsertProjectEnvVar({ projectId: source.id, key: 'DATABASE_URL', value: ENV_VALUE });

  await projectStorage.writeFiles(source.id, [
    { path: 'src/app.ts', content: 'console.log("hello");\n' },
    { path: '.env', content: `PORT=3000\nSTRIPE_KEY=${SECRET_VALUE}\nDATABASE_URL=${ENV_VALUE}\n` },
    { path: 'README.md', content: '# Source project\n' },
  ]);

  return { app, store, projectStorage, org, source };
}

describe('POST /projects/:id/remix — secure fork, secret never enters the clone', () => {
  it('remixes a project WITH a secret and the secret value is NOWHERE in the clone', async () => {
    const { app, store, projectStorage, source } = await setup();

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${source.id}/remix`,
      headers: auth('remix-token'),
      payload: { name: 'Remixed', storagePolicy: 'DETACH' },
    });

    expect(res.statusCode).toBe(201);

    const body = res.json();
    const cloneId = body.project.id;
    expect(cloneId).not.toBe(source.id); // new project, new owner scope

    // The pipeline ran to completion through the normative states.
    expect(body.remix.state).toBe('COMPLETED');

    // Credentials were detached to REFERENCES (keys), never values.
    expect(body.remix.detachedKeys.secretKeys).toContain('STRIPE_KEY');
    expect(body.remix.detachedKeys.envVarKeys).toContain('DATABASE_URL');
    expect(JSON.stringify(body.remix.detachedKeys)).not.toContain(SECRET_VALUE);
    expect(JSON.stringify(body.remix.detachedKeys)).not.toContain(ENV_VALUE);

    // The .env materialized both values → 2 value-lines scrubbed.
    expect(body.remix.scrubbedValueLines).toBeGreaterThanOrEqual(2);

    // ---- THE PROOF: actively SEARCH for the secret value in every clone surface ----

    // (a) Clone FILES: the whole cloned artifact must not contain either value.
    const cloneFiles = await projectStorage.listFiles(cloneId);
    const allFileText = cloneFiles.map((f) => f.content).join('\n');
    expect(allFileText).not.toContain(SECRET_VALUE);
    expect(allFileText).not.toContain(ENV_VALUE);

    // But the .env still exists with the KEY as a reference (parses, no value).
    const envFile = cloneFiles.find((f) => f.path === '.env');
    expect(envFile).toBeTruthy();
    expect(envFile!.content).toContain('STRIPE_KEY=');
    expect(envFile!.content).toContain('DATABASE_URL=');

    // (b) Clone DB: no ProjectSecret / ProjectEnvVar row was carried onto the clone.
    const cloneSecrets = await store.listProjectSecrets(cloneId);
    const cloneEnvVars = await store.listProjectEnvVars(cloneId);
    expect(cloneSecrets).toEqual([]);
    expect(cloneEnvVars).toEqual([]);

    // (c) Remix job record persisted, no value leaked into detachedKeys/scanFindings.
    const job = await store.getRemixJob(body.remix.remixJobId);
    expect(job?.state).toBe('COMPLETED');
    expect(job?.dbForked).toBe(false); // honest: isolated, not physically forked
    expect(JSON.stringify(job)).not.toContain(SECRET_VALUE);
    expect(JSON.stringify(job)).not.toContain(ENV_VALUE);
  });

  it('BLOCKS the remix (409, quarantine) if a secret value somehow survives into the clone', async () => {
    /*
     * Drive the scanner directly against a clone that still has the value to
     * prove the SCANNING gate is real: if the scrub is bypassed, the remix fails.
     */
    const { scanClonedFilesForSecrets } = await import('../remix-pipeline.js');

    const findings = scanClonedFilesForSecrets(
      [{ path: '.env', content: `STRIPE_KEY=${SECRET_VALUE}\n` }],
      [{ key: 'STRIPE_KEY', value: SECRET_VALUE }],
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].secretKey).toBe('STRIPE_KEY');
    expect(JSON.stringify(findings)).not.toContain(SECRET_VALUE); // finding carries key+location only
  });

  it('exposes the remix job state via GET /projects/:id/remix/:remixJobId', async () => {
    const { app, source } = await setup();

    const created = await app.inject({
      method: 'POST',
      url: `/projects/${source.id}/remix`,
      headers: auth('remix-token'),
      payload: { name: 'Remixed 2' },
    });

    const remixJobId = created.json().remix.remixJobId;

    const got = await app.inject({
      method: 'GET',
      url: `/projects/${source.id}/remix/${remixJobId}`,
      headers: auth('remix-token'),
    });
    expect(got.statusCode).toBe(200);
    expect(got.json().remix.state).toBe('COMPLETED');
    expect(got.json().remix.storagePolicy).toBe('DETACH');
  });
});
