import type { PrismaClient } from '../generated/client/index.js';
import rawConnectorCopy from './seed-connector-catalog.copy.json' with { type: 'json' };

export const CONNECTOR_CATALOG_LOCALES = ['en', 'fr'] as const;
export type ConnectorCatalogLocale = (typeof CONNECTOR_CATALOG_LOCALES)[number];

type ConnectorAuthType = 'oauth' | 'api_key';
type ConnectorSection = 'connectors' | 'git_providers' | 'managed';
type ConnectorPlanTier = 'free' | 'pro' | 'enterprise';
type ApiKeyFieldType = 'text' | 'password';

export type ApiKeyField = {
  name: string;
  label: string;
  type: ApiKeyFieldType;
  required: boolean;
  placeholder?: string;
};

export type ConnectorCatalogSeed = {
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

type ApiKeyFieldSeed = Omit<ApiKeyField, 'label' | 'placeholder'>;
type ConnectorCatalogSeedCore = Omit<
  ConnectorCatalogSeed,
  'apiKeyFields' | 'description' | 'displayName' | 'triggerDescriptions'
> & {
  apiKeyFields?: ApiKeyFieldSeed[];
};
type ConnectorCopy = Readonly<{
  displayName: string;
  description: string;
  apiKeyFields?: Readonly<Record<string, Readonly<{ label: string; placeholder?: string }>>>;
  triggerDescriptions?: Readonly<Record<string, string>>;
}>;

const DEFAULT_LOCALE: ConnectorCatalogLocale = 'en';

const CONNECTOR_COPY = rawConnectorCopy as Readonly<
  Record<ConnectorCatalogLocale, Readonly<Record<string, ConnectorCopy>>>
>;

const CONNECTOR_CATALOG_SEED_CORES = Object.freeze([
  {
    provider: 'github',
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
    category: 'dev',
    authType: 'api_key',
    section: 'connectors',
    logoUrl: '/integrations/logos/vercel.svg',
    apiKeyFields: [{ name: 'accessToken', type: 'password', required: true }],
    apiKeyTestEndpoint: 'https://api.vercel.com/v2/user',
    minPlanTier: 'pro',
    forAgentUse: true,
    displayOrder: 30,
    enabled: true,
  },
  {
    provider: 'figma',
    category: 'design',
    authType: 'api_key',
    section: 'connectors',
    logoUrl: '/integrations/logos/figma.svg',
    apiKeyFields: [{ name: 'accessToken', type: 'password', required: true }],
    apiKeyTestEndpoint: 'https://api.figma.com/v1/me',
    minPlanTier: 'pro',
    forAgentUse: true,
    displayOrder: 32,
    enabled: true,
  },
  {
    provider: 'claude',
    category: 'ai',
    authType: 'api_key',
    section: 'connectors',
    logoUrl: '/icons/Anthropic.svg',
    apiKeyFields: [{ name: 'accessToken', type: 'password', required: true }],
    apiKeyTestEndpoint: 'https://api.anthropic.com/v1/models?limit=1',
    minPlanTier: 'pro',
    forAgentUse: true,
    displayOrder: 34,
    enabled: true,
  },
  {
    provider: 'supabase',
    category: 'data',
    authType: 'api_key',
    section: 'connectors',
    logoUrl: '/integrations/logos/supabase.svg',
    apiKeyFields: [{ name: 'accessToken', type: 'password', required: true }],
    apiKeyTestEndpoint: 'https://api.supabase.com/v1/projects',
    minPlanTier: 'pro',
    forAgentUse: true,
    displayOrder: 40,
    enabled: true,
  },
  {
    provider: 'netlify',
    category: 'dev',
    authType: 'api_key',
    section: 'connectors',
    logoUrl: '/integrations/logos/netlify.svg',
    apiKeyFields: [{ name: 'accessToken', type: 'password', required: true }],
    apiKeyTestEndpoint: 'https://api.netlify.com/api/v1/user',
    minPlanTier: 'pro',
    forAgentUse: true,
    displayOrder: 35,
    enabled: true,
  },
  {
    provider: 'gitlab',
    category: 'dev',
    authType: 'oauth',
    section: 'connectors',
    logoUrl: '/integrations/logos/gitlab.svg',
    authorizeUrl: 'https://gitlab.com/oauth/authorize',
    tokenUrl: 'https://gitlab.com/oauth/token',
    userInfoUrl: 'https://gitlab.com/api/v4/user',
    defaultScopes: ['read_user', 'read_api', 'read_repository', 'write_repository'],
    availableScopes: [
      'read_user',
      'read_api',
      'api',
      'read_repository',
      'write_repository',
      'sudo',
      'openid',
      'profile',
      'email',
    ],
    minPlanTier: 'pro',
    forAgentUse: true,
    displayOrder: 20,
    enabled: true,
  },
  {
    provider: 'bitbucket',
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
] satisfies readonly ConnectorCatalogSeedCore[]);

export function normalizeConnectorCatalogLocale(locale?: string | null): ConnectorCatalogLocale {
  return locale?.trim().toLowerCase().split(/[-_]/)[0] === 'fr' ? 'fr' : DEFAULT_LOCALE;
}

function buildConnectorCatalogSeeds(locale: ConnectorCatalogLocale): readonly ConnectorCatalogSeed[] {
  return Object.freeze(
    CONNECTOR_CATALOG_SEED_CORES.map((seed) => {
      const copy = CONNECTOR_COPY[locale][seed.provider] ?? CONNECTOR_COPY.en[seed.provider];
      const { apiKeyFields: apiKeyFieldSeeds, ...seedWithoutApiKeyFields } = seed;

      if (!copy) {
        throw new Error(`Missing connector catalog copy: ${seed.provider}`);
      }

      const apiKeyFields = apiKeyFieldSeeds?.map((field) => {
        const fieldCopy =
          copy.apiKeyFields?.[field.name] ?? CONNECTOR_COPY.en[seed.provider]?.apiKeyFields?.[field.name];

        if (!fieldCopy) {
          throw new Error(`Missing connector API key field copy: ${seed.provider}.${field.name}`);
        }

        return Object.freeze({ ...field, ...fieldCopy });
      });

      return Object.freeze({
        ...seedWithoutApiKeyFields,
        displayName: copy.displayName,
        description: copy.description,
        ...(apiKeyFields ? { apiKeyFields } : {}),
        ...(copy.triggerDescriptions ? { triggerDescriptions: { ...copy.triggerDescriptions } } : {}),
      });
    }),
  );
}

const CONNECTOR_SEEDS_BY_LOCALE = Object.freeze({
  en: buildConnectorCatalogSeeds('en'),
  fr: buildConnectorCatalogSeeds('fr'),
}) satisfies Readonly<Record<ConnectorCatalogLocale, readonly ConnectorCatalogSeed[]>>;

/** English is persisted because the current Prisma schema stores one canonical string per field. */
export const CONNECTOR_CATALOG_SEEDS = CONNECTOR_SEEDS_BY_LOCALE.en;

/** Localized API projection that leaves provider ids, scopes, URLs, and field names unchanged. */
export function getConnectorCatalogSeeds(locale?: string | null): readonly ConnectorCatalogSeed[] {
  return CONNECTOR_SEEDS_BY_LOCALE[normalizeConnectorCatalogLocale(locale)];
}

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
      create: { provider: entry.provider, ...baseData },
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
