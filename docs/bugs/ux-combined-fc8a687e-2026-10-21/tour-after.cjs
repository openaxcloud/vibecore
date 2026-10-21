// Exact local recipe: run from the integration checkout with its private synthetic session files.
const { chromium, expect } = require('@playwright/test');
const fs = require('node:fs');
(async () => {
  const s = JSON.parse(fs.readFileSync('.vibecore/ux-qa/integration-sessions.json')).cases['mobile-fr'];
  const b = await chromium.launch({ executablePath: '/usr/bin/chromium' });
  const c = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await c.addCookies(s.cookies);
  const p = await c.newPage();
  const preferences = p.waitForResponse(
    (r) => r.url().includes('/api/user/preferences') && r.request().method() === 'GET',
  );
  await p.goto(`http://127.0.0.1:5207/projects/${s.projectId}/snapshots?lang=fr`);
  const create = p.getByRole('button', { name: 'Créer l’instantané', exact: true });
  await create.waitFor();
  const tour = p.locator('.vc-product-tour');
  await preferences;
  if (!(await tour.isVisible())) {
    await p.getByRole('button', { name: 'Aide et visite guidée', exact: true }).tap();
    await p.getByRole('button', { name: 'Lancer la visite guidée', exact: true }).tap();
  }
  await tour.waitFor();
  const label = `Tour visible ${Date.now()}`;
  await p.locator('#snapshot-label').fill(label);
  await create.focus();
  await create.scrollIntoViewIfNeeded();
  const hit = (el) => {
    const r = el.getBoundingClientRect();
    return (
      r.y >= 0 &&
      r.bottom <= innerHeight &&
      el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2))
    );
  };
  await expect.poll(() => create.evaluate(hit)).toBe(true);
  await p.screenshot({ path: '/workspace/ux-artifacts/integration-tour-after-create-mobile-fr.png' });
  await create.tap();
  const restore = p.getByRole('button', { name: `Restaurer ${label}`, exact: true });
  await restore.waitFor();
  await expect(tour).toBeVisible();
  await restore.focus();
  await expect.poll(() => restore.evaluate(hit)).toBe(true);
  await p.screenshot({ path: '/workspace/ux-artifacts/integration-tour-after-focus-mobile-fr.png' });
  await p.keyboard.press('Enter');
  const dialog = p.getByRole('dialog', { name: new RegExp(label) });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Annuler', exact: true }).tap();
  await expect(dialog).toBeHidden();
  await expect(restore).toBeFocused();
  await expect.poll(() => restore.evaluate(hit)).toBe(true);
  await p.screenshot({ path: '/workspace/ux-artifacts/integration-tour-after-cancel-mobile-fr.png' });
  while (Number(await tour.getByRole('progressbar').getAttribute('aria-valuenow')) > 1)
    await tour.getByRole('button', { name: 'Retour', exact: true }).tap();
  await tour.getByRole('button', { name: 'Suivant', exact: true }).tap();
  await expect(tour.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '2');
  const laterSaved = p.waitForResponse(
    (r) => r.url().includes('/api/user/preferences') && r.request().method() === 'PATCH',
  );
  await tour.getByRole('button', { name: 'Plus tard', exact: true }).tap();
  expect((await laterSaved).ok()).toBe(true);
  expect(
    (await (await p.request.get('http://127.0.0.1:5207/api/user/preferences')).json()).preferences.productTour.status,
  ).toBe('dismissed');
  await expect(tour).toBeHidden();
  await p.getByRole('button', { name: 'Aide et visite guidée', exact: true }).tap();
  await p.getByRole('button', { name: 'Lancer la visite guidée', exact: true }).tap();
  await expect(tour).toBeVisible();
  const closedSaved = p.waitForResponse(
    (r) => r.url().includes('/api/user/preferences') && r.request().method() === 'PATCH',
  );
  await tour.getByRole('button', { name: 'Fermer la visite guidée', exact: true }).tap();
  expect((await closedSaved).ok()).toBe(true);
  expect(
    (await (await p.request.get('http://127.0.0.1:5207/api/user/preferences')).json()).preferences.productTour.status,
  ).toBe('dismissed');
  await expect(tour).toBeHidden();
  await p.reload();
  await restore.waitFor();
  await expect(restore).toBeVisible();
  expect((await p.locator('main.vc-user-area-shell').getAttribute('style')) ?? '').not.toContain(
    '--vc-product-tour-height',
  );
  await p.screenshot({ path: '/workspace/ux-artifacts/integration-tour-after-dismiss-mobile-fr.png' });
  console.log(
    JSON.stringify({
      viewport: [390, 844],
      label,
      createWhileTourOpen: true,
      focusedButtonHitVisible: true,
      cancelFocusVisible: true,
      laterPersisted: true,
      closePersisted: true,
      paddingRemoved: true,
    }),
  );
  await b.close();
})();
