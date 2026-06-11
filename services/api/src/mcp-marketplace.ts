import { z } from 'zod';
import { createDatabaseClient, type DatabaseClient } from '@vibecore/database';

export const MCP_DOMAINS = [
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

export const MCP_TRANSPORTS = ['STDIO', 'SSE', 'STREAMABLE_HTTP'] as const;

export type McpDomainKey = (typeof MCP_DOMAINS)[number];
export type McpTransportKey = (typeof MCP_TRANSPORTS)[number];

export interface CatalogEntryView {
  id: string;
  slug: string;
  name: string;
  description: string;
  domain: McpDomainKey;
  tags: string[];
  author: string;
  homepageUrl: string | null;
  iconUrl: string | null;
  version: string;
  transport: McpTransportKey;
  configTemplate: Record<string, unknown>;
  configSchema: Record<string, unknown>;
  installCount: number;
  featured: boolean;
  verified: boolean;
  publishedAt: string;
  updatedAt: string;
}

export interface InstallView {
  id: string;
  alias: string;
  enabled: boolean;
  configJson: Record<string, unknown>;
  catalogEntry: CatalogEntryView;
  installedAt: string;
  updatedAt: string;
  organizationId: string | null;
}

export interface CatalogPage {
  items: CatalogEntryView[];
  nextCursor: string | null;
}

export interface DomainCount {
  domain: McpDomainKey;
  count: number;
}

const aliasPattern = /^[a-z0-9][a-z0-9-_]*$/i;

const booleanQueryParam = z.preprocess((value) => {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return undefined;
}, z.boolean().optional());

export const catalogQuerySchema = z.object({
  domain: z.enum(MCP_DOMAINS).optional(),
  search: z.string().min(1).max(120).optional(),
  featured: booleanQueryParam,
  verified: booleanQueryParam,
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().min(1).max(100).optional(),
});

export const catalogParamsSchema = z.object({
  slug: z.string().min(1).max(100),
});

export const installInputSchema = z.object({
  catalogEntrySlug: z.string().min(1).max(100),
  alias: z.string().min(1).max(64).regex(aliasPattern, {
    message: 'alias must be alphanumeric, dash, or underscore',
  }),
  config: z.record(z.unknown()),
  organizationId: z.string().min(1).optional(),
});

export const installParamsSchema = z.object({ installId: z.string().min(1).max(64) });

export const installPatchSchema = z
  .object({
    enabled: z.boolean().optional(),
    alias: z
      .string()
      .min(1)
      .max(64)
      .regex(aliasPattern, { message: 'alias must be alphanumeric, dash, or underscore' })
      .optional(),
    config: z.record(z.unknown()).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'patch must include at least one field' });

export const installListQuerySchema = z.object({
  organizationId: z.string().min(1).max(64).optional(),
});

/**
 * Body for `PUT /mcp/config` — the manually-authored "Configuration" tab state
 * (audit H5). `config.mcpServers` is the same `{ name: MCPServerConfig }` map
 * the runtime consumes; the server values are stored verbatim and validated by
 * the runtime when clients are created, so we only enforce the envelope shape.
 */
export const mcpUserConfigSchema = z.object({
  config: z.object({ mcpServers: z.record(z.unknown()).default({}) }).default({ mcpServers: {} }),
  maxLLMSteps: z.coerce.number().int().min(1).max(50).optional(),
});

export interface McpUserConfigView {
  config: { mcpServers: Record<string, unknown> };
  maxLLMSteps: number;
}

export class McpMarketplaceError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(message: string, statusCode: number, code: string) {
    super(message);
    this.name = 'McpMarketplaceError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

interface JsonSchemaProperty {
  type?: 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array';
  format?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  enum?: unknown[];
  default?: unknown;
  pattern?: string;
}

interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean;
}

/*
 * Reject local/stdio MCP servers in the user "Configuration" tab. A stdio server
 * carries a `command`/`args` that the chat flow spawns as a CHILD PROCESS inside
 * the shared multi-tenant Remix/Node host (mcpService._createStdioClient →
 * child_process.spawn) — i.e. authenticated RCE on the shared server. Unlike the
 * marketplace install path (whose command/args come from an admin-seeded catalog
 * template), this map is fully user-supplied, so only REMOTE transports
 * (sse / streamable-http with a url) are permitted. Default-deny; an operator can
 * re-enable stdio for a trusted single-tenant/local deployment via
 * MCP_ALLOW_STDIO_SERVERS=true.
 */
export function assertNoLocalMcpServers(mcpServers: Record<string, unknown>): void {
  if (process.env.MCP_ALLOW_STDIO_SERVERS === 'true') {
    return;
  }

  for (const [name, raw] of Object.entries(mcpServers)) {
    if (!raw || typeof raw !== 'object') {
      continue;
    }

    const cfg = raw as Record<string, unknown>;
    const type = typeof cfg.type === 'string' ? cfg.type.toLowerCase() : undefined;
    const isStdio = type === 'stdio' || 'command' in cfg || 'args' in cfg;

    if (isStdio) {
      throw new McpMarketplaceError(
        `MCP server '${name}': local (stdio/command) servers are not allowed. Use a remote server (type "sse" or "streamable-http") with a "url".`,
        400,
        'MCP_STDIO_SERVER_FORBIDDEN',
      );
    }

    /*
     * SSRF guard on the user-supplied remote URL. After stdio was blocked, the
     * free-form `url` (sse/streamable-http) became the sanctioned user-controlled
     * path; the shared web pod connects to it, so an internal/metadata URL is a
     * full-read SSRF. Require https to a non-internal host.
     */
    if (typeof cfg.url === 'string' && cfg.url.trim()) {
      if (isBlockedMcpUrl(cfg.url)) {
        throw new McpMarketplaceError(
          `MCP server '${name}': url must be an https URL to a public host (internal/loopback/metadata addresses are not allowed).`,
          400,
          'MCP_URL_BLOCKED',
        );
      }
    }
  }
}

/*
 * Block non-https URLs and internal/loopback/link-local/private/metadata hosts
 * for user-supplied remote MCP server URLs (SSRF). Hostname-based; DNS-rebinding
 * is out of scope here (the connecting side would need a resolve+recheck).
 */
/*
 * Fold an IPv4-mapped IPv6 literal to its dotted-quad IPv4 so the private-range
 * checks below catch it. The WHATWG URL parser normalizes `[::ffff:127.0.0.1]`
 * to the HEX form `::ffff:7f00:1` (and `[::ffff:169.254.169.254]` to
 * `::ffff:a9fe:a9fe`), which matches none of the dotted regexes — a trivial
 * SSRF-guard bypass. Handle both the hex and the (rarer) dotted ::ffff: forms.
 */
function foldIpv4MappedIpv6(host: string): string | undefined {
  const dotted = host.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i);

  if (dotted) {
    return dotted[1];
  }

  const hex = host.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);

  if (hex) {
    const hi = parseInt(hex[1], 16);
    const lo = parseInt(hex[2], 16);

    return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
  }

  // IPv6 transition forms embedding an IPv4: NAT64 (64:ff9b::a9fe:a9fe) and 6to4
  // (2002:a9fe:a9fe::) — both → 169.254.169.254. Fold so the blocklist catches them.
  const transition = host.match(/^64:ff9b::([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i) || host.match(/^2002:([0-9a-f]{1,4}):([0-9a-f]{1,4})/i);

  if (transition) {
    const hi = parseInt(transition[1], 16);
    const lo = parseInt(transition[2], 16);

    return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
  }

  return undefined;
}

/*
 * SSRF guard for the marketplace install/updateInstall path. The stored config's
 * `url` (for a remote sse/streamable-http transport) is later connected to by the
 * shared web pod with NO second check, so an attacker-chosen internal URL would be
 * an SSRF primitive. validateConfigAgainstSchema only checks types/patterns — it
 * does NOT validate the host. (PUT /mcp/config has assertNoLocalMcpServers; this
 * mirrors its url check for the marketplace path.)
 */
function assertInstallConfigUrlAllowed(config: unknown): void {
  const url = (config as { url?: unknown } | null | undefined)?.url;

  if (typeof url === 'string' && url.trim() && isBlockedMcpUrl(url)) {
    throw new McpMarketplaceError('MCP server URL is not allowed', 400, 'MCP_URL_BLOCKED');
  }
}

export function isBlockedMcpUrl(rawUrl: string): boolean {
  let url: URL;

  try {
    url = new URL(rawUrl);
  } catch {
    return true;
  }

  if (url.protocol !== 'https:') {
    return true;
  }

  const host = url.hostname.toLowerCase().replace(/^\[/, '').replace(/\]$/, '').replace(/\.+$/, '');

  if (!host) {
    return true;
  }

  // Check the IPv4-mapped IPv6 folded form against the dotted private ranges too.
  const candidates = [host, foldIpv4MappedIpv6(host)].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    if (
      candidate === 'localhost' ||
      candidate === '0.0.0.0' ||
      candidate === '::1' ||
      candidate === '::' ||
      candidate.endsWith('.localhost') ||
      candidate.endsWith('.internal') ||
      candidate.endsWith('.local') ||
      /^127\./.test(candidate) ||
      /^10\./.test(candidate) ||
      /^192\.168\./.test(candidate) ||
      /^169\.254\./.test(candidate) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(candidate) ||
      /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(candidate) ||
      /^f[cd][0-9a-f]{0,2}:/.test(candidate) ||
      /^fe[89ab][0-9a-f]:/.test(candidate)
    ) {
      return true;
    }
  }

  return false;
}

