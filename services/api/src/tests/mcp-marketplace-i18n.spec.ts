import { hashPassword } from '@vibecore/auth';
/* eslint-disable no-restricted-imports -- NodeNext service tests require explicit relative .js imports. */
import type { DatabaseClient } from '@vibecore/database';
import { describe, expect, it, vi } from 'vitest';
import { MCP_CATALOG_SEEDS, seedMcpCatalog } from '../../../../packages/database/prisma/seed-mcp-catalog.js';
import { buildApiApp } from '../app.js';
import type { EmailProvider } from '../email.js';
import { localizeMcpConfigSchema, McpMarketplaceService, resolveMcpCatalogLocale } from '../mcp-marketplace.js';
import { TestApiStore } from './test-api-store.js';

const publishedAt = new Date('2026-01-01T00:00:00.000Z');

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

const localizedEntry = {
  id: 'catalog-filesystem',
  slug: 'filesystem',
  name: 'Filesystem',
  nameFr: 'Système de fichiers',
  description: 'Read and write files.',
  descriptionFr: 'Lecture et écriture de fichiers.',
  domain: 'FILESYSTEM',
  tags: ['files', 'official'],
  tagsFr: ['fichiers', 'officiel'],
  author: 'modelcontextprotocol',
  homepageUrl: 'https://example.test/filesystem',
  iconUrl: null,
  version: '1.0.0',
  transport: 'STDIO',
  configTemplate: { command: 'npx' },
  configSchema: {
    type: 'object',
    properties: {
      rootDir: {
        type: 'string',
        title: 'Allowed root directory',
        description: 'Absolute allowed path.',
        minLength: 1,
      },
    },
    required: ['rootDir'],
  },
  configSchemaFr: {
    properties: {
      rootDir: {
        title: 'Répertoire racine autorisé',
        description: 'Chemin absolu autorisé.',
      },
      injectedKey: { title: 'Ne doit jamais apparaître' },
    },
  },
  installCount: 2,
  featured: true,
  verified: true,
  featuredForIdePanel: true,
  enabled: true,
  publishedAt,
  updatedAt: publishedAt,
} as const;

const englishOnlyEntry = {
  ...localizedEntry,
  id: 'catalog-github',
  slug: 'github',
  name: 'GitHub',
  nameFr: null,
  description: 'GitHub repository operations.',
  descriptionFr: null,
  tags: ['github', 'official'],
  tagsFr: [],
  configSchemaFr: {},
} as const;

describe('MCP marketplace locale resolution', () => {
  it('prioritizes an explicit supported locale over Accept-Language', () => {
    expect(resolveMcpCatalogLocale({ explicitLocale: 'en', acceptLanguage: 'fr-FR' })).toBe('en');
    expect(resolveMcpCatalogLocale({ explicitLocale: 'fr-FR', acceptLanguage: 'en' })).toBe('fr');
  });

  it('uses weighted Accept-Language negotiation and falls back to English', () => {
    expect(resolveMcpCatalogLocale({ acceptLanguage: 'de;q=1, en;q=0.4, fr-FR;q=0.8' })).toBe('fr');
    expect(resolveMcpCatalogLocale({ acceptLanguage: 'fr;q=0, de;q=1' })).toBe('en');
    expect(resolveMcpCatalogLocale({ acceptLanguage: undefined })).toBe('en');
  });

  it('overlays only translated schema copy while preserving validation and config keys', () => {
    const schema = localizeMcpConfigSchema(localizedEntry.configSchema, localizedEntry.configSchemaFr, 'fr');
    const properties = schema.properties as Record<string, Record<string, unknown>>;

    expect(properties.rootDir).toMatchObject({
      type: 'string',
      minLength: 1,
      title: 'Répertoire racine autorisé',
      description: 'Chemin absolu autorisé.',
    });
    expect(properties.injectedKey).toBeUndefined();
    expect(schema.required).toEqual(['rootDir']);
  });
});

