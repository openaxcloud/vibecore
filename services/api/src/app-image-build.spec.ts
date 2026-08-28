import { describe, expect, it, vi } from 'vitest';

import {
  appImageBuildOperationTag,
  buildAppImageDockerfile,
  cancelAppImageBuildAndWait,
  runAppImageBuild,
  type AppImageBuildSpec,
  type DurableAppImageBuildLifecycle,
  type DurableAppImageBuildState,
} from './app-image-build.js';

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

function durableBuild(operationId: string, buildId: string, status: string, extra: Record<string, unknown> = {}) {
  return {
    id: buildId,
    status,
    tags: [appImageBuildOperationTag(operationId)],
    serviceAccount: SPEC.buildServiceAccount,
    source: { storageSource: { bucket: SPEC.sourceBucket, object: SPEC.sourceObject } },
    images: [SPEC.imageUri],
    ...extra,
  };
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

  it('recovers a crash after submit without a second POST and persists the build id before polling', async () => {
    const operationId = 'deploy-operation-crash-after-submit';

    let state: DurableAppImageBuildState = { phase: 'PREPARED' };
    let crashOnIdentityPersist = true;
    let persistenceCallbackActive = false;
    let postCount = 0;

    const events: string[] = [];

    const persisted = async <T>(operation: () => T | Promise<T>): Promise<T> => {
      persistenceCallbackActive = true;

      try {
        return await operation();
      } finally {
        persistenceCallbackActive = false;
      }
    };

    const lifecycle: DurableAppImageBuildLifecycle = {
      operationId,
      assertAuthority: async () => undefined,
      readState: async () => persisted(() => state),
      markSubmissionStarted: async () =>
        persisted(() => {
          state = { phase: 'SUBMITTING' };
          events.push('db:submitting');
        }),
      recordBuildIdentity: async ({ buildId, logUrl }) =>
        persisted(() => {
          events.push('db:build-id');

          if (crashOnIdentityPersist) {
            throw new Error('simulated process crash at durable build-id callback');
          }

          state = { phase: 'IDENTIFIED', buildId, ...(logUrl ? { logUrl } : {}) };
        }),
      recordSubmissionRejected: async () => undefined,
      recordTerminal: async ({ buildId, providerStatus, logUrl }) =>
        persisted(() => {
          state = { phase: 'TERMINAL', buildId, providerStatus, ...(logUrl ? { logUrl } : {}) };
          events.push('db:terminal');
        }),
    };

    const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
      expect(persistenceCallbackActive).toBe(false);

      const value = String(url);

      if (value.endsWith('/builds') && init?.method === 'POST') {
        postCount += 1;
        events.push('provider:post');

        return jsonResponse({ metadata: { build: { id: 'build-crash', logUrl: 'https://logs/crash' } } });
      }

      if (value.includes('/builds?filter=')) {
        events.push('provider:reconcile');
        return jsonResponse({ builds: [durableBuild(operationId, 'build-crash', 'WORKING')] });
      }

      if (value.endsWith('/builds/build-crash')) {
        events.push('provider:poll');
        return jsonResponse(durableBuild(operationId, 'build-crash', 'SUCCESS'));
      }

      throw new Error(`unexpected fetch ${value}`);
    }) as unknown as typeof fetch;

    await expect(
      runAppImageBuild(SPEC, {
        fetchImpl,
        getAccessToken: async () => 'tok',
        sleep: async () => undefined,
        pollIntervalMs: 0,
        lifecycle,
      }),
    ).rejects.toThrow('simulated process crash');
    expect(events).toEqual(['db:submitting', 'provider:post', 'db:build-id']);

    crashOnIdentityPersist = false;

    const recovered = await runAppImageBuild(SPEC, {
      fetchImpl,
      getAccessToken: async () => 'tok',
      sleep: async () => undefined,
      pollIntervalMs: 0,
      submissionReconcileAttempts: 1,
      lifecycle,
    });

    expect(recovered).toMatchObject({ ok: true, buildId: 'build-crash' });
    expect(postCount).toBe(1);
    expect(events.indexOf('db:build-id')).toBeLessThan(events.indexOf('provider:poll'));
    expect(state).toMatchObject({ phase: 'TERMINAL', buildId: 'build-crash', providerStatus: 'SUCCESS' });
  });

  it('reconciles a lost create response by durable tag and never duplicates the provider build', async () => {
    const operationId = 'deploy-operation-response-loss';

    let state: DurableAppImageBuildState = { phase: 'PREPARED' };
    let providerBuildVisible = false;
    let postCount = 0;

    const lifecycle: DurableAppImageBuildLifecycle = {
      operationId,
      assertAuthority: async () => undefined,
      readState: async () => state,
      markSubmissionStarted: async () => {
        state = { phase: 'SUBMITTING' };
      },
      recordBuildIdentity: async ({ buildId, logUrl }) => {
        state = { phase: 'IDENTIFIED', buildId, ...(logUrl ? { logUrl } : {}) };
      },
      recordSubmissionRejected: async () => undefined,
      recordTerminal: async ({ buildId, providerStatus, logUrl }) => {
        state = { phase: 'TERMINAL', buildId, providerStatus, ...(logUrl ? { logUrl } : {}) };
      },
    };

    const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const value = String(url);

      if (value.endsWith('/builds') && init?.method === 'POST') {
        postCount += 1;
        providerBuildVisible = true;

        const body = JSON.parse(String(init.body)) as { tags?: string[] };
        expect(body.tags).toContain(appImageBuildOperationTag(operationId));
        throw new Error('socket reset after Google accepted the build');
      }

      if (value.includes('/builds?filter=')) {
        return jsonResponse({
          builds: providerBuildVisible ? [durableBuild(operationId, 'build-response-loss', 'QUEUED')] : [],
        });
      }

      if (value.endsWith('/builds/build-response-loss')) {
        return jsonResponse(durableBuild(operationId, 'build-response-loss', 'SUCCESS'));
      }

      throw new Error(`unexpected fetch ${value}`);
    }) as unknown as typeof fetch;

    const result = await runAppImageBuild(SPEC, {
      fetchImpl,
      getAccessToken: async () => 'tok',
      sleep: async () => undefined,
      pollIntervalMs: 0,
      submissionReconcileAttempts: 1,
      lifecycle,
    });

    expect(result).toMatchObject({ ok: true, buildId: 'build-response-loss' });
    expect(postCount).toBe(1);
    expect(state).toMatchObject({ phase: 'TERMINAL', buildId: 'build-response-loss' });
  });

  it('treats transient create HTTP responses as ambiguous and reconciles instead of recording a false rejection', async () => {
    const operationId = 'deploy-operation-create-503';
    let state: DurableAppImageBuildState = { phase: 'PREPARED' };
    let postCount = 0;
    const recordSubmissionRejected = vi.fn();
    const lifecycle: DurableAppImageBuildLifecycle = {
      operationId,
      assertAuthority: async () => undefined,
      readState: async () => state,
      markSubmissionStarted: async () => {
        state = { phase: 'SUBMITTING' };
      },
      recordBuildIdentity: async ({ buildId }) => {
        state = { phase: 'IDENTIFIED', buildId };
      },
      recordSubmissionRejected,
      recordTerminal: async ({ buildId, providerStatus }) => {
        state = { phase: 'TERMINAL', buildId, providerStatus };
      },
    };
    const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const value = String(url);
      if (value.endsWith('/builds') && init?.method === 'POST') {
        postCount += 1;
        return new Response('upstream response lost', { status: 503 });
      }
      if (value.includes('/builds?filter=')) {
        return jsonResponse({ builds: [durableBuild(operationId, 'build-after-503', 'WORKING')] });
      }
      if (value.endsWith('/builds/build-after-503')) {
        return jsonResponse(durableBuild(operationId, 'build-after-503', 'SUCCESS'));
      }
      throw new Error(`unexpected fetch ${value}`);
    }) as unknown as typeof fetch;

    await expect(
      runAppImageBuild(SPEC, {
        fetchImpl,
        getAccessToken: async () => 'tok',
        sleep: async () => undefined,
        pollIntervalMs: 0,
        submissionReconcileAttempts: 1,
        lifecycle,
      }),
    ).resolves.toMatchObject({ ok: true, buildId: 'build-after-503' });
    expect(postCount).toBe(1);
    expect(recordSubmissionRejected).not.toHaveBeenCalled();
    expect(state).toMatchObject({ phase: 'TERMINAL', buildId: 'build-after-503' });
  });

  it('lets a fresh fence reclaim cancellation and proves the provider terminal before registry erasure', async () => {
    const operationId = 'deploy-operation-cancel-reclaim';

    let providerStatus = 'WORKING';
    let firstOwnerValid = true;
    let cancelPostCount = 0;

    const persistedProofs: unknown[] = [];

    const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const value = String(url);

      if (value.endsWith('/builds/build-cancel')) {
        return jsonResponse(
          durableBuild(operationId, 'build-cancel', providerStatus, { logUrl: 'https://logs/cancel' }),
        );
      }

      if (value.endsWith('/builds/build-cancel:cancel') && init?.method === 'POST') {
        cancelPostCount += 1;
        providerStatus = 'CANCELLED';
        firstOwnerValid = false;

        return jsonResponse(durableBuild(operationId, 'build-cancel', providerStatus));
      }

      throw new Error(`unexpected fetch ${value}`);
    }) as unknown as typeof fetch;

    await expect(
      cancelAppImageBuildAndWait(
        SPEC,
        { operationId, buildId: 'build-cancel' },
        {
          fetchImpl,
          getAccessToken: async () => 'tok',
          assertAuthority: async () => {
            if (!firstOwnerValid) {
              throw new Error('cloud-build cancellation fence lost');
            }
          },
        },
      ),
    ).rejects.toThrow('cancellation fence lost');

    const reclaimed = await cancelAppImageBuildAndWait(
      SPEC,
      { operationId, buildId: 'build-cancel' },
      {
        fetchImpl,
        getAccessToken: async () => 'tok',
        assertAuthority: async () => undefined,
        recordCancellationProof: async (proof) => {
          persistedProofs.push(proof);
        },
      },
    );

    expect(cancelPostCount).toBe(1);
    expect(reclaimed).toMatchObject({
      ok: true,
      proof: {
        buildId: 'build-cancel',
        providerStatus: 'CANCELLED',
        terminal: true,
        requiresRegistrySweep: true,
        lateSuccess: false,
      },
    });
    expect(persistedProofs).toHaveLength(1);
  });

  it('records a late SUCCESS as terminal push evidence and still requires the exact registry sweep', async () => {
    const operationId = 'deploy-operation-cancel-late-success';
    const digest = `sha256:${'a'.repeat(64)}`;
    const persistedProofs: unknown[] = [];
    const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
      expect(init?.method).not.toBe('POST');
      expect(String(url)).toMatch(/\/builds\/build-late-success$/u);
      return jsonResponse(
        durableBuild(operationId, 'build-late-success', 'SUCCESS', {
          results: { images: [{ name: SPEC.imageUri, digest }] },
        }),
      );
    }) as unknown as typeof fetch;

    const result = await cancelAppImageBuildAndWait(
      SPEC,
      { operationId, buildId: 'build-late-success' },
      {
        fetchImpl,
        getAccessToken: async () => 'tok',
        assertAuthority: async () => undefined,
        recordCancellationProof: async (proof) => {
          persistedProofs.push(proof);
        },
      },
    );

    expect(result).toMatchObject({
      ok: true,
      proof: {
        buildId: 'build-late-success',
        providerStatus: 'SUCCESS',
        terminal: true,
        requiresRegistrySweep: true,
        lateSuccess: true,
        digest,
      },
    });
    expect(persistedProofs).toEqual([expect.objectContaining({ lateSuccess: true, digest })]);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('refuses a late successful build when authority is lost during the provider poll', async () => {
    const operationId = 'deploy-operation-late-success';
    const recordTerminal = vi.fn();

    const lifecycle: DurableAppImageBuildLifecycle = {
      operationId,
      assertAuthority: async ({ checkpoint }) => {
        if (checkpoint === 'after-build-poll') {
          throw new Error('project deletion fence won');
        }
      },
      readState: async () => ({ phase: 'IDENTIFIED', buildId: 'build-late' }),
      markSubmissionStarted: async () => undefined,
      recordBuildIdentity: async () => undefined,
      recordSubmissionRejected: async () => undefined,
      recordTerminal,
    };

    const fetchImpl = vi.fn(async (url: string | URL) => {
      const value = String(url);

      if (value.endsWith('/builds/build-late')) {
        return jsonResponse(
          durableBuild(operationId, 'build-late', 'SUCCESS', {
            results: { images: [{ name: SPEC.imageUri, digest: 'sha256:late' }] },
          }),
        );
      }

      throw new Error(`unexpected fetch ${value}`);
    }) as unknown as typeof fetch;

    await expect(
      runAppImageBuild(SPEC, {
        fetchImpl,
        getAccessToken: async () => 'tok',
        sleep: async () => undefined,
        pollIntervalMs: 0,
        lifecycle,
      }),
    ).rejects.toThrow('project deletion fence won');
    expect(recordTerminal).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledOnce();
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
