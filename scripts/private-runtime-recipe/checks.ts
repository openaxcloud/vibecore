import assert from 'node:assert/strict';

/** Never send the owner's bearer to an arbitrary preview origin or follow redirects. */
export function privatePreviewUrl(preview: string, apiBase: string): URL {
  const base = new URL(apiBase);
  const url = new URL(preview, base);
  assert.equal(url.origin, base.origin, 'Recipe requires the authenticated API preview proxy');
  assert.equal(url.username + url.password + url.search + url.hash, '', 'Unexpected preview credentials/query');
  assert.match(url.pathname, /^\/api\/runtime\/workspaces\/[^/]+\/preview\/\d+\/proxy\/$/);

  return url;
}

export async function verifyPrivatePreview(url: URL, ownerToken: string, foreignToken: string, marker: string) {
  for (const [token, owner] of [
    [ownerToken, true],
    ['', false],
    [foreignToken, false],
  ] as const) {
    const response = await fetch(url, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000),
    });

    const body = await response.text();

    if (owner) {
      assert.equal(response.status, 200, 'Owner preview must serve HTTP 200');
      assert.ok(body.includes(marker), 'Preview does not contain the generated test marker');
    } else {
      assert.ok([401, 403, 404].includes(response.status), 'Private preview must reject this caller');
      assert.ok(!body.includes(marker), 'Private preview leaked test content');
    }
  }
}

export async function verifyRuntimeSnapshotRefused(create: () => Promise<unknown>) {
  let refused = false;

  try {
    await create();
  } catch (error) {
    const failure = error as { status?: number; code?: string };
    assert.equal(failure.status, 503, 'Unexpected runtime snapshot refusal status');
    assert.equal(failure.code, 'SNAPSHOT_ARCHIVE_UNAVAILABLE', 'Unexpected runtime snapshot refusal code');
    refused = true;
  }
  assert.ok(refused, 'Legacy runtime snapshots must not report an inventory as a recoverable archive');
}

export function assertRecipeClusterName(name: string) {
  assert.match(name, /^vc-private-[0-9a-f]{16}$/, 'Not a generated private recipe cluster');
}

/** Validate offline before sending even one request to a Kubernetes API. */
export function assertRecipeKubeconfig(value: unknown, cluster: string) {
  assertRecipeClusterName(cluster);

  const config = value as {
    'current-context'?: string;
    contexts?: { name: string; context: { cluster: string; user: string } }[];
    clusters?: { name: string; cluster: Record<string, unknown> }[];
    users?: { name: string; user: Record<string, unknown> }[];
  };

  const context = `kind-${cluster}`;
  assert.equal(config['current-context'], context);
  assert.equal(config.contexts?.length, 1);
  assert.equal(config.clusters?.length, 1);
  assert.equal(config.users?.length, 1);
  assert.equal(config.contexts![0].name, context);
  assert.equal(config.contexts![0].context.cluster, context);
  assert.equal(config.contexts![0].context.user, context);
  assert.equal(config.clusters![0].name, context);
  assert.equal(config.users![0].name, context);

  const endpoint = new URL(String(config.clusters![0].cluster.server));
  assert.equal(endpoint.protocol, 'https:');
  assert.equal(endpoint.hostname, '127.0.0.1');
  assert.ok(endpoint.port);
  assert.equal(endpoint.username + endpoint.password + endpoint.search + endpoint.hash, '');
  assert.equal(endpoint.pathname, '/');
  assert.ok(config.clusters![0].cluster['certificate-authority-data']);

  for (const key of Object.keys(config.clusters![0].cluster)) {
    assert.ok(['server', 'certificate-authority-data'].includes(key), `Unexpected cluster option: ${key}`);
  }

  const user = config.users![0].user;
  assert.ok(user['client-certificate-data'] && user['client-key-data']);
  assert.deepEqual(Object.keys(user).sort(), ['client-certificate-data', 'client-key-data']);
}