export function validateConfigAgainstSchema(value: unknown, rawSchema: unknown): string[] {
  const errors: string[] = [];
  const schema = (rawSchema ?? {}) as JsonSchema;

  if (schema.type && schema.type !== 'object') {
    errors.push(`top-level schema type must be 'object', got '${schema.type}'`);
    return errors;
  }

  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    errors.push('config must be a JSON object');
    return errors;
  }

  const cfg = value as Record<string, unknown>;
  const properties = schema.properties ?? {};
  const required = schema.required ?? [];

  /*
   * Reject runtime-reserved keys ALWAYS, independent of the catalog schema's
   * additionalProperties. These keys define how/where the MCP server process is
   * spawned or contacted; if a user could smuggle them through configJson they
   * could run arbitrary commands (command/args/env/cwd) or point the server at an
   * internal target (url/headers) — RCE/SSRF on the shared host. None of the
   * seeded catalog schemas set additionalProperties:false, so this blocklist is
   * the actual trust boundary.
   */
  const RESERVED_CONFIG_KEYS = new Set(['command', 'args', 'url', 'headers', 'env', 'cwd', 'transport']);

  for (const key of Object.keys(cfg)) {
    if (RESERVED_CONFIG_KEYS.has(key.toLowerCase())) {
      errors.push(`reserved field not allowed: '${key}'`);
    }
  }

  for (const key of required) {
    const present = cfg[key];
    if (present === undefined || present === null || present === '') {
      errors.push(`missing required field: '${key}'`);
    }
  }

  for (const [key, raw] of Object.entries(cfg)) {
    const propSchema = properties[key];
    if (!propSchema) {
      if (schema.additionalProperties === false) {
        errors.push(`unknown field: '${key}'`);
      }
      continue;
    }

    if (propSchema.type) {
      if (propSchema.type === 'string' && typeof raw !== 'string') {
        errors.push(`'${key}' must be a string`);
        continue;
      }
      if (propSchema.type === 'integer' && (!Number.isInteger(raw) || typeof raw !== 'number')) {
        errors.push(`'${key}' must be an integer`);
        continue;
      }
      if (propSchema.type === 'number' && typeof raw !== 'number') {
        errors.push(`'${key}' must be a number`);
        continue;
      }
      if (propSchema.type === 'boolean' && typeof raw !== 'boolean') {
        errors.push(`'${key}' must be a boolean`);
        continue;
      }
    }

    if (propSchema.type === 'string' && typeof raw === 'string') {
      if (typeof propSchema.minLength === 'number' && raw.length < propSchema.minLength) {
        errors.push(`'${key}' must be at least ${propSchema.minLength} characters`);
      }
      if (typeof propSchema.maxLength === 'number' && raw.length > propSchema.maxLength) {
        errors.push(`'${key}' must be at most ${propSchema.maxLength} characters`);
      }
      if (propSchema.pattern) {
        try {
          const re = new RegExp(propSchema.pattern);
          if (!re.test(raw)) {
            errors.push(`'${key}' does not match required pattern`);
          }
        } catch {
          // Invalid pattern — ignore (schema author error, not our problem at runtime)
        }
      }
      if (propSchema.format === 'uri') {
        try {
          new URL(raw);
        } catch {
          errors.push(`'${key}' must be a valid URI`);
        }
      }
    }

    if (typeof raw === 'number' && (propSchema.type === 'number' || propSchema.type === 'integer')) {
      if (typeof propSchema.minimum === 'number' && raw < propSchema.minimum) {
        errors.push(`'${key}' must be >= ${propSchema.minimum}`);
      }
      if (typeof propSchema.maximum === 'number' && raw > propSchema.maximum) {
        errors.push(`'${key}' must be <= ${propSchema.maximum}`);
      }
    }

    if (Array.isArray(propSchema.enum) && !propSchema.enum.includes(raw)) {
      errors.push(`'${key}' must be one of: ${propSchema.enum.map((v) => JSON.stringify(v)).join(', ')}`);
    }
  }

  return errors;
}

