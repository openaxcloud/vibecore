export const STORAGE_PANEL_SELECTOR =
  '[data-testid="ide-service-panel"][data-panel="object-storage"] .bolt-project-object-storage-panel';
export const STORAGE_DISABLED_TEXT = 'Object Storage is not available yet';
export const STORAGE_ENABLE_TEXT = 'Enable Object Storage';

export function matchesStorageStatusRequest(request, panelUrl) {
  const actual = new URL(request.url());
  const expected = new URL(panelUrl);
  const body = request.postData() ?? '';
  const contentType = request.headers()['content-type'] ?? '';
  const intent = contentType.includes('application/x-www-form-urlencoded')
    ? new URLSearchParams(body).get('intent')
    : contentType.includes('multipart/form-data')
      ? /name="intent"\r?\n\r?\n([^\r\n]*)/.exec(body)?.[1]
      : null;

  return actual.origin === expected.origin && actual.pathname === expected.pathname &&
    !actual.username && !actual.password && request.method() === 'POST' && intent === 'status';
}

// A confirmed disabled feature is different from a broken endpoint or transport.
export function classifyStorageBackend(status, body) {
  if (
    status === 404 && body?.code === 'FEATURE_NOT_ENABLED' &&
    (body.enabled === undefined || body.enabled === false) &&
    (body.provisioned === undefined || body.provisioned === false)
  ) {
    return { enabled: false, provisioned: false };
  }

  if (status === 200 && body?.enabled === true && typeof body.provisioned === 'boolean' && !body.error) {
    return { enabled: true, provisioned: body.provisioned };
  }

  throw new Error(`Object Storage backend capability is unverified (HTTP ${status})`);
}

export function assertStorageProxy(status, body, capability) {
  if (
    status !== 200 ||
    body?.error ||
    body?.enabled !== capability.enabled ||
    body?.provisioned !== capability.provisioned
  ) {
    throw new Error('Object Storage status proxy does not match the independently checked backend');
  }
}

export async function auditStorageBackendStatus(http, panelUrl, backendUrl, token, cookie) {
  const upstream = await http(backendUrl, { headers: { authorization: `Bearer ${token}` } });
  const capability = classifyStorageBackend(upstream.response.status, upstream.body);
  const result = await http(panelUrl, {
    method: 'POST',
    headers: { accept: 'application/json', cookie },
    body: new URLSearchParams({ intent: 'status' }),
  });
  assertStorageProxy(result.response.status, result.body, capability);

  return result;
}

export class StorageLifecycleUnverified extends Error {
  constructor(evidence) {
    super(
      'Object Storage active lifecycle NOT VERIFIED: this disposable audit has no authorized GCS test bucket. ' +
        'Status/UI capability checks are not upload/download/move/delete acceptance.',
    );
    this.name = 'StorageLifecycleUnverified';
    this.evidence = evidence;
  }
}

export function storageLifecycleEvidence(capability, completedProbes) {
  return {
    capability: capability.enabled ? (capability.provisioned ? 'provisioned' : 'unprovisioned') : 'disabled',
    backendStatusVerified: true,
    uiStateVerified: completedProbes === 2,
    reloadVerified: completedProbes === 2,
    activeLifecycle: 'not_verified',
    blocker: 'AUTHORIZED_GCS_TEST_BUCKET_UNAVAILABLE',
    unverifiedOperations: ['provision', 'upload', 'list-persisted-object', 'download-bytes', 'move', 'delete'],
  };
}

// Read-only proof suitable for this disposable stack. It deliberately fails the
// full UI acceptance result after recording limited capability-state evidence.
// Never click Enable, request signed URLs, or provision external storage here.
export async function auditStorageUiCapability(page, panelUrl, backendUrl, token) {
  let capability;

  for (let probe = 0; probe < 2; probe += 1) {
    const upstream = await page.request.get(backendUrl, { headers: { authorization: `Bearer ${token}` } });
    capability = classifyStorageBackend(upstream.status(), await upstream.json());

    // Observe the actual browser POST emitted by the component after reload.
    const [request] = await Promise.all([
      page.waitForRequest((req) => matchesStorageStatusRequest(req, panelUrl)),
      page.reload({ waitUntil: 'domcontentloaded' }),
    ]);
    const response = await request.response();

    if (!response) {
      throw new Error('Object Storage status request after reload received no response');
    }

    assertStorageProxy(response.status(), await response.json(), capability);

    const panel = page.locator(STORAGE_PANEL_SELECTOR);
    await panel.waitFor({ state: 'visible', timeout: 15_000 });

    if (!capability.enabled) {
      await panel.getByText(STORAGE_DISABLED_TEXT, { exact: true }).waitFor({ state: 'visible' });

      if ((await panel.getByRole('button').count()) !== 0 || (await panel.getByRole('alert').count()) !== 0) {
        throw new Error('Disabled Object Storage must not show active operations or a transport-error alert');
      }
    } else if (!capability.provisioned) {
      await panel.getByRole('button', { name: STORAGE_ENABLE_TEXT, exact: true }).waitFor({ state: 'visible' });
    } else {
      await panel.getByText('Project bucket', { exact: true }).waitFor({ state: 'visible' });
    }
  }

  throw new StorageLifecycleUnverified(storageLifecycleEvidence(capability, 2));
}
