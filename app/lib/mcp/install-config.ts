/**
 * Bridges the MCP *marketplace* (catalog entries + per-user `McpInstall` rows,
 * persisted in the database) with the MCP *runtime* (`MCPService`, which speaks
 * `MCPConfig` / `MCPServerConfig`).
 *
 * Audit C2/H6/H7: an install persists the user's customised values
 * (`configJson` — API keys, paths, connection strings) keyed by the catalog
 * entry's `configSchema` properties, while the catalog entry separately carries
 * a `configTemplate` (a partial `MCPServerConfig`: transport + command/args/env
 * or url/headers). Neither alone is a runnable server config. This module
 * merges the two into a working `MCPServerConfig`, then folds every enabled
 * install in alongside the manually-authored "Configuration" tab servers so the
 * chat/agent runtime sees a single unified `MCPConfig`.
 *
 * Pure (no I/O, no server-only imports) so it is unit-testable and safe to
 * import from either side of the Remix boundary.
 */
import type { MCPConfig, MCPServerConfig } from '~/lib/services/mcpService';

export type McpTransportKey = 'STDIO' | 'SSE' | 'STREAMABLE_HTTP';

/** Minimal shape of a catalog entry as returned by `GET /mcp/installs`. */
export interface InstalledMcpCatalogEntry {
  slug: string;
  name: string;
  transport: McpTransportKey;
  configTemplate: Record<string, unknown>;
}

/** Minimal shape of an `McpInstall` row as returned by `GET /mcp/installs`. */
export interface InstalledMcp {
  id: string;
  alias: string;
  enabled: boolean;
  configJson: Record<string, unknown>;
  catalogEntry: InstalledMcpCatalogEntry;
}

const TRANSPORT_TO_TYPE: Record<McpTransportKey, MCPServerConfig['type']> = {
  STDIO: 'stdio',
  SSE: 'sse',
  STREAMABLE_HTTP: 'streamable-http',
};

const RESERVED_KEYS = new Set(['type', 'command', 'args', 'cwd', 'env', 'url', 'headers']);
const ENV_KEY_PATTERN = /^[A-Z][A-Z0-9_]*$/;

/** JSON deep-clone — catalog templates are always plain JSON. */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringifyScalar(value: unknown): string | null {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return null;
}

function stringifyRecord(value: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};

  for (const [key, raw] of Object.entries(value)) {
    const str = stringifyScalar(raw);

    if (str !== null) {
      out[key] = str;
    }
  }

  return out;
}

/**
 * Replace every `{{key}}` token in the mutable string-bearing fields of a
 * server config. Returns true if at least one occurrence was replaced so the
 * caller knows the value found a binding.
 */
function substituteToken(server: Record<string, unknown>, key: string, value: string): boolean {
  const token = new RegExp(`\\{\\{\\s*${escapeRegExp(key)}\\s*\\}\\}`, 'g');

  let replaced = false;

  const replaceString = (input: string): string => {
    if (!token.test(input)) {
      return input;
    }

    token.lastIndex = 0;
    replaced = true;

    return input.replace(token, value);
  };

  for (const field of ['command', 'cwd', 'url'] as const) {
    if (typeof server[field] === 'string') {
      server[field] = replaceString(server[field] as string);
    }
  }

  if (Array.isArray(server.args)) {
    server.args = (server.args as unknown[]).map((arg) => (typeof arg === 'string' ? replaceString(arg) : arg));
  }

  for (const field of ['env', 'headers'] as const) {
    const record = server[field];

    if (isPlainObject(record)) {
      for (const [recordKey, recordValue] of Object.entries(record)) {
        if (typeof recordValue === 'string') {
          record[recordKey] = replaceString(recordValue);
        }
      }
    }
  }

  return replaced;
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Apply a single user-provided config value to the (mutable) server config.
 *
 * Binding precedence:
 *   1. Reserved keys (`command`/`args`/`cwd`/`url`/`env`/`headers`) — written
 *      directly onto the matching field.
 *   2. An existing key inside the template's `env` map (e.g. the catalog
 *      template declares `env: { GITHUB_PERSONAL_ACCESS_TOKEN: '' }`) or
 *      `headers` map (e.g. an `Authorization` header on an SSE server).
 *   3. A `{{key}}` token anywhere in the template (args/url/command/env values),
 *      used for positional values like a filesystem root or a connection string.
 *   4. Fallback: an UPPER_SNAKE_CASE key with no other binding is treated as an
 *      environment variable.
 */