export interface CatalogFilter {
  domain?: McpDomainKey;
  search?: string;
  featured?: boolean;
  verified?: boolean;
  limit: number;
  cursor?: string;
}

export interface InstallInput {
  userId: string;
  catalogEntrySlug: string;
  alias: string;
  config: Record<string, unknown>;
  organizationId?: string;
}

export interface InstallPatch {
  id: string;
  userId: string;
  patch: { enabled?: boolean; alias?: string; config?: Record<string, unknown> };
}

export interface McpMarketplaceServiceDeps {
  prisma: DatabaseClient;
}

export class McpMarketplaceService {
  constructor(private readonly deps: McpMarketplaceServiceDeps) {}

  async listDomains(): Promise<DomainCount[]> {
    const counts = await this.deps.prisma.mcpCatalogEntry.groupBy({
      by: ['domain'],
      _count: { _all: true },
      orderBy: { domain: 'asc' },
    });

    return counts.map((row) => ({ domain: row.domain as McpDomainKey, count: row._count._all }));
  }

  async listCatalog(filter: CatalogFilter): Promise<CatalogPage> {
    const where: Record<string, unknown> = {};

    if (filter.domain) where.domain = filter.domain;
    if (filter.featured !== undefined) where.featured = filter.featured;
    if (filter.verified !== undefined) where.verified = filter.verified;

    if (filter.search) {
      where.OR = [
        { slug: { contains: filter.search, mode: 'insensitive' } },
        { name: { contains: filter.search, mode: 'insensitive' } },
        { description: { contains: filter.search, mode: 'insensitive' } },
        { tags: { has: filter.search.toLowerCase() } },
      ];
    }

    const entries = await this.deps.prisma.mcpCatalogEntry.findMany({
      where,
      orderBy: [{ featured: 'desc' }, { verified: 'desc' }, { installCount: 'desc' }, { name: 'asc' }],
      take: filter.limit + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
    });

    const hasMore = entries.length > filter.limit;
    const items = entries.slice(0, filter.limit).map((entry) => this.toEntryView(entry));

    return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
  }

