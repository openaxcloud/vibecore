import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

/**
 * BUG-MOBILE-MCP-001 — la feuille « Outils MCP » s'ouvrait HORS de l'écran.
 *
 * Capture iPhone d'Avi, 05/09 22:59 : titre, boutons et « Fermer » coupés à
 * droite, le fil disparu derrière. Mesuré sur le build de production, Chromium
 * 390 : left = 195 px pour une boîte de 366 px ; à 1440 : left = 720 px. Le
 * coin haut-gauche de la modale au CENTRE de l'écran, sur toutes les tailles :
 * `@keyframes vc-modal-in` animait `transform` et, en `fill-mode: both`,
 * remplaçait pour toujours le `translate(-50%, -50%)` qui centre les modales.
 *
 * Ce test ouvre la vraie modale par le vrai menu et mesure sa boîte.
 */

const appBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';
const apiBaseUrl = process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';

async function ouvrirUnProjet(request: APIRequestContext) {
  const suffixe = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  let dernier = '';

  for (let essai = 0; essai < 4; essai += 1) {
    const inscription = await request.post(`${apiBaseUrl}/auth/register`, {
      data: {
        email: `mcp-${suffixe}-${essai}@local.test`,
        password: 'Password123!',
        name: 'Modale outils',
        organizationName: `Modale outils ${suffixe}-${essai}`,
      },
    });

    dernier = await inscription.text();

    if (inscription.ok()) {
      const auth = JSON.parse(dernier) as { token: string; organization: { id: string } };
      const entetes = { authorization: `Bearer ${auth.token}` };

      const projet = await request.post(`${apiBaseUrl}/orgs/${auth.organization.id}/projects`, {
        headers: entetes,
        data: { name: 'Modale outils' },
      });

      const projectId = (await projet.json()).project.id as string;

      /*
       * Un fil réel : la modale se mesure dans l'IDE tel qu'on l'utilise, pas
       * sur un projet vide dont le composeur n'a pas la même forme.
       */
      const conversation = await request.post(`${apiBaseUrl}/projects/${projectId}/ai/conversations`, {
        headers: entetes,
        data: { title: 'Modale outils' },
      });

      const conversationId = (await conversation.json()).conversation.id as string;

      await request.put(`${apiBaseUrl}/projects/${projectId}/ai/conversations/${conversationId}/transcript`, {
        headers: entetes,
        data: {
          messages: [
            { clientId: 'u1', role: 'user', content: 'Ajoute une page de contact.' },
            { clientId: 'a1', role: 'assistant', content: 'La page de contact est créée.' },
          ],
        },
      });
      await request.put(`${apiBaseUrl}/projects/${projectId}/ide-state`, {
        headers: entetes,
        data: { state: { chat: { metadata: { aiConversationId: conversationId } } } },
      });

      return { token: auth.token, projectId };
    }

    if (inscription.status() === 429 && essai < 3) {
      await new Promise((resoudre) => setTimeout(resoudre, 11_000));
      continue;
    }

    break;
  }

  throw new Error(`Impossible de préparer un projet : ${dernier}`);
}

async function ouvrirLaModale(page: Page, request: APIRequestContext) {
  const { token, projectId } = await ouvrirUnProjet(request);

  await page
    .context()
    .addCookies([{ name: 'vc_session', value: token, url: appBaseUrl, httpOnly: true, sameSite: 'Lax' }]);
  await page.goto(`/projects/${projectId}/ide`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.bolt-chat-message-row').first()).toBeVisible({ timeout: 60_000 });

  /* Le menu « … » du composeur, puis son entrée MCP — libellés FR ou EN. */
  await page
    .getByRole('button', { name: /Plus d’options|More composer/ })
    .first()
    .click({ timeout: 60_000 });

  /*
   * Le déclencheur, NOMMÉ précisément : un projet ou une commande dont le nom
   * contient « MCP » ferait passer « Renommer … » ou « Spotlight … » devant.
   * Mesuré : le premier /MCP/ était le bouton de renommage du projet.
   */
  const entreeMcp = page.getByRole('button', { name: /^(Outils MCP|MCP tools)/ }).first();

  await expect(entreeMcp).toBeEnabled({ timeout: 60_000 });
  await entreeMcp.click();

  const modale = page.locator('[role="dialog"]').last();

  await expect(modale).toBeVisible({ timeout: 15_000 });

  // L'animation d'entrée dure ~200 ms : mesurer l'état FINAL, celui qui reste.
  await page.waitForTimeout(600);

  return modale;
}

async function boite(modale: ReturnType<Page['locator']>) {
  return modale.evaluate((element) => {
    const b = element.getBoundingClientRect();

    return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, vw: innerWidth, vh: innerHeight };
  });
}

for (const [nom, viewport, mobile] of [
  ['mobile 390', { width: 390, height: 844 }, true],
  ['bureau 1440', { width: 1440, height: 900 }, false],
] as const) {
  test.describe(`modale « Outils MCP » — ${nom}`, () => {
    test.use(mobile ? { viewport, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport });

    test('tient entière dans l’écran, centrée', async ({ page, request }) => {
      test.setTimeout(120_000);

      const modale = await ouvrirLaModale(page, request);
      const b = await boite(modale);

      expect(b.left, `bord gauche ${b.left}px`).toBeGreaterThanOrEqual(0);
      expect(b.top, `bord haut ${b.top}px`).toBeGreaterThanOrEqual(0);
      expect(b.right, `bord droit ${b.right}px pour ${b.vw}px de large`).toBeLessThanOrEqual(b.vw);
      expect(b.bottom, `bord bas ${b.bottom}px pour ${b.vh}px de haut`).toBeLessThanOrEqual(b.vh);

      // 195 px de left mesurés avant : le coin haut-gauche au milieu de l'écran.
      const centre = (b.left + b.right) / 2;

      expect(Math.abs(centre - b.vw / 2), `centre à ${centre}px, écran de ${b.vw}px`).toBeLessThanOrEqual(2);
    });
  });
}
