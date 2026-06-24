import type { PrismaClient } from '../generated/client/index.js';

type ConnectorAuthType = 'oauth' | 'api_key';

type ConnectorSection = 'connectors' | 'git_providers' | 'managed';

type ConnectorPlanTier = 'free' | 'pro' | 'enterprise';

type ApiKeyFieldType = 'text' | 'password';

type ApiKeyField = {
  name: string;
  label: string;
  type: ApiKeyFieldType;
  required: boolean;
  placeholder?: string;
};

type ConnectorCatalogSeed = {
  provider: string;
  displayName: string;
  description: string;
  category: string;
  authType: ConnectorAuthType;
  section: ConnectorSection;
  logoUrl: string;
  authorizeUrl?: string;
  tokenUrl?: string;
  revokeUrl?: string;
  userInfoUrl?: string;
  defaultScopes?: string[];
  availableScopes?: string[];
  apiKeyFields?: ApiKeyField[];
  apiKeyTestEndpoint?: string;
  triggersSupported?: string[];
  triggerDescriptions?: Record<string, string>;
  webhookSupport?: boolean;
  webhookSignatureScheme?: 'slack_v0' | 'stripe_v0' | 'github_hmac_sha256' | 'hmac_sha256_generic';
  minPlanTier?: ConnectorPlanTier;
  forAgentUse?: boolean;
  displayOrder?: number;
  featuredForIdePanel?: boolean;
  enabled?: boolean;
};

// Phase 0 seeds. GitHub is the Phase 1 first OAuth provider end-to-end.
// The four other entries are stubs so the existing Settings tabs
// (Vercel, Supabase, GitLab, Netlify) and the upcoming IDE panel can
// reference a catalog row. Real OAuth credentials and API-key field
// definitions for those four are finalized in phases 2-3.
export const CONNECTOR_CATALOG_SEEDS: ConnectorCatalogSeed[] = [
  {
    provider: 'github',
    displayName: 'GitHub',
    description: 'Access GitHub repositories, users, and organizations from your e-code apps.',
    category: 'dev',
    authType: 'oauth',
    section: 'connectors',
    logoUrl: '/integrations/logos/github.svg',
    authorizeUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    revokeUrl: 'https://api.github.com/applications/{clientId}/grant',
    userInfoUrl: 'https://api.github.com/user',
    defaultScopes: ['read:org', 'read:user', 'read:project', 'repo', 'user:email'],
    availableScopes: [
      'repo',
      'public_repo',
      'read:org',
      'admin:org',
      'read:user',
      'user:email',
      'read:project',
      'workflow',
      'gist',
      'notifications',
      'read:packages',
      'write:packages',
      'admin:repo_hook',
      'admin:org_hook',
    ],
    triggersSupported: [
      'repo_created',
      'repo_updated',
      'repo_deleted',
      'issue_created',
      'issue_updated',
      'issue_deleted',
      'pull_request_created',
      'pull_request_updated',
      'pull_request_deleted',
      'commit_created',
    ],
    triggerDescriptions: {
      repo_created: 'Repo Created',
      repo_updated: 'Repo Updated',
      repo_deleted: 'Repo Deleted',
      issue_created: 'Issue Created',
      issue_updated: 'Issue Updated',
      issue_deleted: 'Issue Deleted',
      pull_request_created: 'Pull Request Created',
      pull_request_updated: 'Pull Request Updated',
      pull_request_deleted: 'Pull Request Deleted',
      commit_created: 'Commit Created',
    },
    webhookSupport: true,
    webhookSignatureScheme: 'github_hmac_sha256',
    minPlanTier: 'pro',
    forAgentUse: true,
    displayOrder: 10,
    featuredForIdePanel: true,
    enabled: true,
  },
  {
    provider: 'vercel',
    displayName: 'Vercel',
    description: 'Manage Vercel deployments, projects, domains, and team settings from your e-code apps.',
    category: 'dev',
    authType: 'api_key',
    section: 'connectors',
    logoUrl: '/integrations/logos/vercel.svg',
    apiKeyFields: [
      {
        name: 'accessToken',
        label: 'Access Token',
        type: 'password',
        required: true,
        placeholder: 'Personal or Team Access Token',
      },
    ],
    apiKeyTestEndpoint: 'https://api.vercel.com/v2/user',
    minPlanTier: 'pro',
    forAgentUse: true,
    displayOrder: 30,
    enabled: true,
  },
  {
    provider: 'supabase',
    displayName: 'Supabase',
    description: 'Access Supabase projects, databases, auth, storage, and edge functions.',
    category: 'data',
    authType: 'api_key',
    section: 'connectors',
    logoUrl: '/integrations/logos/supabase.svg',
    apiKeyFields: [
      {
        name: 'accessToken',
        label: 'Access Token',
        type: 'password',
        required: true,
        placeholder: 'Supabase Management API token',
      },
    ],
    apiKeyTestEndpoint: 'https://api.supabase.com/v1/projects',
    minPlanTier: 'pro',
    forAgentUse: true,
    displayOrder: 40,
    enabled: true,
  },
  {
    provider: 'netlify',
    displayName: 'Netlify',
    description: 'Manage Netlify sites, deployments, environment variables, and edge functions.',
    category: 'dev',
    authType: 'api_key',
    section: 'connectors',
    logoUrl: '/integrations/logos/netlify.svg',
    apiKeyFields: [
      {
        name: 'accessToken',
        label: 'Personal Access Token',
        type: 'password',
        required: true,
      },
    ],
    apiKeyTestEndpoint: 'https://api.netlify.com/api/v1/user',
    minPlanTier: 'pro',
    forAgentUse: true,
    displayOrder: 35,
    enabled: true,
  },
  {
    provider: 'gitlab',
    displayName: 'GitLab',
    description: 'Connect to GitLab to manage projects, issues, merge requests, and pipelines.',
    category: 'dev',
    authType: 'oauth',
    section: 'connectors',
    logoUrl: '/integrations/logos/gitlab.svg',
    authorizeUrl: 'https://gitlab.com/oauth/authorize',
    tokenUrl: 'https://gitlab.com/oauth/token',
    userInfoUrl: 'https://gitlab.com/api/v4/user',
    defaultScopes: ['read_user', 'read_api', 'read_repository', 'write_repository'],
    availableScopes: ['read_user', 'read_api', 'api', 'read_repository', 'write_repository', 'sudo', 'openid', 'profile', 'email'],
    minPlanTier: 'pro',
    forAgentUse: true,
    displayOrder: 20,
    enabled: true,
  },
  {
    provider: 'bitbucket',
    displayName: 'Bitbucket',
    description: 'Connect to Bitbucket to manage repositories, branches and pull requests.',
    category: 'dev',
    authType: 'oauth',
    section: 'connectors',
    logoUrl: '/integrations/logos/bitbucket.svg',
    authorizeUrl: 'https://bitbucket.org/site/oauth2/authorize',
    tokenUrl: 'https://bitbucket.org/site/oauth2/access_token',
    userInfoUrl: 'https://api.bitbucket.org/2.0/user',
    defaultScopes: ['account', 'repository', 'repository:write', 'pullrequest'],
    availableScopes: ['account', 'repository', 'repository:write', 'pullrequest', 'pullrequest:write', 'webhook'],
    minPlanTier: 'pro',
    forAgentUse: true,
    displayOrder: 30,
    enabled: true,
  },
];

