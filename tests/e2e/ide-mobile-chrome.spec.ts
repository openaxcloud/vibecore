import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

/**
 * Lot IDE-MOBILE-2026-09-06 — « fixe tous les panneaux, tout sans exception ».
 *
 * Quatre captures iPhone d'Avi, 06/09 : onglets des journaux de la Webview
 * coupés, barre d'adresse énorme, état de départ de l'Agent aux puces
 * tronquées, panneau Journaux sur sept rangées. Mesuré sur le build de
 * production à 390, Chromium, AVANT correction :
 *   - Journaux : bandeau de 261 px ;
 *   - Débogueur : `text-[11px]` rendu 14 px, `.text-xs` rendu 9 px, bouton
 *     « Actualiser l'environnement d'exécution » écrasé à 65 px sur trois lignes ;
 *   - feuille « + » : descriptions à 9 px coupées à deux lignes ;
 *   - Webview : barre d'adresse de 53 px, bouton de port de 44 px ;
 *   - état de départ : « Améliorer project/README.md » coupé à 143 px pour 239.
 *
 * Ce test ouvre chaque surface par le vrai chemin (feuille « + ») et mesure
 * les tailles CALCULÉES — c'est ce qui attrape une règle de coquille qui
 * reprendrait la main. Vert Chromium ≠ preuve iOS : la preuve iPhone reste à
 * prendre en réel (voir DESIGN_PROGRAM_MASTER.md).
 */

const appBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';
const apiBaseUrl = process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';

/* 487 px de texte pour 204 px de boîte, mesurés avant : coupé à « src/components/ver… ». */
const CHEMIN_PROFOND = 'src/components/very/deep/directory/structure/ProductCardWithVariants.tsx';

