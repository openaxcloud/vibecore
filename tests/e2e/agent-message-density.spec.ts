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

  test('aucune barre d’actions sous les messages ; le clic droit ouvre le menu', async ({ page, request }) => {
    /*
     * CE TEST A CHANGÉ DE SENS, et il faut le dire.
     *
     * Il vérifiait « actions masquées au repos, révélées au survol ». Avi a
     * tranché l'inverse : il a entouré en rouge la rangée d'actions sous chaque
     * message. Elle est SUPPRIMÉE, et les mêmes boutons vivent dans un menu
     * contextuel — clic droit à la souris, appui long au doigt.
     *
     * Ce qui est conservé, et ce que ce test garde désormais : les actions
     * restent atteignables, avec leurs libellés, et le fil reste dense.
     */
    test.setTimeout(120_000);

    const rows = await openTranscript(page, request);
    const atRest = await measureRows(page);

    expect(atRest.footerCount, 'une rangée d’actions subsiste sous les messages').toBe(0);
    expect(atRest.bandeaux, 'le bandeau « Agent » se répète encore au-dessus des messages').toBe(0);
    expect(atRest.maxGap!, `écart entre lignes : ${atRest.maxGap}px`).toBeLessThanOrEqual(MAX_ROW_GAP_PX);

    /* Le clic droit sur la bulle ouvre le menu, et les actions y sont. */
    await rows.nth(1).click({ button: 'right' });

    const menu = page.locator('.bolt-message-context-menu');

    await expect(menu, 'le clic droit n’ouvre pas le menu contextuel').toBeVisible({ timeout: 10_000 });
    await expect(
      menu.locator('.bolt-assistant-message-action').first(),
      'le menu s’ouvre sans ses actions',
    ).toBeVisible();
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

  test('aucune barre d’actions au doigt ; l’appui long ouvre le menu', async ({ page, request }) => {
    /*
     * Même changement de sens qu'au pointeur fin, et pour la même raison : la
     * rangée d'actions ne se replie plus, elle n'existe plus. « En mobile ou
     * tablet ça doit être comme WhatsApp quand on appuie longtemps ».
     */
    test.setTimeout(120_000);

    const rows = await openTranscript(page, request);
    const atRest = await measureRows(page);

    expect(atRest.footerCount, 'une rangée d’actions subsiste sous les messages').toBe(0);
    expect(atRest.maxGap!, `écart entre lignes : ${atRest.maxGap}px`).toBeLessThanOrEqual(MAX_ROW_GAP_PX);

    /*
     * Appui long : on le compose à la main. `tap()` est trop bref, et les
     * gestes du produit écoutent les événements de POINTEUR — pas le focus,
     * que Safari iOS ne donne pas à un conteneur non interactif.
     */
    const boite = (await rows.nth(1).boundingBox())!;
    await page.touchscreen.tap(boite.x + 20, boite.y + 10);
    await rows.nth(1).dispatchEvent('pointerdown', {
      pointerType: 'touch',
      button: 0,
      isPrimary: true,
      clientX: boite.x + 20,
      clientY: boite.y + 10,
    });
    await page.waitForTimeout(700);

    const menu = page.locator('.bolt-message-context-menu');

    await expect(menu, 'l’appui long n’ouvre pas le menu contextuel').toBeVisible({ timeout: 10_000 });
  });
});
