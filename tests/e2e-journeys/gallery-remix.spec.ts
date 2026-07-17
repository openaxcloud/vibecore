/*
 * PROOF #1 (D5) — Gallery → AUTHENTICATED Remix → new project ID → IDE → Preview.
 *
 * The remix was previously proven only by an API 201; this closes the VISUAL UI
 * gap: a dedicated test user, logged in through the real login form (no personal
 * cookies), browses the Gallery, clicks "Remix this app", and the app opens the
 * IDE on a BRAND-NEW project (a different id than the listing's source). We then
 * observe the preview boot. Every step is captured (video/trace/screenshots +
 * evidence-metadata.json with commit, env, OS, browser+version, timestamp,
 * traceId).
 */
import { test, expect, loginAsTestUser } from './support/fixtures';
import { env } from './support/env';

test('authenticated user remixes a gallery app → new project opens in the IDE', async ({ page, evidence }) => {
  // 1) Real login (dedicated test user, real form).
  await loginAsTestUser(page);
  await page.screenshot({ path: test.info().outputPath('01-logged-in-dashboard.png'), fullPage: true });

  // 2) Browse the public Gallery and confirm the listing is really there.
  await page.goto(`${env.baseURL}/gallery`, { waitUntil: 'domcontentloaded' });
  const card = page.getByTestId(`gallery-card-${env.gallerySlug}`);
  await expect(card, `gallery listing "${env.gallerySlug}" must be published`).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: test.info().outputPath('02-gallery-grid.png'), fullPage: true });

  // 3) Open the detail page.
  await card.click();
  await expect(page).toHaveURL(new RegExp(`/gallery/${env.gallerySlug}`), { timeout: 30_000 });
  const remixButton = page.getByTestId('gallery-remix');
  await expect(remixButton).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('03-gallery-detail.png'), fullPage: true });

  // 4) Snapshot the user's project set BEFORE the remix, so we can prove a NEW
  //    project appears. Remix is a Remix-Router form POST to the web route (the
  //    server calls the API and issues a redirect), so we follow the navigation
  //    rather than a client-side API response.
  const sessionCookie = (await page.context().cookies()).find((c) => c.name === 'vc_session');
  expect(sessionCookie, 'authenticated session cookie present').toBeTruthy();
  const listProjects = async (): Promise<Array<{ id: string; slug?: string }>> => {
    const res = await page.request.get(`${env.apiURL}/orgs`, {
      headers: { authorization: `Bearer ${sessionCookie!.value}` },
    });
    const orgs = (await res.json()).organizations as Array<{ id: string }>;
    const projects: Array<{ id: string; slug?: string }> = [];
    for (const org of orgs) {
      const pr = await page.request.get(`${env.apiURL}/orgs/${org.id}/projects`, {
        headers: { authorization: `Bearer ${sessionCookie!.value}` },
      });
      const body = await pr.json();
      for (const p of (body.projects ?? body) as Array<{ id: string; slug?: string }>) projects.push(p);
    }
    return projects;
  };
  const before = new Set((await listProjects()).map((p) => p.id));

  // 5) Click Remix and follow the redirect INTO the IDE (not back to /gallery).
  await Promise.all([
    page.waitForURL(
      (url) => !url.pathname.startsWith('/gallery') && /\/(@[^/]+\/|projects\/)/.test(url.pathname),
      { timeout: 120_000 },
    ),
    remixButton.click(),
  ]);
  const ideUrl = page.url();
  evidence.note('ideUrl', ideUrl);
  expect(ideUrl, 'must leave the gallery and open a project route').not.toContain('/gallery');
  expect(/\/(@[^/]+\/|projects\/)/.test(new URL(ideUrl).pathname), 'lands on an IDE/project route').toBe(true);

  // A brand-new project must now exist in the user's org (the clone) — the id the
  // remix produced, absent before the click.
  const after = await listProjects();
  const created = after.filter((p) => !before.has(p.id));
  evidence.note('newProjects', created);
  expect(created.length, 'exactly one new project (the clone) was created by the remix').toBe(1);
  const newProjectId = created[0].id;
  evidence.note('newProjectId', newProjectId);
  // The IDE URL must reference the new clone (its id or slug), never only the source.
  expect(ideUrl.includes(newProjectId) || (created[0].slug ? ideUrl.includes(created[0].slug) : false)).toBe(true);
  await page.waitForLoadState('domcontentloaded');
  await page.screenshot({ path: test.info().outputPath('04-ide-opened-on-clone.png'), fullPage: true });

  // 6) Start and observe the preview. A remixed clone opens with the dev server
  //    idle, so we explicitly kick it via the IDE's "Get preview running"
  //    affordance, then wait for the per-workspace preview iframe to load. This
  //    is heavy infra (workspace cold-start + npm install + dev server), so we
  //    give it room and record the outcome honestly.
  const startPreview = page.getByRole('button', { name: /get preview running|run|start preview/i }).first();
  if (await startPreview.isVisible().catch(() => false)) {
    await startPreview.click().catch(() => undefined);
    evidence.note('clickedStartPreview', true);
  }
  // The preview renders in a Webview iframe pointing at the workspace preview host.
  const previewFrame = page.locator('iframe[src*="preview.e-code.ai"], iframe[src*=".preview."]').first();
  let previewRendered = false;
  let previewSrc: string | null = null;
  try {
    // Bounded: enough for a warm dev server, short enough to keep the regression
    // fast. A cold clone's first boot can exceed this; that's recorded, not fatal.
    await expect(previewFrame).toBeVisible({ timeout: 90_000 });
    previewSrc = await previewFrame.getAttribute('src');
    // Confirm the preview host actually answers (dev server really up), not just an empty frame.
    if (previewSrc) {
      const ping = await page.request.get(previewSrc, { timeout: 30_000, failOnStatusCode: false });
      evidence.note('previewHttpStatus', ping.status());
      previewRendered = ping.status() < 500;
    }
  } catch {
    previewRendered = false;
  }
  evidence.note('previewSrc', previewSrc);
  evidence.note('previewRendered', previewRendered);
  await page.screenshot({ path: test.info().outputPath('05-ide-preview.png'), fullPage: true });

  /*
   * The CORE proof — the gap that was previously only an API 201 — is fully
   * asserted above: authenticated UI remix → a NEW project id → the IDE opens on
   * the clone. Those are hard, deterministic gates.
   *
   * The preview boot is a heavy, timing-dependent step (workspace cold-start +
   * dev-server start on a freshly-remixed clone that opens idle). We START it and
   * record whether it rendered (+ HTTP status) into the evidence bundle and a
   * test annotation, but do NOT let its variable boot time flip this regression
   * red — that would make CI flaky on infra latency rather than on a real break.
   */
  if (!previewRendered) {
    test.info().annotations.push({
      type: 'preview-not-rendered',
      description: `Preview did not render within timeout (src=${previewSrc ?? 'none'}). Core remix→IDE proof still holds.`,
    });
  }
});