  async getCatalogEntry(slug: string): Promise<CatalogEntryView> {
    const entry = await this.deps.prisma.mcpCatalogEntry.findUnique({ where: { slug } });

    if (!entry) {
      throw new McpMarketplaceError('Catalog entry not found', 404, 'MCP_CATALOG_NOT_FOUND');
    }

    return this.toEntryView(entry);
  }

  async install(input: InstallInput): Promise<InstallView> {
    const entry = await this.deps.prisma.mcpCatalogEntry.findUnique({
      where: { slug: input.catalogEntrySlug },
    });

    if (!entry) {
      throw new McpMarketplaceError('Catalog entry not found', 404, 'MCP_CATALOG_NOT_FOUND');
    }

    const validationErrors = validateConfigAgainstSchema(input.config, entry.configSchema);

    if (validationErrors.length > 0) {
      throw new McpMarketplaceError(`Invalid MCP config: ${validationErrors.join('; ')}`, 400, 'MCP_CONFIG_INVALID');
    }

    assertInstallConfigUrlAllowed(input.config);

    const conflict = await this.deps.prisma.mcpInstall.findUnique({
      where: { userId_alias: { userId: input.userId, alias: input.alias } },
    });

    if (conflict) {
      throw new McpMarketplaceError(`Alias '${input.alias}' is already in use`, 409, 'MCP_ALIAS_CONFLICT');
    }

    const install = await this.deps.prisma.$transaction(async (tx) => {
      const created = await tx.mcpInstall.create({
        data: {
          catalogEntryId: entry.id,
          userId: input.userId,
          organizationId: input.organizationId,
          alias: input.alias,
          configJson: input.config as never,
          enabled: true,
        },
        include: { catalogEntry: true },
      });

      await tx.mcpCatalogEntry.update({
        where: { id: entry.id },
        data: { installCount: { increment: 1 } },
      });

      return created;
    });

    return this.toInstallView(install);
  }

