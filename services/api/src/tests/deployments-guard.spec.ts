import { describe, expect, it } from 'vitest';
import {
  assertDeploymentProviderConfigured,
  assertDeploymentRequestAllowed,
  deployProviderConfigError,
  providerHasAuthoritativePlanEdge,
  providerSupportedPublishRegions,
} from '../deployments.js';

const baseRequest = {
  provider: 'static' as const,
  environment: 'preview' as const,
  buildCommand: 'npm run build',
  outputDirectory: 'dist',
  framework: undefined,
  branch: undefined,
  commitSha: undefined,
  customDomain: undefined,
  previewDeployment: true,
  timeoutSeconds: 600,
  artifactSizeLimitMb: 250,
  envVars: {},
  injectSecrets: [],
  runtimeKind: 'autoscale' as const,
  removeBrandingBadge: false,
  githubIntegration: undefined,
};

describe('assertDeploymentProviderConfigured', () => {
  it('allows static provider in any environment', () => {
    expect(() => assertDeploymentProviderConfigured('static', { NODE_ENV: 'production' })).not.toThrow();
  });

  it('allows non-production builds without provider env (dev convenience)', () => {
    expect(() => assertDeploymentProviderConfigured('vercel', { NODE_ENV: 'test' })).not.toThrow();
  });

  it('refuses production deployments to providers with missing env', () => {
    expect(() => assertDeploymentProviderConfigured('vercel', { NODE_ENV: 'production' })).toThrow(
      /not configured for production/,
    );
  });

  it('does not allow DEPLOYMENTS_ALLOW_STUBS to bypass production provider requirements', () => {
    expect(() =>
      assertDeploymentProviderConfigured('vercel', { NODE_ENV: 'production', DEPLOYMENTS_ALLOW_STUBS: '1' }),
    ).toThrow(/not configured for production/);
  });

  it('allows production deployments only when real dispatch env is configured', () => {
    expect(() =>
      assertDeploymentProviderConfigured('vercel', {
        NODE_ENV: 'production',
        VERCEL_DEPLOY_HOOK_URL: 'https://api.vercel.com/v1/integrations/deploy/hook',
      }),
    ).not.toThrow();
    expect(() =>
      assertDeploymentProviderConfigured('cloudflare-pages', {
        NODE_ENV: 'production',
        CLOUDFLARE_DEPLOY_HOOK_URL: 'https://api.cloudflare.com/client/v4/pages/projects/x/deployments/hook',
      }),
    ).not.toThrow();
  });

  it('rejects production deployments when only rollback/API tokens are configured but dispatch hook env is missing', () => {
    expect(() =>
      assertDeploymentProviderConfigured('vercel', { NODE_ENV: 'production', VERCEL_API_TOKEN: 'token' }),
    ).toThrow(/not configured for production/);
    expect(() =>
      assertDeploymentProviderConfigured('google-cloud-run', {
        NODE_ENV: 'production',
        GCP_PROJECT_ID: 'project',
        GOOGLE_APPLICATION_CREDENTIALS: '/var/run/secrets/gcp.json',
      }),
    ).toThrow(/not configured for production/);
  });

  it('reports missing env keys in the error details', () => {
    try {
      assertDeploymentProviderConfigured('cloudflare-pages', { NODE_ENV: 'production' });
      throw new Error('should have thrown');
    } catch (error: any) {
      expect(error.code).toBe('DEPLOYMENT_PROVIDER_NOT_CONFIGURED');
      expect(error.details.missingEnv).toContain('CLOUDFLARE_DEPLOY_HOOK_URL');
    }
  });
});

describe('assertDeploymentRequestAllowed', () => {
  it('blocks dangerous build commands regardless of env', () => {
    expect(() =>
      assertDeploymentRequestAllowed({ ...baseRequest, buildCommand: 'docker run --privileged' }, 'enterprise', {
        NODE_ENV: 'test',
      }),
    ).toThrow(/not allowed/);
  });

  it('refuses docker provider for non-enterprise plans', () => {
    expect(() =>
      assertDeploymentRequestAllowed({ ...baseRequest, provider: 'docker' }, 'pro', { NODE_ENV: 'test' }),
    ).toThrow(/Enterprise plan/);
  });
});

describe('deployProviderConfigError', () => {
  it('never blocks the in-process static provider', () => {
    expect(deployProviderConfigError('static', {})).toBeNull();
  });

  it('reports an actionable error when a hook provider has no env configured', () => {
    const result = deployProviderConfigError('vercel', {});
    expect(result).toEqual({
      error: 'PROVIDER_NOT_CONFIGURED',
      message: expect.stringContaining('VERCEL_DEPLOY_HOOK_URL'),
    });
    expect(result?.message).toMatch(/Vercel/);
  });

  it('lists every missing variable for multi-secret providers', () => {
    const result = deployProviderConfigError('github-pages', {});
    expect(result?.error).toBe('PROVIDER_NOT_CONFIGURED');
    expect(result?.message).toContain('GITHUB_DEPLOY_TOKEN');
    expect(result?.message).toContain('GITHUB_PAGES_REPO');
    expect(result?.message).toContain('GITHUB_PAGES_WORKFLOW');
  });

  it('passes once the provider hook env is present', () => {
    expect(deployProviderConfigError('vercel', { VERCEL_DEPLOY_HOOK_URL: 'https://hook.example' })).toBeNull();
  });
});

describe('plan-authoritative provider edge', () => {
  it('allows only platform-served providers until external adapters attest badge and traffic policy', () => {
    expect(providerHasAuthoritativePlanEdge('static')).toBe(true);
    expect(providerHasAuthoritativePlanEdge('server')).toBe(true);
    for (const provider of [
      'vercel',
      'netlify',
      'github-pages',
      'cloudflare-pages',
      'google-cloud-run',
      'docker',
    ] as const) {
      expect(providerHasAuthoritativePlanEdge(provider), provider).toBe(false);
    }
  });

  it('does not advertise server regions that the scheduler cannot prove', () => {
    expect(
      providerSupportedPublishRegions('server', {
        SERVER_DEPLOY_SUPPORTED_REGIONS: 'eu-west-1,us-east-1',
      }),
    ).toEqual(['platform-default']);
  });
});
