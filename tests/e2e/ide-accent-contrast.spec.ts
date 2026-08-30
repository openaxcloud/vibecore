import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

/**
 * CHARTE-IDE-001 — garde d'accessibilité de l'accent de l'IDE.
 *
 * L'accent d'action est passé du bleu à l'orange de marque E-Code. L'orange ne
 * pardonne pas : sur son aplat VIF du thème sombre (#f97316) un libellé blanc
 * tombe à 2,80:1, très en dessous du seuil AA de 4,5:1. La règle tenue par ce
 * test est donc simple et vaut dans les deux thèmes :
 *
 *   tout texte peint SUR un aplat accent, et tout texte peint AVEC l'accent,
 *   respecte AA sur le fond réellement rendu.
 *
 * Mesure : on compose l'alpha du fond avant de calculer. Sans ça, les boutons
 * « fantôme » (accent à 9 % d'opacité) sont comptés comme des aplats pleins et
 * produisent de faux échecs à 1,2:1 — piège rencontré en écrivant ce test.
 */

const appBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';
const apiBaseUrl = process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';

/*
 * Une seule surface, mais choisie pour être DENSE en accent et toujours rendue :
 * le composer Agent porte les puces de mode (aplat accent) et le badge de coût,
 * sans dépendre d'un runtime d'espace de travail. Les quatre panneaux de la
 * première version dépassaient le budget de temps en CI et mesuraient surtout
 * des écrans de chargement.
 */
const PANNEAUX = ['agent'] as const;
const THEMES = ['light', 'dark'] as const;

type AuthPayload = { token: string; organization: { id: string } };

type Mesure = { role: 'aplat' | 'texte'; texte: string; ratio: number; requis: number };

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
        email: `ide-accent-${suffix}-${attempt}@local.test`,
        password: 'Password123!',
        name: 'IDE Accent E2E',
        organizationName: `IDE Accent E2E ${suffix}-${attempt}`,
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

  throw new Error(responseText || 'Unable to authenticate IDE accent user');
}

async function createProject(request: APIRequestContext, auth: AuthPayload) {
  const response = await request.post(`${apiBaseUrl}/orgs/${auth.organization.id}/projects`, {
    headers: { authorization: `Bearer ${auth.token}` },
    data: { name: 'IDE accent contrast project' },
  });

  expect(response.ok(), await response.text()).toBeTruthy();

  return (await response.json()).project.id as string;
}

