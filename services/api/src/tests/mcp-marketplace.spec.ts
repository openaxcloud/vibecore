import { describe, expect, it, beforeAll } from 'vitest';
import { createDatabaseClient } from '@vibecore/database';
import { buildApiApp } from '../app.js';
import { PrismaApiStore } from '../prisma-store.js';
import { seedMcpCatalog } from '../../../../packages/database/prisma/seed-mcp-catalog.js';
import type { EmailProvider } from '../email.js';
import type { GitProvider } from '../project-storage.js';
import {
  McpMarketplaceService,
  validateConfigAgainstSchema,
  createDefaultMcpMarketplaceService,
} from '../mcp-marketplace.js';

async function canReachDatabase() {
  if (!process.env.DATABASE_URL) {
    return false;
  }

  const prisma = createDatabaseClient();

  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  } finally {
    await prisma.$disconnect();
  }
}

class TestEmailProvider implements EmailProvider {
  async send() {}
}

class TestGitProvider implements GitProvider {
  async importRepository(input: { repositoryUrl: string; branch?: string }) {
    return { defaultBranch: input.branch ?? 'main', remoteUrl: input.repositoryUrl, files: [] };
  }
  async status() {
    return { branch: 'main', changedFiles: [], ahead: 0, behind: 0 };
  }
  async commit(input: { message: string }) {
    return { sha: `test-${Date.now().toString(36)}`, message: input.message };
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
    return { stashed: true, output: 'Saved working directory' };
  }
  async stashList() {
    return [];
  }
  async stashApply() {
    return { applied: true, output: 'Applied stash' };
  }
  async cherryPick() {
    return { picked: true, output: 'Cherry-picked commit' };
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
  async createPullRequest() {
    return { url: 'https://github.example/pull/1', number: 1 };
  }
}

describe('validateConfigAgainstSchema', () => {
  it('rejects non-object configs', () => {
    expect(validateConfigAgainstSchema('not-an-object', { type: 'object' })).toContain('config must be a JSON object');
    expect(validateConfigAgainstSchema(null, { type: 'object' })).toContain('config must be a JSON object');
    expect(validateConfigAgainstSchema([], { type: 'object' })).toContain('config must be a JSON object');
  });

  it('reports missing required fields', () => {
    const errors = validateConfigAgainstSchema(
      { GITHUB_PERSONAL_ACCESS_TOKEN: '' },
      {
        type: 'object',
        properties: { GITHUB_PERSONAL_ACCESS_TOKEN: { type: 'string', minLength: 10 } },
        required: ['GITHUB_PERSONAL_ACCESS_TOKEN'],
      },
    );
    expect(errors.some((e) => /required field/.test(e))).toBe(true);
  });

  it('enforces type, minLength and pattern constraints', () => {
    const errors = validateConfigAgainstSchema(
      { name: 12, age: 'not-a-number', code: 'XX' },
      {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
          code: { type: 'string', minLength: 3, pattern: '^[A-Z]+$' },
        },
      },
    );
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/'name' must be a string/),
        expect.stringMatching(/'age' must be a number/),
        expect.stringMatching(/'code' must be at least 3 characters/),
      ]),
    );
  });

  it('validates URI format', () => {
    const errors = validateConfigAgainstSchema(
      { DATABASE_URL: 'not a url' },
      {
        type: 'object',
        properties: { DATABASE_URL: { type: 'string', format: 'uri' } },
      },
    );
    expect(errors.some((e) => /must be a valid URI/.test(e))).toBe(true);
  });

  it('accepts a valid config', () => {
    const errors = validateConfigAgainstSchema(
      { GITHUB_PERSONAL_ACCESS_TOKEN: 'ghp_aaaaaaaaaaaaaaaaaa' },
      {
        type: 'object',
        properties: { GITHUB_PERSONAL_ACCESS_TOKEN: { type: 'string', minLength: 10 } },
        required: ['GITHUB_PERSONAL_ACCESS_TOKEN'],
      },
    );
    expect(errors).toEqual([]);
  });
});

const runDbTests = (await canReachDatabase()) ? describe : describe.skip;

