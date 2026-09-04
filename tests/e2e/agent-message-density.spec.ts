import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

/**
 * Densité des bulles de message du panneau Agent.
 *
 * Référence donnée : la conversation de Claude — texte dense, marges serrées,
 * actions discrètes qui n'apparaissent qu'au survol ou au toucher.
 *
 * Avant : un bandeau « Agent » à fond plein au-dessus de CHAQUE réponse, une
 * barre de cinq icônes rendue en permanence sous chacune (47 px en 390, surmontée
 * d'un filet), et 11 px d'écart entre lignes venant d'un `gap-4` en rem — donc
 * 14 px en mobile et 12 px en desktop, l'inverse de l'intention.
 */

const appBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';
const apiBaseUrl = process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';

/** Écart maximal toléré entre deux lignes de message, en pixels. */
const MAX_ROW_GAP_PX = 8;

async function seedConversation(request: APIRequestContext) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  let lastBody = '';

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const registration = await request.post(`${apiBaseUrl}/auth/register`, {
      data: {
        email: `agent-density-${suffix}-${attempt}@local.test`,
        password: 'Password123!',
        name: 'Agent message density',
        organizationName: `Agent message density ${suffix}-${attempt}`,
      },
    });

    lastBody = await registration.text();

    if (!registration.ok()) {
      // /auth/register est limité par IP ; on patiente plutôt que de rougir la suite.
      if (registration.status() === 429 && attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 11_000));
        continue;
      }

      break;
    }

    const auth = JSON.parse(lastBody) as { token: string; organization: { id: string } };
    const headers = { authorization: `Bearer ${auth.token}` };

    const project = await request.post(`${apiBaseUrl}/orgs/${auth.organization.id}/projects`, {
      headers,
      data: { name: 'Agent message density' },
    });
    expect(project.ok(), await project.text()).toBeTruthy();

    const projectId = (await project.json()).project.id as string;

    const conversation = await request.post(`${apiBaseUrl}/projects/${projectId}/ai/conversations`, {
      headers,
      data: { title: 'Densité' },
    });
    expect(conversation.ok(), await conversation.text()).toBeTruthy();

    const conversationId = (await conversation.json()).conversation.id as string;

    const messages = [1, 2, 3].flatMap((turn) => [
      { clientId: `u-${turn}`, role: 'user', content: `Ajoute une page de contact (tour ${turn}).` },
      {
        clientId: `a-${turn}`,
        role: 'assistant',
        content: `Je vais ajouter la page de contact (tour ${turn}).\n\nLa page est créée et la compilation passe.`,
      },
    ]);

    const transcript = await request.put(
      `${apiBaseUrl}/projects/${projectId}/ai/conversations/${conversationId}/transcript`,
      { headers, data: { messages } },
    );
    expect(transcript.ok(), await transcript.text()).toBeTruthy();

    // Le panneau retrouve la conversation par la mémoire d'IDE du projet.
    const ideState = await request.put(`${apiBaseUrl}/projects/${projectId}/ide-state`, {
      headers,
      data: { state: { chat: { metadata: { aiConversationId: conversationId } } } },
    });
    expect(ideState.ok(), await ideState.text()).toBeTruthy();

    return { token: auth.token, projectId };
  }

  throw new Error(`Impossible de préparer un fil de test : ${lastBody}`);
}

async function openTranscript(page: Page, request: APIRequestContext) {
  const { token, projectId } = await seedConversation(request);

  await page
    .context()
    .addCookies([{ name: 'vc_session', value: token, url: appBaseUrl, httpOnly: true, sameSite: 'Lax' }]);
  await page.goto(`/projects/${projectId}/ide`, { waitUntil: 'domcontentloaded' });

  const rows = page.locator('.bolt-chat-message-row');
  await expect(rows.first()).toBeVisible({ timeout: 60_000 });
  await expect(rows).toHaveCount(6, { timeout: 60_000 });

  return rows;
}

