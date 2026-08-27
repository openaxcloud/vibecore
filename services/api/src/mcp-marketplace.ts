import { createDatabaseClient, type DatabaseClient } from '@vibecore/database';
import { z } from 'zod';
import { appPublicEnglish } from './app-public-copy.js';

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
export const MCP_CATALOG_LOCALES = ['en', 'fr'] as const;

export type McpDomainKey = (typeof MCP_DOMAINS)[number];
export type McpTransportKey = (typeof MCP_TRANSPORTS)[number];
export type McpCatalogLocale = (typeof MCP_CATALOG_LOCALES)[number];

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
  featuredForIdePanel: boolean;
  /** Global kill-switch; false = hidden from the public catalog & un-installable. */
  enabled: boolean;
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
  locale: z.enum(MCP_CATALOG_LOCALES).optional(),
});

export const catalogLocaleQuerySchema = z.object({
  locale: z.enum(MCP_CATALOG_LOCALES).optional(),
});

export const catalogParamsSchema = z.object({
  slug: z.string().min(1).max(100),
});

export const installInputSchema = z.object({
  catalogEntrySlug: z.string().min(1).max(100),
  alias: z
    .string()
    .min(1)
    .max(64)
    .regex(aliasPattern, {
      message: appPublicEnglish('MCP_ALIAS_FORMAT_INVALID'),
    }),
  config: z.record(z.unknown()),
  organizationId: z.string().min(1).optional(),
});

const slugPattern = /^[a-z0-9][a-z0-9-]*$/;

/*
 * Admin catalog write schemas. `configTemplate` / `configSchema` are stored
 * verbatim (they drive install-time validation via validateConfigAgainstSchema),
 * so we only enforce the JSON-object envelope here. `slug` is immutable after
 * creation (installs reference the entry by id; the slug is the public handle).
 */
export const adminCatalogCreateSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(slugPattern, {
      message: appPublicEnglish('MCP_SLUG_FORMAT_INVALID'),
    }),
  name: z.string().min(1).max(120),
  nameFr: z.string().min(1).max(120).optional().nullable(),
  description: z.string().min(1).max(2000),
  descriptionFr: z.string().min(1).max(2000).optional().nullable(),
  domain: z.enum(MCP_DOMAINS),
  tags: z.array(z.string().min(1).max(40)).max(20).default([]),
  tagsFr: z.array(z.string().min(1).max(40)).max(20).default([]),
  author: z.string().min(1).max(120),
  homepageUrl: z.string().url().max(500).optional().nullable(),
  iconUrl: z.string().url().max(500).optional().nullable(),
  version: z.string().min(1).max(40),
  transport: z.enum(MCP_TRANSPORTS),
  configTemplate: z.record(z.unknown()).default({}),
  configSchema: z.record(z.unknown()).default({}),
  configSchemaFr: z.record(z.unknown()).default({}),
  featured: z.boolean().optional(),
  verified: z.boolean().optional(),
  featuredForIdePanel: z.boolean().optional(),
  enabled: z.boolean().optional(),
});

export const adminCatalogUpdateSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    nameFr: z.string().min(1).max(120).nullable().optional(),
    description: z.string().min(1).max(2000).optional(),
    descriptionFr: z.string().min(1).max(2000).nullable().optional(),
    domain: z.enum(MCP_DOMAINS).optional(),
    tags: z.array(z.string().min(1).max(40)).max(20).optional(),
    tagsFr: z.array(z.string().min(1).max(40)).max(20).optional(),
    author: z.string().min(1).max(120).optional(),
    homepageUrl: z.string().url().max(500).nullable().optional(),
    iconUrl: z.string().url().max(500).nullable().optional(),
    version: z.string().min(1).max(40).optional(),
    transport: z.enum(MCP_TRANSPORTS).optional(),
    configTemplate: z.record(z.unknown()).optional(),
    configSchema: z.record(z.unknown()).optional(),
    configSchemaFr: z.record(z.unknown()).optional(),
    featured: z.boolean().optional(),
    verified: z.boolean().optional(),
    featuredForIdePanel: z.boolean().optional(),
    // Global kill-switch. Toggling this cascades to existing installs (see
    // updateCatalogEntry): disable soft-disables them, enable restores them.
    enabled: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: appPublicEnglish('MCP_PATCH_EMPTY') });

export const adminCatalogParamsSchema = z.object({ id: z.string().min(1).max(64) });

export const installParamsSchema = z.object({ installId: z.string().min(1).max(64) });

