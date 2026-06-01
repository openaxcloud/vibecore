import { describe, expect, it } from 'vitest';
import {
  buildInstalledServers,
  buildServerConfigFromInstall,
  mergeMcpConfigs,
  type InstalledMcp,
} from './install-config';

function makeInstall(overrides: Partial<InstalledMcp> & Pick<InstalledMcp, 'catalogEntry'>): InstalledMcp {
  return {
    id: 'inst_1',
    alias: 'srv',
    enabled: true,
    configJson: {},
    ...overrides,
  };
}

describe('buildServerConfigFromInstall', () => {
  it('injects an API key into an existing env placeholder (GitHub case)', () => {
    const config = buildServerConfigFromInstall(
      makeInstall({
        alias: 'github',
        configJson: { GITHUB_PERSONAL_ACCESS_TOKEN: 'ghp_secret' },
        catalogEntry: {
          slug: 'github',
          name: 'GitHub',
          transport: 'STDIO',
          configTemplate: {
            type: 'stdio',
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-github'],
            env: { GITHUB_PERSONAL_ACCESS_TOKEN: '' },
          },
        },
      }),
    );

    expect(config).toEqual({
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      env: { GITHUB_PERSONAL_ACCESS_TOKEN: 'ghp_secret' },
    });
  });

  it('substitutes a {{token}} placeholder in args (filesystem case)', () => {
    const config = buildServerConfigFromInstall(
      makeInstall({
        alias: 'fs',
        configJson: { rootDir: '/srv/project' },
        catalogEntry: {
          slug: 'filesystem',
          name: 'Filesystem',
          transport: 'STDIO',
          configTemplate: {
            type: 'stdio',
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-filesystem', '{{rootDir}}'],
            env: {},
          },
        },
      }),
    );

    expect((config as { args: string[] }).args).toEqual([
      '-y',
      '@modelcontextprotocol/server-filesystem',
      '/srv/project',
    ]);
  });

  it('substitutes a connection-string token (postgres case)', () => {
    const config = buildServerConfigFromInstall(
      makeInstall({
        configJson: { DATABASE_URL: 'postgresql://u:p@db:5432/app' },
        catalogEntry: {
          slug: 'postgres',
          name: 'Postgres',
          transport: 'STDIO',
          configTemplate: {
            type: 'stdio',
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-postgres', '{{DATABASE_URL}}'],
            env: {},
          },
        },
      }),
    );

    expect((config as { args: string[] }).args[2]).toBe('postgresql://u:p@db:5432/app');

    // Not duplicated into env when a token binding was found.
    expect((config as { env: Record<string, string> }).env).toEqual({});
  });

  it('derives the transport type when the template omits it', () => {
    const config = buildServerConfigFromInstall(
      makeInstall({
        configJson: { Authorization: 'Bearer t' },
        catalogEntry: {
          slug: 'remote',
          name: 'Remote',
          transport: 'SSE',
          configTemplate: {
            url: 'https://example.com/sse',
            headers: { Authorization: '' },
          },
        },
      }),
    );

    expect(config).toEqual({
      type: 'sse',
      url: 'https://example.com/sse',
      headers: { Authorization: 'Bearer t' },
    });
  });

  it('falls back to env for an unbound UPPER_SNAKE key', () => {
    const config = buildServerConfigFromInstall(
      makeInstall({
        configJson: { EXTRA_TOKEN: 'xyz' },
        catalogEntry: {
          slug: 'x',
          name: 'X',
          transport: 'STDIO',
          configTemplate: { type: 'stdio', command: 'run', args: [] },
        },
      }),
    );

    expect((config as { env: Record<string, string> }).env).toEqual({ EXTRA_TOKEN: 'xyz' });
  });

  it('ignores empty / null values', () => {
    const config = buildServerConfigFromInstall(
      makeInstall({
        configJson: { GITHUB_PERSONAL_ACCESS_TOKEN: '', NOPE: null },
        catalogEntry: {
          slug: 'github',
          name: 'GitHub',
          transport: 'STDIO',
          configTemplate: {
            type: 'stdio',
            command: 'npx',
            args: [],
            env: { GITHUB_PERSONAL_ACCESS_TOKEN: '' },
          },
        },
      }),
    );

    expect((config as { env: Record<string, string> }).env).toEqual({ GITHUB_PERSONAL_ACCESS_TOKEN: '' });
  });

  it('returns null when the template is not an object', () => {
    expect(
      buildServerConfigFromInstall(
        makeInstall({
          catalogEntry: {
            slug: 'broken',
            name: 'Broken',
            transport: 'STDIO',
            configTemplate: null as unknown as Record<string, unknown>,
          },
        }),
      ),
    ).toBeNull();
  });
});

describe('buildInstalledServers', () => {
  const entry = {
    slug: 'github',
    name: 'GitHub',
    transport: 'STDIO' as const,
    configTemplate: { type: 'stdio', command: 'npx', args: [], env: { TOKEN: '' } },
  };

  it('keys servers by alias and skips disabled installs', () => {
    const servers = buildInstalledServers([
      makeInstall({ alias: 'gh-a', configJson: { TOKEN: 'a' }, catalogEntry: entry }),
      makeInstall({ id: 'i2', alias: 'gh-b', enabled: false, configJson: { TOKEN: 'b' }, catalogEntry: entry }),
    ]);

    expect(Object.keys(servers)).toEqual(['gh-a']);
    expect((servers['gh-a'] as { env: Record<string, string> }).env.TOKEN).toBe('a');
  });
});

describe('mergeMcpConfigs', () => {
  const entry = {
    slug: 'github',
    name: 'GitHub',
    transport: 'STDIO' as const,
    configTemplate: { type: 'stdio', command: 'npx', args: [], env: { TOKEN: '' } },
  };

  it('merges installs with manual servers', () => {
    const merged = mergeMcpConfigs({ mcpServers: { manual: { type: 'sse', url: 'https://m.example/sse' } } }, [
      makeInstall({ alias: 'gh', configJson: { TOKEN: 't' }, catalogEntry: entry }),
    ]);

    expect(Object.keys(merged.mcpServers).sort()).toEqual(['gh', 'manual']);
  });

  it('lets a manual server override an install on alias collision', () => {
    const merged = mergeMcpConfigs({ mcpServers: { gh: { type: 'sse', url: 'https://manual/sse' } } }, [
      makeInstall({ alias: 'gh', configJson: { TOKEN: 't' }, catalogEntry: entry }),
    ]);

    expect(merged.mcpServers.gh).toEqual({ type: 'sse', url: 'https://manual/sse' });
  });

  it('tolerates an undefined config-tab config', () => {
    const merged = mergeMcpConfigs(undefined, [
      makeInstall({ alias: 'gh', configJson: { TOKEN: 't' }, catalogEntry: entry }),
    ]);

    expect(Object.keys(merged.mcpServers)).toEqual(['gh']);
  });
});
