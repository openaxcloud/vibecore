import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

/**
 * TACTILE-001 — cible tactile minimale de la coque compacte.
 *
 * Décision d'Avi : « pour tablet ce doit être comme mobile ». La coque compacte
 * s'applique sous 1200px, donc à 390 ET 768 — ce test mesure les deux largeurs
 * avec les mêmes exigences, jamais la tablette comme un desktop rétréci.
 *
 * Mesuré avant correctif, sur 4 panneaux : 49 contrôles distincts sous 44px —
 * les 4 boutons du socle à 36×36, le déclencheur de recherche à 20px de haut,
 * et 21 contrôles de contenu uniformément à 42px (2px trop court).
 */

const appBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';
const apiBaseUrl = process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';

const CIBLE_MIN = 44;
const LARGEURS = [390, 768] as const;
const PANNEAUX = ['agent', 'activity'] as const;

type AuthPayload = { token: string; organization: { id: string } };

type Controle = { nom: string; largeur: number; hauteur: number };

async function waitForRateLimitReset(responseText: string, fallbackMs = 10_000) {
  const seconds = Number(responseText.match(/retry in (\d+) seconds/i)?.[1]);
  const waitMs = Number.isFinite(seconds) ? (seconds + 1) * 1000 : fallbackMs;

  await new Promise((resolve) => setTimeout(resolve, waitMs));
}

async function authenticate(request: APIRequestContext): Promise<AuthPayload> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  let responseText = '';

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await request.post(`${apiBaseUrl}/auth/register`, {
      data: {
        email: `ide-touch-${suffix}-${attempt}@local.test`,
        password: 'Password123!',
        name: 'IDE Touch E2E',
        organizationName: `IDE Touch E2E ${suffix}-${attempt}`,
      },
    });

    responseText = await response.text();

    if (response.ok()) {
      return JSON.parse(responseText) as AuthPayload;
    }

    if (response.status() === 429 && attempt < 3) {
      await waitForRateLimitReset(responseText);
      continue;
    }

    expect(response.ok(), responseText).toBeTruthy();
  }

  throw new Error(responseText || 'Unable to authenticate IDE touch user');
}

async function createProject(request: APIRequestContext, auth: AuthPayload) {
  const response = await request.post(`${apiBaseUrl}/orgs/${auth.organization.id}/projects`, {
    headers: { authorization: `Bearer ${auth.token}` },
    data: { name: 'IDE touch targets project' },
  });

  expect(response.ok(), await response.text()).toBeTruthy();

  return (await response.json()).project.id as string;
}

function mesurerControles(page: Page, cibleMin: number): Promise<Controle[]> {
  return page.evaluate((min) => {
    const tropPetits: Array<{ nom: string; largeur: number; hauteur: number }> = [];
    const vus = new Set<string>();

    document
      .querySelectorAll('button, a[href], [role="button"], [role="tab"], input:not([type="hidden"]), select, summary')
      .forEach((el) => {
        const r = el.getBoundingClientRect();

        if (r.width < 1 || r.height < 1) {
          return;
        }

        const st = getComputedStyle(el);

        if (st.visibility === 'hidden' || st.display === 'none' || Number(st.opacity) === 0) {
          return;
        }

        const nom = (
          el.getAttribute('aria-label') ||
          el.getAttribute('title') ||
          (el.textContent ?? '').trim() ||
          el.getAttribute('placeholder') ||
          el.tagName
        ).slice(0, 42);

        const cle = `${nom}|${Math.round(r.width)}x${Math.round(r.height)}`;

        if (vus.has(cle)) {
          return;
        }

        vus.add(cle);

        if (r.width < min || r.height < min) {
          tropPetits.push({ nom, largeur: Math.round(r.width), hauteur: Math.round(r.height) });
        }
      });

    return tropPetits;
  }, cibleMin);
}

test('la coque compacte tient la cible tactile de 44px, à 390 comme à 768', async ({ browser, request }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'le test pilote lui-même ses largeurs');
  test.setTimeout(240_000);

  const auth = await authenticate(request);
  const projectId = await createProject(request, auth);

  const echecs: string[] = [];

  let controlesVus = 0;

  for (const largeur of LARGEURS) {
    const context = await browser.newContext({
      viewport: { width: largeur, height: 844 },
      hasTouch: true,
      isMobile: largeur < 768,
    });

    await context.addCookies([
      { name: 'vc_session', value: auth.token, url: appBaseUrl, httpOnly: true, sameSite: 'Lax' },
    ]);

    const page = await context.newPage();

    for (const panneau of PANNEAUX) {
      await test.step(`${largeur}px / ${panneau}`, async () => {
        await page.goto(`${appBaseUrl}/projects/${projectId}/ide?panel=${panneau}`, {
          waitUntil: 'domcontentloaded',
          timeout: 120_000,
        });
        await page.waitForTimeout(5_000);

        controlesVus += await page.evaluate(
          () => document.querySelectorAll('button, a[href], [role="button"], [role="tab"]').length,
        );

        for (const c of await mesurerControles(page, CIBLE_MIN)) {
          echecs.push(`[${largeur}/${panneau}] ${c.largeur}×${c.hauteur} « ${c.nom} »`);
        }
      });
    }

    await context.close();
  }

  // Garde anti-test-vacant : un sélecteur cassé ne doit pas passer pour un succès.
  expect(controlesVus, 'aucun contrôle mesuré — le balayage ne prouve rien').toBeGreaterThan(10);
  expect(echecs, `contrôles sous ${CIBLE_MIN}px :\n${echecs.join('\n')}`).toEqual([]);
});