async function measureRows(page: Page) {
  return page.evaluate(() => {
    const rows = [...document.querySelectorAll('.bolt-chat-message-row')];
    const gaps: number[] = [];

    for (let i = 1; i < rows.length; i += 1) {
      gaps.push(rows[i].getBoundingClientRect().top - rows[i - 1].getBoundingClientRect().bottom);
    }

    const footers = [...document.querySelectorAll('.bolt-assistant-message-footer')];

    /*
     * Diagnostic de la dernière ligne : sa barre reste dépliée par
     * `:last-child`, donc tout frère rendu APRÈS elle (indicateur de
     * flux, sentinelle) la replie. Rouge en CI (E2E 1339, 3/3) sans qu'on
     * puisse lire pourquoi : on le note ici, dans le message d'échec.
     */
    const lastRow = rows.at(-1) ?? null;
    const trailing = lastRow?.nextElementSibling ?? null;

    /*
     * Diagnostic de la PREMIÈRE barre, celle que le survol et le toucher
     * visent. Rouge 3/3 en CI (E2E 1351 : survol → opacité 0, toucher →
     * hauteur 0) et vert sur le MÊME build en local : la mesure doit dire, dans
     * le message d'échec, si la barre est bien dans la ligne visée, ce que le
     * moteur calcule pour elle, et ce que les media queries rendent.
     */
    const firstRow = rows[1] ?? null;
    const firstFooter = footers[0] ?? null;
    const firstStyle = firstFooter ? getComputedStyle(firstFooter) : null;

    const diagnostic = {
      hoverMedia: matchMedia('(hover: hover)').matches ? 'hover' : matchMedia('(hover: none)').matches ? 'none' : '?',
      pointerMedia: matchMedia('(pointer: coarse)').matches
        ? 'coarse'
        : matchMedia('(pointer: fine)').matches
          ? 'fine'
          : '?',
      viewport: `${innerWidth}x${innerHeight}`,
      firstFooterInFirstRow: firstRow && firstFooter ? firstRow.contains(firstFooter) : null,
      firstRowHovered: firstRow ? firstRow.matches(':hover') : null,
      firstRowRevealed: firstRow?.getAttribute('data-actions-revealed') ?? null,
      firstRowFocusWithin: firstRow ? firstRow.matches(':focus-within') : null,
      firstFooter: firstStyle
        ? `display=${firstStyle.display} height=${firstStyle.height} opacity=${firstStyle.opacity} overflow=${firstStyle.overflow} children=${firstFooter?.childElementCount}`
        : null,
      styleSheets: document.styleSheets.length,
      footerRules: [...document.styleSheets].reduce((total, sheet) => {
        try {
          return (
            total + [...sheet.cssRules].filter((rule) => rule.cssText.includes('bolt-assistant-message-footer')).length
          );
        } catch {
          return total;
        }
      }, 0),
      activeElement: document.activeElement ? document.activeElement.tagName.toLowerCase() : null,
    };

    return {
      diagnostic: JSON.stringify(diagnostic),
      rowCount: rows.length,
      lastRowIsLastChild: lastRow ? lastRow.parentElement?.lastElementChild === lastRow : null,
      trailing: trailing ? `${trailing.tagName.toLowerCase()}.${[...trailing.classList].join('.')}` : null,
      statusCount: lastRow?.parentElement?.querySelectorAll('[role="status"]').length ?? null,
      maxGap: gaps.length ? Math.max(...gaps) : null,
      bandeaux: document.querySelectorAll('.bolt-assistant-message-mobile-head').length,
      footerCount: footers.length,
      footerBorders: footers.map((f) => getComputedStyle(f).borderTopWidth),
      footerOpacities: footers.map((f) => Number(getComputedStyle(f).opacity)),
      footerHeights: footers.map((f) => Math.round(f.getBoundingClientRect().height)),
    };
  });
}

test.describe('densité des messages — pointeur fin', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('actions masquées au repos, révélées au survol du message', async ({ page, request }) => {
    /*
     * `/auth/register` est limité à ~10 par minute et par IP : la préparation du
     * fixture peut donc attendre plusieurs paliers de repli avant d'obtenir une
     * session. Le délai par défaut de 30 s de la configuration ne le couvre pas,
     * et c'est la cause n°1 des faux rouges de cette suite.
     */
    test.setTimeout(120_000);

    const rows = await openTranscript(page, request);
    const atRest = await measureRows(page);

    /*
     * Témoin positif : sans lui, un sélecteur périmé donnerait « aucune barre
     * d'actions visible » sur une page où rien n'a été mesuré.
     */
    expect(atRest.footerCount, 'aucune barre d’actions mesurée').toBeGreaterThanOrEqual(3);

    expect(atRest.bandeaux, 'le bandeau « Agent » se répète encore au-dessus des messages').toBe(0);
    expect(
      atRest.footerBorders.every((width) => width === '0px'),
      'filet au-dessus des actions',
    ).toBe(true);
    expect(
      atRest.footerOpacities.every((opacity) => opacity === 0),
      'actions visibles au repos',
    ).toBe(true);
    expect(atRest.maxGap!, `écart entre lignes : ${atRest.maxGap}px`).toBeLessThanOrEqual(MAX_ROW_GAP_PX);

    // Survoler la PREMIÈRE réponse ne doit révéler QUE la sienne.
    await rows.nth(1).hover();
    await page.waitForTimeout(300);

    const hovered = await measureRows(page);

    expect(hovered.footerOpacities[0], `le survol ne révèle pas les actions du message — ${hovered.diagnostic}`).toBe(
      1,
    );
    expect(
      hovered.footerOpacities.slice(1).every((opacity) => opacity === 0),
      'le survol révèle les actions des AUTRES messages',
    ).toBe(true);
  });
});

