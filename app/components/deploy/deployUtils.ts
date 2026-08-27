import {
  getDeployRemainingCopy,
  type DeployRemainingCopy,
  type DeployRemainingKey,
} from '~/lib/i18n/catalogs/deploy-remaining';
import { detectUserLanguage } from '~/lib/i18n/language';

const MAX_BUILD_OUTPUT_CHARS = 4000;

export const DEFAULT_DEPLOY_BUILD_COMMAND = 'npm run build';
export const DEFAULT_DEPLOY_OUTPUT_DIRECTORY = 'dist';
export const BOLT_DEPLOY_OUTPUT_DIRECTORIES = ['/dist', '/build', '/out', '/output', '/.next', '/public'];

export type BoltDeployProviderId =
  | 'static'
  | 'vercel'
  | 'netlify'
  | 'github-pages'
  | 'cloudflare-pages'
  | 'google-cloud-run'
  | 'docker';

export interface BoltDeployProvider {
  id: BoltDeployProviderId;
  name: string;
  description: string;
}

const BOLT_DEPLOY_PROVIDER_COPY_KEYS: Readonly<
  Record<BoltDeployProviderId, Readonly<{ name: DeployRemainingKey; descriptionKey: DeployRemainingKey }>>
> = {
  static: {
    name: 'deployRemaining.provider.static.name',
    descriptionKey: 'deployRemaining.provider.static.description',
  },
  vercel: {
    name: 'deployRemaining.provider.vercel.name',
    descriptionKey: 'deployRemaining.provider.vercel.description',
  },
  netlify: {
    name: 'deployRemaining.provider.netlify.name',
    descriptionKey: 'deployRemaining.provider.netlify.description',
  },
  'github-pages': {
    name: 'deployRemaining.provider.githubPages.name',
    descriptionKey: 'deployRemaining.provider.githubPages.description',
  },
  'cloudflare-pages': {
    name: 'deployRemaining.provider.cloudflarePages.name',
    descriptionKey: 'deployRemaining.provider.cloudflarePages.description',
  },
  'google-cloud-run': {
    name: 'deployRemaining.provider.googleCloudRun.name',
    descriptionKey: 'deployRemaining.provider.googleCloudRun.description',
  },
  docker: {
    name: 'deployRemaining.provider.docker.name',
    descriptionKey: 'deployRemaining.provider.docker.description',
  },
};

const BOLT_DEPLOY_PROVIDER_IDS = Object.keys(BOLT_DEPLOY_PROVIDER_COPY_KEYS) as BoltDeployProviderId[];

function createBoltDeployProvider(id: BoltDeployProviderId, copy: DeployRemainingCopy): BoltDeployProvider {
  const keys = BOLT_DEPLOY_PROVIDER_COPY_KEYS[id];

  return { id, name: copy[keys.name], description: copy[keys.descriptionKey] };
}

export function getBoltDeployProviders(language?: string | null): readonly BoltDeployProvider[] {
  const copy = getDeployRemainingCopy(language);

  return BOLT_DEPLOY_PROVIDER_IDS.map((id) => createBoltDeployProvider(id, copy));
}

/**
 * Backward-compatible data for callers that cannot pass a locale yet. Client
 * modules resolve the persisted/browser locale when they load; server callers
 * retain the canonical English default.
 */
export const BOLT_DEPLOY_PROVIDERS: readonly BoltDeployProvider[] = getBoltDeployProviders(detectUserLanguage());

export function formatBuildFailureOutput(output?: string) {
  const trimmed = output?.trim();

  if (!trimmed) {
    return 'Build failed with no output captured.';
  }

  if (trimmed.length <= MAX_BUILD_OUTPUT_CHARS) {
    return trimmed;
  }

  return `Build output (truncated):\n${trimmed.slice(-MAX_BUILD_OUTPUT_CHARS)}`;
}

export function detectFrameworkFromDeployConfig(input: { buildCommand?: string; outputDirectory?: string }) {
  const command = (input.buildCommand ?? DEFAULT_DEPLOY_BUILD_COMMAND).toLowerCase();
  const output = (input.outputDirectory ?? DEFAULT_DEPLOY_OUTPUT_DIRECTORY).toLowerCase();

  if (command.includes('next') || output === '.next') {
    return 'nextjs';
  }

  if (command.includes('astro')) {
    return 'astro';
  }

  if (command.includes('remix')) {
    return 'remix';
  }

  if (command.includes('nuxt')) {
    return 'nuxt';
  }

  if (command.includes('vite') || output === 'dist') {
    return 'vite';
  }

  return 'static';
}