describe('MCP marketplace localized views', () => {
  it('localizes catalog entries and falls back field-by-field to English', async () => {
    const findMany = vi.fn().mockResolvedValue([localizedEntry, englishOnlyEntry]);

    const prisma = {
      mcpCatalogEntry: {
        findMany,
      },
    } as unknown as DatabaseClient;

    const service = new McpMarketplaceService({ prisma });

    const page = await service.listCatalog({ limit: 10, locale: 'fr', search: 'fichiers' });

    expect(page.items[0]).toMatchObject({
      name: 'Système de fichiers',
      description: 'Lecture et écriture de fichiers.',
      tags: ['fichiers', 'officiel'],
    });
    expect(page.items[1]).toMatchObject({
      name: 'GitHub',
      description: 'GitHub repository operations.',
      tags: ['github', 'official'],
    });
    expect(page.items[1].configSchema).toEqual(englishOnlyEntry.configSchema);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { nameFr: { contains: 'fichiers', mode: 'insensitive' } },
            { descriptionFr: { contains: 'fichiers', mode: 'insensitive' } },
            { tagsFr: { has: 'fichiers' } },
          ]),
        }),
      }),
    );
  });

  it('returns the localized catalog copy from a newly created install', async () => {
    const createdInstall = {
      id: 'install-1',
      alias: 'filesystem',
      enabled: true,
      configJson: {},
      organizationId: null,
      installedAt: publishedAt,
      updatedAt: publishedAt,
      catalogEntry: localizedEntry,
    };
    const transaction = {
      mcpInstall: { create: vi.fn().mockResolvedValue(createdInstall) },
      mcpCatalogEntry: { update: vi.fn().mockResolvedValue(localizedEntry) },
    };
    const prisma = {
      mcpCatalogEntry: { findUnique: vi.fn().mockResolvedValue(localizedEntry) },
      mcpInstall: { findUnique: vi.fn().mockResolvedValue(null) },
      mcpGlobalPolicy: { findMany: vi.fn().mockResolvedValue([]) },
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => unknown) => callback(transaction)),
    } as unknown as DatabaseClient;

    const service = new McpMarketplaceService({ prisma });

    const install = await service.install({
      userId: 'user-1',
      catalogEntrySlug: 'filesystem',
      alias: 'filesystem',
      config: { rootDir: '/workspace' },
      locale: 'fr',
    });

    expect(install.catalogEntry.name).toBe('Système de fichiers');
    expect(install.catalogEntry.description).toBe('Lecture et écriture de fichiers.');
    expect(install.catalogEntry.tags).toEqual(['fichiers', 'officiel']);
    expect(transaction.mcpInstall.create).toHaveBeenCalledOnce();
  });
});

describe('MCP marketplace HTTP locale propagation', () => {
  it('uses Accept-Language and lets an explicit locale override it', async () => {
    const findMany = vi.fn().mockResolvedValue([localizedEntry]);
    const prisma = {
      mcpCatalogEntry: { findMany },
    } as unknown as DatabaseClient;
    const store = new TestApiStore();
    const token = 'mcp-i18n-token';
    const user = await store.createUser({
      email: 'mcp-i18n@example.com',
      name: 'MCP i18n',
      passwordHash: hashPassword('password123'),
    });
    await store.createSession({ userId: user.id, token, expiresAt: new Date(Date.now() + 3_600_000) });

    const app = await buildApiApp({
      store,
      emailProvider: new QuietEmailProvider(),
      mcpMarketplace: new McpMarketplaceService({ prisma }),
    });

    try {
      const french = await app.inject({
        method: 'GET',
        url: '/mcp/catalog?limit=10',
        headers: { authorization: `Bearer ${token}`, 'accept-language': 'fr-FR,fr;q=0.9,en;q=0.5' },
      });

      expect(french.statusCode).toBe(200);
      expect(french.headers['content-language']).toBe('fr');
      expect(french.headers.vary).toContain('Accept-Language');
      expect(french.json().items[0]).toMatchObject({
        name: 'Système de fichiers',
        description: 'Lecture et écriture de fichiers.',
        tags: ['fichiers', 'officiel'],
      });

      const english = await app.inject({
        method: 'GET',
        url: '/mcp/catalog?limit=10&locale=en',
        headers: { authorization: `Bearer ${token}`, 'accept-language': 'fr-FR' },
      });

      expect(english.statusCode).toBe(200);
      expect(english.headers['content-language']).toBe('en');
      expect(english.json().items[0]).toMatchObject({
        name: 'Filesystem',
        description: 'Read and write files.',
        tags: ['files', 'official'],
      });
    } finally {
      await app.close();
    }
  });
});