  async listInstalls(input: { userId: string; organizationId?: string }): Promise<InstallView[]> {
    const installs = await this.deps.prisma.mcpInstall.findMany({
      where: {
        userId: input.userId,
        ...(input.organizationId !== undefined ? { organizationId: input.organizationId } : {}),
      },
      orderBy: { installedAt: 'desc' },
      include: { catalogEntry: true },
    });

    return installs.map((install) => this.toInstallView(install));
  }

  async getInstall(input: { id: string; userId: string }): Promise<InstallView> {
    const install = await this.deps.prisma.mcpInstall.findFirst({
      where: { id: input.id, userId: input.userId },
      include: { catalogEntry: true },
    });

    if (!install) {
      throw new McpMarketplaceError('Install not found', 404, 'MCP_INSTALL_NOT_FOUND');
    }

    return this.toInstallView(install);
  }

  async updateInstall(input: InstallPatch): Promise<InstallView> {
    const install = await this.deps.prisma.mcpInstall.findFirst({
      where: { id: input.id, userId: input.userId },
      include: { catalogEntry: true },
    });

    if (!install) {
      throw new McpMarketplaceError('Install not found', 404, 'MCP_INSTALL_NOT_FOUND');
    }

    if (input.patch.alias && input.patch.alias !== install.alias) {
      const conflict = await this.deps.prisma.mcpInstall.findUnique({
        where: { userId_alias: { userId: input.userId, alias: input.patch.alias } },
      });

      if (conflict) {
        throw new McpMarketplaceError(`Alias '${input.patch.alias}' is already in use`, 409, 'MCP_ALIAS_CONFLICT');
      }
    }

    if (input.patch.config !== undefined) {
      const validationErrors = validateConfigAgainstSchema(input.patch.config, install.catalogEntry.configSchema);

      if (validationErrors.length > 0) {
        throw new McpMarketplaceError(`Invalid MCP config: ${validationErrors.join('; ')}`, 400, 'MCP_CONFIG_INVALID');
      }

      assertInstallConfigUrlAllowed(input.patch.config);
    }

    const updated = await this.deps.prisma.mcpInstall.update({
      where: { id: install.id },
      data: {
        ...(input.patch.enabled !== undefined ? { enabled: input.patch.enabled } : {}),
        ...(input.patch.alias !== undefined ? { alias: input.patch.alias } : {}),
        ...(input.patch.config !== undefined ? { configJson: input.patch.config as never } : {}),
      },
      include: { catalogEntry: true },
    });

    return this.toInstallView(updated);
  }