async function preparerUnProjet(request: APIRequestContext, options: { fil: boolean }) {
  const suffixe = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  let dernier = '';

  for (let essai = 0; essai < 4; essai += 1) {
    const inscription = await request.post(`${apiBaseUrl}/auth/register`, {
      data: {
        email: `chrome-${suffixe}-${essai}@local.test`,
        password: 'Password123!',
        name: 'Chrome mobile',
        organizationName: `Chrome mobile ${suffixe}-${essai}`,
      },
    });

    dernier = await inscription.text();

    if (inscription.ok()) {
      const auth = JSON.parse(dernier) as { token: string; organization: { id: string } };
      const entetes = { authorization: `Bearer ${auth.token}` };

      const projet = await request.post(`${apiBaseUrl}/orgs/${auth.organization.id}/projects`, {
        headers: entetes,
        data: { name: 'Chrome mobile' },
      });

      const projectId = (await projet.json()).project.id as string;

      if (options.fil) {
        const conversation = await request.post(`${apiBaseUrl}/projects/${projectId}/ai/conversations`, {
          headers: entetes,
          data: { title: 'Chrome mobile' },
        });

        const conversationId = (await conversation.json()).conversation.id as string;

        await request.put(`${apiBaseUrl}/projects/${projectId}/ai/conversations/${conversationId}/transcript`, {
          headers: entetes,
          data: {
            messages: [
              { clientId: 'u1', role: 'user', content: 'Ajoute une page de contact.' },
              {
                clientId: 'a1',
                role: 'assistant',
                content:
                  'La page de contact est créée.\n\n' +
                  '<boltArtifact id="contact" title="Page de contact">' +
                  `<boltAction type="file" filePath="${CHEMIN_PROFOND}">// contact\n</boltAction>` +
                  '<boltAction type="shell">pnpm install && pnpm add zod</boltAction>' +
                  '</boltArtifact>',
              },
            ],
          },
        });
        await request.put(`${apiBaseUrl}/projects/${projectId}/ide-state`, {
          headers: entetes,
          data: { state: { chat: { metadata: { aiConversationId: conversationId } } } },
        });

        // Une connexion nommée suffit au panneau Base de données pour montrer le studio (capture 13:07).
        await request.put(`${apiBaseUrl}/projects/${projectId}/env-vars`, {
          headers: entetes,
          data: { key: 'DATABASE_URL', value: 'postgres://e2e:e2e@127.0.0.1:5432/e2e' },
        });
      }

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

async function ouvrirIde(page: Page, request: APIRequestContext, options: { fil: boolean }) {
  const { token, projectId } = await preparerUnProjet(request, options);

  await page
    .context()
    .addCookies([{ name: 'vc_session', value: token, url: appBaseUrl, httpOnly: true, sameSite: 'Lax' }]);
  await page.goto(`/projects/${projectId}/ide`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('button-add-tab')).toBeVisible({ timeout: 60_000 });

  return { token, projectId };
}

/*
 * Un VRAI appui long, par le moteur.
 *
 * `dispatchEvent('contextmenu', { clientX })` ne porte pas de coordonnées dans
 * Playwright : le menu recevait `NaN`, son style en ligne était refusé, et il
 * restait posé dans le flux à 10 px du bord — mesuré le 06/09. Un vert pris là
 * ne disait rien du menu réel. Les événements tactiles du protocole, eux,
 * passent par la pile pointeur du moteur, comme le doigt d'Avi.
 */
async function appuiLong(page: Page, cible: ReturnType<Page['locator']>, ou: 'gauche' | 'droite') {
  await cible.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);

  const boite = await cible.boundingBox();

  expect(boite, 'la cible de l’appui long doit être mesurable').toBeTruthy();

  const x = Math.round(ou === 'droite' ? boite!.x + boite!.width - 40 : boite!.x + 60);
  const y = Math.round(Math.min(Math.max(boite!.y + boite!.height / 2, 120), 700));
  const cdp = await page.context().newCDPSession(page);

  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await page.waitForTimeout(900);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();

  return { x, y };
}

/* Le vrai chemin : la feuille « + », puis l'outil. */
async function ouvrirOutil(page: Page, id: string) {
  await page.getByTestId('button-add-tab').click();
  await page.getByTestId(`tool-item-${id}`).click({ timeout: 15_000 });
}

type Mesure = { text: string; font: number; w: number; h: number; sw: number; cw: number; sh: number; ch: number };

async function mesurer(page: Page, selecteur: string): Promise<Mesure[]> {
  return page.evaluate((sel) => {
    return [...document.querySelectorAll<HTMLElement>(sel)].map((el) => {
      const r = el.getBoundingClientRect();

      return {
        text: el.textContent?.trim().slice(0, 40) ?? '',
        font: parseFloat(getComputedStyle(el).fontSize),
        w: Math.round(r.width),
        h: Math.round(r.height),
        sw: el.scrollWidth,
        cw: el.clientWidth,
        sh: el.scrollHeight,
        ch: el.clientHeight,
      };
    });
  }, selecteur);
}

function entier(mesures: Mesure[], quoi: string) {
  expect(mesures.length, `${quoi} : aucun élément mesuré`).toBeGreaterThan(0);

  for (const m of mesures) {
    expect(m.sw, `${quoi} « ${m.text} » tronqué : ${m.sw}px de texte pour ${m.cw}px`).toBeLessThanOrEqual(m.cw + 1);
  }
}

test.describe('chrome de l’IDE sur téléphone — 390', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

  test('état de départ de l’Agent : chaque action entière, la puce du composeur entière', async ({ page, request }) => {
    test.setTimeout(150_000);
    await ouvrirIde(page, request, { fil: false });

    const actions = page.locator('.bolt-mobile-agent-start-actions button');

    await expect(actions.first()).toBeVisible({ timeout: 60_000 });

    const libelles = await mesurer(page, '.bolt-mobile-agent-start-actions button > span:last-child');

    entier(libelles, 'action de départ');

    for (const m of libelles) {
      expect(m.font, `libellé « ${m.text} » à ${m.font}px`).toBe(13);
    }

    const boutons = await mesurer(page, '.bolt-mobile-agent-start-actions button');

    // Une colonne : chaque bouton prend la largeur du bloc (mesuré avant : 181 px sur deux colonnes).
    for (const m of boutons) {
      expect(m.w, `bouton « ${m.text} » large de ${m.w}px`).toBeGreaterThan(300);
    }

    const puce = await mesurer(page, '.bolt-composer-chip-label');

    entier(puce, 'puce du composeur');
  });

  test('Journaux : trois rangées, actions en icônes accessibles, statut et niveaux entiers', async ({
    page,
    request,
  }) => {
    test.setTimeout(150_000);
    await ouvrirIde(page, request, { fil: true });
    await ouvrirOutil(page, 'logs');

    const bandeau = page.locator('.bolt-project-console-header');

    await expect(bandeau).toBeVisible({ timeout: 30_000 });

    const [hauteur] = await mesurer(page, '.bolt-project-console-header');

    // Mesuré avant : 261 px sur sept rangées.
    expect(hauteur.h, `bandeau de ${hauteur.h}px`).toBeLessThanOrEqual(130);

    // Six actions, dont la vue fractionnée masquée (largeur 0) : cinq icônes de 32 px.
    const icones = (await mesurer(page, '.bolt-project-console-search button')).filter((m) => m.w > 0);

    expect(icones.length).toBe(5);

    for (const m of icones) {
      expect(m.w, `action « ${m.text} » ${m.w}px de large`).toBeLessThanOrEqual(34);
    }

    // Le libellé est masqué — le nom accessible le porte encore.
    await expect(page.locator('.bolt-project-console-action-label').first()).toBeHidden();

    // Le nom accessible tient, libellé masqué ou non.
    await expect(page.getByRole('button', { name: /expression régulière|regex/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /recharger|reload/i })).toBeVisible();

    const statut = await mesurer(page, '.bolt-project-console-status');

    entier(statut, 'statut');

    const niveaux = await mesurer(page, '.bolt-project-console-level-chips button');

    entier(niveaux, 'puce de niveau');
  });

  test('feuille « + » : titres 13 px, descriptions 12 px entières, une colonne', async ({ page, request }) => {
    test.setTimeout(150_000);
    await ouvrirIde(page, request, { fil: true });
    await page.getByTestId('button-add-tab').click();
    await expect(page.getByTestId('tools-sheet')).toBeVisible({ timeout: 15_000 });

    const titres = await mesurer(page, '.bolt-mobile-more-item-copy > span');
    const descriptions = await mesurer(page, '.bolt-mobile-more-item-copy > small');

    expect(titres.length).toBeGreaterThan(10);

    for (const m of titres) {
      expect(m.font, `titre « ${m.text} » à ${m.font}px`).toBe(13);
    }

    for (const m of descriptions) {
      expect(m.font, `description « ${m.text} » à ${m.font}px`).toBe(12);
      expect(m.sh, `description « ${m.text} » coupée : ${m.sh}px pour ${m.ch}px`).toBeLessThanOrEqual(m.ch + 1);
    }

    const cartes = await mesurer(page, '.bolt-mobile-more-item');

    for (const m of cartes.slice(0, 6)) {
      expect(m.w, `carte « ${m.text} » large de ${m.w}px`).toBeGreaterThan(300);
    }

    // Feuille « Panneaux » (⋮) — capture iPhone 06/09 10:34 : libellés coupés à la deuxième ligne.
    await page.getByTestId('tools-sheet-close').click();
    await page.getByTestId('button-more').click();
    await expect(page.getByTestId('mobile-more-menu-sheet')).toBeVisible({ timeout: 15_000 });

    const panneaux = await mesurer(page, '.bolt-mobile-more-menu-item > span:last-child');

    expect(panneaux.length).toBeGreaterThan(10);

    for (const m of panneaux) {
      expect(m.font, `panneau « ${m.text} » à ${m.font}px`).toBe(12);
      expect(m.sh, `panneau « ${m.text} » coupé : ${m.sh}px pour ${m.ch}px`).toBeLessThanOrEqual(m.ch + 1);
      expect(m.sw, `panneau « ${m.text} » tronqué`).toBeLessThanOrEqual(m.cw + 1);
    }
  });

  test('Débogueur : légendes 11 px, texte 12 px, bouton d’en-tête entier sur sa ligne', async ({ page, request }) => {
    test.setTimeout(150_000);
    await ouvrirIde(page, request, { fil: true });
    await ouvrirOutil(page, 'debugger');

    const legendes = page.locator('.bolt-workbench-mobile .text-\\[11px\\]');

    await expect(legendes.first()).toBeVisible({ timeout: 30_000 });

    // Les légendes en capitales des cartes de chiffres : 10 px (14 mesurés avant).
    for (const m of await mesurer(page, '.bolt-workbench-mobile .text-\\[11px\\].uppercase')) {
      expect(m.font, `légende « ${m.text} » à ${m.font}px`).toBe(10);
    }

    for (const m of await mesurer(page, '.bolt-workbench-mobile .text-\\[11px\\]:not(.uppercase)')) {
      expect(m.font, `légende « ${m.text} » à ${m.font}px`).toBe(11);
    }

    for (const m of await mesurer(page, '.bolt-workbench-mobile p.text-xs')) {
      expect(m.font, `texte « ${m.text} » à ${m.font}px`).toBe(12);
    }

    const petits = await mesurer(page, '.bolt-workbench-mobile button.h-7');

    entier(petits, 'bouton sm');

    // 44 px de haut et 65 de large mesurés avant, le libellé sur trois lignes : une seule ligne de 36 px.
    for (const m of petits) {
      // TACTILE-001 : la cible ne descend jamais sous 44 px (run 1481 refusé pour 36).
      expect(m.h, `bouton « ${m.text} » haut de ${m.h}px`).toBeGreaterThanOrEqual(44);
    }

    // 65 px mesurés avant, le libellé sur trois lignes : le bouton doit avoir sa largeur naturelle.
    const ecrases = await page.evaluate(() => {
      const out: string[] = [];

      for (const bouton of document.querySelectorAll<HTMLElement>('.bolt-workbench-mobile button.h-7')) {
        const clone = bouton.cloneNode(true) as HTMLElement;

        clone.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;width:auto;max-width:none;';

        // À côté de l'original : le clone hérite de la même échelle de police (12 px dans le panneau).
        bouton.parentElement?.append(clone);

        const naturelle = clone.getBoundingClientRect().width;

        clone.remove();

        if (bouton.getBoundingClientRect().width < naturelle - 1) {
          out.push(
            `${bouton.textContent?.trim()} : ${Math.round(bouton.getBoundingClientRect().width)}px pour ${Math.round(naturelle)}px`,
          );
        }
      }

      return out;
    });

    expect(ecrases, 'boutons écrasés sous leur largeur naturelle').toEqual([]);
  });

  test('Webview : barre d’adresse compacte, journaux à 12 px sans débordement', async ({ page, request }) => {
    test.setTimeout(150_000);
    await ouvrirIde(page, request, { fil: true });
    await ouvrirOutil(page, 'preview');

    const barre = page.locator('.bolt-preview-addressbar');

    await expect(barre).toBeVisible({ timeout: 30_000 });

    const [adresse] = await mesurer(page, '.bolt-preview-addressbar');

    // 53 px mesurés avant.
    expect(adresse.h, `barre d'adresse de ${adresse.h}px`).toBeLessThanOrEqual(40);

    // Le bouton de port arrive avec la liste des ports, après la barre : l'attendre (vu flaky sans).
    await expect(page.locator('.bolt-preview-port-button')).toBeVisible({ timeout: 30_000 });

    await expect(page.locator('.bolt-preview-port-button')).toBeVisible({ timeout: 30_000 });

    const [port] = await mesurer(page, '.bolt-preview-port-button');

    expect(port.h, `bouton de port de ${port.h}px`).toBe(30);

    const etapes = await mesurer(page, '.bolt-preview-loading-steps strong');

    // La carte de démarrage n'est là que pendant le démarrage : quand elle l'est, ses libellés sont entiers.
    for (const m of etapes) {
      expect(m.sw, `étape « ${m.text} » tronquée`).toBeLessThanOrEqual(m.cw + 1);
      expect(m.font).toBe(11);
    }

    await page
      .getByRole('button', { name: /journaux|logs/i })
      .first()
      .click({ timeout: 15_000 });

    const onglets = page.locator('.bolt-preview-logs-panel [role="tablist"] button');

    await expect(onglets.first()).toBeVisible({ timeout: 15_000 });

    for (const m of await mesurer(page, '.bolt-preview-logs-panel [role="tablist"] button')) {
      expect(m.font, `onglet « ${m.text} » à ${m.font}px`).toBe(12);
    }

    const bord = await page.locator('.bolt-preview-logs-panel header').evaluate((el) => ({
      right: el.getBoundingClientRect().right,
      vw: innerWidth,
      sw: el.scrollWidth,
      cw: el.clientWidth,
    }));

    expect(bord.right, `bandeau des journaux à ${bord.right}px pour ${bord.vw}px`).toBeLessThanOrEqual(bord.vw);
    expect(bord.sw, 'bandeau des journaux qui déborde').toBeLessThanOrEqual(bord.cw + 1);
  });

  test('fil de l’agent : le chemin de fichier entier, replié ; le résumé de commande à 32 px dans le flux', async ({
    page,
    request,
  }) => {
    test.setTimeout(150_000);
    await ouvrirIde(page, request, { fil: true });

    const chemin = page.locator('.bolt-action-file-path');

    await expect(chemin.first()).toBeVisible({ timeout: 60_000 });

    // Le fil se rend en deux temps (une passe sur trois, `mesurer` rendait vide) : attendre le chemin PEINT.
    await expect
      .poll(async () => (await mesurer(page, '.bolt-action-file-path'))[0]?.text, { timeout: 30_000 })
      .toBe(CHEMIN_PROFOND.slice(0, 40));

    // Le fil peut se re-rendre entre deux mesures : on mesure jusqu'à obtenir une ligne.
    const mesurerJusquA = async (selecteur: string) => {
      let mesures: Mesure[] = [];

      await expect
        .poll(async () => (mesures = await mesurer(page, selecteur)).length, { timeout: 30_000 })
        .toBeGreaterThan(0);

      return mesures[0];
    };

    const m = await mesurerJusquA('.bolt-action-file-path');
    expect(m.sw, `chemin tronqué : ${m.sw}px de texte pour ${m.cw}px`).toBeLessThanOrEqual(m.cw + 1);

    // Replié sur plusieurs lignes, pas coupé : plus haut qu'une ligne de 11 px.
    expect(m.h, `chemin haut de ${m.h}px`).toBeGreaterThan(24);

    await expect(page.locator('.bolt-action-row button.bolt-action-target').first()).toBeVisible();

    const cible = await mesurerJusquA('.bolt-action-row button.bolt-action-target');

    expect(cible.h, `cible du fichier de ${cible.h}px`).toBeGreaterThanOrEqual(44);

    // Le repli de la commande : 44 px de cible, 32 px dans le flux (mesuré avant : 44).
    await expect(page.locator('.bolt-action-row-details').first()).toBeVisible({ timeout: 30_000 });

    await expect(page.locator('.bolt-action-row-details').first()).toBeVisible({ timeout: 30_000 });

    const repli = await mesurerJusquA('.bolt-action-row-details');
    const resume = await mesurerJusquA('.bolt-action-row-details > summary');

    expect(resume.h, `cible du résumé de ${resume.h}px`).toBeGreaterThanOrEqual(44);
    expect(repli.h, `repli de ${repli.h}px dans le flux`).toBeLessThanOrEqual(34);

    /*
     * Capture 14:10 : « Afficher la commande » restait dans une boîte grise
     * après l'appui (le survol colle au doigt), et « npm install » flottait
     * dans 20 px de marge, en jetons de 14 px dans un `pre` de 11 px.
     */
    const resumeLocator = page.locator('.bolt-action-row-details > summary').first();
    const boite = await resumeLocator.boundingBox();

    await page.touchscreen.tap((boite?.x ?? 0) + (boite?.width ?? 0) / 2, (boite?.y ?? 0) + (boite?.height ?? 0) / 2);
    await expect(page.locator('.bolt-action-row-details[open]').first()).toBeVisible({ timeout: 10_000 });

    const apresAppui = await page.evaluate(() => {
      const resume = document.querySelector<HTMLElement>('.bolt-action-row-details[open] > summary')!;
      const pre = document.querySelector<HTMLElement>('.bolt-action-row-details[open] pre')!;
      const jeton = pre.querySelector<HTMLElement>('span');

      return {
        survol: resume.matches(':hover'),
        fond: getComputedStyle(resume).backgroundColor,
        padding: getComputedStyle(pre).paddingTop,
        jetonFont: jeton ? getComputedStyle(jeton).fontSize : null,
        preFont: getComputedStyle(pre).fontSize,
      };
    });

    // Le doigt laisse `:hover` vrai (c'est le piège) : le fond doit rester celui du repos.
    expect(apresAppui.fond, `fond après appui : ${apresAppui.fond} (survol : ${apresAppui.survol})`).toBe(
      'rgba(0, 0, 0, 0)',
    );
    expect(parseFloat(apresAppui.padding), `marge intérieure de ${apresAppui.padding}`).toBeLessThanOrEqual(10);
    expect(apresAppui.preFont).toBe('12px');
    expect(apresAppui.jetonFont, 'les jetons Shiki suivent le pre, pas la règle de coquille').toBe('12px');
  });

  test('Paramètres, Variables, Éditeur : bande d’onglets compacte, boutons deux par rangée, pastille Historique visible', async ({
    page,
    request,
  }) => {
    test.setTimeout(200_000);
    await ouvrirIde(page, request, { fil: true });

    // Paramètres — capture 11:02 : bande de 88 px avec descriptions, liste des raccourcis qui défile dans la page.
    await ouvrirOutil(page, 'settings');

    const bande = page.locator('.bolt-project-settings-sidebar');

    await expect(bande).toBeVisible({ timeout: 30_000 });

    const [b] = await mesurer(page, '.bolt-project-settings-sidebar');

    expect(b.h, `bande d'onglets de ${b.h}px`).toBeLessThanOrEqual(60);
    await expect(page.locator('.bolt-project-settings-sidebar button small').first()).toBeHidden();

    for (const m of await mesurer(page, '.bolt-project-settings-sidebar button')) {
      expect(m.h, `onglet « ${m.text} » haut de ${m.h}px`).toBeGreaterThanOrEqual(44);
      expect(m.sw, `onglet « ${m.text} » tronqué`).toBeLessThanOrEqual(m.cw + 1);
    }

    const raccourcis = await mesurer(page, '.bolt-project-settings-keybindings');

    for (const m of raccourcis) {
      expect(m.sh, `liste des raccourcis qui défile dans la page : ${m.sh}px pour ${m.ch}px`).toBeLessThanOrEqual(
        m.ch + 1,
      );
    }

    // Variables — même barre d'outils que Stockage d'objets (capture 11:03 : cinq boutons empilés de 60 px).
    await ouvrirOutil(page, 'env');

    // Capture 17:56 : la bande « Développement · Aperçu · Fabrication » n'avait que 203 px, « Fabrication » recouvert.
    const portees = page.locator('.bolt-project-env-scopes .bolt-project-tool-tabs');

    await expect(portees).toBeVisible({ timeout: 30_000 });

    const [bandePortees] = await mesurer(page, '.bolt-project-env-scopes .bolt-project-tool-tabs');

    expect(bandePortees.w, `bande des portées large de ${bandePortees.w}px`).toBeGreaterThan(300);
    expect(bandePortees.sw, `bande de ${bandePortees.sw}px de contenu pour ${bandePortees.cw}px`).toBeLessThanOrEqual(
      bandePortees.cw + 1,
    );

    const barre = page.locator('.bolt-project-panel-toolbar');

    await expect(barre.first()).toBeVisible({ timeout: 30_000 });

    const boutons = (await mesurer(page, '.bolt-project-panel-toolbar button')).filter((m) => m.h > 0);

    expect(boutons.length).toBeGreaterThan(0);

    for (const m of boutons) {
      expect(m.h, `bouton « ${m.text} » haut de ${m.h}px`).toBeGreaterThanOrEqual(44);
    }

    // Deux par rangée : au moins deux boutons partagent la même ligne (un bouton seul remplit la sienne).
    if (boutons.length >= 2) {
      const rangees = await page.evaluate(() => {
        const tops = [...document.querySelectorAll<HTMLElement>('.bolt-project-panel-toolbar button')]
          .filter((el) => el.getBoundingClientRect().height > 0)
          .map((el) => Math.round(el.getBoundingClientRect().top));

        return tops.filter((top, index) => tops.indexOf(top) !== index).length;
      });

      expect(rangees, 'aucun bouton ne partage sa rangée : empilés pleine largeur').toBeGreaterThan(0);
    }

    // Éditeur — capture 11:01 : pastille « Historique » coupée par le bas de son conteneur.
    await ouvrirOutil(page, 'editor');

    const editeur = page.getByRole('button', { name: /^(Éditeur|Editor)$/ }).first();

    if (await editeur.count()) {
      await editeur.click();
    }

    const pastille = page.getByTestId('file-history-open');

    await expect(pastille).toBeVisible({ timeout: 30_000 });

    const geometrie = await pastille.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const nav = document.querySelector('.bolt-mobile-replit-nav')?.getBoundingClientRect();

      return {
        bottom: r.bottom,
        right: r.right,
        navTop: nav?.top ?? innerHeight,
        vw: innerWidth,
        pos: getComputedStyle(el).position,
      };
    });

    expect(geometrie.pos).toBe('fixed');
    expect(
      geometrie.bottom,
      `pastille à ${geometrie.bottom}px pour un socle à ${geometrie.navTop}px`,
    ).toBeLessThanOrEqual(geometrie.navTop);
    expect(geometrie.right).toBeLessThanOrEqual(geometrie.vw);
  });

  test('menu contextuel d’un message : chaque action a son libellé ; Sécurité : une paire par ligne', async ({
    page,
    request,
  }) => {
    test.setTimeout(200_000);
    await ouvrirIde(page, request, { fil: true });

    // Capture 12:18 : quatre icônes muettes. L'appui long est un `contextmenu` pour le moteur.
    const ligne = page.locator('.bolt-chat-message-row').nth(1);

    await expect(ligne).toBeVisible({ timeout: 60_000 });

    await appuiLong(page, ligne, 'gauche');

    const menu = page.locator('.bolt-message-context-menu');

    await expect(menu).toBeVisible({ timeout: 15_000 });

    const libelles = await mesurer(page, '.bolt-message-context-menu .bolt-message-action-label');

    expect(libelles.length).toBeGreaterThanOrEqual(3);

    for (const m of libelles) {
      expect(m.w, `libellé « ${m.text} » large de ${m.w}px : invisible`).toBeGreaterThan(40);
    }

    const menuBoite = await menu.evaluate((el) => {
      const r = el.getBoundingClientRect();

      return { right: r.right, bottom: r.bottom, vw: innerWidth, vh: innerHeight };
    });

    expect(menuBoite.right).toBeLessThanOrEqual(menuBoite.vw);
    expect(menuBoite.bottom).toBeLessThanOrEqual(menuBoite.vh);
    await page.keyboard.press('Escape');

    // Capture 12:19 : « Modérée / 0 active » sur 120 px par ligne.
    await ouvrirOutil(page, 'security');

    const lignes = page.locator('.bolt-panel-row');

    await expect(lignes.first()).toBeVisible({ timeout: 30_000 });

    for (const m of await mesurer(page, '.bolt-panel-row')) {
      // Une paire courte tient sur une ligne ; un détail long (« Résumé ») se replie dessous, deux lignes au plus.
      expect(m.h, `ligne « ${m.text} » haute de ${m.h}px`).toBeLessThanOrEqual(m.text.length > 28 ? 72 : 48);
    }

    // Audit du 06/09 : le volet « Dernière analyse » faisait 437 px sur 390 — « Aucune an… » coupé au bord.
    const volet = await page
      .locator('.bolt-project-security-grid aside')
      .first()
      .evaluate((el) => {
        const r = el.getBoundingClientRect();

        return { right: Math.round(r.right), w: Math.round(r.width), vw: innerWidth };
      });

    expect(volet.right, `volet large de ${volet.w}px, bord droit à ${volet.right}px`).toBeLessThanOrEqual(volet.vw);

    // Git, capture 13:08 : deux champs « main » sans libellé visible au-dessus.
    await ouvrirOutil(page, 'git');

    const source = page.getByTestId('git-tab-pr-source');

    await expect(source).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/^(Branche source|Source branch)$/)).toBeVisible();
    await expect(page.getByText(/^(Branche cible|Target branch)$/)).toBeVisible();
  });

  test('Base de données, « Mes données » : le studio prend la hauteur de son contenu, sans défilement interne', async ({
    page,
    request,
  }) => {
    test.setTimeout(150_000);
    await ouvrirIde(page, request, { fil: true });
    await ouvrirOutil(page, 'database');

    // La liste « Toutes les bases de données » d'abord : la carte DATABASE_URL ouvre l'atelier.
    await page
      .getByRole('button', { name: /^DATABASE_URL/ })
      .first()
      .click({ timeout: 30_000 });

    const atelier = page.locator('.bolt-database-workbench');

    await expect(atelier).toBeVisible({ timeout: 30_000 });
    await page.getByRole('tab', { name: /Mes données|My data/i }).click();

    const studio = page.locator('.bolt-database-studio');

    await expect(studio).toBeVisible({ timeout: 30_000 });

    const geometrie = await page.evaluate(() => {
      const lire = (sel: string) => {
        const el = document.querySelector<HTMLElement>(sel)!;
        const cs = getComputedStyle(el);

        return {
          display: cs.display,
          flexGrow: cs.flexGrow,
          overflowY: cs.overflowY,
          h: Math.round(el.getBoundingClientRect().height),
          sh: el.scrollHeight,
          ch: el.clientHeight,
        };
      };

      return {
        corps: lire('.bolt-database-workbench-body'),
        studio: lire('.bolt-database-studio'),
        resultats: lire('.bolt-database-studio-results'),
      };
    });

    // Capture 13:07 : une centaine de pixels visibles, le reste coupé par un défilement interne.
    expect(geometrie.corps.flexGrow).toBe('0');
    expect(geometrie.corps.overflowY).toBe('visible');
    expect(geometrie.corps.sh, 'le corps défile encore en interne').toBeLessThanOrEqual(geometrie.corps.ch + 1);
    expect(geometrie.studio.display).toBe('block');
    expect(geometrie.studio.h, `studio haut de ${geometrie.studio.h}px`).toBeGreaterThan(250);
    expect(geometrie.resultats.h, `résultats hauts de ${geometrie.resultats.h}px`).toBeGreaterThanOrEqual(120);
  });
  test('Déploiements « Gérer » : les actions d’un déploiement se partagent la ligne', async ({ page, request }) => {
    test.setTimeout(150_000);

    const { token, projectId } = await ouvrirIde(page, request, { fil: false });

    // Un déploiement statique mis en file (il échoue proprement sans pod) : la carte suffit.
    const cree = await request.post(`${apiBaseUrl}/projects/${projectId}/deployments`, {
      headers: { authorization: `Bearer ${token}` },
      data: { provider: 'static', timeoutSeconds: 30 },
    });

    expect(cree.ok(), `création du déploiement : ${cree.status()}`).toBe(true);

    await ouvrirOutil(page, 'deployments');
    await page
      .getByRole('button', { name: /^(Gérer|Manage)$/ })
      .first()
      .click({ timeout: 30_000 });

    const actions = page.locator('.bolt-project-deploy-actions').first();

    await expect(actions).toBeVisible({ timeout: 30_000 });

    // L'état du déploiement est traduit : « QUEUED » en capitales anglaises n'est pas un libellé.
    const etat = page.locator('.bolt-project-deploy-card em[data-status]').first();

    await expect(etat).toBeVisible();
    await expect(etat).not.toHaveText(/^[A-Z_]+$/);

    // Capture 14:10 : trois formulaires de 44 px l'un sous l'autre, boutons étroits.
    const geometrie = await actions.evaluate((el) => {
      const enfants = [...el.children].map((c) => {
        const r = c.getBoundingClientRect();
        const bouton = c.querySelector('button, a') ?? c;
        const b = bouton.getBoundingClientRect();

        return { y: Math.round(r.y), w: Math.round(r.width), bw: Math.round(b.width), bh: Math.round(b.height) };
      });

      return { display: getComputedStyle(el).display, enfants };
    });

    expect(geometrie.display).toBe('flex');
    expect(geometrie.enfants.length).toBeGreaterThanOrEqual(3);

    /*
     * 308 px de carte à 390 : deux actions par ligne, la troisième prend la
     * ligne suivante en entier. Trois sur une ligne feraient 97 px chacune et
     * couperaient « Restauration ». Mesuré avant : trois lignes, boutons étroits.
     */
    const lignes = new Set(geometrie.enfants.map((e) => e.y));

    expect(
      lignes.size,
      `les actions occupent ${lignes.size} lignes : ${JSON.stringify(geometrie.enfants)}`,
    ).toBeLessThanOrEqual(2);

    for (const e of geometrie.enfants) {
      expect(e.bw, 'chaque bouton prend la largeur de sa part').toBeGreaterThanOrEqual(e.w - 2);
      expect(e.bw, `bouton large de ${e.bw}px : étroit comme avant`).toBeGreaterThanOrEqual(140);
      expect(e.bh, 'cible tactile').toBeGreaterThanOrEqual(44);
    }
  });
  test('Intégrations : icônes visibles ; Extensions : pastilles de domaine entières', async ({ page, request }) => {
    test.setTimeout(150_000);
    await ouvrirIde(page, request, { fil: false });

    // Capture 14:40 : Trello, Asana, Figma en blanc sur gris — le fond de boîte paraissait à travers le masque.
    await ouvrirOutil(page, 'integrations');

    const icones = page.locator(".bolt-project-integrations-grid article > div > span[class*='i-']");

    await expect(icones.first()).toBeVisible({ timeout: 30_000 });

    const couleurs = await icones.evaluateAll((elements) =>
      elements.slice(0, 6).map((el) => {
        const cs = getComputedStyle(el);

        return {
          color: cs.color,
          fond: cs.backgroundColor,
          masque: cs.maskImage !== 'none' || cs.webkitMaskImage !== 'none',
        };
      }),
    );

    expect(couleurs.length).toBeGreaterThan(0);

    for (const c of couleurs) {
      expect(c.masque, 'l’icône est bien rendue par un masque').toBe(true);
      expect(c.fond, `fond ${c.fond} pour une couleur ${c.color}`).toBe(c.color);
    }

    // Même capture : « web browsi » coupé au bord de la rangée des domaines.
    await ouvrirOutil(page, 'extensions');

    const pastilles = page.locator('.bolt-project-extension-categories');

    await expect(pastilles).toBeVisible({ timeout: 30_000 });

    const [rangee] = await mesurer(page, '.bolt-project-extension-categories');

    expect(rangee.sw, `rangée de ${rangee.sw}px pour ${rangee.cw}px : une pastille est coupée`).toBeLessThanOrEqual(
      rangee.cw + 1,
    );

    for (const m of await mesurer(page, '.bolt-project-extension-categories button')) {
      expect(m.sw, `pastille « ${m.text} » tronquée`).toBeLessThanOrEqual(m.cw + 1);
    }
  });
});

