import type { PrismaClient } from '../generated/client/index.js';
import rawMcpCatalogSeeds from './seed-mcp-catalog.json' with { type: 'json' };

const MCP_CATALOG_DOMAINS = [
  'AI_AGENTS',
  'CODE_EXECUTION',
  'DATABASES',
  'DEVOPS',
  'DEVELOPER_TOOLS',
  'COMMUNICATION',
  'PRODUCTIVITY',
  'KNOWLEDGE',
  'WEB_BROWSING',
  'SEARCH',
  'CLOUD',
  'SECURITY',
  'FILESYSTEM',
  'VERSION_CONTROL',
  'MONITORING',
  'OTHER',
] as const;

const MCP_CATALOG_TRANSPORTS = ['STDIO', 'SSE', 'STREAMABLE_HTTP'] as const;

type McpCatalogDomain = (typeof MCP_CATALOG_DOMAINS)[number];
type McpCatalogTransport = (typeof MCP_CATALOG_TRANSPORTS)[number];

export interface CatalogSeed {
  slug: string;
  name: string;
  nameFr?: string;
  description: string;
  descriptionFr: string;
  domain: McpCatalogDomain;
  tags: string[];
  tagsFr: string[];
  author: string;
  homepageUrl?: string;
  iconUrl?: string;
  version: string;
  transport: McpCatalogTransport;
  configTemplate: Record<string, unknown>;
  configSchema: Record<string, unknown>;
  configSchemaFr?: Record<string, unknown>;
  featured?: boolean;
  verified?: boolean;
}

function invalidCatalogValue(index: number, field: string): never {
  throw new TypeError(`MCP_CATALOG_INVALID:${index}:${field}`);
}

function readRecord(value: unknown, index: number, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return invalidCatalogValue(index, field);
  }

  return value as Record<string, unknown>;
}

function readString(value: unknown, index: number, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return invalidCatalogValue(index, field);
  }

  return value;
}

function readOptionalString(value: unknown, index: number, field: string): string | undefined {
  return value === undefined ? undefined : readString(value, index, field);
}

function readStringArray(value: unknown, index: number, field: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    return invalidCatalogValue(index, field);
  }

  return value.map((item, itemIndex) => readString(item, index, `${field}[${itemIndex}]`));
}

function readOptionalBoolean(value: unknown, index: number, field: string): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'boolean') {
    return invalidCatalogValue(index, field);
  }

  return value;
}

function readDomain(value: unknown, index: number): McpCatalogDomain {
  const domain = readString(value, index, 'domain');

  return MCP_CATALOG_DOMAINS.includes(domain as McpCatalogDomain)
    ? (domain as McpCatalogDomain)
    : invalidCatalogValue(index, 'domain');
}

function readTransport(value: unknown, index: number): McpCatalogTransport {
  const transport = readString(value, index, 'transport');

  return MCP_CATALOG_TRANSPORTS.includes(transport as McpCatalogTransport)
    ? (transport as McpCatalogTransport)
    : invalidCatalogValue(index, 'transport');
}

function parseCatalogSeed(value: unknown, index: number): CatalogSeed {
  const entry = readRecord(value, index, 'entry');
  const description = readString(entry.description, index, 'description');
  const descriptionFr = readString(entry.descriptionFr, index, 'descriptionFr');
  const tags = readStringArray(entry.tags, index, 'tags');
  const tagsFr = readStringArray(entry.tagsFr, index, 'tagsFr');

  if (
    descriptionFr === description ||
    (tags.length === tagsFr.length && tags.every((tag, tagIndex) => tag === tagsFr[tagIndex]))
  ) {
    return invalidCatalogValue(index, 'fr');
  }

  return {
    slug: readString(entry.slug, index, 'slug'),
    name: readString(entry.name, index, 'name'),
    nameFr: readOptionalString(entry.nameFr, index, 'nameFr'),
    description,
    descriptionFr,
    domain: readDomain(entry.domain, index),
    tags,
    tagsFr,
    author: readString(entry.author, index, 'author'),
    homepageUrl: readOptionalString(entry.homepageUrl, index, 'homepageUrl'),
    iconUrl: readOptionalString(entry.iconUrl, index, 'iconUrl'),
    version: readString(entry.version, index, 'version'),
    transport: readTransport(entry.transport, index),
    configTemplate: readRecord(entry.configTemplate, index, 'configTemplate'),
    configSchema: readRecord(entry.configSchema, index, 'configSchema'),
    configSchemaFr:
      entry.configSchemaFr === undefined ? undefined : readRecord(entry.configSchemaFr, index, 'configSchemaFr'),
    featured: readOptionalBoolean(entry.featured, index, 'featured'),
    verified: readOptionalBoolean(entry.verified, index, 'verified'),
  };
}

function loadCatalogSeeds(value: unknown): readonly CatalogSeed[] {
  if (!Array.isArray(value) || value.length === 0) {
    return invalidCatalogValue(-1, 'root');
  }

  const entries = value.map(parseCatalogSeed);
  const slugs = new Set(entries.map((entry) => entry.slug));

  if (slugs.size !== entries.length) {
    return invalidCatalogValue(-1, 'slug');
  }

  return Object.freeze(entries);
}

export const MCP_CATALOG_SEEDS = loadCatalogSeeds(rawMcpCatalogSeeds);

function toPersistenceData(entry: CatalogSeed) {
  return {
    name: entry.name,
    nameFr: entry.nameFr ?? null,
    description: entry.description,
    descriptionFr: entry.descriptionFr,
    domain: entry.domain,
    tags: entry.tags,
    tagsFr: entry.tagsFr,
    author: entry.author,
    homepageUrl: entry.homepageUrl ?? null,
    iconUrl: entry.iconUrl ?? null,
    version: entry.version,
    transport: entry.transport,
    configTemplate: entry.configTemplate as never,
    configSchema: entry.configSchema as never,
    configSchemaFr: (entry.configSchemaFr ?? {}) as never,
    featured: entry.featured ?? false,
    verified: entry.verified ?? false,
  };
}

export async function seedMcpCatalog(prisma: PrismaClient): Promise<void> {
  for (const entry of MCP_CATALOG_SEEDS) {
    const data = toPersistenceData(entry);

    await prisma.mcpCatalogEntry.upsert({
      where: { slug: entry.slug },
      create: { slug: entry.slug, ...data },
      update: data,
    });
  }
}
