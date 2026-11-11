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

// Install observers before reload, but accept status only after the new main
// document commits. Read its body on response, not after DOMContentLoaded.
export async function readStorageStatusAfterReload(page, panelUrl, timeout = 15_000) {
  const mainFrame = page.mainFrame();
  let navigationRequest;
  let committed = false;
  let statusRequest;
  let resolveStatus;
  let rejectStatus;
  let failure;
  const status = new Promise((resolve, reject) => {
    resolveStatus = resolve;
    rejectStatus = reject;
  });
  const fail = (error) => {
    failure = error;
    rejectStatus(error);
  };
  const onRequest = (request) => {
    if (request.serviceWorker?.() || request.frame() !== mainFrame) {
      return;
    }
    if (request.isNavigationRequest()) {
      if (committed) {
        fail(new Error('Object Storage reload was interrupted by another navigation'));
      } else {
        navigationRequest = request;
      }
    } else if (committed && !statusRequest && matchesStorageStatusRequest(request, panelUrl)) {
      statusRequest = request;
    }
  };
  const onNavigated = (frame) => {
    if (frame !== mainFrame) {
      return;
    }
    if (!navigationRequest || committed) {
      fail(new Error('Object Storage reload has an unexpected main-document commit'));
      return;
    }
    committed = true;
  };
  const onResponse = (response) => {
    if (statusRequest && response.request() === statusRequest) {
      // Calling json now starts capture immediately and propagates missing-body
      // failures. No fallback to another request or an API-synthesized body.
      response.json().then(
        (body) => resolveStatus({ status: response.status(), body }),
        fail,
      );
    }
  };
  const onFailed = (request) => {
    if (request === statusRequest || request === navigationRequest) {
      fail(new Error('Object Storage reload/status request failed'));
    }
  };
  page.on('request', onRequest);
  page.on('framenavigated', onNavigated);
  page.on('response', onResponse);
  page.on('requestfailed', onFailed);
  const timer = setTimeout(() => fail(new Error('Object Storage new-document status timed out')), timeout);

  try {
    const [result, navigation] = await Promise.all([
      status,
      page.reload({ waitUntil: 'domcontentloaded', timeout }),
    ]);
    if (failure) {
      throw failure;
    }
    if (!committed || !navigation || navigation.request() !== navigationRequest) {
      throw new Error('Object Storage status is not tied to the completed reload');
    }
    return result;
  } finally {
    clearTimeout(timer);
    page.off('request', onRequest);
    page.off('framenavigated', onNavigated);
    page.off('response', onResponse);
    page.off('requestfailed', onFailed);
  }
}

// Read-only proof suitable for this disposable stack. It deliberately fails the
// full UI acceptance result after recording limited capability-state evidence.
// Never click Enable, request signed URLs, or provision external storage here.
export async function auditStorageUiCapability(page, panelUrl, backendUrl, token) {
  let capability;

  for (let probe = 0; probe < 2; probe += 1) {
    const upstream = await page.request.get(backendUrl, { headers: { authorization: `Bearer ${token}` } });
    capability = classifyStorageBackend(upstream.status(), await upstream.json());

    const response = await readStorageStatusAfterReload(page, panelUrl);
    assertStorageProxy(response.status, response.body, capability);

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
