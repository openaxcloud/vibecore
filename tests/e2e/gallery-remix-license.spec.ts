import { expect, test } from '@playwright/test';
import JSZip from 'jszip';
import { assertIbanWasMasked } from '~/lib/qa/tpl-proof-contract.js';

/**
 * Screen-level proof of P0-V3-05 (I-RMX-3): versioned license + explicit
 * consent + PII masking on a REAL gallery remix, against the local full stack
 * (real API on :3001 + real Postgres).
 *
 * The visual contract is part of the requirement ("une preuve API n'est pas
 * une preuve UI") — so the license block, the consent checkbox gating the
 * Remix button, and the redirect into the IDE are asserted ON SCREEN, then the
 * masking + the pinned license snapshot are verified on the produced clone/job.
 */

const API_BASE_URL =
  process.env.PLAYWRIGHT_API_URL ?? process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';

const APP_BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';

/** Must be listed in PLATFORM_ADMIN_EMAILS of the stack under test. */
const ADMIN_EMAIL = 'e2e-platform-admin@local.test';
const ADMIN_PASSWORD = 'Password123!';

const PII_EMAIL = 'jane.doe@acme-corp.fr';
const PII_PHONE = '+33 6 12 34 56 78';

/*
 * P0-V3-05 réserve #2 : un NOM est une donnée personnelle. Avant ce lot, aucun
 * matcher ne le couvrait et « Jane Doe » survivait dans le clone produit ici.
 */
const PII_NAME = 'Jane Doe';
const PII_IBAN = 'FR76 3000 6000 0112 3456 7890 189';
const PII_CARD = '4242 4242 4242 4242';
const LICENSE_TEXT = 'MIT License\n\nPermission is hereby granted, free of charge, to any person…';
const SOURCE_CUSTOMERS_CSV = `name,email,phone,iban,card\n${PII_NAME},${PII_EMAIL},${PII_PHONE},${PII_IBAN},${PII_CARD}\n`;
const SOURCE_PRODUCTS_CSV = 'name,price,stock\nDesk Lamp,4200,7\n';

type Api = import('@playwright/test').APIRequestContext;

async function registerOrLogin(request: Api, email: string, name: string) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const register = await request.post(`${API_BASE_URL}/auth/register`, {
    data: { email, password: ADMIN_PASSWORD, name, organizationName: `${name} ${suffix}` },
  });

  if (register.ok()) {
    const payload = (await register.json()) as {
      token: string;
      organization: { id: string };
      verificationToken?: string;
    };

    /*
     * The platform-admin bootstrap (PLATFORM_ADMIN_EMAILS) only applies once
     * email ownership is proven — the non-prod register response exposes the
     * verification token exactly for this kind of harness.
     */
    if (payload.verificationToken) {
      const verify = await request.post(`${API_BASE_URL}/auth/verify-email`, {
        data: { token: payload.verificationToken },
      });
      expect(verify.ok(), await verify.text()).toBeTruthy();
    }

    return payload;
  }

  const login = await request.post(`${API_BASE_URL}/auth/login`, {
    data: { email, password: ADMIN_PASSWORD },
  });
  expect(login.ok(), await login.text()).toBeTruthy();

  const payload = (await login.json()) as { token: string; organizations?: Array<{ id: string }> };

  const orgs = await request.get(`${API_BASE_URL}/orgs`, {
    headers: { authorization: `Bearer ${payload.token}` },
  });

  const organization = ((await orgs.json()) as { organizations: Array<{ id: string }> }).organizations[0];

  return { token: payload.token, organization };
}

