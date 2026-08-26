import { describe, expect, it, vi } from 'vitest';

import { buildAppImageDockerfile, runAppImageBuild, type AppImageBuildSpec } from './app-image-build.js';

const SPEC: AppImageBuildSpec = {
  gcpProject: 'vibecore-495216',
  region: 'europe-west9',
  sourceBucket: 'vc-proj1',
  sourceObject: 'tmp/server-deploy/dep1-context.tgz',
  imageUri: 'europe-west9-docker.pkg.dev/vibecore-495216/vibecore-prod-apps/p-proj1:dep1',
  cosignKmsKey:
    'gcpkms://projects/vibecore-495216/locations/europe-west9/keyRings/ecode-supply-chain/cryptoKeys/cosign-images',
  buildServiceAccount:
    'projects/vibecore-495216/serviceAccounts/vibecore-prod-app-builder@vibecore-495216.iam.gserviceaccount.com',
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
    expect(create?.url).toBe(
      'https://cloudbuild.googleapis.com/v1/projects/vibecore-495216/locations/europe-west9/builds',
    );

    const body = JSON.parse(String(create?.init?.body));
    expect(body.source.storageSource).toEqual({ bucket: 'vc-proj1', object: 'tmp/server-deploy/dep1-context.tgz' });
    expect(body.images).toEqual([SPEC.imageUri]);
    expect(body.serviceAccount).toBe(SPEC.buildServiceAccount);
    expect(body.steps[0].name).toBe('gcr.io/cloud-builders/docker');
    expect(body.options.requestedVerifyOption).toBe('VERIFIED');
    expect(body.steps.map((step: { id: string }) => step.id)).toEqual([
      'build-image',
      'push-image',
      'extract-supply-chain-tools',
      'generate-sbom',
      'sign-image',
      'attest-sbom',
      'verify-supply-chain',
    ]);

    const pushScript = body.steps[1].args[1] as string;
    expect(pushScript).toContain('docker image inspect');
    expect(pushScript).toContain('/workspace/ecode-image-ref.txt');

    const extractionArgs = body.steps[2].args as string[];
    expect(extractionArgs).toContain(
      'ghcr.io/sigstore/cosign/cosign:v3.1.2@sha256:d91bc4e7e95e8d2f549c747a72dc174f90579e410a1695f57f686674f84ce849',
    );
    expect(extractionArgs).toContain(
      'docker.io/anchore/syft:v1.30.0@sha256:bd5357d2cd087f03af748dac24df48bfbc1723080d78f75f69aca1f2d429060e',
    );
    expect(extractionArgs[1]).toContain('signing-config create --out /workspace/ecode-signing-config.json');

    const sbomScript = body.steps[3].args[1] as string;
    const signScript = body.steps[4].args[1] as string;
    const attestScript = body.steps[5].args[1] as string;
    const verifyScript = body.steps[6].args[1] as string;
    expect(sbomScript).toContain('docker:${DIGEST_REF}');
    expect(signScript).toContain('COSIGN_EXPERIMENTAL=1');
    expect(signScript).toContain('--signing-config /workspace/ecode-signing-config.json');
    expect(signScript).toContain('--registry-referrers-mode=oci-1-1 "$DIGEST_REF"');
    expect(signScript).not.toContain('--tlog-upload');
    expect(attestScript).toContain('COSIGN_EXPERIMENTAL=1');
    expect(attestScript).toContain('--signing-config /workspace/ecode-signing-config.json');
    expect(attestScript).toContain('--type spdxjson');
    expect(attestScript).toContain('"$DIGEST_REF"');
    expect(attestScript).not.toContain('attach sbom');
    expect(verifyScript).toContain('verify-attestation');
    expect([sbomScript, signScript, attestScript, verifyScript].every((value) => value.includes('image-ref.txt'))).toBe(
      true,
    );

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

  it('fails before Cloud Build when the KMS signer or dedicated builder identity is missing/cross-project', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;

    const result = await runAppImageBuild(
      {
        ...SPEC,
        cosignKmsKey:
          'gcpkms://projects/other-project/locations/europe-west9/keyRings/ecode-supply-chain/cryptoKeys/cosign-images',
      },
      { fetchImpl, getAccessToken: async () => 'unused' },
    );

    expect(result).toMatchObject({ ok: false });
    expect(fetchImpl).not.toHaveBeenCalled();

    const implicitBuilder = await runAppImageBuild(
      { ...SPEC, buildServiceAccount: '' },
      { fetchImpl, getAccessToken: async () => 'unused' },
    );
    expect(implicitBuilder).toMatchObject({ ok: false });
    expect(fetchImpl).not.toHaveBeenCalled();

    const crossProjectBuilder = await runAppImageBuild(
      {
        ...SPEC,
        buildServiceAccount:
          'projects/other-project/serviceAccounts/vibecore-prod-app-builder@other-project.iam.gserviceaccount.com',
      },
      { fetchImpl, getAccessToken: async () => 'unused' },
    );
    expect(crossProjectBuilder).toMatchObject({ ok: false });
    expect(fetchImpl).not.toHaveBeenCalled();
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