runDbTests('McpMarketplaceService integration (real Postgres)', () => {
  beforeAll(async () => {
    const prisma = createDatabaseClient();
    try {
      // Reset installs only (catalog is seed data)
      await prisma.mcpInstall.deleteMany({});
      await seedMcpCatalog(prisma);
    } finally {
      await prisma.$disconnect();
    }
  });

  it('lists catalog with domain counts and search filtering', { timeout: 15_000 }, async () => {
    const prisma = createDatabaseClient();
    const service = new McpMarketplaceService({ prisma });

    try {
      const domains = await service.listDomains();
      expect(domains.length).toBeGreaterThan(5);
      const databases = domains.find((d) => d.domain === 'DATABASES');
      expect(databases).toBeTruthy();
      expect(databases!.count).toBeGreaterThanOrEqual(3); // postgres + sqlite + redis from seed

      const allFeatured = await service.listCatalog({ limit: 50, featured: true });
      expect(allFeatured.items.length).toBeGreaterThan(0);
      expect(allFeatured.items.every((entry) => entry.featured)).toBe(true);

      const searchPg = await service.listCatalog({ limit: 50, search: 'postgres' });
      expect(searchPg.items.some((e) => e.slug === 'postgres')).toBe(true);

      const dbDomain = await service.listCatalog({ limit: 50, domain: 'DATABASES' });
      expect(dbDomain.items.every((e) => e.domain === 'DATABASES')).toBe(true);
    } finally {
      await prisma.$disconnect();
    }
  });

  it('paginates with cursor', { timeout: 15_000 }, async () => {
    const prisma = createDatabaseClient();
    const service = new McpMarketplaceService({ prisma });

    try {
      const page1 = await service.listCatalog({ limit: 5 });
      expect(page1.items.length).toBe(5);
      expect(page1.nextCursor).toBeTruthy();

      const page2 = await service.listCatalog({ limit: 5, cursor: page1.nextCursor! });
      expect(page2.items.length).toBeGreaterThan(0);
      const ids1 = new Set(page1.items.map((e) => e.id));
      expect(page2.items.every((e) => !ids1.has(e.id))).toBe(true);
    } finally {
      await prisma.$disconnect();
    }
  });

  it('returns 404 for missing slug', { timeout: 15_000 }, async () => {
    const prisma = createDatabaseClient();
    const service = new McpMarketplaceService({ prisma });

    try {
      await expect(service.getCatalogEntry('nope-not-real')).rejects.toMatchObject({
        statusCode: 404,
        code: 'MCP_CATALOG_NOT_FOUND',
      });
    } finally {
      await prisma.$disconnect();
    }
  });
});

const runApiTests = (await canReachDatabase()) ? describe : describe.skip;