export const installPatchSchema = z
  .object({
    enabled: z.boolean().optional(),
    alias: z
      .string()
      .min(1)
      .max(64)
      .regex(aliasPattern, { message: appPublicEnglish('MCP_ALIAS_FORMAT_INVALID') })
      .optional(),
    config: z.record(z.unknown()).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: appPublicEnglish('MCP_PATCH_EMPTY') });

export const installListQuerySchema = z.object({
  organizationId: z.string().min(1).max(64).optional(),
  locale: z.enum(MCP_CATALOG_LOCALES).optional(),
});

function normalizeMcpCatalogLocale(value: unknown): McpCatalogLocale | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const primary = value.trim().toLowerCase().split(/[-_]/u)[0];

  return primary === 'en' || primary === 'fr' ? primary : undefined;
}

/** Explicit `locale` wins, then weighted Accept-Language negotiation, then English. */
export function resolveMcpCatalogLocale(input: {
  explicitLocale?: unknown;
  acceptLanguage?: string | readonly string[] | null;
}): McpCatalogLocale {
  const explicitLocale = normalizeMcpCatalogLocale(input.explicitLocale);

  if (explicitLocale) {
    return explicitLocale;
  }

  const header =
    typeof input.acceptLanguage === 'string'
      ? input.acceptLanguage
      : input.acceptLanguage
        ? [...input.acceptLanguage].join(',')
        : '';

  const negotiated = header
    .split(',')
    .map((entry, index) => {
      const [tag, ...parameters] = entry.trim().split(';');
      const qualityParameter = parameters.find((parameter) => parameter.trim().toLowerCase().startsWith('q='));
      const parsedQuality = qualityParameter ? Number.parseFloat(qualityParameter.trim().slice(2)) : 1;

      return {
        locale: normalizeMcpCatalogLocale(tag),
        quality: Number.isFinite(parsedQuality) ? parsedQuality : 0,
        index,
      };
    })
    .filter(
      (entry): entry is { locale: McpCatalogLocale; quality: number; index: number } =>
        Boolean(entry.locale) && entry.quality > 0,
    )
    .sort((left, right) => right.quality - left.quality || left.index - right.index)[0]?.locale;

  return negotiated ?? 'en';
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function mergeLocalizedSchemaCopy(base: unknown, localized: unknown): unknown {
  if (!isJsonRecord(base) || !isJsonRecord(localized)) {
    return base;
  }

  const merged: Record<string, unknown> = { ...base };

  for (const [key, localizedValue] of Object.entries(localized)) {
    if ((key === 'title' || key === 'description') && typeof localizedValue === 'string' && localizedValue.trim()) {
      merged[key] = localizedValue;
      continue;
    }

    if (key in base) {
      merged[key] = mergeLocalizedSchemaCopy(base[key], localizedValue);
    }
  }

  return merged;
}

/** Overlay translated labels only; validation rules and configuration keys always come from English. */
export function localizeMcpConfigSchema(
  configSchema: unknown,
  configSchemaFr: unknown,
  locale: McpCatalogLocale,
): Record<string, unknown> {
  const base = isJsonRecord(configSchema) ? configSchema : {};

  return locale === 'fr' ? (mergeLocalizedSchemaCopy(base, configSchemaFr) as Record<string, unknown>) : base;
}

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
  const transition =
    host.match(/^64:ff9b::([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i) || host.match(/^2002:([0-9a-f]{1,4}):([0-9a-f]{1,4})/i);

  if (transition) {
    const hi = parseInt(transition[1], 16);
    const lo = parseInt(transition[2], 16);

    return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
  }

  // IPv4-COMPATIBLE IPv6 (deprecated `::x.x.x.x`, no `ffff`). The URL parser
  // compresses these to `::<hi>:<lo>` (e.g. ::127.0.0.1 → ::7f00:1,
  // ::169.254.169.254 → ::a9fe:a9fe), which the ::ffff: branch above misses —
  // a loopback/metadata SSRF bypass. Fold to dotted-quad so the blocklist catches it.
  const compat = host.match(/^::([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);

  if (compat) {
    const hi = parseInt(compat[1], 16);
    const lo = parseInt(compat[2], 16);

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
  locale?: McpCatalogLocale;
}

export interface InstallInput {
  userId: string;
  catalogEntrySlug: string;
  alias: string;
  config: Record<string, unknown>;
  organizationId?: string;
  locale?: McpCatalogLocale;
}

export interface InstallPatch {
  id: string;
  userId: string;
  patch: { enabled?: boolean; alias?: string; config?: Record<string, unknown> };
  locale?: McpCatalogLocale;
}

export interface AdminCatalogCreateInput {
  slug: string;
  name: string;
  nameFr?: string | null;
  description: string;
  descriptionFr?: string | null;
  domain: McpDomainKey;
  tags?: string[];
  tagsFr?: string[];
  author: string;
  homepageUrl?: string | null;
  iconUrl?: string | null;
  version: string;
  transport: McpTransportKey;
  configTemplate?: Record<string, unknown>;
  configSchema?: Record<string, unknown>;
  configSchemaFr?: Record<string, unknown>;
  featured?: boolean;
  verified?: boolean;
  featuredForIdePanel?: boolean;
  enabled?: boolean;
}

export interface AdminCatalogUpdateInput {
  name?: string;
  nameFr?: string | null;
  description?: string;
  descriptionFr?: string | null;
  domain?: McpDomainKey;
  tags?: string[];
  tagsFr?: string[];
  author?: string;
  homepageUrl?: string | null;
  iconUrl?: string | null;
  version?: string;
  transport?: McpTransportKey;
  configTemplate?: Record<string, unknown>;
  configSchema?: Record<string, unknown>;
  configSchemaFr?: Record<string, unknown>;
  featured?: boolean;
  verified?: boolean;
  featuredForIdePanel?: boolean;
  enabled?: boolean;
}

/*
 * Per-org MCP policy, persisted by REUSING the existing
 * OrganizationConnectorPolicy table (no new migration). Each policied catalog
 * entry gets one row keyed by `provider = "mcp:<mode>:<slug>"`:
 *   - forced  ("mcp:force:"): the org MUST have this entry installed — a
 *     governance/compliance MCP the admin mandates.
 *   - allowed ("mcp:allow:"): the entry is on the org allow-list. When an
 *     allow-list exists, ONLY allow-listed (or forced) entries may be installed
 *     by org members.
 *   - blocked ("mcp:block:", enabled=false): the entry is explicitly denied.
 * Absence of any "mcp:*" row means "no allow-list configured" → all catalog
 * entries are installable (default-open), matching today's behaviour.
 */
export type McpOrgPolicyMode = 'forced' | 'allowed' | 'blocked';

export interface McpOrgPolicyEntry {
  slug: string;
  name: string;
  domain: McpDomainKey;
  mode: McpOrgPolicyMode;
}

export interface McpOrgPolicyView {
  organizationId: string;
  /** True once any allow/forced row exists → install is restricted to the list. */
  allowListEnforced: boolean;
  entries: McpOrgPolicyEntry[];
}

/*
 * Platform-wide (global) MCP policy — one tier ABOVE the org policy. Same three
 * modes; persisted in the dedicated McpGlobalPolicy table (one row per slug).
 * Install resolution evaluates GLOBAL first, then the org allow-list/block, so a
 * server must clear BOTH gates. Absence of any global row = default-open.
 */
export interface McpGlobalPolicyEntry {
  slug: string;
  name: string;
  domain: McpDomainKey;
  mode: McpOrgPolicyMode;
}

export interface McpGlobalPolicyView {
  /** True once any allowed/forced global row exists → install restricted platform-wide. */
  allowListEnforced: boolean;
  entries: McpGlobalPolicyEntry[];
}

export const MCP_POLICY_PROVIDER_PREFIX = 'mcp:';

function policyProviderKey(slug: string, mode: McpOrgPolicyMode): string {
  const kind = mode === 'forced' ? 'force' : mode === 'blocked' ? 'block' : 'allow';
  return `${MCP_POLICY_PROVIDER_PREFIX}${kind}:${slug}`;
}

function parsePolicyProvider(provider: string): { slug: string; mode: McpOrgPolicyMode } | null {
  if (!provider.startsWith(MCP_POLICY_PROVIDER_PREFIX)) {
    return null;
  }

  const rest = provider.slice(MCP_POLICY_PROVIDER_PREFIX.length);
  const sep = rest.indexOf(':');

  if (sep < 0) {
    return null;
  }

  const kind = rest.slice(0, sep);
  const slug = rest.slice(sep + 1);

  if (!slug) {
    return null;
  }

  const mode: McpOrgPolicyMode | null =
    kind === 'force' ? 'forced' : kind === 'block' ? 'blocked' : kind === 'allow' ? 'allowed' : null;

  return mode ? { slug, mode } : null;
}

export const adminOrgPolicySetSchema = z.object({
  slug: z.string().min(1).max(100),
  mode: z.enum(['forced', 'allowed', 'blocked']),
});

export const adminOrgPolicyClearSchema = z.object({
  slug: z.string().min(1).max(100),
});

export const adminGlobalPolicySetSchema = z.object({
  slug: z.string().min(1).max(100),
  mode: z.enum(['forced', 'allowed', 'blocked']),
});

export const adminGlobalPolicyClearSchema = z.object({
  slug: z.string().min(1).max(100),
});

const GLOBAL_POLICY_MODES: McpOrgPolicyMode[] = ['forced', 'allowed', 'blocked'];

function isGlobalPolicyMode(value: string): value is McpOrgPolicyMode {
  return (GLOBAL_POLICY_MODES as string[]).includes(value);
}

/*
 * Shared install gate for a set of policy rows (org OR global). A blocked slug
 * is always denied; once ANY allow/forced row exists an allow-list is in force,
 * so only allow-listed/forced slugs pass. No rows → default-open. Throws a
 * scope-specific McpMarketplaceError; returns void when the install is allowed.
 */
export function evaluatePolicyGate(
  entries: Array<{ slug: string; mode: McpOrgPolicyMode }>,
  slug: string,
  scope: 'organization' | 'platform',
): void {
  if (entries.length === 0) {
    return;
  }

  let allowListExists = false;
  let thisAllowedOrForced = false;

  for (const info of entries) {
    if (info.mode === 'blocked' && info.slug === slug) {
      throw new McpMarketplaceError(
        scope === 'platform'
          ? `MCP server '${slug}' is blocked platform-wide by the administrator`
          : `MCP server '${slug}' is blocked by your organization's policy`,
        403,
        scope === 'platform' ? 'MCP_GLOBAL_POLICY_BLOCKED' : 'MCP_ORG_POLICY_BLOCKED',
      );
    }

    if (info.mode === 'allowed' || info.mode === 'forced') {
      allowListExists = true;

      if (info.slug === slug) {
        thisAllowedOrForced = true;
      }
    }
  }

  if (allowListExists && !thisAllowedOrForced) {
    throw new McpMarketplaceError(
      scope === 'platform'
        ? `MCP server '${slug}' is not on the platform allow-list`
        : `MCP server '${slug}' is not on your organization's allow-list`,
      403,
      scope === 'platform' ? 'MCP_GLOBAL_POLICY_NOT_ALLOWED' : 'MCP_ORG_POLICY_NOT_ALLOWED',
    );
  }
}

export interface McpMarketplaceServiceDeps {
  prisma: DatabaseClient;
}

export class McpMarketplaceService {
  constructor(private readonly deps: McpMarketplaceServiceDeps) {}

  async listDomains(): Promise<DomainCount[]> {
    const counts = await this.deps.prisma.mcpCatalogEntry.groupBy({
      by: ['domain'],
      where: { enabled: true },
      _count: { _all: true },
      orderBy: { domain: 'asc' },
    });

    return counts.map((row) => ({ domain: row.domain as McpDomainKey, count: row._count._all }));
  }

  async listCatalog(filter: CatalogFilter): Promise<CatalogPage> {
    // Public catalog listing hides globally-disabled (kill-switched) entries,
    // matching getCatalogEntry (404s on disabled) and install (blocks disabled).
    // Admins still see everything via listCatalogForAdmin.
    const where: Record<string, unknown> = { enabled: true };
    const locale = filter.locale ?? 'en';

    if (filter.domain) where.domain = filter.domain;
    if (filter.featured !== undefined) where.featured = filter.featured;
    if (filter.verified !== undefined) where.verified = filter.verified;

    if (filter.search) {
      where.OR = [
        { slug: { contains: filter.search, mode: 'insensitive' } },
        { name: { contains: filter.search, mode: 'insensitive' } },
        { description: { contains: filter.search, mode: 'insensitive' } },
        { tags: { has: filter.search.toLowerCase() } },
        ...(locale === 'fr'
          ? [
              { nameFr: { contains: filter.search, mode: 'insensitive' } },
              { descriptionFr: { contains: filter.search, mode: 'insensitive' } },
              { tagsFr: { has: filter.search.toLowerCase() } },
            ]
          : []),
      ];
    }

    const entries = await this.deps.prisma.mcpCatalogEntry.findMany({
      where,
      orderBy: [{ featured: 'desc' }, { verified: 'desc' }, { installCount: 'desc' }, { name: 'asc' }],
      take: filter.limit + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
    });

    const hasMore = entries.length > filter.limit;
    const items = entries.slice(0, filter.limit).map((entry) => this.toEntryView(entry, locale));

    return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
  }

  async getCatalogEntry(slug: string, locale: McpCatalogLocale = 'en'): Promise<CatalogEntryView> {
    const entry = await this.deps.prisma.mcpCatalogEntry.findUnique({ where: { slug } });

    // A globally-disabled entry is treated as absent on the public read path.
    if (!entry || !entry.enabled) {
      throw new McpMarketplaceError('Catalog entry not found', 404, 'MCP_CATALOG_NOT_FOUND');
    }

    return this.toEntryView(entry, locale);
  }

  async install(input: InstallInput): Promise<InstallView> {
    const entry = await this.deps.prisma.mcpCatalogEntry.findUnique({
      where: { slug: input.catalogEntrySlug },
    });

    if (!entry) {
      throw new McpMarketplaceError('Catalog entry not found', 404, 'MCP_CATALOG_NOT_FOUND');
    }

    // Global kill-switch: a disabled catalog entry can never be installed.
    if (!entry.enabled) {
      throw new McpMarketplaceError(
        `MCP server '${input.catalogEntrySlug}' is disabled by the platform administrator`,
        403,
        'MCP_CATALOG_DISABLED',
      );
    }

    const validationErrors = validateConfigAgainstSchema(input.config, entry.configSchema);

    if (validationErrors.length > 0) {
      throw new McpMarketplaceError(`Invalid MCP config: ${validationErrors.join('; ')}`, 400, 'MCP_CONFIG_INVALID');
    }

    assertInstallConfigUrlAllowed(input.config);

    // Enforce policy, GLOBAL first then the org allow-list/block (both must pass).
    await this.assertGlobalInstallAllowed(input.catalogEntrySlug);

    if (input.organizationId) {
      await this.assertOrgInstallAllowed(input.organizationId, input.catalogEntrySlug);
    }

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

    return this.toInstallView(install, input.locale);
  }

  async listInstalls(input: {
    userId: string;
    organizationId?: string;
    locale?: McpCatalogLocale;
  }): Promise<InstallView[]> {
    const installs = await this.deps.prisma.mcpInstall.findMany({
      where: {
        userId: input.userId,
        ...(input.organizationId !== undefined ? { organizationId: input.organizationId } : {}),
      },
      orderBy: { installedAt: 'desc' },
      include: { catalogEntry: true },
    });

    return installs.map((install) => this.toInstallView(install, input.locale));
  }

  async getInstall(input: { id: string; userId: string; locale?: McpCatalogLocale }): Promise<InstallView> {
    const install = await this.deps.prisma.mcpInstall.findFirst({
      where: { id: input.id, userId: input.userId },
      include: { catalogEntry: true },
    });

    if (!install) {
      throw new McpMarketplaceError('Install not found', 404, 'MCP_INSTALL_NOT_FOUND');
    }

    return this.toInstallView(install, input.locale);
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

    return this.toInstallView(updated, input.locale);
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

  // --- Admin catalog management ---------------------------------------------

  /** Full catalog listing for the admin console (no cursor; ordered by name). */
  async listCatalogForAdmin(): Promise<CatalogEntryView[]> {
    const entries = await this.deps.prisma.mcpCatalogEntry.findMany({
      orderBy: [{ name: 'asc' }],
    });

    return entries.map((entry) => this.toEntryView(entry));
  }

  async getCatalogEntryById(id: string): Promise<CatalogEntryView> {
    const entry = await this.deps.prisma.mcpCatalogEntry.findUnique({ where: { id } });

    if (!entry) {
      throw new McpMarketplaceError('Catalog entry not found', 404, 'MCP_CATALOG_NOT_FOUND');
    }

    return this.toEntryView(entry);
  }

  async createCatalogEntry(input: AdminCatalogCreateInput): Promise<CatalogEntryView> {
    const existing = await this.deps.prisma.mcpCatalogEntry.findUnique({ where: { slug: input.slug } });

    if (existing) {
      throw new McpMarketplaceError(`Slug '${input.slug}' is already in use`, 409, 'MCP_CATALOG_SLUG_CONFLICT');
    }

    const created = await this.deps.prisma.mcpCatalogEntry.create({
      data: {
        slug: input.slug,
        name: input.name,
        nameFr: input.nameFr ?? null,
        description: input.description,
        descriptionFr: input.descriptionFr ?? null,
        domain: input.domain,
        tags: input.tags ?? [],
        tagsFr: input.tagsFr ?? [],
        author: input.author,
        homepageUrl: input.homepageUrl ?? null,
        iconUrl: input.iconUrl ?? null,
        version: input.version,
        transport: input.transport,
        configTemplate: (input.configTemplate ?? {}) as never,
        configSchema: (input.configSchema ?? {}) as never,
        configSchemaFr: (input.configSchemaFr ?? {}) as never,
        ...(input.featured !== undefined ? { featured: input.featured } : {}),
        ...(input.verified !== undefined ? { verified: input.verified } : {}),
        ...(input.featuredForIdePanel !== undefined ? { featuredForIdePanel: input.featuredForIdePanel } : {}),
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      },
    });

    return this.toEntryView(created);
  }

  async updateCatalogEntry(id: string, patch: AdminCatalogUpdateInput): Promise<CatalogEntryView> {
    const existing = await this.deps.prisma.mcpCatalogEntry.findUnique({ where: { id } });

    if (!existing) {
      throw new McpMarketplaceError('Catalog entry not found', 404, 'MCP_CATALOG_NOT_FOUND');
    }

    /*
     * Kill-switch cascade: flipping `enabled` soft-disables (or restores) every
     * existing install of this entry, in the SAME transaction as the entry
     * update. Disabling never deletes a row — re-enabling flips them back on, so
     * the action is fully reversible. (A user who had manually disabled an
     * install before a kill-switch will see it re-enabled on restore; that is
     * the documented, safe default for an admin kill-switch.)
     */
    const enabledChanged = patch.enabled !== undefined && patch.enabled !== existing.enabled;

    const updated = await this.deps.prisma.$transaction(async (tx) => {
      const row = await tx.mcpCatalogEntry.update({
        where: { id },
        data: {
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.nameFr !== undefined ? { nameFr: patch.nameFr } : {}),
          ...(patch.description !== undefined ? { description: patch.description } : {}),
          ...(patch.descriptionFr !== undefined ? { descriptionFr: patch.descriptionFr } : {}),
          ...(patch.domain !== undefined ? { domain: patch.domain } : {}),
          ...(patch.tags !== undefined ? { tags: patch.tags } : {}),
          ...(patch.tagsFr !== undefined ? { tagsFr: patch.tagsFr } : {}),
          ...(patch.author !== undefined ? { author: patch.author } : {}),
          ...(patch.homepageUrl !== undefined ? { homepageUrl: patch.homepageUrl } : {}),
          ...(patch.iconUrl !== undefined ? { iconUrl: patch.iconUrl } : {}),
          ...(patch.version !== undefined ? { version: patch.version } : {}),
          ...(patch.transport !== undefined ? { transport: patch.transport } : {}),
          ...(patch.configTemplate !== undefined ? { configTemplate: patch.configTemplate as never } : {}),
          ...(patch.configSchema !== undefined ? { configSchema: patch.configSchema as never } : {}),
          ...(patch.configSchemaFr !== undefined ? { configSchemaFr: patch.configSchemaFr as never } : {}),
          ...(patch.featured !== undefined ? { featured: patch.featured } : {}),
          ...(patch.verified !== undefined ? { verified: patch.verified } : {}),
          ...(patch.featuredForIdePanel !== undefined ? { featuredForIdePanel: patch.featuredForIdePanel } : {}),
          ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
        },
      });

      if (enabledChanged) {
        await tx.mcpInstall.updateMany({
          where: { catalogEntryId: id },
          data: { enabled: patch.enabled },
        });
      }

      return row;
    });

    return this.toEntryView(updated);
  }

  async deleteCatalogEntry(id: string): Promise<{ id: string; slug: string; installCount: number }> {
    const existing = await this.deps.prisma.mcpCatalogEntry.findUnique({
      where: { id },
      select: { id: true, slug: true, installCount: true },
    });

    if (!existing) {
      throw new McpMarketplaceError('Catalog entry not found', 404, 'MCP_CATALOG_NOT_FOUND');
    }

    // McpInstall.catalogEntry is onDelete:Cascade, so any org/user installs of
    // this entry are removed with it. That is the intended "hard unpublish".
    await this.deps.prisma.mcpCatalogEntry.delete({ where: { id } });

    return existing;
  }

  // --- Org MCP policy (reuses OrganizationConnectorPolicy) -------------------

  /*
   * Install-time gate: reject an org-scoped install that the org policy forbids.
   * Rules: a blocked entry is always denied; if the org has ANY allow-listed or
   * forced entry (i.e. an allow-list exists), only allow-listed/forced entries
   * may be installed. With no policy rows the org is default-open.
   */
  private async assertOrgInstallAllowed(organizationId: string, slug: string): Promise<void> {
    const rows = await this.deps.prisma.organizationConnectorPolicy.findMany({
      where: { organizationId, provider: { startsWith: MCP_POLICY_PROVIDER_PREFIX } },
      select: { provider: true },
    });

    const entries = rows
      .map((row) => parsePolicyProvider(row.provider))
      .filter((value): value is { slug: string; mode: McpOrgPolicyMode } => value !== null);

    evaluatePolicyGate(entries, slug, 'organization');
  }

  /*
   * Platform-wide gate, evaluated BEFORE the org gate. Same block / allow-list
   * semantics as the org policy, one tier up: a globally-blocked slug is denied
   * to everyone; once any global allow/forced row exists, only those slugs are
   * installable platform-wide.
   */
  private async assertGlobalInstallAllowed(slug: string): Promise<void> {
    const rows = await this.deps.prisma.mcpGlobalPolicy.findMany({ select: { slug: true, mode: true } });

    const entries = rows
      .filter((row) => isGlobalPolicyMode(row.mode))
      .map((row) => ({ slug: row.slug, mode: row.mode as McpOrgPolicyMode }));

    evaluatePolicyGate(entries, slug, 'platform');
  }

  async getOrgPolicy(organizationId: string): Promise<McpOrgPolicyView> {
    const rows = await this.deps.prisma.organizationConnectorPolicy.findMany({
      where: { organizationId, provider: { startsWith: MCP_POLICY_PROVIDER_PREFIX } },
    });

    const parsed = rows
      .map((row) => parsePolicyProvider(row.provider))
      .filter((value): value is { slug: string; mode: McpOrgPolicyMode } => value !== null);

    // Resolve entry names/domains for display (skip rows whose entry was deleted).
    const slugs = [...new Set(parsed.map((p) => p.slug))];
    const entries =
      slugs.length > 0
        ? await this.deps.prisma.mcpCatalogEntry.findMany({
            where: { slug: { in: slugs } },
            select: { slug: true, name: true, domain: true },
          })
        : [];
    const bySlug = new Map(entries.map((e) => [e.slug, e]));

    const list: McpOrgPolicyEntry[] = parsed
      .map((p) => {
        const entry = bySlug.get(p.slug);
        return entry ? { slug: p.slug, name: entry.name, domain: entry.domain as McpDomainKey, mode: p.mode } : null;
      })
      .filter((value): value is McpOrgPolicyEntry => value !== null)
      .sort((a, b) => a.name.localeCompare(b.name));

    return {
      organizationId,
      allowListEnforced: list.some((entry) => entry.mode === 'allowed' || entry.mode === 'forced'),
      entries: list,
    };
  }

  /**
   * Set the policy for a single catalog entry within an org. A slug has at most
   * ONE policy row; changing the mode replaces the prior row (the provider key
   * encodes the mode, so we clear any existing mode-keyed rows first).
   */
  async setOrgPolicy(input: {
    organizationId: string;
    slug: string;
    mode: McpOrgPolicyMode;
  }): Promise<McpOrgPolicyView> {
    const entry = await this.deps.prisma.mcpCatalogEntry.findUnique({
      where: { slug: input.slug },
      select: { id: true },
    });

    if (!entry) {
      throw new McpMarketplaceError('Catalog entry not found', 404, 'MCP_CATALOG_NOT_FOUND');
    }

    const provider = policyProviderKey(input.slug, input.mode);

    await this.deps.prisma.$transaction(async (tx) => {
      // Remove any prior policy row(s) for this slug regardless of mode.
      for (const mode of ['forced', 'allowed', 'blocked'] as McpOrgPolicyMode[]) {
        if (mode === input.mode) {
          continue;
        }

        await tx.organizationConnectorPolicy.deleteMany({
          where: { organizationId: input.organizationId, provider: policyProviderKey(input.slug, mode) },
        });
      }

      await tx.organizationConnectorPolicy.upsert({
        where: { organizationId_provider: { organizationId: input.organizationId, provider } },
        create: {
          organizationId: input.organizationId,
          provider,
          enabled: input.mode !== 'blocked',
          allowedRoleKeys: [],
        },
        update: { enabled: input.mode !== 'blocked' },
      });
    });

    return this.getOrgPolicy(input.organizationId);
  }

  /** Remove any MCP policy for a slug (back to default-open for that entry). */
  async clearOrgPolicy(input: { organizationId: string; slug: string }): Promise<McpOrgPolicyView> {
    await this.deps.prisma.organizationConnectorPolicy.deleteMany({
      where: {
        organizationId: input.organizationId,
        provider: {
          in: (['forced', 'allowed', 'blocked'] as McpOrgPolicyMode[]).map((m) => policyProviderKey(input.slug, m)),
        },
      },
    });

    return this.getOrgPolicy(input.organizationId);
  }

  // --- Global (platform-wide) MCP policy (dedicated McpGlobalPolicy table) -----

  async getGlobalPolicy(): Promise<McpGlobalPolicyView> {
    const rows = await this.deps.prisma.mcpGlobalPolicy.findMany({ select: { slug: true, mode: true } });
    const valid = rows.filter((row) => isGlobalPolicyMode(row.mode));

    // Resolve entry names/domains for display (skip rows whose entry was deleted).
    const slugs = [...new Set(valid.map((row) => row.slug))];
    const entries =
      slugs.length > 0
        ? await this.deps.prisma.mcpCatalogEntry.findMany({
            where: { slug: { in: slugs } },
            select: { slug: true, name: true, domain: true },
          })
        : [];
    const bySlug = new Map(entries.map((entry) => [entry.slug, entry]));

    const list: McpGlobalPolicyEntry[] = valid
      .map((row) => {
        const entry = bySlug.get(row.slug);
        return entry
          ? {
              slug: row.slug,
              name: entry.name,
              domain: entry.domain as McpDomainKey,
              mode: row.mode as McpOrgPolicyMode,
            }
          : null;
      })
      .filter((value): value is McpGlobalPolicyEntry => value !== null)
      .sort((a, b) => a.name.localeCompare(b.name));

    return {
      allowListEnforced: list.some((entry) => entry.mode === 'allowed' || entry.mode === 'forced'),
      entries: list,
    };
  }

  /** Set the platform-wide policy for a single catalog entry (one row per slug). */
  async setGlobalPolicy(input: { slug: string; mode: McpOrgPolicyMode }): Promise<McpGlobalPolicyView> {
    const entry = await this.deps.prisma.mcpCatalogEntry.findUnique({
      where: { slug: input.slug },
      select: { id: true },
    });

    if (!entry) {
      throw new McpMarketplaceError('Catalog entry not found', 404, 'MCP_CATALOG_NOT_FOUND');
    }

    await this.deps.prisma.mcpGlobalPolicy.upsert({
      where: { slug: input.slug },
      create: { slug: input.slug, mode: input.mode },
      update: { mode: input.mode },
    });

    return this.getGlobalPolicy();
  }

  /** Remove the global policy for a slug (back to default-open platform-wide). */
  async clearGlobalPolicy(input: { slug: string }): Promise<McpGlobalPolicyView> {
    await this.deps.prisma.mcpGlobalPolicy.deleteMany({ where: { slug: input.slug } });

    return this.getGlobalPolicy();
  }

  private toEntryView = (
    entry: {
      id: string;
      slug: string;
      name: string;
      nameFr: string | null;
      description: string;
      descriptionFr: string | null;
      domain: string;
      tags: string[];
      tagsFr: string[];
      author: string;
      homepageUrl: string | null;
      iconUrl: string | null;
      version: string;
      transport: string;
      configTemplate: unknown;
      configSchema: unknown;
      configSchemaFr: unknown;
      installCount: number;
      featured: boolean;
      verified: boolean;
      featuredForIdePanel?: boolean;
      enabled?: boolean;
      publishedAt: Date;
      updatedAt: Date;
    },
    locale: McpCatalogLocale = 'en',
  ): CatalogEntryView => ({
    id: entry.id,
    slug: entry.slug,
    name: locale === 'fr' && entry.nameFr?.trim() ? entry.nameFr : entry.name,
    description: locale === 'fr' && entry.descriptionFr?.trim() ? entry.descriptionFr : entry.description,
    domain: entry.domain as McpDomainKey,
    tags: locale === 'fr' && entry.tagsFr.length > 0 ? entry.tagsFr : entry.tags,
    author: entry.author,
    homepageUrl: entry.homepageUrl,
    iconUrl: entry.iconUrl,
    version: entry.version,
    transport: entry.transport as McpTransportKey,
    configTemplate: (entry.configTemplate ?? {}) as Record<string, unknown>,
    configSchema: localizeMcpConfigSchema(entry.configSchema, entry.configSchemaFr, locale),
    installCount: entry.installCount,
    featured: entry.featured,
    verified: entry.verified,
    featuredForIdePanel: entry.featuredForIdePanel ?? false,
    enabled: entry.enabled ?? true,
    publishedAt: entry.publishedAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  });

  private toInstallView = (
    install: {
      id: string;
      alias: string;
      enabled: boolean;
      configJson: unknown;
      organizationId: string | null;
      installedAt: Date;
      updatedAt: Date;
      catalogEntry: Parameters<McpMarketplaceService['toEntryView']>[0];
    },
    locale: McpCatalogLocale = 'en',
  ): InstallView => ({
    id: install.id,
    alias: install.alias,
    enabled: install.enabled,
    configJson: (install.configJson ?? {}) as Record<string, unknown>,
    catalogEntry: this.toEntryView(install.catalogEntry, locale),
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
