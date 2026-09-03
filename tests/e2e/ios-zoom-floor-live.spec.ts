import { expect, test, type Page } from '@playwright/test';

/**
 * Aucun champ de saisie sous 16px en dessous de 1024px de large.
 *
 * C'est le plancher qui empêche Safari iOS de zoomer sur un champ focalisé — et
 * de ne jamais dézoomer ensuite. Une seule exception suffit à ramener le défaut.
 *
 * ⚠️ CE TEST PORTE SON PROPRE TÉMOIN, et il refuse de conclure sans lui.
 *
 * Sans témoin, un « 0 champ fautif » ne distingue pas « tout va bien » de « je
 * ne regarde pas au bon endroit ». Mesuré pendant l'écriture de ce test : une
 * première version injectait un témoin à 12px par style en ligne ordinaire — le
 * plancher du produit, qui est en `!important`, le relevait à 16px, et le
 * témoin devenait aveugle. Il est donc posé en `!important` lui aussi.
 */

const appBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';

const PAGES = ['/login', '/register'];

async function poserLeTemoin(page: Page) {
  await page.evaluate(() => {
    const temoin = document.createElement('input');
    temoin.id = 'temoin-plancher-ios';
    temoin.setAttribute('aria-label', 'TEMOIN plancher');
    temoin.style.cssText = 'position:fixed;top:0;left:0;width:80px;height:24px;z-index:99999';

    /* Le plancher du produit est en `!important` : le témoin doit l'être aussi. */
    temoin.style.setProperty('font-size', '12px', 'important');
    document.body.appendChild(temoin);
  });
}

async function releverLesChamps(page: Page) {
  return page.evaluate(() => {
    /*
     * Seuls les champs de SAISIE DE TEXTE font zoomer Safari. Une case à cocher
     * ou un bouton radio n'ouvrent pas de clavier et ne déclenchent rien.
     *
     * Mesuré pendant l'écriture de ce test : sans cette restriction, il
     * signalait `input[name=rememberMe]` — une case à cocher à 14px — et aurait
     * donc exigé un changement sans effet sur le défaut qu'il garde.
     */
    const NON_TEXTUELS = [
      'checkbox',
      'radio',
      'range',
      'color',
      'file',
      'button',
      'submit',
      'reset',
      'image',
      'hidden',
    ];

    const visibles = [...document.querySelectorAll('input, textarea, select')].filter((champ) => {
      const boite = champ.getBoundingClientRect();

      if (boite.width <= 4 || boite.height <= 4) {
        return false;
      }

      const type = (champ.getAttribute('type') ?? '').toLowerCase();

      return !NON_TEXTUELS.includes(type);
    });

    return visibles.map((champ) => ({
      sous16: parseFloat(getComputedStyle(champ).fontSize) < 16,
      temoin: (champ.getAttribute('aria-label') ?? '').includes('TEMOIN'),
      description: `${champ.tagName.toLowerCase()} « ${(
        champ.getAttribute('aria-label') ??
        champ.getAttribute('placeholder') ??
        champ.getAttribute('name') ??
        '?'
      ).slice(0, 40)} » à ${Math.round(parseFloat(getComputedStyle(champ).fontSize) * 10) / 10}px`,
    }));
  });
}

for (const chemin of PAGES) {
  test(`aucun champ sous le plancher de 16px — ${chemin}`, async ({ page }) => {
    test.setTimeout(120_000);

    await page.setViewportSize({ width: 393, height: 659 });
    await page.goto(`${appBaseUrl}${chemin}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('input, textarea, select').first()).toBeVisible({ timeout: 60_000 });

    await poserLeTemoin(page);

    const champs = await releverLesChamps(page);
    const temoin = champs.find((champ) => champ.temoin);

    expect(temoin, 'le témoin n’a pas été monté').toBeTruthy();
    expect(temoin!.sous16, 'le témoin doit être vu SOUS le plancher, sinon la mesure est aveugle').toBe(true);

    const fautifs = champs.filter((champ) => champ.sous16 && !champ.temoin).map((champ) => champ.description);

    expect(fautifs, `\n${fautifs.join('\n')}\n`).toEqual([]);
  });
}
