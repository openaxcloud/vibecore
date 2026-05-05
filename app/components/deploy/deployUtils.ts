const MAX_BUILD_OUTPUT_CHARS = 4000;

export const DEFAULT_DEPLOY_BUILD_COMMAND = 'npm run build';
export const DEFAULT_DEPLOY_OUTPUT_DIRECTORY = 'dist';
export const BOLT_DEPLOY_OUTPUT_DIRECTORIES = ['/dist', '/build', '/out', '/output', '/.next', '/public'];

export const BOLT_DEPLOY_PROVIDERS = [
  { id: 'static', name: 'Static export', description: 'Create an immutable static artifact.' },
  { id: 'vercel', name: 'Vercel', description: 'Reuse the existing Bolt Vercel deployment path.' },
  { id: 'netlify', name: 'Netlify', description: 'Reuse the existing Bolt Netlify deployment path.' },
  { id: 'github-pages', name: 'GitHub Pages', description: 'Publish static output through GitHub integration.' },
  { id: 'cloudflare-pages', name: 'Cloudflare Pages', description: 'Deploy static output to Cloudflare Pages.' },
  { id: 'google-cloud-run', name: 'Google Cloud Run', description: 'Build an isolated user app service.' },
  { id: 'docker', name: 'Custom Dockerfile', description: 'Enterprise-only isolated builder.' },
] as const;

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
