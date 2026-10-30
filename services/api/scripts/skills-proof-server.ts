// Synthetic local UI fixture; run only against the dedicated Skills proof database.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { PrismaApiStore } from '../src/prisma-store';
import { buildApiApp } from '../src/app';
assert.ok(
  process.env.DATABASE_URL === 'postgresql://proof:proof@127.0.0.1:55439/skills_proof' &&
    process.env.NODE_ENV === 'test',
);
const store = new PrismaApiStore();
const suffix = randomUUID();
const user = await store.createUser({ email: `${suffix}@example.test`, name: 'Skills QA', passwordHash: 'no-login' });
const org = await store.createOrganization({ name: 'Skills QA', slug: suffix, ownerUserId: user.id });
const token = randomUUID();
await store.createSession({ userId: user.id, token, expiresAt: new Date(Date.now() + 3600000) });
const project = await store.createProject({ organizationId: org.id, name: 'Skills isolated proof', slug: suffix });
// Synthetic metadata only: no third-party content is fetched or executed.
await store.installSkill({
  scope: 'project',
  scopeId: project.id,
  ownerRepo: 'ecode-proof/ui',
  name: 'UI',
  description: 'Synthetic interface guidance',
  instructions: 'Explain the synthetic interface clearly.',
  enabled: true,
  auditVerdict: 'approved',
  resources: [{ path: 'references/synthetic-reference.md', kind: 'reference', bytes: 42 }],
});
writeFileSync('/tmp/skills-browser-fixture.json', JSON.stringify({ token, projectId: project.id }));
const app = await buildApiApp({ store, loggerStream: { write() {} } });
await app.listen({ host: '127.0.0.1', port: 18787 });
console.log('Isolated Skills API ready');