runApiTests('MCP marketplace HTTP endpoints (Postgres)', () => {
  it('exposes catalog, install, list, patch and uninstall flow end-to-end', { timeout: 120_000 }, async () => {
    // Many sequential HTTP calls + Postgres roundtrips; default 5s is too tight
    // when this spec runs alongside the full platform:test suite under load.
    const prisma = createDatabaseClient();
    try {
      // ensure seed present
      await prisma.mcpInstall.deleteMany({});
      await seedMcpCatalog(prisma);

      const app = await buildApiApp({
        store: new PrismaApiStore(prisma),
        gitProvider: new TestGitProvider(),
        emailProvider: new TestEmailProvider(),
        mcpMarketplace: createDefaultMcpMarketplaceService(prisma),
      });
      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      const register = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: `mcp-${suffix}@example.com`,
          password: 'password123',
          name: 'McpUser',
          organizationName: `McpOrg-${suffix}`,
        },
      });
      expect(register.statusCode).toBe(201);
      const token = register.json().token;
      const auth = { authorization: `Bearer ${token}` } as Record<string, string>;

      // catalog list
      const catalog = await app.inject({ method: 'GET', url: '/mcp/catalog?limit=5', headers: auth });
      expect(catalog.statusCode).toBe(200);
      const catalogBody = catalog.json();
      expect(catalogBody.items.length).toBe(5);
      expect(typeof catalogBody.nextCursor === 'string' || catalogBody.nextCursor === null).toBe(true);

      // domains list
      const domainsResp = await app.inject({ method: 'GET', url: '/mcp/catalog/domains', headers: auth });
      expect(domainsResp.statusCode).toBe(200);
      expect(Array.isArray(domainsResp.json().domains)).toBe(true);

      // get single entry
      const githubResp = await app.inject({ method: 'GET', url: '/mcp/catalog/github', headers: auth });
      expect(githubResp.statusCode).toBe(200);
      expect(githubResp.json().entry.slug).toBe('github');

      // install fails without required token
      const badInstall = await app.inject({
        method: 'POST',
        url: '/mcp/installs',
        headers: auth,
        payload: {
          catalogEntrySlug: 'github',
          alias: 'gh-1',
          config: {}, // missing required GITHUB_PERSONAL_ACCESS_TOKEN
        },
      });
      expect(badInstall.statusCode).toBe(400);
      expect(badInstall.json().code).toBe('MCP_CONFIG_INVALID');

      // install succeeds
      const okInstall = await app.inject({
        method: 'POST',
        url: '/mcp/installs',
        headers: auth,
        payload: {
          catalogEntrySlug: 'github',
          alias: 'gh-1',
          config: { GITHUB_PERSONAL_ACCESS_TOKEN: 'ghp_xxxxxxxxxxxx' },
        },
      });
      expect(okInstall.statusCode).toBe(201);
      const installId: string = okInstall.json().install.id;
      expect(okInstall.json().install.alias).toBe('gh-1');
      expect(okInstall.json().install.enabled).toBe(true);

      // install count incremented
      const githubAfter = await app.inject({ method: 'GET', url: '/mcp/catalog/github', headers: auth });
      expect(githubAfter.json().entry.installCount).toBeGreaterThanOrEqual(1);

      // duplicate alias 409
      const dup = await app.inject({
        method: 'POST',
        url: '/mcp/installs',
        headers: auth,
        payload: {
          catalogEntrySlug: 'github',
          alias: 'gh-1',
          config: { GITHUB_PERSONAL_ACCESS_TOKEN: 'ghp_yyyyyyyyyyyy' },
        },
      });
      expect(dup.statusCode).toBe(409);
      expect(dup.json().code).toBe('MCP_ALIAS_CONFLICT');

      // list installs
      const listed = await app.inject({ method: 'GET', url: '/mcp/installs', headers: auth });
      expect(listed.statusCode).toBe(200);
      expect(listed.json().installs.length).toBe(1);
      expect(listed.json().installs[0].id).toBe(installId);

      // patch toggle disabled
      const patched = await app.inject({
        method: 'PATCH',
        url: `/mcp/installs/${installId}`,
        headers: auth,
        payload: { enabled: false },
      });
      expect(patched.statusCode).toBe(200);
      expect(patched.json().install.enabled).toBe(false);

      // patch invalid config rejected
      const badPatch = await app.inject({
        method: 'PATCH',
        url: `/mcp/installs/${installId}`,
        headers: auth,
        payload: { config: { GITHUB_PERSONAL_ACCESS_TOKEN: '' } },
      });
      expect(badPatch.statusCode).toBe(400);
      expect(badPatch.json().code).toBe('MCP_CONFIG_INVALID');

      // uninstall
      const removed = await app.inject({
        method: 'DELETE',
        url: `/mcp/installs/${installId}`,
        headers: auth,
      });
      expect(removed.statusCode).toBe(200);
      expect(removed.json().install.alias).toBe('gh-1');

      // 404 on second uninstall
      const notFound = await app.inject({
        method: 'DELETE',
        url: `/mcp/installs/${installId}`,
        headers: auth,
      });
      expect(notFound.statusCode).toBe(404);
      expect(notFound.json().code).toBe('MCP_INSTALL_NOT_FOUND');

      await app.close();
    } finally {
      await prisma.$disconnect();
    }
  });

  it('isolates installs between users', { timeout: 120_000 }, async () => {
    const prisma = createDatabaseClient();
    try {
      await prisma.mcpInstall.deleteMany({});

      const app = await buildApiApp({
        store: new PrismaApiStore(prisma),
        gitProvider: new TestGitProvider(),
        emailProvider: new TestEmailProvider(),
        mcpMarketplace: createDefaultMcpMarketplaceService(prisma),
      });
      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      const u1 = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: `mcp-iso-1-${suffix}@example.com`,
          password: 'password123',
          name: 'U1',
          organizationName: `U1Org-${suffix}`,
        },
      });
      const u2 = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: `mcp-iso-2-${suffix}@example.com`,
          password: 'password123',
          name: 'U2',
          organizationName: `U2Org-${suffix}`,
        },
      });

      const auth1 = { authorization: `Bearer ${u1.json().token}` };
      const auth2 = { authorization: `Bearer ${u2.json().token}` };

      const i1 = await app.inject({
        method: 'POST',
        url: '/mcp/installs',
        headers: auth1,
        payload: {
          catalogEntrySlug: 'filesystem',
          alias: 'fs-shared',
          config: { rootDir: '/tmp/u1' },
        },
      });
      expect(i1.statusCode).toBe(201);

      // user 2 can use the same alias since uniqueness is per-user
      const i2 = await app.inject({
        method: 'POST',
        url: '/mcp/installs',
        headers: auth2,
        payload: {
          catalogEntrySlug: 'filesystem',
          alias: 'fs-shared',
          config: { rootDir: '/tmp/u2' },
        },
      });
      expect(i2.statusCode).toBe(201);

      // each user only sees their own installs
      const list1 = await app.inject({ method: 'GET', url: '/mcp/installs', headers: auth1 });
      const list2 = await app.inject({ method: 'GET', url: '/mcp/installs', headers: auth2 });
      expect(list1.json().installs).toHaveLength(1);
      expect(list2.json().installs).toHaveLength(1);
      expect(list1.json().installs[0].id).not.toBe(list2.json().installs[0].id);

      // user 2 cannot delete user 1's install
      const u1InstallId: string = list1.json().installs[0].id;
      const cross = await app.inject({
        method: 'DELETE',
        url: `/mcp/installs/${u1InstallId}`,
        headers: auth2,
      });
      expect(cross.statusCode).toBe(404);

      await app.close();
    } finally {
      await prisma.$disconnect();
    }
  });
});