test.describe('densité des messages — pointeur grossier', () => {
  /*
   * `isMobile` + `hasTouch` font passer Chromium en `(hover: none)` et
   * `(pointer: coarse)` — c'est ce que le test doit vérifier, et un préréglage
   * d'appareil complet ne peut pas être appliqué dans un `describe`
   * (`defaultBrowserType` forcerait un nouveau worker).
   */
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

  test('actions repliées au repos, dépliées au toucher du message', async ({ page, request }) => {
    /*
     * `/auth/register` est limité à ~10 par minute et par IP : la préparation du
     * fixture peut donc attendre plusieurs paliers de repli avant d'obtenir une
     * session. Le délai par défaut de 30 s de la configuration ne le couvre pas,
     * et c'est la cause n°1 des faux rouges de cette suite.
     */
    test.setTimeout(120_000);

    const rows = await openTranscript(page, request);

    const media = await page.evaluate(() => matchMedia('(hover: none)').matches);
    expect(media, 'le contexte de test n’émule pas un pointeur sans survol').toBe(true);

    const atRest = await measureRows(page);

    expect(atRest.footerCount, 'aucune barre d’actions mesurée').toBeGreaterThanOrEqual(3);
    expect(atRest.bandeaux, 'le bandeau « Agent » se répète encore au-dessus des messages').toBe(0);
    expect(atRest.maxGap!, `écart entre lignes : ${atRest.maxGap}px`).toBeLessThanOrEqual(MAX_ROW_GAP_PX);

    /*
     * Sans survol, la place n'est pas réservée : les barres des messages autres
     * que le dernier sont repliées à zéro. Le dernier garde la sienne, c'est
     * celui sur lequel on agit.
     */
    expect(
      atRest.footerHeights.slice(0, -1).every((height) => height === 0),
      'actions dépliées au repos',
    ).toBe(true);
    expect(
      atRest.footerHeights.at(-1),
      `la dernière réponse n’expose pas ses actions — lignes ${atRest.rowCount}, barres ${atRest.footerCount}, ` +
        `dernière ligne :last-child=${atRest.lastRowIsLastChild}, frère suivant=${atRest.trailing}, ` +
        `indicateurs de flux=${atRest.statusCount} — ${atRest.diagnostic}`,
    ).toBeGreaterThan(0);

    /*
     * On vise la PROSE du message, pas le centre géométrique de la ligne : une
     * fois la barre ouverte la ligne grandit, et son centre tombe alors SUR la
     * barre — un appui sur une commande ne doit pas replier, donc le geste ne
     * serait plus « toucher le message ».
     */
    const prose = () => rows.nth(1).locator('[class*="MarkdownContent"]').first();

    await prose().tap();
    await page.waitForTimeout(300);

    /*
     * La révélation ne doit PAS dépendre du focus. Elle reposait sur
     * `:focus-within` — donc sur le fait que le moteur focalise un `<div
     * tabindex="-1">` au toucher. Chromium le fait, Safari iOS ne le fait pas :
     * un test vert ici n'aurait rien dit de l'appareil d'Avi. On vérifie donc
     * l'attribut explicite que l'appui pose, PUIS son effet mesuré.
     */
    const marque = await rows.nth(1).getAttribute('data-actions-revealed');
    expect(marque, 'l’appui n’a pas marqué la ligne comme dépliée').toBe('true');

    const tapped = await measureRows(page);

    expect(
      tapped.footerHeights[0],
      `le toucher ne déplie pas les actions du message — ${tapped.diagnostic}`,
    ).toBeGreaterThan(0);

    /*
     * Contre-vérification du même mécanisme SANS focus : on retire le focus, la
     * barre doit rester ouverte parce que c'est l'attribut qui la tient.
     */
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.waitForTimeout(200);

    const sansFocus = await measureRows(page);

    expect(
      sansFocus.footerHeights[0],
      'la barre se referme dès que le focus part — elle dépend encore du focus',
    ).toBeGreaterThan(0);

    /*
     * Un second appui referme : une seule ligne dépliée à la fois. On retire le
     * focus AVANT de mesurer — l'appui refocalise la ligne sous Chromium, et
     * `:focus-within` la garderait ouverte : ce serait mesurer le repli du
     * focus, pas celui de l'attribut.
     */
    await prose().tap();
    await page.waitForTimeout(300);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.waitForTimeout(200);

    const referme = await measureRows(page);

    expect(await rows.nth(1).getAttribute('data-actions-revealed'), 'la ligne reste marquée dépliée').toBeNull();
    expect(referme.footerHeights[0], 'un second appui ne referme pas les actions').toBe(0);
    expect(tapped.footerOpacities[0], 'les actions dépliées restent invisibles').toBe(1);

    /*
     * Plancher tactile MESURÉ, en pixels. Un test unitaire vérifiait la présence
     * de `min-h-11` : 2,75rem, soit 44 px avec une base de 16 — mais la base rem
     * du produit vaut 14 px sous 1024 px, donc la classe rendait 38,5 px et le
     * test restait vert sur une cible trop petite. Seule la boîte rendue tranche.
     */
    const cibles = await page.evaluate(() =>
      [...document.querySelectorAll('.bolt-assistant-message-action, .bolt-user-message-edit')]
        .map((element) => element.getBoundingClientRect())
        .filter((box) => box.width > 0 && box.height > 0)
        .map((box) => ({ w: Math.round(box.width), h: Math.round(box.height) })),
    );

    expect(cibles.length, 'aucune cible tactile mesurée').toBeGreaterThanOrEqual(5);
    expect(
      cibles.filter((cible) => cible.w < 44 || cible.h < 44),
      'cibles tactiles sous 44px',
    ).toEqual([]);
  });
});
