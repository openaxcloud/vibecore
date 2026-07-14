import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

type CloudBuildStep = {
  id: string;
  waitFor?: string[];
  args?: string[];
};

type CloudBuildConfig = {
  steps: CloudBuildStep[];
};

const runtimeTier = parse(readFileSync('infra/cloudbuild/runtime-tier.yaml', 'utf8')) as CloudBuildConfig;

describe('runtime-tier Cloud Build resource safety', () => {
  it('serializes memory-heavy service image builds on the 8 GB worker', () => {
    const buildChain = [
      ['build-api', 'build-deps'],
      ['build-workspace-manager', 'build-api'],
      ['build-preview-proxy', 'build-workspace-manager'],
      ['build-ai-gateway', 'build-preview-proxy'],
      ['build-worker', 'build-ai-gateway'],
      ['build-screenshotter', 'build-worker'],
    ] as const;

    for (const [stepId, predecessorId] of buildChain) {
      const step = runtimeTier.steps.find(({ id }) => id === stepId);

      expect(step, `${stepId} must remain in runtime-tier.yaml`).toBeDefined();
      expect(step?.waitFor, `${stepId} must wait only for ${predecessorId}`).toEqual([predecessorId]);
    }

    expect(runtimeTier.steps.find(({ id }) => id === 'scan-images')?.waitFor).toEqual(['build-screenshotter']);
  });

  it('primes the cache for every service image in the serialized chain', () => {
    const cacheScript = runtimeTier.steps.find(({ id }) => id === 'prime-cache')?.args?.join('\n') ?? '';

    for (const image of ['api', 'workspace-manager', 'preview-proxy', 'ai-gateway', 'worker', 'screenshotter']) {
      expect(cacheScript, `prime-cache must pull ${image}:latest`).toContain(image);
    }
  });
});