/*
 * EN FRANÇAIS, comme Avi.
 *
 * Le bloc précédent tourne dans la langue par défaut du navigateur, l'anglais,
 * et c'est ainsi qu'un menu de 300 px passait pour tenir dans l'écran : les
 * libellés français sont plus longs (« Modifier le prompt et créer une branche
 * de conversation ») et poussent le menu à sa largeur maximale, 366 px sur 390.
 * Un vert pris dans la mauvaise langue ne prouvait rien pour la capture.
 */
test.describe('chrome de l’IDE sur téléphone — 390, en français', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
    locale: 'fr-FR',
  });

  test('appui long près du bord droit : le menu et ses libellés français restent dans l’écran, sans infobulle', async ({
    page,
    request,
  }) => {
    test.setTimeout(150_000);
    await ouvrirIde(page, request, { fil: true });

    const ligne = page.locator('.bolt-chat-message-row').nth(1);

    await expect(ligne).toBeVisible({ timeout: 60_000 });

    // Capture 13:35 : le doigt à droite de la bulle, le menu posé à 165 px et coupé.
    await appuiLong(page, ligne, 'droite');

    const menu = page.locator('.bolt-message-context-menu');

    await expect(menu).toBeVisible({ timeout: 15_000 });
    await expect(menu.getByRole('button', { name: /Régénérer/ })).toBeVisible();

    const geometrie = await menu.evaluate((el) => {
      const r = el.getBoundingClientRect();

      return { left: r.left, right: r.right, width: r.width, vw: innerWidth };
    });

    expect(geometrie.width, 'le menu français doit être plus large que l’estimation de 232 px').toBeGreaterThan(232);
    expect(geometrie.left).toBeGreaterThanOrEqual(12);
    expect(geometrie.right, `bord droit à ${geometrie.right}px pour ${geometrie.vw}px d’écran`).toBeLessThanOrEqual(
      geometrie.vw - 12,
    );

    // Chaque libellé du menu est entier — replié sur deux lignes s'il le faut, jamais coupé ni rogné.
    for (const m of await mesurer(page, '.bolt-message-context-menu .bolt-message-action-label')) {
      expect(m.sw, `libellé « ${m.text} » tronqué : ${m.sw}px pour ${m.cw}px`).toBeLessThanOrEqual(m.cw + 1);
      expect(m.sh, `libellé « ${m.text} » rogné en hauteur : ${m.sh}px pour ${m.ch}px`).toBeLessThanOrEqual(m.ch + 1);
    }

    for (const m of await mesurer(page, '.bolt-message-context-menu button')) {
      expect(m.sh, `entrée « ${m.text} » rognée : ${m.sh}px de contenu pour ${m.ch}px`).toBeLessThanOrEqual(m.ch + 1);
      expect(m.h, `entrée « ${m.text} » haute de ${m.h}px`).toBeGreaterThanOrEqual(44);
    }

    // Même capture : une infobulle « Copier le message » flottait au-dessus du menu.
    await page.waitForTimeout(400);
    await expect(page.locator('[role="tooltip"]')).toHaveCount(0);
  });

  test('« Effacer l’historique » ouvre une conversation neuve, et elle le reste au rechargement', async ({
    page,
    request,
  }) => {
    test.setTimeout(150_000);

    const { token, projectId } = await ouvrirIde(page, request, { fil: true });
    const lignes = page.locator('.bolt-chat-message-row');

    await expect(lignes).toHaveCount(2, { timeout: 60_000 });

    const etatAvant = await request.get(`${apiBaseUrl}/projects/${projectId}/ide-state`, {
      headers: { authorization: `Bearer ${token}` },
    });

    const conversationAvant = (await etatAvant.json()).ideState?.state?.chat?.metadata?.aiConversationId as
      | string
      | undefined;

    expect(conversationAvant, 'le projet part d’une conversation connue').toBeTruthy();

    // Le vrai chemin d'Avi : le menu de l'Agent, « Nouvelle discussion », puis la confirmation.
    await page.getByTestId('mobile-agent-menu-trigger').click();
    await page.getByTestId('mobile-agent-new-chat').click();
    await page.getByRole('button', { name: /^Effacer l'historique$/ }).click({ timeout: 15_000 });

    // Mesuré avant : quatre messages avant, quatre après — le fil « effacé » revenait.
    await expect(lignes).toHaveCount(0, { timeout: 15_000 });
    await page.waitForTimeout(3000);
    await expect(lignes, 'le fil ne doit pas se remplir à nouveau').toHaveCount(0);

    await expect
      .poll(
        async () => {
          const etat = await request.get(`${apiBaseUrl}/projects/${projectId}/ide-state`, {
            headers: { authorization: `Bearer ${token}` },
          });

          return (await etat.json()).ideState?.state?.chat?.metadata?.aiConversationId as string | undefined;
        },
        { timeout: 20_000, message: 'une conversation NEUVE doit devenir la conversation courante' },
      )
      .not.toBe(conversationAvant);

    // Au rechargement, le repli serveur (`?limit=1`) ne doit pas ramener l'ancienne conversation.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('button-add-tab')).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(6000);
    await expect(lignes, 'après rechargement, la conversation reste neuve').toHaveCount(0);
  });
});