test('gallery remix shows the versioned license, requires explicit consent, and masks PII in the clone', async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);

  const api = page.request;
  const slug = `licensed-crm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  // ---- 1. CURATION (admin): source project with PII + snapshot + licensed listing.
  const admin = await registerOrLogin(api, ADMIN_EMAIL, 'E2E Platform Admin');
  const authHeaders = { authorization: `Bearer ${admin.token}` };

  const reauth = await api.post(`${API_BASE_URL}/auth/reauth`, {
    headers: authHeaders,
    data: { password: ADMIN_PASSWORD },
  });
  expect(reauth.ok(), await reauth.text()).toBeTruthy();

  const createProject = await api.post(`${API_BASE_URL}/orgs/${admin.organization.id}/projects`, {
    headers: authHeaders,
    data: { name: `Licensed CRM ${slug}` },
  });
  expect(createProject.ok(), await createProject.text()).toBeTruthy();

  const sourceProjectId = ((await createProject.json()) as { project: { id: string } }).project.id;

  const zip = new JSZip();
  zip.file('seed/customers.csv', SOURCE_CUSTOMERS_CSV);

  // Catalogue produit : NE DOIT PAS être masqué (name+price+stock ≠ personnes).
  zip.file('data/products.csv', SOURCE_PRODUCTS_CSV);
  zip.file('README.md', '# Licensed CRM\nContact: support@example.com\n');

  const writeFiles = await api.post(`${API_BASE_URL}/projects/${sourceProjectId}/files/import/zip`, {
    headers: authHeaders,
    data: { zipBase64: await zip.generateAsync({ type: 'base64' }) },
  });
  expect(writeFiles.ok(), await writeFiles.text()).toBeTruthy();

  const createSnapshot = await api.post(`${API_BASE_URL}/projects/${sourceProjectId}/snapshots`, {
    headers: authHeaders,
    data: { label: 'gallery release' },
  });
  expect(createSnapshot.ok(), await createSnapshot.text()).toBeTruthy();

  const snapshotId = ((await createSnapshot.json()) as { snapshot: { id: string } }).snapshot.id;

  const createListing = await api.post(`${API_BASE_URL}/admin/gallery-listings`, {
    headers: authHeaders,
    data: {
      slug,
      title: 'Licensed CRM',
      description: 'A CRM sample used to prove license + consent + PII masking on remix.',
      category: 'web',
      tags: ['crm'],
      sourceProjectId,
      sourceSnapshotId: snapshotId,
      authorName: 'Ada Lovelace',
      licenseId: 'MIT',
      licenseText: LICENSE_TEXT,

      // FAIL-CLOSED : rendre le listing remixable exige les confirmations explicites.
      remixAllowed: true,
      rightsConfirmed: true,
      piiPolicyAccepted: true,
    },
  });
  expect(createListing.ok(), await createListing.text()).toBeTruthy();

  // ---- 2. ON SCREEN (anonymous): license block visible, Remix gated by consent.
  await page.goto(`/gallery/${slug}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('gallery-license-id')).toHaveText('MIT');
  await expect(page.getByTestId('gallery-pii-handling')).toContainText('masked');
  await expect(page.getByTestId('gallery-remix')).toBeDisabled();
  await testInfo.attach('license-block-anonymous', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });

  // ---- 3. REMIXER (different user): consent checkbox unlocks Remix → IDE.
  const remixer = await registerOrLogin(
    api,
    `e2e-remixer-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@local.test`,
    'E2E Remixer',
  );
  await page
    .context()
    .addCookies([{ name: 'vc_session', value: remixer.token, url: APP_BASE_URL, httpOnly: true, sameSite: 'Lax' }]);

  await page.goto(`/gallery/${slug}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('gallery-remix')).toBeDisabled();
  await page.getByTestId('gallery-consent').check();
  await expect(page.getByTestId('gallery-remix')).toBeEnabled();
  await testInfo.attach('consent-checked', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });

  await page.getByTestId('gallery-remix').click();

  // The action redirects into the IDE — canonical /@org/slug or legacy /projects/:id/ide.
  await page.waitForURL(/(\/@|\/projects\/)/, { timeout: 60_000 });
  await testInfo.attach('after-remix-redirect', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });

  // ---- 4. THE CLONE: PII masked, fixtures kept (verified on the produced files).
  const remixerHeaders = { authorization: `Bearer ${remixer.token}` };

  const projectsRes = await api.get(`${API_BASE_URL}/orgs/${remixer.organization.id}/projects`, {
    headers: remixerHeaders,
  });
  expect(projectsRes.ok(), await projectsRes.text()).toBeTruthy();

  /*
   * The remixer registered fresh in this test — their org contains EXACTLY the
   * clone the UI remix just produced (this is also a proof the clone landed in
   * the remixer's org, not the author's).
   */
  const projects = ((await projectsRes.json()) as { projects: Array<{ id: string }> }).projects;
  expect(projects).toHaveLength(1);

  const cloneId = projects[0].id;

  /*
   * The files LIST strips content (path + size only) — read the actual bytes
   * through the zip export, which archives the clone's real storage.
   */
  const exportRes = await api.get(`${API_BASE_URL}/projects/${cloneId}/export/zip`, {
    headers: remixerHeaders,
  });
  expect(exportRes.ok(), await exportRes.text()).toBeTruthy();

  const archive = ((await exportRes.json()) as { archive: { base64: string } }).archive;
  const cloneZip = await JSZip.loadAsync(archive.base64, { base64: true });
  const contents: string[] = [];

  for (const entry of Object.values(cloneZip.files)) {
    if (!entry.dir) {
      contents.push(await entry.async('string'));
    }
  }

  const allText = contents.join('\n');
  expect(allText.length).toBeGreaterThan(0);

  /*
   * LA PREUVE : on CHERCHE les données personnelles dans le clone réel et on
   * échoue à les trouver — les 5 catégories, nom compris.
   */
  for (const secret of [PII_NAME, PII_EMAIL, PII_PHONE, PII_IBAN, PII_CARD]) {
    expect(allText, secret).not.toContain(secret);
  }

  for (const marker of ['name', 'email', 'phone', 'iban', 'card']) {
    expect(allText, marker).toContain(`[PII:${marker} masked on remix]`);
  }

  /*
   * TPL-02.6: a true before/after. The helper refuses the old false-positive
   * shape where the clone merely lacks an arbitrary value: it first proves the
   * source fixture contains the complete IBAN and a safe release marker, then
   * requires the explicit mask marker and rejects the terminal group too.
   */
  assertIbanWasMasked({
    sourceText: `${SOURCE_CUSTOMERS_CSV}\n${SOURCE_PRODUCTS_CSV}`,
    cloneText: allText,
    fullIban: PII_IBAN,
    trailingFragment: '189',
    safeMarker: 'Desk Lamp',
  });

  expect(allText).toContain('support@example.com'); // RFC 2606 fixture kept
  // Non-régression : le catalogue produit traverse le remix intact.
  expect(allText).toContain('Desk Lamp');

  // ---- 5. THE JOB: versioned license + consent pinned (API remix, same listing).
  const apiRemix = await api.post(`${API_BASE_URL}/gallery/${slug}/remix`, {
    headers: remixerHeaders,
    data: { organizationId: remixer.organization.id, acceptLicense: true },
  });
  expect(apiRemix.status(), await apiRemix.text()).toBe(201);

  const remixPayload = (await apiRemix.json()) as {
    remix: {
      licenseSnapshot: { licenseId: string; licenseTextSha256: string | null };
      consentVersion: string;
      piiMaskedCount: number;
    };
  };
  expect(remixPayload.remix.licenseSnapshot.licenseId).toBe('MIT');
  expect(remixPayload.remix.licenseSnapshot.licenseTextSha256).toMatch(/^[0-9a-f]{64}$/);
  expect(remixPayload.remix.consentVersion).toMatch(/^\d{4}-\d{2}-\d{2}\./);
  expect(remixPayload.remix.piiMaskedCount).toBeGreaterThanOrEqual(5);

  // ---- 6. NEGATIVE (server-enforced): no consent → 400, nothing cloned.
  const refused = await api.post(`${API_BASE_URL}/gallery/${slug}/remix`, {
    headers: remixerHeaders,
    data: { organizationId: remixer.organization.id },
  });
  expect(refused.status()).toBe(400);
  expect(((await refused.json()) as { code: string }).code).toBe('REMIX_CONSENT_REQUIRED');
});
