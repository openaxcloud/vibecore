import type { Page, Request } from '@playwright/test';

/** Read the real panel GET from the newly committed document, never a pre-reload refresh. */
export async function reloadPanelJson(page: Page, projectId: string, panel: string) {
  let committed = false;
  let documentRequested = false;
  let requests = new WeakSet<Request>();

  const onNavigation = (frame: ReturnType<Page['mainFrame']>) => {
    if (documentRequested && frame === page.mainFrame()) {
      committed = true;
    }
  };
  const onRequest = (request: Request) => {
    let frame: ReturnType<Request['frame']>;

    try {
      frame = request.frame();
    } catch {
      // Service-worker/early requests can have no associated frame.
      return;
    }

    if (frame === page.mainFrame() && request.isNavigationRequest() && request.resourceType() === 'document') {
      documentRequested = true;
      committed = false;
      requests = new WeakSet<Request>();
    }

    if (committed && frame === page.mainFrame()) {
      requests.add(request);
    }
  };
  page.on('framenavigated', onNavigation);
  page.on('request', onRequest);

  try {
    /*
     * Keep Playwright's existing response timeout. Read the body as soon as the
     * selected response arrives, before handing control back to the scenario.
     */
    const result = page
      .waitForResponse(
        (response) =>
          committed &&
          requests.has(response.request()) &&
          response.request().method() === 'GET' &&
          new URL(response.url()).pathname === `/api/projects/${projectId}/ide-panel/${panel}`,
      )
      .then(async (response) => ({ ok: response.ok(), body: await response.json() }));

    const [loaded] = await Promise.all([result, page.reload({ waitUntil: 'domcontentloaded' })]);

    return loaded;
  } finally {
    page.off('framenavigated', onNavigation);
    page.off('request', onRequest);
  }
}
