import { expect, test, type APIRequestContext } from '@playwright/test';

/**
 * IOS-ZOOM-001 — aucun champ ne doit descendre sous 16 px de police RENDUE.
 *
 * Safari iOS zoome sur tout champ dont la police calculée est inférieure à
 * 16 px, et ne dézoome jamais tout seul. Avi le constate sur la zone de saisie
 * de l'agent : l'écran saute dès qu'il touche le champ.
 *
 * Un test qui lirait les classes ne verrait rien : le balisage écrit `text-base`
 * — donc 1rem, la bonne valeur. C'est la base rem, redéfinie à 14 px sous
 * 1024 px, qui la dégonfle. Seule la police CALCULÉE par le navigateur révèle
 * l'écart, exactement comme pour les cibles tactiles.
 */

const IOS_MIN_FONT_PX = 16;

/** Formats où Safari iOS zoome. Le desktop ne zoome pas au focus. */
const VIEWPORTS = [
  { label: 'mobile 390', width: 390, height: 844 },
  { label: 'tablette 768', width: 768, height: 1024 },
] as const;

const ROUTES = ['/login', '/signup', '/register', '/forgot-password'] as const;

type Field = { libelle: string; balise: string; police: number; type: string };

async function measureFields(page: import('@playwright/test').Page): Promise<Field[]> {
  return page.evaluate(() => {
    const NON_TEXTUEL = ['checkbox', 'radio', 'range', 'color', 'file', 'hidden', 'submit', 'button', 'image', 'reset'];

    return Array.from(document.querySelectorAll('input, textarea, select'))
      .filter((el) => {
        const style = getComputedStyle(el);
        const box = el.getBoundingClientRect();
        const type = (el as HTMLInputElement).type ?? '';

        return (
          box.width > 0 &&
          box.height > 0 &&
          style.visibility !== 'hidden' &&
          style.display !== 'none' &&
          !NON_TEXTUEL.includes(type)
        );
      })
      .map((el) => ({
        libelle: (
          el.getAttribute('placeholder') ||
          el.getAttribute('aria-label') ||
          el.getAttribute('name') ||
          ''
        ).slice(0, 40),
        balise: el.tagName.toLowerCase(),
        type: (el as HTMLInputElement).type ?? '',
        police: parseFloat(getComputedStyle(el).fontSize),
      }));
  });
}

