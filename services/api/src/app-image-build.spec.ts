import { describe, expect, it, vi } from 'vitest';

import { buildAppImageDockerfile, runAppImageBuild, type AppImageBuildSpec } from './app-image-build.js';

const SPEC: AppImageBuildSpec = {
  gcpProject: 'vibecore-495216',
  region: 'europe-west9',
  sourceBucket: 'vc-proj1',
  sourceObject: 'tmp/server-deploy/dep1-context.tgz',
  imageUri: 'europe-west9-docker.pkg.dev/vibecore-495216/vibecore-prod-apps/p-proj1:dep1',
  baseImage: 'europe-west9-docker.pkg.dev/vibecore-495216/vibecore-prod-containers/workspace-agent:sha-abc',
  buildCommand: 'npm run build',
  startCommand: 'node server.js',
};

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe('buildAppImageDockerfile', () => {
  it('is fully generic: base image + COPY + optional RUN build + CMD start — no language anywhere', () => {
    const dockerfile = buildAppImageDockerfile({
      baseImage: 'registry/base:tag',
      buildCommand: 'npm run build',
      startCommand: 'node server.js',
    });

    expect(dockerfile).toBe(
      [
        'FROM registry/base:tag',
        'COPY --chown=1000:1000 . /home/project',
        'WORKDIR /home/project',
        'ENV ECODE_DEPLOYMENT=1',
        'RUN npm run build',
        'CMD ["sh", "-lc", "node server.js"]',
        '',
      ].join('\n'),
    );
  });

  it('omits the RUN line when there is no build command', () => {
    const dockerfile = buildAppImageDockerfile({
      baseImage: 'registry/base:tag',
      buildCommand: null,
      startCommand: 'python app.py',
    });

    expect(dockerfile).not.toContain('RUN ');
    expect(dockerfile).toContain('CMD ["sh", "-lc", "python app.py"]');
  });
});

describe('runAppImageBuild', () => {
  it('creates a regional build from the GCS context, polls to SUCCESS, and reports the image size', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    let polls = 0;
    const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      calls.push({ url: u, init });

      if (u.endsWith('/builds') && init?.method === 'POST') {
        return jsonResponse({ metadata: { build: { id: 'build-1', logUrl: 'https://logs' } } });
      }

      if (u.endsWith('/builds/build-1')) {
        polls += 1;

        return polls < 2
          ? jsonResponse({ status: 'WORKING' })
          : jsonResponse({
              status: 'SUCCESS',
              results: { images: [{ name: SPEC.imageUri, digest: 'sha256:beef' }] },
            });
      }

      if (u.startsWith('https://artifactregistry.googleapis.com/')) {
        return jsonResponse({ imageSizeBytes: '123456789' });
      }

      throw new Error(`unexpected fetch ${u}`);
    }) as unknown as typeof fetch;

    const result = await runAppImageBuild(SPEC, {
      fetchImpl,
      getAccessToken: async () => 'tok',
      sleep: async () => undefined,
      pollIntervalMs: 1,
    });

    expect(result).toMatchObject({
      ok: true,
      imageUri: SPEC.imageUri,
      digest: 'sha256:beef',
      imageSizeBytes: 123456789,
      buildId: 'build-1',
    });

    // Regional endpoint + storageSource context + pinned image + generated Dockerfile step.
    const create = calls.find((c) => c.init?.method === 'POST');
    expect(create?.url).toBe('https://cloudbuild.googleapis.com/v1/projects/vibecore-495216/locations/europe-west9/builds');

    const body = JSON.parse(String(create?.init?.body));
    expect(body.source.storageSource).toEqual({ bucket: 'vc-proj1', object: 'tmp/server-deploy/dep1-context.tgz' });
    expect(body.images).toEqual([SPEC.imageUri]);
    expect(body.steps[0].name).toBe('gcr.io/cloud-builders/docker');

    const script = body.steps[0].args[1] as string;
    expect(script).toContain('base64 -d > .ecode-app.Dockerfile');
    expect(script).toContain(`docker build -f .ecode-app.Dockerfile -t '${SPEC.imageUri}' .`);

    // The AR size lookup targets the digest resource under the right repo.
    const ar = calls.find((c) => c.url.startsWith('https://artifactregistry.googleapis.com/'));
    expect(ar?.url).toContain('/repositories/vibecore-prod-apps/dockerImages/');
    expect(ar?.url).toContain(encodeURIComponent('p-proj1@sha256:beef'));
  });

  it('maps a FAILURE to ok:false with the log URL', async () => {
    const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
      if (String(url).endsWith('/builds') && init?.method === 'POST') {
        return jsonResponse({ metadata: { build: { id: 'build-2', logUrl: 'https://logs/2' } } });
      }

      return jsonResponse({ status: 'FAILURE', logUrl: 'https://logs/2' });
    }) as unknown as typeof fetch;

    const result = await runAppImageBuild(SPEC, {
      fetchImpl,
      getAccessToken: async () => 'tok',
      sleep: async () => undefined,
      pollIntervalMs: 1,
    });

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.error).toContain('FAILURE');
      expect(result.error).toContain('https://logs/2');
      expect(result.buildId).toBe('build-2');
    }
  });

  it('fails cleanly when auth or create is unavailable (never throws)', async () => {
    const noAuth = await runAppImageBuild(SPEC, {
      fetchImpl: vi.fn() as unknown as typeof fetch,
      getAccessToken: async () => {
        throw new Error('no metadata server');
      },
    });
    expect(noAuth.ok).toBe(false);

    if (!noAuth.ok) {
      expect(noAuth.error).toContain('no metadata server');
    }

    const createFails = await runAppImageBuild(SPEC, {
      fetchImpl: vi.fn(async () => jsonResponse({ error: 'denied' }, 403)) as unknown as typeof fetch,
      getAccessToken: async () => 'tok',
      sleep: async () => undefined,
    });
    expect(createFails.ok).toBe(false);

    if (!createFails.ok) {
      expect(createFails.error).toContain('403');
    }
  });

  it('a lost build (never terminal) fails at the deadline instead of hanging', async () => {
    let now = 0;
    const realDateNow = Date.now;
    Date.now = () => now;

    try {
      const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
        if (String(url).endsWith('/builds') && init?.method === 'POST') {
          return jsonResponse({ metadata: { build: { id: 'build-3' } } });
        }

        return jsonResponse({ status: 'WORKING' });
      }) as unknown as typeof fetch;

      const result = await runAppImageBuild(
        { ...SPEC, timeoutSeconds: 1 },
        {
          fetchImpl,
          getAccessToken: async () => 'tok',
          sleep: async () => {
            now += 60_000;
          },
          pollIntervalMs: 1,
        },
      );

      expect(result.ok).toBe(false);

      if (!result.ok) {
        expect(result.error).toContain('WORKING');
      }
    } finally {
      Date.now = realDateNow;
    }
  });
});
