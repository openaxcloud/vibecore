/* eslint object-curly-newline: off -- Follow Prettier for nested literal objects; the repository rules conflict here. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import JSZip from 'jszip';
import { test } from 'vitest';
import { verifyArchiveBytes } from './archive-checks.js';
import {
  assertRecipeKubeconfig,
  assertRecipeEvent,
  validationRef,
  privatePreviewUrl,
  verifyPrivatePreview,
  verifyRuntimeSnapshotRefused,
} from './checks.js';
import { podEvidence } from './evidence.js';
import { recipeManifests } from './manifests.js';

const name = 'vc-private-0123456789abcdef';
const context = `kind-${name}`;

function kubeconfig() {
  return {
    'current-context': context,
    contexts: [{ name: context, context: { cluster: context, user: context } }],
    clusters: [{ name: context, cluster: { server: 'https://127.0.0.1:43210', 'certificate-authority-data': 'ca' } }],
    users: [{ name: context, user: { 'client-certificate-data': 'cert', 'client-key-data': 'key' } }],
  };
}

test('only a single, generated loopback kind context with embedded TLS credentials is accepted', () => {
  assertRecipeKubeconfig(kubeconfig(), name);

  for (const mutate of [
    (config: ReturnType<typeof kubeconfig>) => {
      config['current-context'] = 'production';
    },
    (config: ReturnType<typeof kubeconfig>) => {
      config.clusters[0].cluster.server = 'https://example.com:443';
    },
    (config: ReturnType<typeof kubeconfig>) => {
      config.contexts.push(config.contexts[0]);
    },
    (config: ReturnType<typeof kubeconfig>) => {
      Object.assign(config.clusters[0].cluster, { 'proxy-url': 'http://example.com' });
    },
    (config: ReturnType<typeof kubeconfig>) => {
      Object.assign(config.users[0].user, { exec: { command: 'cloud-auth' } });
    },
    (config: ReturnType<typeof kubeconfig>) => {
      Object.assign(config.clusters[0].cluster, { 'insecure-skip-tls-verify': true });
    },
  ]) {
    const config = kubeconfig();
    mutate(config);
    assert.throws(() => assertRecipeKubeconfig(config, name));
  }
  assert.throws(() => assertRecipeKubeconfig(kubeconfig(), 'production'));
});

test('preview authorization never forwards a bearer to an alternate origin or route', () => {
  const path = '/api/runtime/workspaces/ws-one/preview/4173/proxy/';
  assert.equal(privatePreviewUrl(path, 'http://127.0.0.1:3001').pathname, path);

  for (const preview of ['https://example.com' + path, '/health', path + '?token=secret']) {
    assert.throws(() => privatePreviewUrl(preview, 'http://127.0.0.1:3001'));
  }
});

test('private preview uses real HTTP; rejects blank pages, redirects and leaked content', async () => {
  let failure: 'none' | 'blank' | 'redirect' | 'leak' = 'none';

  const server = createServer((request, response) => {
    const owner = request.headers.authorization === 'Bearer owner';
    const status = owner ? (failure === 'redirect' ? 302 : 200) : 403;
    response
      .writeHead(status)
      .end(owner ? (failure === 'blank' ? '' : 'proof-marker') : failure === 'leak' ? 'proof-marker' : 'denied');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');

    const url = new URL(`http://127.0.0.1:${address.port}/`);
    await verifyPrivatePreview(url, 'owner', 'stranger', 'proof-marker');

    for (const mode of ['blank', 'redirect', 'leak'] as const) {
      failure = mode;
      await assert.rejects(verifyPrivatePreview(url, 'owner', 'stranger', 'proof-marker'));
    }
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('runtime archive check fails closed for success, connectivity errors, and wrong refusal codes', async () => {
  await verifyRuntimeSnapshotRefused(async () => {
    throw { status: 503, code: 'SNAPSHOT_ARCHIVE_UNAVAILABLE' };
  });
  await assert.rejects(verifyRuntimeSnapshotRefused(async () => ({ files: [] })));
  await assert.rejects(
    verifyRuntimeSnapshotRefused(async () => {
      throw { status: 503, code: 'MANAGER_DOWN' };
    }),
  );
  await assert.rejects(
    verifyRuntimeSnapshotRefused(async () => {
      throw new Error('network unavailable');
    }),
  );
});

test('sandbox opt-out belongs only to the test manager; services have no ingress or cloud credentials', () => {
  const resources = recipeManifests(name, 'local-password', 'local-agent', 'local-manager', 'local-jwt');

  const deployment = (resource: string) =>
    resources.find((item) => item.kind === 'Deployment' && item.metadata.name === resource);

  const deployments = resources.filter((item) => item.kind === 'Deployment') as unknown as {
    metadata: { name: string };
    spec: { template: { spec: { containers: { env: { name: string; value: string }[]; imagePullPolicy: string }[] } } };
  }[];

  for (const item of deployments) {
    const container = item.spec.template.spec.containers[0];
    const env = Object.fromEntries(container.env.map(({ name: key, value }) => [key, value]));
    assert.equal(container.imagePullPolicy, 'Never');

    if (item.metadata.name === 'manager') {
      assert.equal(env.NODE_ENV, 'test');
      assert.equal(env.WORKSPACE_DISABLE_SANDBOX_SCHEDULING, '1');
    } else {
      assert.equal(env.WORKSPACE_DISABLE_SANDBOX_SCHEDULING, undefined);
    }
  }
  assert.ok(deployment('api') && deployment('manager'));

  for (const item of resources) {
    assert.ok(!['Ingress', 'ClusterRoleBinding'].includes(item.kind));

    if ('namespace' in item.metadata) {
      assert.equal(item.metadata.namespace, name);
    }
  }

  const text = JSON.stringify(resources);
  assert.ok(!/OPENAI_API_KEY|ANTHROPIC_API_KEY|GOOGLE_APPLICATION_CREDENTIALS|LoadBalancer|NodePort/.test(text));

  const workflow = readFileSync(
    new URL('../../.github/workflows/private-runtime-recipe.yml', import.meta.url).pathname.replace(
      '/scripts/.github/',
      '/.github/',
    ),
    'utf8',
  );
  assert.match(workflow, /on:\n  workflow_dispatch:/);
  assert.ok(!/pull_request:|schedule:|secrets\.|id-token:|environment:/.test(workflow));
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /persist-credentials: false/);
});

test('actual ZIP bytes, not the inventory, must match the saved runtime file', async () => {
  const zip = new JSZip();
  const content = Buffer.from('preuve UTF-8 éphémère\n');
  zip.file('proof.txt', content);

  const bytes = await zip.generateAsync({ type: 'nodebuffer' });

  const object = {
    contentBase64: bytes.toString('base64'),
    byteLength: bytes.length,
    contentHash: createHash('sha256').update(bytes).digest('hex'),
  };

  const expected = createHash('sha256').update(content).digest('hex');
  assert.equal((await verifyArchiveBytes(object, 'proof.txt', expected)).fileHash, expected);
  await assert.rejects(verifyArchiveBytes(object, 'missing.txt', expected));
  await assert.rejects(verifyArchiveBytes(object, 'proof.txt', '0'.repeat(64)));
  await assert.rejects(verifyArchiveBytes({ ...object, contentHash: '0'.repeat(64) }, 'proof.txt', expected));
});

test('automatic runs accept only the exact dedicated branch and push event', () => {
  assertRecipeEvent('workflow_dispatch', 'refs/heads/main');
  assertRecipeEvent('push', validationRef);

  for (const event of ['pull_request', 'pull_request_target', 'workflow_run', undefined]) {
    assert.throws(() => assertRecipeEvent(event, validationRef));
  }

  for (const ref of ['refs/heads/main', validationRef + '-other', validationRef.replace('heads', 'tags'), undefined]) {
    assert.throws(() => assertRecipeEvent('push', ref));
  }

  const workflow = readFileSync('.github/workflows/private-runtime-recipe.yml', 'utf8');
  assert.match(workflow, /push:\n    branches: \[validation\/private-runtime-20261113-7b970996\]/);
});

test('evidence retains runtime image IDs and exit codes without arbitrary messages', () => {
  const pod = {
    metadata: { name: 'test', namespace: name },
    status: {
      containerStatuses: [
        {
          name: 'agent',
          image: 'local:unique',
          imageID: 'sha256:actual',
          ready: false,
          restartCount: 1,
          state: {
            waiting: { reason: 'CrashLoopBackOff', message: 'SECRET' },
            terminated: { reason: 'Error', exitCode: 1, message: 'SECRET' },
          },
        },
      ],
    },
  };

  const evidence = JSON.stringify(podEvidence(pod));
  assert.ok(!evidence.includes('SECRET'));
  assert.match(evidence, /sha256:actual/);
  assert.match(evidence, /"exitCode":1/);
});
