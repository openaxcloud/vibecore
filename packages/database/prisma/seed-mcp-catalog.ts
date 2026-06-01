import type { PrismaClient } from '../generated/client/index.js';

type CatalogSeed = {
  slug: string;
  name: string;
  description: string;
  domain:
    | 'AI_AGENTS'
    | 'CODE_EXECUTION'
    | 'DATABASES'
    | 'DEVOPS'
    | 'DEVELOPER_TOOLS'
    | 'COMMUNICATION'
    | 'PRODUCTIVITY'
    | 'KNOWLEDGE'
    | 'WEB_BROWSING'
    | 'SEARCH'
    | 'CLOUD'
    | 'SECURITY'
    | 'FILESYSTEM'
    | 'VERSION_CONTROL'
    | 'MONITORING'
    | 'OTHER';
  tags: string[];
  author: string;
  homepageUrl?: string;
  iconUrl?: string;
  version: string;
  transport: 'STDIO' | 'SSE' | 'STREAMABLE_HTTP';
  configTemplate: Record<string, unknown>;
  configSchema: Record<string, unknown>;
  featured?: boolean;
  verified?: boolean;
};

const REPO = 'https://github.com/modelcontextprotocol/servers';

const stdioTemplate = (pkg: string, args: string[] = []) => ({
  type: 'stdio',
  command: 'npx',
  args: ['-y', pkg, ...args],
  env: {} as Record<string, string>,
});