  async uninstall(input: { id: string; userId: string }): Promise<{
    id: string;
    alias: string;
    organizationId: string | null;
  }> {
    const install = await this.deps.prisma.mcpInstall.findFirst({
      where: { id: input.id, userId: input.userId },
      select: { id: true, catalogEntryId: true, alias: true, organizationId: true },
    });

    if (!install) {
      throw new McpMarketplaceError('Install not found', 404, 'MCP_INSTALL_NOT_FOUND');
    }

    await this.deps.prisma.$transaction(async (tx) => {
      await tx.mcpInstall.delete({ where: { id: install.id } });
      // Decrement only while positive so seed/import drift (or a rolled-back
      // increment) can't drive installCount negative — the catalog sorts and
      // displays this value. updateMany is a no-op when the guard doesn't match.
      await tx.mcpCatalogEntry.updateMany({
        where: { id: install.catalogEntryId, installCount: { gt: 0 } },
        data: { installCount: { decrement: 1 } },
      });
    });

    return { id: install.id, alias: install.alias, organizationId: install.organizationId };
  }

  /**
   * Read a user's persisted "Configuration" tab state (audit H5). Returns an
   * empty config + the default step count when the user has never saved one.
   */
  async getUserConfig(userId: string): Promise<McpUserConfigView> {
    const row = await this.deps.prisma.mcpUserConfig.findUnique({ where: { userId } });

    if (!row) {
      return { config: { mcpServers: {} }, maxLLMSteps: 5 };
    }

    const stored = (row.configJson ?? {}) as { mcpServers?: Record<string, unknown> };

    return {
      config: { mcpServers: stored.mcpServers ?? {} },
      maxLLMSteps: row.maxLLMSteps,
    };
  }

  /** Upsert a user's "Configuration" tab state (audit H5). */
  async saveUserConfig(input: {
    userId: string;
    config?: { mcpServers?: Record<string, unknown> };
    maxLLMSteps?: number;
  }): Promise<McpUserConfigView> {
    const mcpServers = input.config?.mcpServers ?? {};

    assertNoLocalMcpServers(mcpServers);

    const configJson = { mcpServers } as never;

    const row = await this.deps.prisma.mcpUserConfig.upsert({
      where: { userId: input.userId },
      create: {
        userId: input.userId,
        configJson,
        ...(input.maxLLMSteps !== undefined ? { maxLLMSteps: input.maxLLMSteps } : {}),
      },
      update: {
        configJson,
        ...(input.maxLLMSteps !== undefined ? { maxLLMSteps: input.maxLLMSteps } : {}),
      },
    });

    return { config: { mcpServers }, maxLLMSteps: row.maxLLMSteps };
  }

  private toEntryView = (entry: {
    id: string;
    slug: string;
    name: string;
    description: string;
    domain: string;
    tags: string[];
    author: string;
    homepageUrl: string | null;
    iconUrl: string | null;
    version: string;
    transport: string;
    configTemplate: unknown;
    configSchema: unknown;
    installCount: number;
    featured: boolean;
    verified: boolean;
    publishedAt: Date;
    updatedAt: Date;
  }): CatalogEntryView => ({
    id: entry.id,
    slug: entry.slug,
    name: entry.name,
    description: entry.description,
    domain: entry.domain as McpDomainKey,
    tags: entry.tags,
    author: entry.author,
    homepageUrl: entry.homepageUrl,
    iconUrl: entry.iconUrl,
    version: entry.version,
    transport: entry.transport as McpTransportKey,
    configTemplate: (entry.configTemplate ?? {}) as Record<string, unknown>,
    configSchema: (entry.configSchema ?? {}) as Record<string, unknown>,
    installCount: entry.installCount,
    featured: entry.featured,
    verified: entry.verified,
    publishedAt: entry.publishedAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  });

  private toInstallView = (install: {
    id: string;
    alias: string;
    enabled: boolean;
    configJson: unknown;
    organizationId: string | null;
    installedAt: Date;
    updatedAt: Date;
    catalogEntry: Parameters<McpMarketplaceService['toEntryView']>[0];
  }): InstallView => ({
    id: install.id,
    alias: install.alias,
    enabled: install.enabled,
    configJson: (install.configJson ?? {}) as Record<string, unknown>,
    catalogEntry: this.toEntryView(install.catalogEntry),
    installedAt: install.installedAt.toISOString(),
    updatedAt: install.updatedAt.toISOString(),
    organizationId: install.organizationId,
  });
}

export function createDefaultMcpMarketplaceService(
  prisma: DatabaseClient = createDatabaseClient(),
): McpMarketplaceService {
  return new McpMarketplaceService({ prisma });
}