// MCP catalog entries that are surfaced inside the new IDE Integrations
// panel as "MCP Servers for e-code Agent". Slugs match the existing
// seed-mcp-catalog entries; the flag only flips on rows that exist.
const MCP_FEATURED_FOR_IDE_PANEL_SLUGS = ['google-maps', 'sentry'];

export async function seedConnectorCatalog(prisma: PrismaClient): Promise<void> {
  for (const entry of CONNECTOR_CATALOG_SEEDS) {
    const baseData = {
      displayName: entry.displayName,
      description: entry.description,
      category: entry.category,
      authType: entry.authType,
      section: entry.section,
      logoUrl: entry.logoUrl,
      defaultClientId: undefined,
      authorizeUrl: entry.authorizeUrl,
      tokenUrl: entry.tokenUrl,
      revokeUrl: entry.revokeUrl,
      userInfoUrl: entry.userInfoUrl,
      defaultScopes: entry.defaultScopes ?? [],
      availableScopes: entry.availableScopes ?? [],
      apiKeyFields: entry.apiKeyFields ? (entry.apiKeyFields as never) : undefined,
      apiKeyTestEndpoint: entry.apiKeyTestEndpoint,
      triggersSupported: entry.triggersSupported ?? [],
      triggerDescriptions: (entry.triggerDescriptions ?? {}) as never,
      webhookSupport: entry.webhookSupport ?? false,
      webhookSignatureScheme: entry.webhookSignatureScheme,
      minPlanTier: entry.minPlanTier ?? 'free',
      forAgentUse: entry.forAgentUse ?? true,
      displayOrder: entry.displayOrder ?? 0,
      featuredForIdePanel: entry.featuredForIdePanel ?? false,
      enabled: entry.enabled ?? true,
    };

    await prisma.connectorCatalog.upsert({
      where: { provider: entry.provider },
      create: {
        provider: entry.provider,
        ...baseData,
      },
      update: baseData,
    });
  }

  for (const slug of MCP_FEATURED_FOR_IDE_PANEL_SLUGS) {
    await prisma.mcpCatalogEntry.updateMany({
      where: { slug },
      data: { featuredForIdePanel: true },
    });
  }
}
