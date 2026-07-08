import { describe, expect, it } from 'vitest';
import { autoApplyAttemptKey, isRiskyAgentPatchPath, shouldAutoApplyPatch } from './agent-auto-apply';

describe('isRiskyAgentPatchPath', () => {
  it('flags dependency manifests at the project root', () => {
    expect(isRiskyAgentPatchPath('package.json')).toBe(true);
    expect(isRiskyAgentPatchPath('package-lock.json')).toBe(true);
    expect(isRiskyAgentPatchPath('pnpm-lock.yaml')).toBe(true);
    expect(isRiskyAgentPatchPath('yarn.lock')).toBe(true);
    expect(isRiskyAgentPatchPath('bun.lockb')).toBe(true);
  });

  it('flags TypeScript configuration', () => {
    expect(isRiskyAgentPatchPath('tsconfig.json')).toBe(true);
    expect(isRiskyAgentPatchPath('jsconfig.json')).toBe(true);
  });

  it('flags Cloudflare worker configuration', () => {
    expect(isRiskyAgentPatchPath('wrangler.toml')).toBe(true);
    expect(isRiskyAgentPatchPath('wrangler.jsonc')).toBe(true);
  });

  it('flags Vite/Tailwind/Next/etc. config files with various extensions', () => {
    expect(isRiskyAgentPatchPath('vite.config.ts')).toBe(true);
    expect(isRiskyAgentPatchPath('vite.config.js')).toBe(true);
    expect(isRiskyAgentPatchPath('vite.config.mts')).toBe(true);
    expect(isRiskyAgentPatchPath('vite.config.cjs')).toBe(true);
    expect(isRiskyAgentPatchPath('tailwind.config.ts')).toBe(true);
    expect(isRiskyAgentPatchPath('postcss.config.js')).toBe(true);
    expect(isRiskyAgentPatchPath('next.config.mjs')).toBe(true);
    expect(isRiskyAgentPatchPath('remix.config.js')).toBe(true);
    expect(isRiskyAgentPatchPath('astro.config.mts')).toBe(true);
    expect(isRiskyAgentPatchPath('svelte.config.js')).toBe(true);
  });

  it('flags every flavour of .env file', () => {
    expect(isRiskyAgentPatchPath('.env')).toBe(true);
    expect(isRiskyAgentPatchPath('.env.local')).toBe(true);
    expect(isRiskyAgentPatchPath('.env.production')).toBe(true);
    expect(isRiskyAgentPatchPath('.env.development.local')).toBe(true);
  });

  it('flags risky files even when nested in a subdirectory', () => {
    expect(isRiskyAgentPatchPath('apps/web/package.json')).toBe(true);
    expect(isRiskyAgentPatchPath('packages/foo/tsconfig.json')).toBe(true);
    expect(isRiskyAgentPatchPath('services/api/.env.local')).toBe(true);
  });

  it('handles Windows-style backslashes and leading ./ or /', () => {
    expect(isRiskyAgentPatchPath('apps\\web\\package.json')).toBe(true);
    expect(isRiskyAgentPatchPath('./package.json')).toBe(true);
    expect(isRiskyAgentPatchPath('/package.json')).toBe(true);
  });

  it('does not flag source files that happen to contain a risky filename in their path', () => {
    expect(isRiskyAgentPatchPath('src/components/PackageJson.tsx')).toBe(false);
    expect(isRiskyAgentPatchPath('src/utils/parseEnv.ts')).toBe(false);
    expect(isRiskyAgentPatchPath('docs/environment.md')).toBe(false);
  });

  it('does not flag arbitrary application code', () => {
    expect(isRiskyAgentPatchPath('app/routes/index.tsx')).toBe(false);
    expect(isRiskyAgentPatchPath('src/server.ts')).toBe(false);
    expect(isRiskyAgentPatchPath('README.md')).toBe(false);
    expect(isRiskyAgentPatchPath('Dockerfile')).toBe(false);
  });

  it('is case-insensitive on basenames', () => {
    expect(isRiskyAgentPatchPath('Package.json')).toBe(true);
    expect(isRiskyAgentPatchPath('apps/Vite.Config.TS')).toBe(true);
  });

  it('returns false for empty / non-string input rather than throwing', () => {
    expect(isRiskyAgentPatchPath('')).toBe(false);
    expect(isRiskyAgentPatchPath(null)).toBe(false);
    expect(isRiskyAgentPatchPath(undefined)).toBe(false);
  });
});

describe('shouldAutoApplyPatch', () => {
  it('approves a pending patch when auto-apply is on, regardless of path', () => {
    expect(shouldAutoApplyPatch({ autoApplyEnabled: true, status: 'pending' })).toBe(true);
  });

  it('keeps a pending patch for review when auto-apply is off (review required)', () => {
    expect(shouldAutoApplyPatch({ autoApplyEnabled: false, status: 'pending' })).toBe(false);
  });

  it('refuses anything other than a pending status', () => {
    for (const status of ['applying', 'accepted', 'rejected', 'failed', 'reverted']) {
      expect(shouldAutoApplyPatch({ autoApplyEnabled: true, status })).toBe(false);
    }
  });
});

describe('autoApplyAttemptKey', () => {
  it('changes when the agent regenerates a new version of the same proposal', () => {
    const first = autoApplyAttemptKey({
      id: 'artifact:file-1',
      updatedAt: '2026-05-14T10:00:00.000Z',
      proposedContent: 'export const value = 1;',
    });
    const second = autoApplyAttemptKey({
      id: 'artifact:file-1',
      updatedAt: '2026-05-14T10:00:01.000Z',
      proposedContent: 'export const value = 100;',
    });

    expect(second).not.toBe(first);
  });

  it('stays stable for the same proposal version so failed attempts do not loop forever', () => {
    const input = {
      id: 'artifact:file-1',
      updatedAt: '2026-05-14T10:00:00.000Z',
      proposedContent: 'export const value = 1;',
    };

    expect(autoApplyAttemptKey(input)).toBe(autoApplyAttemptKey(input));
  });
});