for (const viewport of VIEWPORTS) {
  test(`aucun champ sous ${IOS_MIN_FONT_PX}px — ${viewport.label}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });

    const fautifs: Array<Field & { route: string }> = [];

    for (const route of ROUTES) {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('input, textarea', { timeout: 20_000 });

      const champs = await measureFields(page);

      /*
       * Sans ce garde-fou, une erreur de sélecteur ou une page qui n'a pas fini
       * de rendre donnerait « aucun champ fautif » sur une page jamais regardée.
       * Le compteur transforme un faux négatif silencieux en échec bruyant.
       */
      expect(champs.length, `aucun champ mesuré sur ${route}`).toBeGreaterThan(0);

      for (const champ of champs) {
        if (champ.police < IOS_MIN_FONT_PX) {
          fautifs.push({ ...champ, route });
        }
      }
    }

    expect(
      fautifs,
      fautifs.map((c) => `${c.route} — ${c.balise}[${c.type}] « ${c.libelle} » : ${c.police}px`).join('\n'),
    ).toEqual([]);
  });
}

test('la mesure détecte réellement un champ trop petit', async ({ page }) => {
  /*
   * Le contre-test. Sans lui, une suite verte pourrait simplement signifier que
   * la mesure ne regarde rien — c'est le piège rencontré trois fois aujourd'hui.
   */
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input', { timeout: 20_000 });

  expect((await measureFields(page)).every((c) => c.police >= IOS_MIN_FONT_PX)).toBe(true);

  /*
   * On force la petite taille par un style EN LIGNE marqué `!important`.
   *
   * Une feuille injectée ne suffit plus : le plancher est déclaré
   * `input:not([type='checkbox'])… { font-size: 16px !important }`, une règle
   * PLUS SPÉCIFIQUE qu'un simple `input`. À `!important` égal, la spécificité
   * tranche — et le plancher gagne, ce qui est exactement le but.
   *
   * Ce premier jet de contre-test échouait donc en PROUVANT que le correctif
   * marche. Un style en ligne `!important` est le seul niveau qui batte une
   * règle de feuille : la mesure doit le voir tomber sous le seuil.
   */
  await page.evaluate(() => {
    const field = document.querySelector('input:not([type=checkbox]):not([type=radio])');
    (field as HTMLElement | null)?.style.setProperty('font-size', '12px', 'important');
  });

  expect((await measureFields(page)).some((c) => c.police < IOS_MIN_FONT_PX)).toBe(true);
});

test('la balise viewport n’interdit pas le zoom volontaire', async ({ page }) => {
  /*
   * La solution de facilité pour ce bug est `maximum-scale=1` /
   * `user-scalable=no`. Elle empêche l'utilisateur de zoomer lui-même — un vrai
   * défaut d'accessibilité — et ne corrige pas la cause. Ce cas interdit de la
   * réintroduire par commodité.
   */
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/login', { waitUntil: 'domcontentloaded' });

  const contenu = await page.getAttribute('meta[name="viewport"]', 'content');

  expect(contenu).toBeTruthy();
  expect(contenu).not.toMatch(/maximum-scale\s*=\s*1(\.0)?\b/);
  expect(contenu).not.toMatch(/user-scalable\s*=\s*(no|0)/);
});

/*
 * La zone de saisie de l'agent — le champ qui avait MOTIVÉ IOS-ZOOM-001 et que la
 * suite ne regardait pas.
 *
 * Les routes publiques ci-dessus respectaient déjà le plancher : le test était
 * vert sur des pages qui n'avaient jamais eu le défaut, pendant que le champ
 * signalé rendait 14 px. Il faut donc s'authentifier et ouvrir un vrai projet
 * pour mesurer la seule surface qui comptait.
 */
const appBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';
const apiBaseUrl = process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';

async function createProjectSession(request: APIRequestContext) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  let lastBody = '';

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const registration = await request.post(`${apiBaseUrl}/auth/register`, {
      data: {
        email: `ios-zoom-agent-${suffix}-${attempt}@local.test`,
        password: 'Password123!',
        name: 'iOS zoom agent composer',
        organizationName: `iOS zoom agent ${suffix}-${attempt}`,
      },
    });

    lastBody = await registration.text();

    if (registration.ok()) {
      const auth = JSON.parse(lastBody) as { token: string; organization: { id: string } };

      const project = await request.post(`${apiBaseUrl}/orgs/${auth.organization.id}/projects`, {
        headers: { authorization: `Bearer ${auth.token}` },
        data: { name: 'iOS zoom agent composer' },
      });

      expect(project.ok(), await project.text()).toBeTruthy();

      return {
        token: auth.token,
        projectId: (await project.json()).project.id as string,
      };
    }

    // /auth/register est limité par IP ; on patiente plutôt que de rougir la suite.
    if (registration.status() === 429 && attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, 11_000));
      continue;
    }

    break;
  }

  throw new Error(`Impossible d'ouvrir une session de test : ${lastBody}`);
}

for (const viewport of VIEWPORTS) {
  test(`la zone de saisie de l'agent tient le plancher — ${viewport.label}`, async ({ page, request }) => {
    const { token, projectId } = await createProjectSession(request);

    await page
      .context()
      .addCookies([{ name: 'vc_session', value: token, url: appBaseUrl, httpOnly: true, sameSite: 'Lax' }]);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(`/projects/${projectId}/ide`, { waitUntil: 'domcontentloaded' });

    const composerField = page.locator('.bolt-project-chatbox textarea');
    await expect(composerField).toBeVisible({ timeout: 60_000 });

    const police = await composerField.evaluate((element) => parseFloat(getComputedStyle(element).fontSize));

    /*
     * Témoin positif : sans lui, un sélecteur qui ne matche plus donnerait un
     * « aucun champ fautif » sur une page jamais regardée — le piège que ce
     * fichier documente déjà plus haut.
     */
    expect(Number.isFinite(police), 'police non mesurée sur la zone de saisie de l’agent').toBe(true);

    expect(police, `zone de saisie de l’agent en ${viewport.label} : ${police}px`).toBeGreaterThanOrEqual(
      IOS_MIN_FONT_PX,
    );
  });
}