function mesurerAccent(page: Page): Promise<Mesure[]> {
  return page.evaluate(() => {
    const parse = (c: string | null) => {
      if (!c) {
        return null;
      }

      if (c.startsWith('color(')) {
        const m = c.match(/[\d.]+/g);
        return m ? { r: +m[0] * 255, g: +m[1] * 255, b: +m[2] * 255, a: m[3] !== undefined ? +m[3] : 1 } : null;
      }

      const m = c.match(/[\d.]+/g);

      return m ? { r: +m[0], g: +m[1], b: +m[2], a: m[3] !== undefined ? +m[3] : 1 } : null;
    };

    type Couleur = { r: number; g: number; b: number; a: number };

    const lum = ({ r, g, b }: { r: number; g: number; b: number }) => {
      const f = (v: number) => {
        const n = v / 255;
        return n <= 0.03928 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4);
      };

      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };

    const blend = (fg: Couleur, bg: { r: number; g: number; b: number }) => ({
      r: fg.r * fg.a + bg.r * (1 - fg.a),
      g: fg.g * fg.a + bg.g * (1 - fg.a),
      b: fg.b * fg.a + bg.b * (1 - fg.a),
      a: 1,
    });

    const ratio = (a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }) => {
      const l1 = lum(a);
      const l2 = lum(b);

      return +((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)).toFixed(2);
    };

    const hexOf = (c: string) => {
      const p = parse(c);

      return p ? `#${[p.r, p.g, p.b].map((n) => Math.round(n).toString(16).padStart(2, '0')).join('')}` : '';
    };

    const accent = getComputedStyle(document.documentElement)
      .getPropertyValue('--vc-ide-accent-action')
      .trim()
      .toLowerCase();

    /*
     * Fond RÉELLEMENT peint sous l'élément : plusieurs surfaces sont posées par
     * des calques frères en position absolue, qu'une remontée d'ancêtres rate.
     */
    const fondSous = (el: Element) => {
      const r = el.getBoundingClientRect();
      const x = Math.min(window.innerWidth - 2, Math.max(2, r.x + Math.min(r.width / 2, 40)));
      const y = Math.min(window.innerHeight - 2, Math.max(2, r.y + r.height / 2));

      for (const n of document.elementsFromPoint(x, y)) {
        if (n === el || el.contains(n)) {
          continue;
        }

        const c = parse(getComputedStyle(n).backgroundColor);

        if (c && c.a > 0.85) {
          return c;
        }
      }

      return parse(getComputedStyle(document.body).backgroundColor)!;
    };

    const mesures: Array<{ role: 'aplat' | 'texte'; texte: string; ratio: number; requis: number }> = [];

    document.querySelectorAll('*').forEach((el) => {
      const r = el.getBoundingClientRect();

      if (r.width < 6 || r.height < 6) {
        return;
      }

      const porteDuTexte = [...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? '').trim());

      if (!porteDuTexte) {
        return;
      }

      const st = getComputedStyle(el);
      const taille = parseFloat(st.fontSize);
      const requis = taille >= 24 || (taille >= 18.66 && parseInt(st.fontWeight, 10) >= 700) ? 3 : 4.5;
      const fondBrut = parse(st.backgroundColor);

      const texte = (el.textContent ?? '').trim().slice(0, 24);

      // Un fond translucide n'est pas un aplat : il faut le composer d'abord.
      if (fondBrut && fondBrut.a > 0.95 && hexOf(st.backgroundColor) === accent) {
        let fg = parse(st.color)!;

        if (fg.a < 1) {
          fg = blend(fg, fondBrut);
        }

        mesures.push({ role: 'aplat', texte, ratio: ratio(fg, fondBrut), requis });

        return;
      }

      if (hexOf(st.color) === accent) {
        const sous = fondSous(el);
        const fond = fondBrut && fondBrut.a > 0.02 && fondBrut.a <= 0.95 ? blend(fondBrut, sous) : sous;

        let fg = parse(st.color)!;

        if (fg.a < 1) {
          fg = blend(fg, fond);
        }

        mesures.push({ role: 'texte', texte, ratio: ratio(fg, fond), requis });
      }
    });

    return mesures;
  });
}

test('l’accent de l’IDE respecte AA en aplat comme en texte, dans les deux thèmes', async ({
  page,
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'contrat desktop');
  test.setTimeout(420_000);

  const auth = await authenticate(request);
  const projectId = await createProject(request, auth);

  const echecs: string[] = [];

  let mesuresTotales = 0;

  for (const theme of THEMES) {
    await page.context().clearCookies();
    await page.context().addCookies([
      { name: 'vc_session', value: auth.token, url: appBaseUrl, httpOnly: true, sameSite: 'Lax' },
      { name: 'ecode_theme', value: theme, url: appBaseUrl, sameSite: 'Lax' },
    ]);
    await page.addInitScript((t) => {
      try {
        localStorage.setItem('bolt_theme', t as string);
      } catch {
        // stockage bloqué : le cookie fait foi
      }
    }, theme);

    for (const panneau of PANNEAUX) {
      await test.step(`${theme} / ${panneau}`, async () => {
        await page.goto(`/projects/${projectId}/ide?panel=${panneau}`, { waitUntil: 'domcontentloaded' });

        /*
         * On attend un élément qui PORTE l'accent, pas seulement la coque : sans
         * ça le balayage part trop tôt et ne mesure qu'un écran de chargement.
         */
        await page
          .locator('[data-testid="agent-mode-segmented"]')
          .first()
          .waitFor({ state: 'visible', timeout: 180_000 });

        const mesures = await mesurerAccent(page);
        mesuresTotales += mesures.length;

        for (const m of mesures) {
          if (m.ratio < m.requis) {
            echecs.push(`[${theme}/${panneau}] ${m.role} « ${m.texte} » ${m.ratio}:1 < ${m.requis}`);
          }
        }
      });
    }
  }

  /*
   * Le balayage doit avoir VU de l'accent : un sélecteur cassé passerait sinon
   * en silence. Portée assumée : le composer Agent porte deux éléments accent
   * par thème (la puce de mode active, en aplat, et le badge de coût, en
   * texte) — soit quatre mesures au total. C'est étroit, mais c'est exactement
   * la paire aplat/texte que le changement de charte met en jeu.
   */
  expect(mesuresTotales, 'aucun élément accent mesuré — le balayage ne prouve rien').toBeGreaterThanOrEqual(4);
  expect(echecs, `contrastes sous AA :\n${echecs.join('\n')}`).toEqual([]);
});