function applyConfigValue(server: Record<string, unknown>, key: string, raw: unknown): void {
  if (raw === undefined || raw === null || raw === '') {
    return;
  }

  if (RESERVED_KEYS.has(key)) {
    if (key === 'args' && Array.isArray(raw)) {
      server.args = raw.map((arg) => stringifyScalar(arg) ?? '').filter((arg) => arg !== '');
      return;
    }

    if ((key === 'env' || key === 'headers') && isPlainObject(raw)) {
      const existing = isPlainObject(server[key]) ? (server[key] as Record<string, string>) : {};
      server[key] = { ...existing, ...stringifyRecord(raw) };

      return;
    }

    if (key === 'type') {
      // The transport drives `type`; never let user config override it.
      return;
    }

    const str = stringifyScalar(raw);

    if (str !== null) {
      server[key] = str;
    }

    return;
  }

  const str = stringifyScalar(raw);

  if (str === null) {
    return;
  }

  // (2a) existing env key on the template.
  if (isPlainObject(server.env) && key in (server.env as Record<string, unknown>)) {
    (server.env as Record<string, string>)[key] = str;
    return;
  }

  /*
   * (2b) existing header key on the template (e.g. an `Authorization` header
   * for an SSE / streamable-http server).
   */
  if (isPlainObject(server.headers) && key in (server.headers as Record<string, unknown>)) {
    (server.headers as Record<string, string>)[key] = str;
    return;
  }

  // (3) {{token}} substitution.
  if (substituteToken(server, key, str)) {
    return;
  }

  // (4) UPPER_SNAKE_CASE → environment variable.
  if (ENV_KEY_PATTERN.test(key)) {
    const env = isPlainObject(server.env) ? (server.env as Record<string, string>) : {};
    env[key] = str;
    server.env = env;
  }

  /*
   * Otherwise the value has no binding in the template; drop it silently — it
   * was already validated against the catalog schema, but the template author
   * gave it no slot, so injecting it blindly would corrupt the config.
   */
}

/**
 * Merge a catalog entry's `configTemplate` with a user's `configJson` to
 * produce a runnable `MCPServerConfig`. Returns null when the template is not a
 * usable object.
 */
export function buildServerConfigFromInstall(install: InstalledMcp): MCPServerConfig | null {
  const template = install.catalogEntry?.configTemplate;

  if (!isPlainObject(template)) {
    return null;
  }

  const server = clone(template) as Record<string, unknown>;

  /*
   * Ensure a transport `type` is present; the template usually sets it, but the
   * catalog entry's `transport` is authoritative when it is missing.
   */
  if (typeof server.type !== 'string') {
    const transport = install.catalogEntry?.transport;

    if (transport && TRANSPORT_TO_TYPE[transport]) {
      server.type = TRANSPORT_TO_TYPE[transport];
    }
  }

  const configJson = isPlainObject(install.configJson) ? install.configJson : {};

  for (const [key, value] of Object.entries(configJson)) {
    applyConfigValue(server, key, value);
  }

  return server as MCPServerConfig;
}

/**
 * Build the `mcpServers` map contributed by the marketplace installs, keyed by
 * each install's alias. Disabled installs and unusable templates are skipped.
 */
export function buildInstalledServers(installs: InstalledMcp[]): Record<string, MCPServerConfig> {
  const servers: Record<string, MCPServerConfig> = {};

  for (const install of installs) {
    if (!install?.enabled) {
      continue;
    }

    const config = buildServerConfigFromInstall(install);

    if (config) {
      servers[install.alias] = config;
    }
  }

  return servers;
}

/**
 * Combine the manually-authored "Configuration" tab servers with the
 * marketplace installs into a single `MCPConfig`. Manually-configured servers
 * win on an alias collision — a hand-written entry is an explicit override.
 */
export function mergeMcpConfigs(configTab: MCPConfig | undefined, installs: InstalledMcp[]): MCPConfig {
  const manual = isPlainObject(configTab?.mcpServers) ? configTab!.mcpServers : {};
  const installed = buildInstalledServers(installs);

  return {
    mcpServers: {
      ...installed,
      ...manual,
    },
  };
}