describe('MCP seed French coverage', () => {
  it('provides reviewed French descriptions and tags for every built-in entry', () => {
    expect(MCP_CATALOG_SEEDS).toHaveLength(22);

    for (const entry of MCP_CATALOG_SEEDS) {
      expect(entry.descriptionFr.trim(), entry.slug).not.toBe('');
      expect(entry.descriptionFr, entry.slug).not.toBe(entry.description);
      expect(entry.tagsFr.length, entry.slug).toBeGreaterThan(0);
      expect(entry.tagsFr, entry.slug).not.toEqual(entry.tags);
    }
  });

  it('translates descriptive names while preserving product and protocol names', () => {
    const translatedNameSlugs = MCP_CATALOG_SEEDS.filter((entry) => entry.nameFr).map((entry) => entry.slug);

    expect(translatedNameSlugs).toEqual([
      'filesystem',
      'memory',
      'aws-kb-retrieval',
      'time',
      'sequential-thinking',
      'everything',
    ]);
    expect(MCP_CATALOG_SEEDS.find((entry) => entry.slug === 'filesystem')?.nameFr).toBe('Système de fichiers');
    expect(MCP_CATALOG_SEEDS.find((entry) => entry.slug === 'github')?.nameFr).toBeUndefined();
    expect(MCP_CATALOG_SEEDS.find((entry) => entry.slug === 'cloudflare')?.nameFr).toBeUndefined();
  });

  it('persists the complete English and French catalogue on create and update', async () => {
    const upsert = vi.fn(async (_input: unknown) => ({}));
    const prisma = {
      mcpCatalogEntry: { upsert },
    } as unknown as Parameters<typeof seedMcpCatalog>[0];

    await seedMcpCatalog(prisma);

    expect(upsert).toHaveBeenCalledTimes(MCP_CATALOG_SEEDS.length);

    for (const [index, entry] of MCP_CATALOG_SEEDS.entries()) {
      const input = upsert.mock.calls[index]?.[0] as {
        where: { slug: string };
        create: Record<string, unknown>;
        update: Record<string, unknown>;
      };

      expect(input.where).toEqual({ slug: entry.slug });
      expect(input.create).toEqual({ slug: entry.slug, ...input.update });
      expect(input.update).toMatchObject({
        name: entry.name,
        nameFr: entry.nameFr ?? null,
        description: entry.description,
        descriptionFr: entry.descriptionFr,
        tags: entry.tags,
        tagsFr: entry.tagsFr,
        configTemplate: entry.configTemplate,
        configSchema: entry.configSchema,
        configSchemaFr: entry.configSchemaFr ?? {},
      });
    }

    const filesystemUpsert = upsert.mock.calls
      .map(([input]) => input as { where: { slug: string }; update: Record<string, unknown> })
      .find((input) => input.where.slug === 'filesystem');

    expect(filesystemUpsert?.update.configSchemaFr).toEqual({
      properties: {
        rootDir: {
          title: 'Répertoire racine autorisé',
          description: 'Chemin absolu auquel le serveur est autorisé à accéder.',
        },
      },
    });
  });
});