export const MCP_CATALOG_SEEDS: CatalogSeed[] = [
  {
    slug: 'filesystem',
    name: 'Filesystem',
    description: 'Read, write, and search files within an allowed directory tree. Reference MCP server.',
    domain: 'FILESYSTEM',
    tags: ['files', 'official', 'reference'],
    author: 'modelcontextprotocol',
    homepageUrl: `${REPO}/tree/main/src/filesystem`,
    version: '0.7.0',
    transport: 'STDIO',
    configTemplate: stdioTemplate('@modelcontextprotocol/server-filesystem', ['{{rootDir}}']),
    configSchema: {
      type: 'object',
      properties: {
        rootDir: {
          type: 'string',
          title: 'Allowed root directory',
          description: 'Absolute path the server is allowed to access.',
          minLength: 1,
        },
      },
      required: ['rootDir'],
    },
    featured: true,
    verified: true,
  },
  {
    slug: 'memory',
    name: 'Memory (Knowledge Graph)',
    description: 'Long-term memory using a local knowledge graph. Reference MCP server.',
    domain: 'KNOWLEDGE',
    tags: ['memory', 'official', 'reference', 'knowledge-graph'],
    author: 'modelcontextprotocol',
    homepageUrl: `${REPO}/tree/main/src/memory`,
    version: '0.6.0',
    transport: 'STDIO',
    configTemplate: stdioTemplate('@modelcontextprotocol/server-memory'),
    configSchema: { type: 'object', properties: {} },
    featured: true,
    verified: true,
  },
  {
    slug: 'github',
    name: 'GitHub',
    description: 'GitHub repos, issues, PRs, code search and file operations via REST API.',
    domain: 'VERSION_CONTROL',
    tags: ['git', 'github', 'official', 'reference'],
    author: 'modelcontextprotocol',
    homepageUrl: `${REPO}/tree/main/src/github`,
    version: '0.6.2',
    transport: 'STDIO',
    configTemplate: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      env: { GITHUB_PERSONAL_ACCESS_TOKEN: '' },
    },
    configSchema: {
      type: 'object',
      properties: {
        GITHUB_PERSONAL_ACCESS_TOKEN: {
          type: 'string',
          title: 'GitHub Personal Access Token',
          format: 'password',
          minLength: 10,
        },
      },
      required: ['GITHUB_PERSONAL_ACCESS_TOKEN'],
    },
    featured: true,
    verified: true,
  },
  {
    slug: 'gitlab',
    name: 'GitLab',
    description: 'GitLab API integration for projects, issues, MRs and CI pipelines.',
    domain: 'VERSION_CONTROL',
    tags: ['git', 'gitlab', 'official', 'reference'],
    author: 'modelcontextprotocol',
    homepageUrl: `${REPO}/tree/main/src/gitlab`,
    version: '0.6.0',
    transport: 'STDIO',
    configTemplate: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-gitlab'],
      env: { GITLAB_PERSONAL_ACCESS_TOKEN: '', GITLAB_API_URL: 'https://gitlab.com/api/v4' },
    },
    configSchema: {
      type: 'object',
      properties: {
        GITLAB_PERSONAL_ACCESS_TOKEN: { type: 'string', format: 'password', minLength: 10 },
        GITLAB_API_URL: { type: 'string', default: 'https://gitlab.com/api/v4' },
      },
      required: ['GITLAB_PERSONAL_ACCESS_TOKEN'],
    },
    verified: true,
  },
  {
    slug: 'git',
    name: 'Git',
    description: 'Local git repository operations: log, diff, blame, status.',
    domain: 'VERSION_CONTROL',
    tags: ['git', 'official', 'reference', 'local'],
    author: 'modelcontextprotocol',
    homepageUrl: `${REPO}/tree/main/src/git`,
    version: '0.6.0',
    transport: 'STDIO',
    configTemplate: stdioTemplate('@modelcontextprotocol/server-git'),
    configSchema: { type: 'object', properties: {} },
    verified: true,
  },
  {
    slug: 'postgres',
    name: 'PostgreSQL',
    description: 'Read-only SQL queries and schema introspection against a Postgres database.',
    domain: 'DATABASES',
    tags: ['database', 'sql', 'postgres', 'official', 'reference'],
    author: 'modelcontextprotocol',
    homepageUrl: `${REPO}/tree/main/src/postgres`,
    version: '0.6.0',
    transport: 'STDIO',
    configTemplate: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-postgres', '{{DATABASE_URL}}'],
      env: {},
    },
    configSchema: {
      type: 'object',
      properties: {
        DATABASE_URL: { type: 'string', format: 'uri', minLength: 10 },
      },
      required: ['DATABASE_URL'],
    },
    featured: true,
    verified: true,
  },
  {
    slug: 'sqlite',
    name: 'SQLite',
    description: 'SQL queries and schema operations on a local SQLite file.',
    domain: 'DATABASES',
    tags: ['database', 'sql', 'sqlite', 'official', 'reference'],
    author: 'modelcontextprotocol',
    homepageUrl: `${REPO}/tree/main/src/sqlite`,
    version: '0.6.2',
    transport: 'STDIO',
    configTemplate: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-sqlite', '--db-path', '{{dbPath}}'],
      env: {},
    },
    configSchema: {
      type: 'object',
      properties: {
        dbPath: { type: 'string', minLength: 1 },
      },
      required: ['dbPath'],
    },
    verified: true,
  },
  {
    slug: 'redis',
    name: 'Redis',
    description: 'Get/set keys and run commands against a Redis instance.',
    domain: 'DATABASES',
    tags: ['database', 'redis', 'cache', 'official', 'reference'],
    author: 'modelcontextprotocol',
    homepageUrl: `${REPO}/tree/main/src/redis`,
    version: '0.6.0',
    transport: 'STDIO',
    configTemplate: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-redis', '{{REDIS_URL}}'],
      env: {},
    },
    configSchema: {
      type: 'object',
      properties: { REDIS_URL: { type: 'string', minLength: 10 } },
      required: ['REDIS_URL'],
    },
    verified: true,
  },
  {
    slug: 'brave-search',
    name: 'Brave Search',
    description: 'Web and local search via the Brave Search API.',
    domain: 'SEARCH',
    tags: ['search', 'web', 'brave', 'official', 'reference'],
    author: 'modelcontextprotocol',
    homepageUrl: `${REPO}/tree/main/src/brave-search`,
    version: '0.6.2',
    transport: 'STDIO',
    configTemplate: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-brave-search'],
      env: { BRAVE_API_KEY: '' },
    },
    configSchema: {
      type: 'object',
      properties: { BRAVE_API_KEY: { type: 'string', format: 'password', minLength: 10 } },
      required: ['BRAVE_API_KEY'],
    },
    featured: true,
    verified: true,
  },
  {
    slug: 'fetch',
    name: 'Fetch',
    description: 'Fetch any URL and return contents as markdown or text.',
    domain: 'WEB_BROWSING',
    tags: ['web', 'http', 'official', 'reference'],
    author: 'modelcontextprotocol',
    homepageUrl: `${REPO}/tree/main/src/fetch`,
    version: '0.6.0',
    transport: 'STDIO',
    configTemplate: stdioTemplate('@modelcontextprotocol/server-fetch'),
    configSchema: { type: 'object', properties: {} },
    featured: true,
    verified: true,
  },
  {
    slug: 'puppeteer',
    name: 'Puppeteer',
    description: 'Browser automation: navigate, click, screenshot, scrape pages.',
    domain: 'WEB_BROWSING',
    tags: ['browser', 'puppeteer', 'automation', 'official', 'reference'],
    author: 'modelcontextprotocol',
    homepageUrl: `${REPO}/tree/main/src/puppeteer`,
    version: '0.6.0',
    transport: 'STDIO',
    configTemplate: stdioTemplate('@modelcontextprotocol/server-puppeteer'),
    configSchema: { type: 'object', properties: {} },
    verified: true,
  },
  {
    slug: 'slack',
    name: 'Slack',
    description: 'Read and post Slack messages, list channels, manage threads.',
    domain: 'COMMUNICATION',
    tags: ['chat', 'slack', 'official', 'reference'],
    author: 'modelcontextprotocol',
    homepageUrl: `${REPO}/tree/main/src/slack`,
    version: '0.6.0',
    transport: 'STDIO',
    configTemplate: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-slack'],
      env: { SLACK_BOT_TOKEN: '', SLACK_TEAM_ID: '' },
    },
    configSchema: {
      type: 'object',
      properties: {
        SLACK_BOT_TOKEN: { type: 'string', format: 'password', minLength: 10 },
        SLACK_TEAM_ID: { type: 'string', minLength: 1 },
      },
      required: ['SLACK_BOT_TOKEN', 'SLACK_TEAM_ID'],
    },
    verified: true,
  },
  {
    slug: 'google-drive',
    name: 'Google Drive',
    description: 'Search and read files from Google Drive via OAuth.',
    domain: 'CLOUD',
    tags: ['cloud', 'google', 'drive', 'official', 'reference'],
    author: 'modelcontextprotocol',
    homepageUrl: `${REPO}/tree/main/src/gdrive`,
    version: '0.6.2',
    transport: 'STDIO',
    configTemplate: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-gdrive'],
      env: { GDRIVE_CREDENTIALS_PATH: '' },
    },
    configSchema: {
      type: 'object',
      properties: { GDRIVE_CREDENTIALS_PATH: { type: 'string', minLength: 1 } },
      required: ['GDRIVE_CREDENTIALS_PATH'],
    },
    verified: true,
  },
  {
    slug: 'google-maps',
    name: 'Google Maps',
    description: 'Geocoding, places search, directions and elevation via Google Maps API.',
    domain: 'CLOUD',
    tags: ['maps', 'google', 'geo', 'official', 'reference'],
    author: 'modelcontextprotocol',
    homepageUrl: `${REPO}/tree/main/src/google-maps`,
    version: '0.6.0',
    transport: 'STDIO',
    configTemplate: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-google-maps'],
      env: { GOOGLE_MAPS_API_KEY: '' },
    },
    configSchema: {
      type: 'object',
      properties: { GOOGLE_MAPS_API_KEY: { type: 'string', format: 'password', minLength: 10 } },
      required: ['GOOGLE_MAPS_API_KEY'],
    },
    verified: true,
  },
  {
    slug: 'aws-kb-retrieval',
    name: 'AWS Knowledge Base Retrieval',
    description: 'Retrieve documents from AWS Bedrock Knowledge Bases.',
    domain: 'CLOUD',
    tags: ['cloud', 'aws', 'bedrock', 'rag', 'official', 'reference'],
    author: 'modelcontextprotocol',
    homepageUrl: `${REPO}/tree/main/src/aws-kb-retrieval-server`,
    version: '0.6.0',
    transport: 'STDIO',
    configTemplate: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-aws-kb-retrieval'],
      env: { AWS_REGION: 'us-east-1', AWS_ACCESS_KEY_ID: '', AWS_SECRET_ACCESS_KEY: '' },
    },
    configSchema: {
      type: 'object',
      properties: {
        AWS_REGION: { type: 'string', default: 'us-east-1' },
        AWS_ACCESS_KEY_ID: { type: 'string', format: 'password' },
        AWS_SECRET_ACCESS_KEY: { type: 'string', format: 'password' },
      },
      required: ['AWS_REGION', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'],
    },
    verified: true,
  },
  {
    slug: 'time',
    name: 'Time & Timezone',
    description: 'Current time and timezone conversion utilities.',
    domain: 'PRODUCTIVITY',
    tags: ['time', 'utility', 'official', 'reference'],
    author: 'modelcontextprotocol',
    homepageUrl: `${REPO}/tree/main/src/time`,
    version: '0.6.0',
    transport: 'STDIO',
    configTemplate: stdioTemplate('@modelcontextprotocol/server-time'),
    configSchema: { type: 'object', properties: {} },
    verified: true,
  },
  {
    slug: 'sequential-thinking',
    name: 'Sequential Thinking',
    description: 'Step-by-step thinking tool that helps the model break down problems.',
    domain: 'AI_AGENTS',
    tags: ['reasoning', 'thinking', 'official', 'reference'],
    author: 'modelcontextprotocol',
    homepageUrl: `${REPO}/tree/main/src/sequentialthinking`,
    version: '0.6.2',
    transport: 'STDIO',
    configTemplate: stdioTemplate('@modelcontextprotocol/server-sequential-thinking'),
    configSchema: { type: 'object', properties: {} },
    featured: true,
    verified: true,
  },
  {
    slug: 'everart',
    name: 'EverArt',
    description: 'Generate images via EverArt API.',
    domain: 'PRODUCTIVITY',
    tags: ['image', 'generation', 'art', 'official', 'reference'],
    author: 'modelcontextprotocol',
    homepageUrl: `${REPO}/tree/main/src/everart`,
    version: '0.6.0',
    transport: 'STDIO',
    configTemplate: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-everart'],
      env: { EVERART_API_KEY: '' },
    },
    configSchema: {
      type: 'object',
      properties: { EVERART_API_KEY: { type: 'string', format: 'password', minLength: 10 } },
      required: ['EVERART_API_KEY'],
    },
    verified: true,
  },
  {
    slug: 'everything',
    name: 'Everything (Reference Test Server)',
    description: 'Reference server demonstrating all MCP features (resources, tools, prompts).',
    domain: 'DEVELOPER_TOOLS',
    tags: ['testing', 'reference', 'official', 'examples'],
    author: 'modelcontextprotocol',
    homepageUrl: `${REPO}/tree/main/src/everything`,
    version: '0.6.2',
    transport: 'STDIO',
    configTemplate: stdioTemplate('@modelcontextprotocol/server-everything'),
    configSchema: { type: 'object', properties: {} },
    verified: true,
  },
  {
    slug: 'sentry',
    name: 'Sentry',
    description: 'Query Sentry issues, events, and project data.',
    domain: 'MONITORING',
    tags: ['monitoring', 'errors', 'sentry', 'official', 'reference'],
    author: 'modelcontextprotocol',
    homepageUrl: `${REPO}/tree/main/src/sentry`,
    version: '0.6.2',
    transport: 'STDIO',
    configTemplate: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-sentry'],
      env: { SENTRY_AUTH_TOKEN: '' },
    },
    configSchema: {
      type: 'object',
      properties: { SENTRY_AUTH_TOKEN: { type: 'string', format: 'password', minLength: 10 } },
      required: ['SENTRY_AUTH_TOKEN'],
    },
    verified: true,
  },
  {
    slug: 'kubernetes',
    name: 'Kubernetes',
    description: 'Inspect and manage Kubernetes clusters via kubectl-equivalent operations.',
    domain: 'DEVOPS',
    tags: ['k8s', 'devops', 'community'],
    author: 'community',
    homepageUrl: 'https://github.com/Flux159/mcp-server-kubernetes',
    version: '2.0.0',
    transport: 'STDIO',
    configTemplate: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', 'mcp-server-kubernetes'],
      env: { KUBECONFIG: '' },
    },
    configSchema: {
      type: 'object',
      properties: { KUBECONFIG: { type: 'string', minLength: 1 } },
      required: ['KUBECONFIG'],
    },
    featured: true,
  },
  {
    slug: 'cloudflare',
    name: 'Cloudflare',
    description: 'Manage Cloudflare Workers, KV, R2 and analytics.',
    domain: 'CLOUD',
    tags: ['cloudflare', 'cdn', 'workers', 'official'],
    author: 'cloudflare',
    homepageUrl: 'https://github.com/cloudflare/mcp-server-cloudflare',
    version: '1.0.0',
    transport: 'STDIO',
    configTemplate: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@cloudflare/mcp-server-cloudflare'],
      env: { CLOUDFLARE_API_TOKEN: '', CLOUDFLARE_ACCOUNT_ID: '' },
    },
    configSchema: {
      type: 'object',
      properties: {
        CLOUDFLARE_API_TOKEN: { type: 'string', format: 'password', minLength: 10 },
        CLOUDFLARE_ACCOUNT_ID: { type: 'string', minLength: 1 },
      },
      required: ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID'],
    },
    verified: true,
  },
];

export async function seedMcpCatalog(prisma: PrismaClient): Promise<void> {
  for (const entry of MCP_CATALOG_SEEDS) {
    await prisma.mcpCatalogEntry.upsert({
      where: { slug: entry.slug },
      create: {
        slug: entry.slug,
        name: entry.name,
        description: entry.description,
        domain: entry.domain,
        tags: entry.tags,
        author: entry.author,
        homepageUrl: entry.homepageUrl,
        iconUrl: entry.iconUrl,
        version: entry.version,
        transport: entry.transport,
        configTemplate: entry.configTemplate as never,
        configSchema: entry.configSchema as never,
        featured: entry.featured ?? false,
        verified: entry.verified ?? false,
      },
      update: {
        name: entry.name,
        description: entry.description,
        domain: entry.domain,
        tags: entry.tags,
        author: entry.author,
        homepageUrl: entry.homepageUrl,
        iconUrl: entry.iconUrl,
        version: entry.version,
        transport: entry.transport,
        configTemplate: entry.configTemplate as never,
        configSchema: entry.configSchema as never,
        featured: entry.featured ?? false,
        verified: entry.verified ?? false,
      },
    });
  }
}
