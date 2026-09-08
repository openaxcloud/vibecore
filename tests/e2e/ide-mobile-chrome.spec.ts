import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import JSZip from 'jszip';

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

async function preparerUnProjet(request: APIRequestContext, options: { fil: boolean; long?: boolean }) {
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

      let conversationId: string | undefined;

      if (options.fil) {
        const conversation = await request.post(`${apiBaseUrl}/projects/${projectId}/ai/conversations`, {
          headers: entetes,
          data: { title: 'Chrome mobile' },
        });

        conversationId = (await conversation.json()).conversation.id as string;

        await request.put(`${apiBaseUrl}/projects/${projectId}/ai/conversations/${conversationId}/transcript`, {
          headers: entetes,
          data: {
            messages: [
              // Un fil LONG quand le test doit remonter la conversation : à 390 px, deux messages ne défilent pas.
              ...(options.long
                ? Array.from({ length: 5 }, (_, i) => [
                    {
                      clientId: `u0${i}`,
                      role: 'user',
                      content: `Analysez les derniers journaux de l'environnement d'exécution, identifiez la cause première et corrigez le projet afin que l'aperçu s'exécute correctement (${i}).`,
                    },
                    {
                      clientId: `a0${i}`,
                      role: 'assistant',
                      content: `Tour ${i} : un catalogue, un panier, une page produit, et une longue explication qui occupe plusieurs lignes pour que le fil défile réellement sur un téléphone.`,
                    },
                  ]).flat()
                : []),
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

      return { token: auth.token, projectId, conversationId };
    }

    if (inscription.status() === 429 && essai < 3) {
      await new Promise((resoudre) => setTimeout(resoudre, 11_000));
      continue;
    }

    break;
  }

  throw new Error(`Impossible de préparer un projet : ${dernier}`);
}

async function ouvrirIde(
  page: Page,
  request: APIRequestContext,
  options: { fil: boolean; long?: boolean; theme?: 'light' | 'dark' },
) {
  const { token, projectId, conversationId } = await preparerUnProjet(request, options);

  await page.context().addCookies([
    { name: 'vc_session', value: token, url: appBaseUrl, httpOnly: true, sameSite: 'Lax' },

    // Le cookie partagé est la source de vérité du thème (app/lib/stores/theme.ts).
    ...(options.theme ? [{ name: 'ecode_theme', value: options.theme, url: appBaseUrl }] : []),
  ]);
  await page.goto(`/projects/${projectId}/ide`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('button-add-tab')).toBeVisible({ timeout: 60_000 });

  return { token, projectId, conversationId };
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
  /*
   * Le fil se remonte une fois à la fin de l'hydratation (vers 13 s après le
   * chargement, à l'événement `load`) : un appui long commencé juste avant
   * perd sa ligne en cours de route et n'ouvre rien — mesuré le 07/09, deux
   * échecs sur quatre passes, « menu introuvable » après 15 s. On attend donc
   * la fin du chargement avant de poser le doigt.
   */
  await page.waitForLoadState('load');
  await page.waitForTimeout(800);
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

/*
 * Un moteur de dictée factice, piloté par le test : ni Chromium sans service
 * ni WebKitGTK (pas d'API Web Speech) ne peuvent transcrire ; ce qui se
 * vérifie ici, c'est ce que l'INTERFACE fait de ce que le moteur lui dit.
 * Le moteur réel de Safari iOS n'est pas exercé — à confirmer sur iPhone.
 */
const FAUX_MOTEUR_DE_DICTEE = `(() => {
  const instances = [];
  class FauxReconnaissance {
    constructor() { this.continuous = false; this.interimResults = false; this.lang = ''; this.appels = []; instances.push(this); }
    start() { this.appels.push('start'); }
    stop() { this.appels.push('stop'); }
    abort() { this.appels.push('abort'); }
    _emettre(type, detail) { const h = this['on' + type]; if (h) h(Object.assign({ type }, detail)); }
    _resultat(textes, final) {
      const results = textes.map((t) => { const r = [{ transcript: t, confidence: 0.9 }]; r.isFinal = final; return r; });
      this._emettre('result', { results, resultIndex: 0 });
    }
  }
  window.webkitSpeechRecognition = FauxReconnaissance;
  window.SpeechRecognition = FauxReconnaissance;
  window.__sr = instances;
})();`;

/* Le vrai chemin : la feuille « + », puis l'outil. */
async function ouvrirOutil(page: Page, id: string) {
  await page.getByTestId('button-add-tab').click();
  await page.getByTestId(`tool-item-${id}`).click({ timeout: 15_000 });
}

/*
 * Le fil est « stable » quand sa hauteur de contenu et sa position ne bougent
 * plus pendant une seconde (quatre lectures à 250 ms). Bornée à 20 s : au-delà,
 * on mesure quand même, et l'assertion dira ce qu'elle voit.
 */
async function attendreLeFilStable(page: Page) {
  const lire = () =>
    page.evaluate(() => {
      const boite = [...document.querySelectorAll<HTMLElement>('*')].find((el) => {
        const style = getComputedStyle(el);

        return (
          /(auto|scroll)/.test(style.overflowY) &&
          el.scrollHeight > el.clientHeight + 50 &&
          el.querySelector('.bolt-chat-message-row')
        );
      });

      return boite ? `${boite.scrollHeight}:${Math.round(boite.scrollTop)}` : 'aucune';
    });

  let precedent = await lire();
  let stable = 0;

  for (let i = 0; i < 80 && stable < 4; i += 1) {
    await page.waitForTimeout(250);

    const courant = await lire();

    stable = courant === precedent ? stable + 1 : 0;
    precedent = courant;
  }
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

  test('menu contextuel d’un message : une barre d’icônes de 44 px, chaque action nommée ; Sécurité : une paire par ligne', async ({
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

    /*
     * Avi, 07/09 08:03 : « on n'a pas besoin du contenu, il faut que les
     * icônes ». Sur téléphone, les libellés restent dans `aria-label` (chaque
     * action est nommée), à l'écran cinq disques de 44 px en ligne.
     */
    const boutons = await mesurer(page, '.bolt-message-context-menu button');

    expect(boutons.length).toBeGreaterThanOrEqual(3);

    for (const m of boutons) {
      expect(m.w, `entrée « ${m.text} » large de ${m.w}px`).toBe(44);
      expect(m.h, `entrée « ${m.text} » haute de ${m.h}px`).toBe(44);
    }

    const nommes = await menu
      .locator('button')
      .evaluateAll((els) => els.every((el) => (el.getAttribute('aria-label') ?? '').length > 3));

    expect(nommes, 'chaque action porte son nom pour VoiceOver').toBe(true);

    for (const m of await mesurer(page, '.bolt-message-context-menu .bolt-message-action-label')) {
      expect(m.w, `libellé « ${m.text} » encore affiché`).toBe(0);
    }

    const menuBoite = await menu.evaluate((el) => {
      const r = el.getBoundingClientRect();

      return { right: r.right, bottom: r.bottom, height: r.height, vw: innerWidth, vh: innerHeight };
    });

    expect(menuBoite.right).toBeLessThanOrEqual(menuBoite.vw);
    expect(menuBoite.bottom).toBeLessThanOrEqual(menuBoite.vh);
    expect(menuBoite.height, 'une seule rangée').toBeLessThanOrEqual(60);
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

    // Audit WebKitGTK 06/09 : « src/components/very/… » à 157 px dans l'arbre de travail — un chemin se replie.
    const rangeesGit = await mesurer(page, '.bolt-git-tab .truncate');

    expect(rangeesGit.length, 'Git : aucun élément mesuré — le sélecteur ne vise plus le panneau').toBeGreaterThan(0);

    for (const m of rangeesGit) {
      expect(m.sw, `Git : « ${m.text} » coupé, ${m.sw}px pour ${m.cw}px`).toBeLessThanOrEqual(m.cw + 1);
    }

    // Même audit, Studio : « src/components/very/deep/directory/stru… » dans la carte de révision.
    await ouvrirOutil(page, 'studio');

    const carte = page.locator('.bolt-project-agent-patch-card strong').first();

    if (await carte.isVisible({ timeout: 15_000 }).catch(() => false)) {
      for (const m of await mesurer(page, '.bolt-project-agent-patch-card strong')) {
        expect(m.sw, `Studio : « ${m.text} » coupé, ${m.sw}px pour ${m.cw}px`).toBeLessThanOrEqual(m.cw + 1);
      }
    }
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
  test('zone de saisie : les menus « Agent » et « Économique » se rendent hors du composeur, visibles à l’écran', async ({
    page,
    request,
  }) => {
    test.setTimeout(150_000);
    await ouvrirIde(page, request, { fil: false });

    /*
     * Avi, 06/09 17:57 : « quand on ouvre le menu on voit rien ». Rendus dans
     * le composeur, les menus étaient bornés par ses ancêtres (confinement,
     * collant, défilement) ; sur iPhone ils restaient derrière lui. Ils se
     * rendent désormais à la racine du gabarit mobile.
     */
    for (const [nom, declencheur, selecteur] of [
      ['Agent', page.locator('.bolt-chatbox-mode-trigger').first(), '.bolt-chatbox-mode-menu'],
      ['Économique', page.locator('.bolt-composer-chip').first(), '.bolt-agent-power-popover'],
    ] as const) {
      await expect(declencheur).toBeVisible({ timeout: 30_000 });
      await expect(declencheur).toBeEnabled({ timeout: 30_000 });

      const menu = page.locator(selecteur).first();

      // Le composeur finit de s'armer après son affichage : un premier appui peut tomber trop tôt.
      for (let essai = 0; essai < 3 && !(await menu.isVisible().catch(() => false)); essai += 1) {
        const boite = await declencheur.boundingBox();

        await page.touchscreen.tap(
          (boite?.x ?? 0) + (boite?.width ?? 0) / 2,
          (boite?.y ?? 0) + (boite?.height ?? 0) / 2,
        );
        await page.waitForTimeout(700);
      }

      await expect(menu, `menu « ${nom} »`).toBeVisible({ timeout: 10_000 });

      const place = await menu.evaluate((el) => {
        const r = el.getBoundingClientRect();

        return {
          top: Math.round(r.top),
          bottom: Math.round(r.bottom),
          vh: innerHeight,
          dansComposeur: Boolean(el.closest('.bolt-project-agent-composer, .bolt-project-chatbox')),
          dansRacineMobile: Boolean(el.closest('.bolt-responsive-ide-mobile')),
          parentConfine: Boolean(
            [
              ...(function* () {
                let p = el.parentElement;

                while (p) {
                  yield p;
                  p = p.parentElement;
                }
              })(),
            ].find((p) => getComputedStyle(p).containerType !== 'normal'),
          ),
        };
      });

      expect(place.dansComposeur, `menu « ${nom} » encore rendu dans le composeur`).toBe(false);
      expect(place.dansRacineMobile, `menu « ${nom} » hors du gabarit mobile : ses règles ne s’appliquent plus`).toBe(
        true,
      );
      expect(place.parentConfine, `menu « ${nom} » sous un ancêtre confiné`).toBe(false);
      expect(place.top).toBeGreaterThanOrEqual(0);
      expect(place.bottom, `menu « ${nom} » bas à ${place.bottom}px pour ${place.vh}px`).toBeLessThanOrEqual(place.vh);

      /*
       * Un appui DANS le menu ne le referme pas : le portail sort le menu de
       * l'ancre qui servait de test « dehors ». Le menu de mode se ferme sur
       * choix (voulu) ; le panneau de puissance reste ouvert après un choix
       * de palier, et se ferme par son déclencheur.
       */
      const entree = menu.locator('button').first();
      const libelleEntree = (await entree.textContent())?.trim() ?? '';
      const boiteEntree = await entree.boundingBox();

      await page.touchscreen.tap(
        (boiteEntree?.x ?? 0) + (boiteEntree?.width ?? 0) / 2,
        (boiteEntree?.y ?? 0) + (boiteEntree?.height ?? 0) / 2,
      );
      await page.waitForTimeout(500);

      if (selecteur === '.bolt-chatbox-mode-menu') {
        await expect(menu, 'le menu de mode se ferme sur choix').toBeHidden({ timeout: 5_000 });
        await expect(declencheur, `le choix « ${libelleEntree} » a été pris`).toContainText(libelleEntree.slice(0, 5));
      } else {
        await expect(menu, 'le panneau de puissance reste ouvert après un appui dedans').toBeVisible();

        // La feuille recouvre son déclencheur : on la ferme comme au doigt, par un appui au-dessus d'elle, dans le fil.
        const boiteFeuille = await menu.boundingBox();

        await page.touchscreen.tap(195, Math.max(120, (boiteFeuille?.y ?? 400) - 40));
        await expect(menu, 'un appui hors de la feuille la ferme').toBeHidden({ timeout: 5_000 });
      }
    }
  });

  test('zone de saisie : la feuille prend l’écran sur téléphone, et s’arrête à 760 px centrée sur tablette', async ({
    page,
    request,
  }) => {
    test.setTimeout(150_000);

    /*
     * Avi, 07/09 07:58 : « ça me paraît bien large ». Sur téléphone la feuille
     * vaut l'écran, c'est voulu. Le gabarit mobile sert aussi les tablettes et
     * les téléphones en paysage : mesuré avant correction, 820 px de feuille
     * sur un iPad portrait pour un menu de deux lignes. Même plafond que les
     * autres feuilles mobiles, centré.
     */
    const ouvrirLaFeuille = async () => {
      const declencheur = page.locator('.bolt-chatbox-mode-trigger').first();
      const menu = page.locator('.bolt-chatbox-mode-menu').first();

      await expect(declencheur).toBeEnabled({ timeout: 30_000 });

      /*
       * Le composeur se remonte une fois, vers 13 s après le chargement (fin de
       * l'hydratation) : un appui à coordonnées figées peut tomber sur ce
       * remontage. `tap()` attend un élément attaché et stable, et réessaie.
       */
      for (let essai = 0; essai < 3 && !(await menu.isVisible().catch(() => false)); essai += 1) {
        await declencheur.tap({ timeout: 10_000 }).catch(() => undefined);
        await page.waitForTimeout(700);
      }

      expect(page.url(), 'l’IDE a quitté sa page pendant l’appui').toContain('/ide');
      await expect(menu).toBeVisible({ timeout: 10_000 });

      const mesure = await menu.evaluate((el) => {
        const r = el.getBoundingClientRect();

        return {
          left: Math.round(r.left),
          right: Math.round(r.right),
          width: Math.round(r.width),
          top: Math.round(r.top),
          vw: innerWidth,
        };
      });

      // La feuille recouvre son déclencheur : on la ferme comme au doigt, par un appui au-dessus d'elle, dans le fil.
      await page.touchscreen.tap(mesure.vw / 2, Math.max(120, mesure.top - 40));
      await expect(menu, 'un appui hors de la feuille la ferme').toBeHidden({ timeout: 5_000 });

      return mesure;
    };

    await page.setViewportSize({ width: 820, height: 1180 });
    await ouvrirIde(page, request, { fil: false });
    await expect(page.locator('.bolt-responsive-ide-mobile'), 'la tablette utilise le gabarit mobile').toHaveCount(1);

    const tablette = await ouvrirLaFeuille();

    expect(tablette.width, `feuille de ${tablette.width}px sur ${tablette.vw}px`).toBe(760);
    expect(Math.abs(tablette.left - (tablette.vw - 760) / 2), 'la feuille est centrée').toBeLessThanOrEqual(1);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(600);

    const telephone = await ouvrirLaFeuille();

    expect(telephone.left).toBe(0);
    expect(telephone.width, 'sur téléphone la feuille vaut l’écran').toBe(390);
  });

  test('fil de l’agent : en remontant, le texte garde sa largeur et la pastille « descendre » est centrée au-dessus de la zone de saisie', async ({
    page,
    request,
  }) => {
    test.setTimeout(150_000);
    await ouvrirIde(page, request, { fil: true, long: true });

    /*
     * Avi, 07/09 07:58 : « l'icône scroll se met à droite et tout le texte se
     * met à droite ». Mesuré avant correction (Chromium 390) : en remontant,
     * la bulle passait de 380 à 316 px de bord droit, la pastille à 12 px du
     * bord. Attendu : le fil ne bouge pas, la pastille au milieu, juste
     * au-dessus de la zone de saisie.
     */
    const rangee = page.locator('.bolt-chat-message-row').last();

    await expect(rangee).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(1500);

    const geometrie = () =>
      page.evaluate(() => {
        const rows = [...document.querySelectorAll<HTMLElement>('.bolt-chat-message-row')];
        const derniere = rows[rows.length - 1];
        const transcript = document.querySelector('.bolt-project-agent-transcript')?.getBoundingClientRect();
        const pastille = document.querySelector('.bolt-agent-scroll-to-bottom')?.getBoundingClientRect();
        const composeur = document.querySelector('.bolt-project-agent-composer')?.getBoundingClientRect();

        return {
          rangeeDroite: Math.round(derniere.getBoundingClientRect().right),
          rembourrage: getComputedStyle(derniere).paddingInlineEnd,
          transcript: transcript ? { left: transcript.left, right: transcript.right } : null,
          pastille: pastille
            ? {
                centre: (pastille.left + pastille.right) / 2,
                bottom: Math.round(pastille.bottom),
                top: Math.round(pastille.top),
              }
            : null,
          composeurTop: composeur ? Math.round(composeur.top) : null,
        };
      });

    const enBas = await geometrie();

    expect(enBas.pastille, 'en bas du fil, pas de pastille').toBeNull();

    /*
     * Remonter le fil : la boîte qui défile est la plus PROFONDE des boîtes défilantes contenant les messages
     * (StickToBottom en intercale une ; un conteneur extérieur qui déborde ne ferait pas apparaître la pastille).
     */
    await page.evaluate(() => {
      const boite = [...document.querySelectorAll<HTMLElement>('*')]
        .filter(
          (el) => /(auto|scroll)/.test(getComputedStyle(el).overflowY) && el.querySelector('.bolt-chat-message-row'),
        )
        .sort((a, b) => a.clientHeight - b.clientHeight)[0];

      if (boite) {
        boite.scrollTop = Math.max(0, boite.scrollTop - 600);
      }
    });

    const pastille = page.locator('.bolt-agent-scroll-to-bottom');

    await expect(pastille, 'la pastille apparaît quand on remonte').toBeVisible({ timeout: 10_000 });

    const remonte = await geometrie();

    expect(remonte.rembourrage, 'le fil ne rétrécit pas quand la pastille est là').toBe(enBas.rembourrage);
    expect(remonte.rangeeDroite, 'le bord droit du fil ne bouge pas').toBe(enBas.rangeeDroite);
    expect(remonte.pastille).not.toBeNull();
    expect(remonte.transcript).not.toBeNull();

    const centreFil = (remonte.transcript!.left + remonte.transcript!.right) / 2;

    expect(Math.abs(remonte.pastille!.centre - centreFil), 'la pastille est centrée sur le fil').toBeLessThanOrEqual(2);
    expect(remonte.composeurTop).not.toBeNull();
    expect(remonte.pastille!.bottom, 'la pastille ne recouvre pas la zone de saisie').toBeLessThanOrEqual(
      remonte.composeurTop!,
    );
    expect(
      remonte.composeurTop! - remonte.pastille!.bottom,
      'la pastille est JUSTE au-dessus de la zone de saisie',
    ).toBeLessThanOrEqual(16);
  });

  test('menu contextuel sur le dernier message : la barre reste au-dessus de la zone de saisie, et le fil ne bouge pas', async ({
    page,
    request,
  }) => {
    test.setTimeout(150_000);
    await ouvrirIde(page, request, { fil: true, long: true });

    /*
     * Avi, 07/09 08:03 : « parfois on la voit pas si je prends le premier ou
     * dernier message, c'est caché, et on ne voit plus le contenu à
     * l'arrière-plan ». Mesuré sur WebKitGTK : menu jusqu'à 744 px pour une
     * zone de saisie à 647 (rendu dans la bulle, sous le composeur collant), et
     * le fil reculait de 45 px au `focus()` de la première entrée.
     */
    const derniere = page.locator('.bolt-chat-message-row').last();

    await expect(derniere).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(1200);

    const etat = () =>
      page.evaluate(() => {
        const boite = [...document.querySelectorAll<HTMLElement>('*')].find((el) => {
          const style = getComputedStyle(el);

          return (
            /(auto|scroll)/.test(style.overflowY) &&
            el.scrollHeight > el.clientHeight + 50 &&
            el.querySelector('.bolt-chat-message-row')
          );
        });

        const menu = document.querySelector('.bolt-message-context-menu')?.getBoundingClientRect();
        const composeur = document.querySelector('.bolt-project-agent-composer')?.getBoundingClientRect();
        const entete = document.querySelector('.bolt-mobile-ecode-header')?.getBoundingClientRect();

        return {
          scrollTop: boite ? Math.round(boite.scrollTop) : null,
          menu: menu ? { top: Math.round(menu.top), bottom: Math.round(menu.bottom) } : null,
          composeurTop: composeur ? Math.round(composeur.top) : null,
          enteteBas: entete ? Math.round(entete.bottom) : 0,
          dansLeFil: Boolean(document.querySelector('.bolt-project-agent-transcript .bolt-message-context-menu')),
          dansLaRacine: Boolean(document.querySelector('.bolt-responsive-ide-mobile > .bolt-message-context-menu')),
        };
      });

    /*
     * Porte E2E, runs 1594 et 1608 (runner CI, 3 tentatives sur 3) : « le fil
     * ne doit pas bouger » — 388 → 548, puis 420 → 388. Ce n'est pas le menu
     * qui bouge le fil : c'est le fil qui finit de se rendre entre les deux
     * mesures (hauteur de contenu +160 puis −32 px), ce que 1 200 ms ne
     * couvrent pas sur un runner lent. En local, même bridé ×4 CPU, il est
     * stable à 1 200 ms — d'où le vert 3/3 ici. On attend la fin réelle du
     * chargement, puis un fil dont la hauteur et la position ne changent
     * plus pendant une seconde.
     */
    await page.waitForLoadState('load');
    await attendreLeFilStable(page);

    const avant = await etat();

    await appuiLong(page, derniere, 'gauche');

    const menu = page.locator('.bolt-message-context-menu');

    await expect(menu).toBeVisible({ timeout: 15_000 });

    const apres = await etat();

    expect(apres.scrollTop, 'le fil ne doit pas bouger à l’ouverture du menu').toBe(avant.scrollTop);
    expect(apres.dansLeFil, 'le menu ne se rend plus dans le fil').toBe(false);
    expect(apres.dansLaRacine, 'le menu se rend à la racine du gabarit mobile').toBe(true);
    expect(apres.menu).not.toBeNull();
    expect(apres.composeurTop).not.toBeNull();
    expect(
      apres.menu!.bottom,
      `menu jusqu’à ${apres.menu!.bottom}px pour une zone de saisie à ${apres.composeurTop}px`,
    ).toBeLessThanOrEqual(apres.composeurTop! - 8);
    expect(apres.menu!.top, 'sous l’en-tête').toBeGreaterThanOrEqual(apres.enteteBas);
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();

    // Le premier message, tout en haut : la barre passe sous le doigt, jamais sous l'en-tête.
    await page.evaluate(() => document.querySelector('.bolt-chat-message-row')?.scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(500);

    const premiere = page.locator('.bolt-chat-message-row').first();

    await appuiLong(page, premiere, 'gauche');
    await expect(menu).toBeVisible({ timeout: 15_000 });

    const haut = await etat();

    expect(
      haut.menu!.top,
      `menu à ${haut.menu!.top}px pour un en-tête jusqu’à ${haut.enteteBas}px`,
    ).toBeGreaterThanOrEqual(haut.enteteBas);
    expect(haut.menu!.bottom).toBeLessThanOrEqual(haut.composeurTop! - 8);
  });

  for (const [format, largeur, hauteur] of [
    ['téléphone 390', 390, 844],
    ['tablette 820', 820, 1180],
  ] as const) {
    test(`zone de saisie : le menu « ••• » se rend hors du composeur, entier, et chacune de ses entrées s’ouvre dans l’écran — ${format}`, async ({
      page,
      request,
    }) => {
      test.setTimeout(200_000);
      await page.setViewportSize({ width: largeur, height: hauteur });
      await ouvrirIde(page, request, { fil: false });
      await page.waitForLoadState('load');
      await page.waitForTimeout(800);

      /*
       * Avi, 07/09 08:07 : « la boîte de dialogue qui s'ouvre n'est toujours
       * pas fixée, on ne voit rien » — « Ouvrir Supabase » en haut d'une
       * feuille tranchée, posée sur le composeur. Même mécanique que les menus
       * « Agent » et « Économique » : rendu dans le composeur, borné par ses
       * ancêtres. Et « assure-toi que chaque item s'ouvre parfaitement » :
       * chaque entrée est ouverte, sa surface mesurée dans l'écran.
       */
      const declencheur = page.locator('.bolt-chatbox-tools-menu-anchor button').first();
      const menu = page.getByTestId('composer-tools-menu');

      const ouvrirLeMenu = async () => {
        for (let essai = 0; essai < 3 && !(await menu.isVisible().catch(() => false)); essai += 1) {
          await declencheur.tap({ timeout: 10_000 }).catch(() => undefined);
          await page.waitForTimeout(600);
        }

        await expect(menu, 'le menu « ••• »').toBeVisible({ timeout: 10_000 });
      };

      await ouvrirLeMenu();

      const feuille = await menu.evaluate((el) => {
        const r = el.getBoundingClientRect();

        const entrees = [...el.querySelectorAll<HTMLElement>('.bolt-chatbox-tools-menu-item')].map((b) => {
          const q = b.getBoundingClientRect();

          return {
            texte: b.textContent?.trim().slice(0, 30) ?? '',
            dedans: q.top >= r.top - 1 && q.bottom <= r.bottom + 1,
          };
        });

        return {
          dansComposeur: Boolean(el.closest('.bolt-project-agent-composer, .bolt-project-chatbox')),
          dansRacineMobile: Boolean(el.closest('.bolt-responsive-ide-mobile')),
          top: Math.round(r.top),
          bottom: Math.round(r.bottom),
          left: Math.round(r.left),
          right: Math.round(r.right),
          vw: innerWidth,
          vh: innerHeight,
          composeurTop: Math.round(document.querySelector('.bolt-project-agent-composer')!.getBoundingClientRect().top),
          entrees,
        };
      });

      expect(feuille.dansComposeur, 'le menu est encore rendu dans le composeur').toBe(false);
      expect(feuille.dansRacineMobile).toBe(true);
      expect(feuille.top).toBeGreaterThanOrEqual(0);
      expect(feuille.left).toBeGreaterThanOrEqual(0);
      expect(feuille.right).toBeLessThanOrEqual(feuille.vw);

      // Une feuille ancrée sur le socle, comme « Agent » et « Économique » : elle recouvre le composeur, jamais l'écran.
      expect(feuille.bottom, `feuille jusqu’à ${feuille.bottom}px pour ${feuille.vh}px d’écran`).toBeLessThanOrEqual(
        feuille.vh,
      );
      expect(feuille.top, 'la feuille commence sous l’en-tête').toBeGreaterThanOrEqual(48);
      expect(feuille.entrees.length, 'les entrées du menu').toBeGreaterThanOrEqual(5);

      for (const entree of feuille.entrees) {
        expect(entree.dedans, `entrée « ${entree.texte} » tranchée par la feuille`).toBe(true);
      }

      /*
       * Chaque entrée, à son tour : ce qu'elle ouvre doit tenir dans l'écran.
       * « Améliorer le prompt » est inerte sans texte (et appelle un modèle) :
       * on vérifie seulement qu'il est désactivé à vide.
       */
      const surfaces = '[role="dialog"], [data-radix-popper-content-wrapper], .bolt-chatbox-tools-menu [role="group"]';
      const nombreEntrees = feuille.entrees.length;

      for (let index = 0; index < nombreEntrees; index += 1) {
        await ouvrirLeMenu();

        const entree = menu.locator('.bolt-chatbox-tools-menu-item').nth(index);
        const texte = (await entree.textContent())?.trim().slice(0, 30) ?? `entrée ${index}`;

        if (await entree.isDisabled()) {
          expect(texte, 'seule « Améliorer le prompt » peut être inerte à vide').toMatch(/Améliorer|Enhance/);
          await page.keyboard.press('Escape');
          continue;
        }

        // On marque les surfaces déjà là : celle qui s'ouvre est celle qui n'est pas marquée (un compte se trompe quand une surface précédente finit de disparaître).
        await page.locator(surfaces).evaluateAll((els) => {
          els.forEach((el) => el.setAttribute('data-vc-avant', '1'));
        });

        await entree.tap({ timeout: 10_000 });
        await page.waitForTimeout(700);

        const ouverture = await page.evaluate(
          ({ surfaces }) => {
            const candidats = [...document.querySelectorAll<HTMLElement>(surfaces)].filter(
              (el) => el.getBoundingClientRect().height > 0 && !el.hasAttribute('data-vc-avant'),
            );

            const surface = candidats.length > 0 ? candidats[candidats.length - 1] : null;
            const composeur = document.querySelector('.bolt-project-agent-composer')!.getBoundingClientRect();
            const r = surface?.getBoundingClientRect();
            const entete = document.querySelector('.bolt-mobile-ecode-header')?.getBoundingClientRect();

            // Ce qui est peint au centre de la surface doit être la surface : rien ne passe devant (feuille, en-tête).
            const dessus = r ? document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2) : null;

            return {
              enteteBas: entete ? Math.round(entete.bottom) : 0,
              peinteDessus: Boolean(surface && dessus && surface.contains(dessus)),
              surface: r
                ? {
                    top: Math.round(r.top),
                    bottom: Math.round(r.bottom),
                    left: Math.round(r.left),
                    right: Math.round(r.right),
                  }
                : null,
              composeur: {
                top: Math.round(composeur.top),
                bottom: Math.round(composeur.bottom),
                left: Math.round(composeur.left),
                right: Math.round(composeur.right),
              },
              vw: innerWidth,
              vh: innerHeight,
            };
          },
          { surfaces },
        );

        /*
         * Une surface neuve, ou (paramètres de l'agent) le composeur lui-même
         * qui grandit : dans les deux cas, dans l'écran. Hors « paramètres »,
         * la surface est EXIGÉE : mesuré le 07/09, « Ouvrir Supabase »
         * n'ouvrait rien (le menu se fermait à l'ouverture et démontait son
         * dialogue), sur téléphone comme sur bureau.
         */
        if (!/param|settings/i.test(texte)) {
          expect(ouverture.surface, `« ${texte} » n’a rien ouvert`).not.toBeNull();
        }

        const boite = ouverture.surface ?? ouverture.composeur;

        expect(boite.left, `« ${texte} » : bord gauche à ${boite.left}px`).toBeGreaterThanOrEqual(0);

        // Sous l'en-tête fixé, jamais dessous (la palette avait son titre caché par l'en-tête) ; et rien devant elle.
        expect(
          boite.top,
          `« ${texte} » : haut à ${boite.top}px pour un en-tête jusqu’à ${ouverture.enteteBas}px`,
        ).toBeGreaterThanOrEqual(ouverture.enteteBas);

        if (ouverture.surface) {
          expect(
            ouverture.peinteDessus,
            `« ${texte} » : quelque chose passe devant la surface (feuille, en-tête)`,
          ).toBe(true);
        }

        expect(boite.right, `« ${texte} » : bord droit à ${boite.right}px pour ${ouverture.vw}px`).toBeLessThanOrEqual(
          ouverture.vw,
        );
        expect(boite.bottom, `« ${texte} » : bas à ${boite.bottom}px pour ${ouverture.vh}px`).toBeLessThanOrEqual(
          ouverture.vh,
        );

        // Un appui DANS la surface ne la fait pas disparaître (mesuré : un clic dans le dialogue MCP le démontait).
        if (ouverture.surface) {
          await page.touchscreen.tap(
            (ouverture.surface.left + ouverture.surface.right) / 2,
            Math.min(ouverture.surface.top + 24, ouverture.surface.bottom - 4),
          );
          await page.waitForTimeout(400);

          const encoreLa = await page
            .locator(surfaces)
            .evaluateAll(
              (els) =>
                els.filter((el) => el.getBoundingClientRect().height > 0 && !el.hasAttribute('data-vc-avant')).length,
            );

          expect(encoreLa, `« ${texte} » : la surface a disparu après un appui dedans`).toBeGreaterThan(0);
        }

        // Refermer ce qui s'est ouvert, puis le menu s'il est resté ouvert.
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);

        if (await menu.isVisible().catch(() => false)) {
          await page.keyboard.press('Escape');
          await page.waitForTimeout(300);
        }

        if (await menu.isVisible().catch(() => false)) {
          await page.touchscreen.tap(largeur / 2, 120);
          await page.waitForTimeout(300);
        }
      }
    });
  }

  test('Webview : l’URL se lit en 13 px et s’édite à 16 px ; les journaux se referment', async ({ page, request }) => {
    test.setTimeout(150_000);
    await ouvrirIde(page, request, { fil: true });
    await ouvrirOutil(page, 'preview');

    const barre = page.locator('.bolt-preview-addressbar');

    await expect(barre).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.bolt-preview-port-button')).toBeVisible({ timeout: 30_000 });

    /*
     * Avi, 07/09 08:19 : « tu as réduis la police du contenu comme le reste,
     * où il y a l'URL ». Le champ garde 16 px (plancher iOS, IOS-ZOOM-001) ;
     * hors édition, c'est un bouton en 13 px qui montre l'adresse.
     */
    const lecture = barre.locator('.bolt-preview-url-text');
    const champ = barre.locator('input');

    await expect(lecture).toBeVisible();

    const polices = await page.evaluate(() => ({
      lecture: getComputedStyle(document.querySelector('.bolt-preview-url-text')!).fontSize,
      champ: getComputedStyle(document.querySelector('.bolt-preview-addressbar input')!).fontSize,
      champVisible: getComputedStyle(document.querySelector('.bolt-preview-addressbar input')!).opacity !== '0',
    }));

    expect(polices.lecture, 'l’URL se lit à l’échelle du reste').toBe('13px');
    expect(polices.champ, 'le champ garde le plancher iOS').toBe('16px');
    expect(polices.champVisible, 'hors édition, le champ est retiré de la vue').toBe(false);

    // Un appui sur l'adresse révèle le champ et le focalise, à 16 px.
    if (await lecture.isEnabled()) {
      await lecture.tap();
      await expect(champ).toBeFocused({ timeout: 5_000 });

      const enEdition = await champ.evaluate((el) => ({
        largeur: el.getBoundingClientRect().width,
        police: getComputedStyle(el).fontSize,
      }));

      expect(enEdition.largeur).toBeGreaterThan(80);
      expect(enEdition.police).toBe('16px');
      await champ.blur();
      await expect(lecture).toBeVisible();
    }

    /*
     * « Quand j'ouvre les journaux je ne peux pas les fermer » : « Ancrer à
     * droite » est caché sur téléphone et rien ne refermait le panneau.
     */
    // Le chemin d'Avi : « Afficher les journaux » sur la carte de démarrage ; à défaut (carte absente), le bouton de la barre d'outils.
    const boutonCarte = page
      .locator('.bolt-preview-splash button')
      .filter({ hasText: /journaux|logs/i })
      .first();

    if (await boutonCarte.isVisible().catch(() => false)) {
      await boutonCarte.tap();
    } else {
      await page
        .locator(
          '.bolt-project-webview-toolbar button[title*="ournaux"], .bolt-project-webview-toolbar button[title*="logs" i]',
        )
        .first()
        .evaluate((el) => (el as HTMLElement).click());
    }

    const journaux = page.locator('.bolt-preview-logs-panel');

    await expect(journaux).toBeVisible({ timeout: 10_000 });

    const croix = journaux.locator('.bolt-preview-logs-close');

    await expect(croix, 'la croix qui referme les journaux').toBeVisible();

    const boiteCroix = await croix.boundingBox();

    expect(boiteCroix!.width, 'cible tactile').toBeGreaterThanOrEqual(44);
    expect(boiteCroix!.x + boiteCroix!.width).toBeLessThanOrEqual(390);
    await croix.tap();
    await expect(journaux, 'les journaux se referment').toBeHidden({ timeout: 5_000 });
  });

  test('sélecteur d’onglets : les raccourcis du bas sont plus petits que les onglets, et tous de même taille', async ({
    page,
    request,
  }) => {
    test.setTimeout(150_000);
    await ouvrirIde(page, request, { fil: false });
    await page.waitForLoadState('load');
    await page.waitForTimeout(600);

    // Avi, 07/09 08:21 : « les carrés doivent être plus petits que les carrés au-dessus, et tous de même taille ».
    await page.getByTestId('mobile-bottom-navigation').getByTestId('button-tab-switcher').tap();

    const selecteur = page.getByTestId('mobile-tab-switcher');

    await expect(selecteur).toBeVisible({ timeout: 10_000 });

    const onglets = await mesurer(page, '.bolt-mobile-tab-switcher-card');
    const raccourcis = await mesurer(page, '.bolt-mobile-tab-switcher-quick button');

    expect(onglets.length, 'au moins un onglet ouvert').toBeGreaterThan(0);
    expect(raccourcis.length, 'quatre raccourcis').toBe(4);

    const hauteurOnglet = Math.min(...onglets.map((m) => m.h));
    const hauteurs = new Set(raccourcis.map((m) => m.h));
    const largeurs = new Set(raccourcis.map((m) => m.w));

    expect(hauteurs.size, `raccourcis de hauteurs différentes : ${[...hauteurs].join(', ')}`).toBe(1);
    expect(largeurs.size, `raccourcis de largeurs différentes : ${[...largeurs].join(', ')}`).toBe(1);
    expect(
      raccourcis[0].h,
      `raccourci de ${raccourcis[0].h}px pour un onglet de ${hauteurOnglet}px`,
    ).toBeLessThanOrEqual(hauteurOnglet - 20);
    expect(raccourcis[0].h, 'cible tactile').toBeGreaterThanOrEqual(44);

    for (const m of raccourcis) {
      expect(m.sw, `raccourci « ${m.text} » tronqué`).toBeLessThanOrEqual(m.cw + 1);
    }
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`sélecteur d’onglets : la croix de fermeture se peint dans la couleur du contenu — thème ${theme}`, async ({
      page,
      request,
    }) => {
      test.setTimeout(150_000);
      await ouvrirIde(page, request, { fil: false, theme });
      await page.waitForLoadState('load');
      await page.waitForTimeout(600);

      /*
       * Avi, 07/09 : « avec le thème light la croix est blanche sur du clair, on
       * voit pas bien, il faut la même couleur que le contenu ». Mesuré avant
       * correction (Chromium 390, clair) : glyphe masquée peinte en
       * rgb(246, 248, 251) — la couleur de FOND — sur la tuile « Secrets ».
       */
      await ouvrirOutil(page, 'secrets');
      await page.waitForTimeout(800);
      await page.getByTestId('mobile-bottom-navigation').getByTestId('button-tab-switcher').tap();
      await expect(page.getByTestId('mobile-tab-switcher')).toBeVisible({ timeout: 10_000 });

      const croix = page.getByTestId('button-close-tab-secrets');

      await expect(croix).toBeVisible();

      const mesure = await croix.evaluate((bouton) => {
        const luminance = (couleur: string) => {
          const m = couleur.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);

          if (!m) {
            throw new Error(`couleur illisible : ${couleur}`);
          }

          const alpha = m[4] === undefined ? 1 : parseFloat(m[4]);

          const [r, g, b] = [m[1], m[2], m[3]].map((v) => {
            const c = parseInt(v, 10) / 255;
            return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
          });

          return { l: 0.2126 * r + 0.7152 * g + 0.0722 * b, alpha };
        };
        const contraste = (a: string, b: string) => {
          const la = luminance(a).l;
          const lb = luminance(b).l;

          return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
        };

        const carte = bouton.closest<HTMLElement>('.bolt-mobile-tab-switcher-card')!;
        const contenu = carte.querySelector<HTMLElement>('.bolt-mobile-tab-switcher-card-main')!;
        const glyphe = [...bouton.querySelectorAll<HTMLElement>('span')].find((el) => el.className.includes('i-ph:'))!;
        const pastille = glyphe.parentElement!;
        const styleGlyphe = getComputedStyle(glyphe);
        const stylePastille = getComputedStyle(pastille);
        const masque = styleGlyphe.maskImage !== 'none' || styleGlyphe.webkitMaskImage !== 'none';

        // Une icône masquée se peint avec sa `background-color`.
        const peinture = masque ? styleGlyphe.backgroundColor : styleGlyphe.color;

        const fondPastille =
          luminance(stylePastille.backgroundColor).alpha > 0.5
            ? stylePastille.backgroundColor
            : getComputedStyle(carte).backgroundColor;

        return {
          theme: document.documentElement.getAttribute('data-theme'),
          masque,
          peinture,
          couleurContenu: getComputedStyle(contenu).color,
          fondPastille,
          contraste: contraste(peinture, fondPastille),
          taille: glyphe.getBoundingClientRect().width,
        };
      });

      expect(mesure.theme).toBe(theme);
      expect(mesure.masque, 'la glyphe Phosphor est un masque').toBe(true);
      expect(mesure.peinture, 'la croix a la couleur du contenu').toBe(mesure.couleurContenu);
      expect(
        mesure.contraste,
        `contraste ${mesure.contraste.toFixed(1)}:1 (${mesure.peinture} sur ${mesure.fondPastille})`,
      ).toBeGreaterThanOrEqual(4.5);
      expect(mesure.taille, 'glyphe de 18 px, pas ramenée à 1em par la coque').toBeGreaterThanOrEqual(18);
    });
  }

  test('dictée vocale : l’appui dit qu’on écoute, garde le texte tapé, et l’interface se remet au repos quand le moteur s’arrête seul', async ({
    page,
    request,
  }) => {
    test.setTimeout(150_000);
    await page.addInitScript(FAUX_MOTEUR_DE_DICTEE);
    await ouvrirIde(page, request, { fil: false });
    await page.waitForLoadState('load');
    await page.waitForTimeout(800);

    /*
     * Avi, 07/09 08:18 : « il faut améliorer l'enregistrement de voix et le
     * comportement quand on clique dessus, on comprend rien ». Mesuré avant
     * correction (Chromium 390, moteur factice) : start() sans langue, icône
     * « micro barré » pendant l'écoute, rien d'autre ne change, le texte tapé
     * est effacé par la dictée, et le moteur qui s'arrête seul laisse
     * l'interface « en écoute » — deux appuis pour relancer.
     */
    const champ = page.locator('.bolt-project-agent-composer textarea');

    const micro = page
      .locator('.bolt-project-agent-composer button')
      .filter({ has: page.locator('[class*="i-ph:microphone"]') })
      .first();

    await expect(micro).toBeVisible({ timeout: 15_000 });
    await champ.fill('Bonjour');

    // La dernière instance est la vivante : la ré-hydratation en démonte une première (abort seul).
    const moteur = () =>
      page.evaluate(() => {
        const m = (window as any).__sr.at(-1);
        return { lang: m.lang, appels: m.appels as string[], ecouteLaFin: typeof m.onend === 'function' };
      });

    await micro.tap();
    await expect.poll(async () => (await moteur()).appels).toEqual(['start']);

    const demarre = await moteur();

    expect(demarre.lang, 'la langue de l’interface est donnée au moteur').toBe('en-US');
    expect(demarre.ecouteLaFin, 'le moteur qui s’arrête seul doit être entendu').toBe(true);
    await expect(champ, 'pendant la demande d’accès, le champ le dit').toHaveAttribute(
      'placeholder',
      /microphone access/i,
    );

    await page.evaluate(() => (window as any).__sr.at(-1)._emettre('start'));
    await expect(champ, 'pendant l’écoute, le champ dit comment arrêter').toHaveAttribute('placeholder', /Listening/);
    await expect(micro).toHaveAttribute('aria-pressed', 'true');
    expect(await micro.locator('[class*="microphone-slash"]').count(), 'pas de micro barré pendant l’écoute').toBe(0);
    await expect(micro.locator('.bolt-dictee-halo')).toBeVisible();

    const couleurEcoute = await micro.evaluate((el) => getComputedStyle(el).color);

    await page.evaluate(() => (window as any).__sr.at(-1)._resultat(['I want a contact page'], false));
    await expect(champ, 'le texte tapé reste, la dictée s’y ajoute').toHaveValue('Bonjour I want a contact page');

    // Le moteur s'arrête seul (silence, Safari iOS) : l'interface revient au repos.
    await page.evaluate(() => (window as any).__sr.at(-1)._emettre('end'));
    await expect(micro).toHaveAttribute('aria-pressed', 'false');
    await expect(champ).not.toHaveAttribute('placeholder', /Listening/);
    expect(await micro.evaluate((el) => getComputedStyle(el).color)).not.toBe(couleurEcoute);

    // Un seul appui relance — pas un stop() dans le vide, puis un troisième appui.
    await micro.tap();
    await expect.poll(async () => (await moteur()).appels).toEqual(['start', 'start']);

    // Silence : on le dit, et on revient au repos.
    await page.evaluate(() => (window as any).__sr.at(-1)._emettre('error', { error: 'no-speech' }));
    await expect(page.getByText(/No speech detected/)).toBeVisible({ timeout: 5_000 });
    await expect(micro).toHaveAttribute('aria-pressed', 'false');
  });

  test('panneaux d’outils : le contenu reste net jusqu’au bord haut de la barre du bas — pas de bande morte', async ({
    page,
    request,
  }) => {
    test.setTimeout(150_000);
    await ouvrirIde(page, request, { fil: false });
    await page.waitForLoadState('load');
    await page.waitForTimeout(600);

    /*
     * Avi, 07/09 08:26, panneau « Activité » : « cette espace ne sert à rien,
     * on doit gagner de l'espace ». Le voile de la barre du bas montait 26 px
     * au-dessus de la pastille, avec un flou d'arrière-plan : sur iOS le bord
     * de la boîte floutée est net, et ces 26 px se lisaient comme une bande
     * vide. Ici : la boîte du voile commence au bord haut de la pastille, et
     * un point 6 px au-dessus appartient au contenu du panneau, sans flou.
     */
    await ouvrirOutil(page, 'activity');
    await expect(page.getByTestId('ide-service-panel')).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(800);

    const geometrie = await page.evaluate(() => {
      const nav = document.querySelector<HTMLElement>('.bolt-mobile-replit-nav')!;
      const voile = nav.querySelector<HTMLElement>('.bolt-mobile-replit-nav-bg')!;
      const pastille = nav.querySelector<HTMLElement>('.bolt-mobile-replit-nav-inner')!;
      const hautVoile = voile.getBoundingClientRect().top;
      const hautPastille = pastille.getBoundingClientRect().top;
      const sous = document.elementFromPoint(innerWidth / 2, hautPastille - 6) as HTMLElement | null;

      let floute = false;

      for (let el: HTMLElement | null = sous; el; el = el.parentElement) {
        const style = getComputedStyle(el);

        if ((style.backdropFilter && style.backdropFilter !== 'none') || el === voile) {
          floute = true;
          break;
        }
      }

      return {
        hautVoile,
        hautPastille,
        dansLePanneau: Boolean(sous?.closest('[data-testid="ide-service-panel"]')),
        floute,
      };
    });

    expect(
      Math.abs(geometrie.hautVoile - geometrie.hautPastille),
      `voile à ${geometrie.hautVoile}, pastille à ${geometrie.hautPastille}`,
    ).toBeLessThanOrEqual(1);
    expect(geometrie.dansLePanneau, '6 px au-dessus de la pastille, c’est le panneau').toBe(true);
    expect(geometrie.floute, '… et il n’est pas flouté').toBe(false);
  });

  for (const largeur of [430, 390] as const) {
    test(`barre du bas : les onglets fixes sont centrés entre le sélecteur et « + » — ${largeur} px`, async ({
      page,
      request,
    }) => {
      test.setTimeout(150_000);
      await page.setViewportSize({ width: largeur, height: largeur === 430 ? 932 : 844 });
      await ouvrirIde(page, request, { fil: false });
      await page.waitForLoadState('load');
      await page.waitForTimeout(600);

      /*
       * Avi, 07/09 08:36, entourés en rouge : « les trois panneaux fixes qui
       * restent toujours fixes doivent être centrés ». Mesuré avant
       * correction : onglets rangés à gauche de leur rangée, 55 px de vide
       * avant « + » à 430, 15 à 390.
       */
      const mesure = await page.evaluate(() => {
        const nav = document.querySelector<HTMLElement>('[data-testid="mobile-bottom-navigation"]')!;
        const rangee = nav.querySelector<HTMLElement>('.bolt-mobile-replit-panel-scroll')!;
        const onglets = [...rangee.querySelectorAll<HTMLElement>('.bolt-mobile-replit-panel-tab')];
        const r = (el: HTMLElement) => el.getBoundingClientRect();
        const premier = r(onglets[0]);
        const dernier = r(onglets[onglets.length - 1]);
        const boite = r(rangee);

        return {
          nombre: onglets.length,
          videGauche: premier.left - boite.left,
          videDroit: boite.right - dernier.right,
          deborde: rangee.scrollWidth > rangee.clientWidth + 1,
        };
      });

      expect(mesure.nombre, 'les trois onglets fixes').toBeGreaterThanOrEqual(3);
      expect(mesure.deborde, 'la rangée tient sans défiler').toBe(false);
      expect(
        Math.abs(mesure.videGauche - mesure.videDroit),
        `vide à gauche ${mesure.videGauche.toFixed(1)} px, à droite ${mesure.videDroit.toFixed(1)} px`,
      ).toBeLessThanOrEqual(2);
    });
  }

  test('panneau Agent, état de départ : la carte « Agent prêt » se pose sous l’en-tête, sans bande vide', async ({
    page,
    request,
  }) => {
    test.setTimeout(150_000);
    await ouvrirIde(page, request, { fil: false });
    await page.waitForLoadState('load');
    await page.waitForTimeout(800);

    /*
     * Avi, 07/09 14:22, capture iPhone : ~50 px de vide entre l'en-tête et la
     * carte « Agent prêt ». Mesuré avant correction (Chromium 390) : en-tête
     * jusqu'à 49, carte à 103 — 54 px, une marge de 55 px héritée de la
     * bascule de langue flottante retirée depuis.
     */
    const geometrie = await page.evaluate(() => {
      const entete = document.querySelector('.bolt-mobile-ecode-header')!.getBoundingClientRect();
      const depart = document.querySelector('.bolt-mobile-agent-start-state')!.getBoundingClientRect();
      const contexte = document.querySelector('.bolt-mobile-agent-context-bar')?.getBoundingClientRect();

      return {
        enteteBas: Math.round(entete.bottom),
        departHaut: Math.round(depart.top),
        contexteBas: contexte ? Math.round(contexte.bottom) : null,
      };
    });

    const plancher = Math.max(geometrie.enteteBas, geometrie.contexteBas ?? 0);

    expect(geometrie.departHaut, 'sous l’en-tête (et la barre de contexte)').toBeGreaterThanOrEqual(plancher);
    expect(
      geometrie.departHaut - plancher,
      `${geometrie.departHaut - plancher}px de vide sous l’en-tête`,
    ).toBeLessThanOrEqual(24);
  });

  test('fil de l’agent : le premier message se pose sous l’en-tête, sans bande morte et sans être rogné', async ({
    page,
    request,
  }) => {
    test.setTimeout(150_000);
    await ouvrirIde(page, request, { fil: true, long: true });
    await expect(page.locator('.bolt-chat-message-row').first()).toBeVisible({ timeout: 60_000 });
    await page.waitForLoadState('load');
    await attendreLeFilStable(page);

    /*
     * Avi, capture iPhone du 07/09 08:06, renvoyée le 08/09 : « retire cette
     * espace, ça cache le contenu et perd de la place ». Mesuré avant
     * correction (Chromium 390) : en-tête jusqu'à 49, boîte de défilement à
     * partir de 62 — 13 px de bande morte — et la première bulle à 47, ses 15
     * premiers pixels rognés (un point à 2 px sous son haut touchait le
     * conteneur, pas la bulle).
     */
    const geometrie = await page.evaluate(() => {
      const boite = [...document.querySelectorAll<HTMLElement>('*')].find((el) => {
        const style = getComputedStyle(el);

        return (
          /(auto|scroll)/.test(style.overflowY) &&
          el.scrollHeight > el.clientHeight + 50 &&
          el.querySelector('.bolt-chat-message-row')
        );
      })!;

      boite.scrollTop = 0;

      const entete = document.querySelector('.bolt-mobile-ecode-header')!.getBoundingClientRect();
      const bulle = document.querySelector('.bolt-chat-message-row')!.getBoundingClientRect();
      const x = Math.round(bulle.left + 40);
      const sous = (y: number) => document.elementFromPoint(x, y);

      return {
        enteteBas: Math.round(entete.bottom),
        boiteHaut: Math.round(boite.getBoundingClientRect().top),
        bulleHaut: Math.round(bulle.top),
        sousEnteteDansLeFil: Boolean(sous(Math.round(entete.bottom) + 2)?.closest('.bolt-project-agent-transcript')),
        hautDeBulleTouchable: Boolean(sous(Math.round(bulle.top) + 2)?.closest('.bolt-chat-message-row')),
      };
    });

    expect(geometrie.boiteHaut, 'la boîte qui défile commence sous l’en-tête, pas plus bas').toBeLessThanOrEqual(
      geometrie.enteteBas,
    );
    expect(geometrie.sousEnteteDansLeFil, '2 px sous l’en-tête, on touche déjà le fil').toBe(true);
    expect(geometrie.bulleHaut - geometrie.enteteBas, 'la bulle se pose juste sous le trait').toBeGreaterThanOrEqual(3);
    expect(geometrie.bulleHaut - geometrie.enteteBas, 'sans bande morte').toBeLessThanOrEqual(10);
    expect(geometrie.hautDeBulleTouchable, 'le haut de la première bulle n’est pas rogné').toBe(true);
  });

  test('menu d’un message : un seul à la fois, posé au-dessus de la ligne, fermé au défilement', async ({
    page,
    request,
  }) => {
    test.setTimeout(150_000);
    await ouvrirIde(page, request, { fil: true, long: true });

    const lignes = page.locator('.bolt-chat-message-row');

    await expect(lignes.last()).toBeVisible({ timeout: 60_000 });
    await page.waitForLoadState('load');
    await attendreLeFilStable(page);

    /*
     * Avi, 08/09 07:47 : « pas toujours au même endroit pour chaque message,
     * jamais l'icône disparaît » — deux menus ouverts ensemble sur ses
     * captures (barre de l'agent + rond « Modifier »), à des hauteurs
     * différentes, et la page à recharger.
     */
    const utilisateur = page.locator('.bolt-chat-message-row-user').last();
    const agent = page.locator('.bolt-chat-message-row-assistant').last();
    const menu = page.locator('.bolt-message-context-menu');

    await appuiLong(page, utilisateur, 'droite');
    await expect(menu).toHaveCount(1, { timeout: 15_000 });

    const premier = await page.evaluate(() => {
      const m = document.querySelector('.bolt-message-context-menu')!.getBoundingClientRect();
      const rangees = document.querySelectorAll('.bolt-chat-message-row-user');
      const ligne = rangees[rangees.length - 1]!.getBoundingClientRect();

      return {
        menuBas: Math.round(m.bottom),
        menuCentre: Math.round(m.left + m.width / 2),
        ligneHaut: Math.round(ligne.top),
        ligneCentre: Math.round(ligne.left + ligne.width / 2),
      };
    });

    expect(premier.menuBas, 'au-dessus de la ligne du message').toBeLessThanOrEqual(premier.ligneHaut);
    expect(Math.abs(premier.menuCentre - premier.ligneCentre), 'centré sur la ligne').toBeLessThanOrEqual(24);

    // Un appui long sur un autre message : UN menu, celui du nouveau message.
    await appuiLong(page, agent, 'gauche');
    await expect(menu).toHaveCount(1, { timeout: 15_000 });
    await expect(menu.locator('.bolt-assistant-message-footer')).toHaveCount(1);

    // Faire défiler le fil le ferme.
    await page.evaluate(() => {
      const boite = [...document.querySelectorAll<HTMLElement>('*')]
        .filter(
          (el) => /(auto|scroll)/.test(getComputedStyle(el).overflowY) && el.querySelector('.bolt-chat-message-row'),
        )
        .sort((a, b) => a.clientHeight - b.clientHeight)[0];

      boite.scrollTop = Math.max(0, boite.scrollTop - 80);
    });
    await expect(menu).toHaveCount(0, { timeout: 5_000 });
  });

  test('fin de tour à la Replit : « Worked for » et « Checkpoint made » sous la réponse, au-dessus de la zone de saisie ; retour arrière ; « Changes » ouvre le commit', async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000);

    const { token, projectId, conversationId } = await ouvrirIde(page, request, { fil: true });
    const entetes = { authorization: `Bearer ${token}` };

    /*
     * Avi, 08/09 07:48–07:51, quatre captures : chez nous « Léger · ×0.530 k
     * jetons » sous la zone de saisie ; chez Replit deux lignes repliables
     * sous la réponse — « Worked for 2 minutes » (Time worked / Work done /
     * Items read / Agent usage) et « Checkpoint made 25 days ago » (message du
     * commit, date, Rollback here, Changes), la feuille « Rollback to this
     * checkpoint? » (Files / Database / Agent memory) et « Changes » qui
     * ouvre le commit dans l'onglet Git.
     *
     * Le point de restauration est pris ici comme la fin de tour le prend
     * (RP-CKPT-04) : un commit Git, puis un instantané `automatic` dont le
     * manifeste relie le tout au message `a1` et garde les statistiques.
     */
    // Un projet neuf n'a rien dans son stockage : le fichier que le tour a écrit y est importé d'abord.
    const archive = new JSZip();

    archive.file(CHEMIN_PROFOND, '// contact\n');
    archive.file('package.json', '{ "name": "chrome-mobile", "private": true }\n');

    const importation = await request.post(`${apiBaseUrl}/projects/${projectId}/files/import/zip`, {
      headers: entetes,
      data: { zipBase64: await archive.generateAsync({ type: 'base64' }), replaceExisting: true },
    });

    expect(importation.ok(), await importation.text()).toBe(true);

    const commit = await request.post(`${apiBaseUrl}/projects/${projectId}/git/commit`, {
      headers: entetes,
      data: { message: 'Page de contact' },
    });

    expect(commit.ok(), await commit.text()).toBe(true);

    const sha = String((await commit.json()).commit?.sha ?? '').trim();

    expect(sha).toMatch(/^[0-9a-f]{40}$/u);

    const instantane = await request.post(`${apiBaseUrl}/projects/${projectId}/snapshots`, {
      headers: entetes,
      data: {
        label: 'Page de contact',
        kind: 'automatic',
        manifest: {
          checkpoint: {
            // Comme la fin de tour : l'identifiant client ET le rang du tour dans la conversation (stable au relu).
            messageId: 'a1',
            conversationId,
            turnIndex: 0,
            commitSha: sha,
            commitMessage: 'Page de contact',
            statistiques: { dureeMs: 120_000, actions: 15, lignesLues: 218, coutCents: 321 },
          },
        },
      },
    });

    expect(instantane.ok(), await instantane.text()).toBe(true);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('button-add-tab')).toBeVisible({ timeout: 60_000 });

    // Au relu, le message porte son identifiant serveur (`aimsg_…`) : on prend le bloc de la dernière réponse.
    const bloc = page
      .locator('.bolt-chat-message-row-assistant')
      .last()
      .locator('[data-testid^="fin-de-tour-"]')
      .first();

    await expect(bloc).toBeVisible({ timeout: 60_000 });
    await page.waitForLoadState('load');
    await attendreLeFilStable(page);

    /*
     * Le testid apparaît sur une LIGNE du bloc ; la racine `.bolt-fin-de-tour`,
     * elle, pouvait n'être pas encore posée au moment de la mesure — d'où un
     * `getBoundingClientRect` de `null` vu une fois sur ce test (run local du
     * 08/09, passé au réessai). On attend la racine elle-même : ce que la
     * mesure suivante déréférence.
     */
    await page.waitForSelector('.bolt-fin-de-tour', { state: 'attached', timeout: 30_000 });
    await page.waitForSelector('.bolt-project-agent-composer', { state: 'attached', timeout: 30_000 });

    // RP-CKPT-01 — en bas du fil, ni le bloc ni le dernier message ne passent sous la zone de saisie.
    const geometrie = await page.evaluate(() => {
      // La boîte qui défile est la plus PROFONDE des boîtes défilantes contenant le fil (StickToBottom en intercale une).
      const boite = [...document.querySelectorAll<HTMLElement>('*')]
        .filter(
          (el) => /(auto|scroll)/.test(getComputedStyle(el).overflowY) && el.querySelector('.bolt-chat-message-row'),
        )
        .sort((a, b) => a.clientHeight - b.clientHeight)[0];

      if (boite) {
        boite.scrollTop = boite.scrollHeight;
      }

      const rangees = document.querySelectorAll('.bolt-chat-message-row');
      const derniere = rangees[rangees.length - 1]!.getBoundingClientRect();
      const bloc = document.querySelector('.bolt-fin-de-tour')!.getBoundingClientRect();
      const composeur = document.querySelector('.bolt-project-agent-composer')!.getBoundingClientRect();
      const boiteRect = boite?.getBoundingClientRect();

      return {
        derniereBas: Math.round(derniere.bottom),
        blocBas: Math.round(bloc.bottom),
        composeurHaut: Math.round(composeur.top),
        boiteBas: boiteRect ? Math.round(boiteRect.bottom) : null,
      };
    });

    expect(geometrie.boiteBas, 'la boîte qui défile s’arrête où la zone de saisie commence').toBeLessThanOrEqual(
      geometrie.composeurHaut + 1,
    );
    expect(geometrie.blocBas, 'le bloc de fin de tour reste au-dessus de la zone de saisie').toBeLessThanOrEqual(
      geometrie.composeurHaut + 1,
    );
    expect(geometrie.derniereBas, 'le dernier message reste au-dessus de la zone de saisie').toBeLessThanOrEqual(
      geometrie.composeurHaut + 1,
    );

    // RP-CKPT-07 — fermées par défaut ; RP-CKPT-02 — les quatre lignes de Replit.
    await expect(page.getByTestId('fin-de-tour-travail-detail')).toHaveCount(0);
    await expect(page.getByTestId('fin-de-tour-travail')).toHaveText(/Worked for 2 minutes|A travaillé 2 minutes/u);
    await page.getByTestId('fin-de-tour-travail').click();
    await expect(page.getByTestId('fin-de-tour-timeWorked')).toContainText('2 minutes');
    await expect(page.getByTestId('fin-de-tour-workDone')).toContainText('15 actions');
    await expect(page.getByTestId('fin-de-tour-itemsRead')).toContainText(/218 (lines|lignes)/u);
    await expect(page.getByTestId('fin-de-tour-agentUsage')).toContainText(/\$3\.21|3,21 \$/u);

    // RP-CKPT-03 — le point de restauration : message du commit, date, deux boutons.
    await expect(page.getByTestId('fin-de-tour-point')).toHaveText(/Checkpoint made|Point de restauration créé/u);
    await page.getByTestId('fin-de-tour-point').click();

    const detailDuPoint = page.getByTestId('fin-de-tour-point-detail');

    await expect(detailDuPoint).toContainText('Page de contact');
    await expect(detailDuPoint).toContainText(/2026/u);
    await expect(page.getByTestId('fin-de-tour-rollback')).toBeVisible();
    await expect(page.getByTestId('fin-de-tour-changes')).toBeVisible();

    // RP-CKPT-05 — la feuille Replit : Files / Database / Agent memory, Cancel.
    await page.getByTestId('fin-de-tour-rollback').click();

    const feuille = page.getByTestId('rollback-dialog');

    await expect(feuille).toBeVisible();
    await expect(feuille).toContainText(/Rollback to this checkpoint\?|Revenir à ce point de restauration \?/u);
    await expect(feuille).toContainText('Page de contact');

    const impact = page.getByTestId('rollback-impact');

    await expect(impact.locator('strong')).toHaveCount(3);
    await expect(impact).toContainText(/Files|Fichiers/u);
    await expect(impact).toContainText(/Database|Base de données/u);
    await expect(impact).toContainText(/Agent memory|Mémoire de l’agent/u);
    await expect(feuille.locator('input[type="checkbox"]')).toHaveCount(0);
    await page.getByTestId('rollback-cancel').click();
    await expect(feuille).toHaveCount(0);

    // RP-CKPT-06 — « Changes » ouvre l'onglet Git directement sur le commit du point.
    await page.getByTestId('fin-de-tour-changes').click();

    const detailDuCommit = page.getByTestId('git-commit-detail');

    await expect(detailDuCommit).toBeVisible({ timeout: 30_000 });
    await expect(detailDuCommit).toContainText(sha.slice(0, 8));
  });

  test('onglet Secrets : en-tête sur une ligne, filtre, ajout en ligne, puces clé / valeur / ⋮ et menu de ligne — parité Replit', async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000);
    await ouvrirIde(page, request, { fil: false });
    await page.waitForLoadState('load');
    await page.waitForTimeout(600);

    /*
     * Avi, 07/09 14:19–14:20, cinq captures de l'onglet Secrets de Replit :
     * « voici comment il faut faire la tab secret ». Avant : deux champs
     * empilés, un gros bouton plein, « Importer .env », et, par secret,
     * quatre boutons pleine largeur empilés (Révéler / Copier / Copier la
     * valeur / Modifier).
     */
    await ouvrirOutil(page, 'secrets');

    const panneau = page.getByTestId('secrets-panel');

    await expect(panneau).toBeVisible({ timeout: 20_000 });

    // RP-SEC-01 — titre, ⋮ et « + New Secret » sur UNE ligne, dans l'écran.
    const entete = await page.evaluate(() => {
      const r = (sel: string) => document.querySelector(sel)!.getBoundingClientRect();
      const titre = r('.bolt-secrets-title');
      const menu = r('[data-testid="secrets-menu"]');
      const nouveau = r('[data-testid="secrets-new"]');

      const centre = (b: DOMRect) => b.top + b.height / 2;

      return {
        titreY: centre(titre),
        menuY: centre(menu),
        nouveauY: centre(nouveau),
        nouveauDroite: nouveau.right,
        largeur: innerWidth,
        hMenu: menu.height,
        hNouveau: nouveau.height,
      };
    });

    // Centres verticaux alignés : le titre fait 22 px, les boutons 44.
    expect(Math.abs(entete.titreY - entete.nouveauY), 'titre et bouton sur la même ligne').toBeLessThanOrEqual(4);
    expect(Math.abs(entete.menuY - entete.nouveauY)).toBeLessThanOrEqual(4);
    expect(entete.nouveauDroite).toBeLessThanOrEqual(entete.largeur);

    // Tailles Replit (mesurées sur les captures d'Avi) : ⋮ et bouton d'environ 30 px, cible tactile prolongée à 44.
    expect(entete.hMenu).toBeGreaterThanOrEqual(30);
    expect(entete.hNouveau).toBeGreaterThanOrEqual(30);

    // RP-SEC-02 — le filtre, pleine largeur.
    const filtre = page.getByTestId('secrets-filter');

    await expect(filtre).toBeVisible();
    expect((await filtre.boundingBox())!.width).toBeGreaterThan(entete.largeur * 0.8);

    // RP-SEC-04 — ajout EN LIGNE : Clé et Valeur côte à côte, « Ajouter » grisé tant qu'il manque quelque chose.
    await page.getByTestId('secrets-new').tap();

    const formulaire = page.getByTestId('secrets-form');

    await expect(formulaire).toBeVisible();

    const champs = await page.evaluate(() => {
      const cle = document.querySelector('[data-testid="secrets-form-key"]')!.getBoundingClientRect();
      const valeur = document.querySelector('[data-testid="secrets-form-value"]')!.getBoundingClientRect();

      return {
        cleY: cle.top,
        valeurY: valeur.top,
        cleH: cle.height,
        policeCle: getComputedStyle(document.querySelector('[data-testid="secrets-form-key"]')!).fontSize,
      };
    });

    expect(Math.abs(champs.cleY - champs.valeurY), 'Clé et Valeur sur une rangée').toBeLessThanOrEqual(2);
    expect(champs.cleH).toBeGreaterThanOrEqual(34);
    expect(parseFloat(champs.policeCle), 'plancher iOS : pas de zoom au focus').toBeGreaterThanOrEqual(16);

    const ajouter = page.getByTestId('secrets-form-add');

    await expect(ajouter).toBeDisabled();
    await page.getByTestId('secrets-form-key').fill('SLACK_API_KEY');
    await expect(ajouter).toBeDisabled();
    await page.getByTestId('secrets-form-value').fill('xoxb-test');
    await expect(ajouter).toBeEnabled();
    await ajouter.tap();

    // RP-SEC-03 — la ligne : puce clé, puce valeur (points + œil), ⋮ — trois éléments de 44 px sur une rangée.
    const ligne = page.getByTestId('secret-row-SLACK_API_KEY');

    await expect(ligne).toBeVisible({ timeout: 20_000 });
    await expect(formulaire).toBeHidden();

    const geometrie = await ligne.evaluate((el) => {
      const [cle, valeur, menu] = [
        el.querySelector('.bolt-secrets-chip--key')!,
        el.querySelector('.bolt-secrets-chip--value')!,
        el.querySelector('.bolt-secrets-row-menu')!,
      ].map((n) => n.getBoundingClientRect());

      return {
        cle: { y: cle.top, h: cle.height, l: cle.width },
        valeur: {
          y: valeur.top,
          h: valeur.height,
          l: valeur.width,
          texte: el.querySelector('.bolt-secrets-chip--value .bolt-secrets-chip-text')!.textContent,
        },
        menu: { y: menu.top, h: menu.height, l: menu.width, droite: menu.right },
        largeur: innerWidth,
      };
    });

    expect(Math.abs(geometrie.cle.y - geometrie.valeur.y)).toBeLessThanOrEqual(2);
    expect(Math.abs(geometrie.cle.y - geometrie.menu.y)).toBeLessThanOrEqual(2);
    expect(geometrie.cle.h).toBeGreaterThanOrEqual(30);
    expect(geometrie.valeur.h).toBeGreaterThanOrEqual(30);
    expect(geometrie.menu.l).toBeGreaterThanOrEqual(30);

    // La police des lignes suit Replit (≈ 13 px), le titre aussi (≈ 22 px) — mesuré, pas déclaré.
    const polices = await page.evaluate(() => ({
      ligne: parseFloat(
        getComputedStyle(document.querySelector('.bolt-secrets-chip--key .bolt-secrets-chip-text')!).fontSize,
      ),
      titre: parseFloat(getComputedStyle(document.querySelector('.bolt-secrets-title')!).fontSize),
    }));

    expect(polices.ligne).toBe(13);
    expect(polices.titre).toBe(22);

    // La cible tactile reste de 44 px : 5 px au-dessus de la puce, c'est encore elle.
    const dessus = await page.evaluate(() => {
      const puce = document.querySelector<HTMLElement>('.bolt-secrets-chip--key')!;
      const r = puce.getBoundingClientRect();
      const touche = document.elementFromPoint(r.left + r.width / 2, r.top - 5);

      return touche === puce || puce.contains(touche);
    });

    expect(dessus, 'la puce répond 5 px au-dessus de sa boîte').toBe(true);
    expect(geometrie.menu.droite).toBeLessThanOrEqual(geometrie.largeur);
    expect(geometrie.valeur.texte, 'la valeur est masquée par défaut').toMatch(/^•+$/);

    // Le filtre agit.
    await filtre.fill('zzz');
    await expect(ligne).toBeHidden();
    await filtre.fill('slack');
    await expect(ligne).toBeVisible();

    // RP-SEC-08 — le menu ⋮ : Modifier / Trouver les usages / Supprimer, flottant, dans l'écran.
    await page.getByTestId('secret-menu-SLACK_API_KEY').tap();

    const menu = page.getByTestId('secrets-floating-menu');

    await expect(menu).toBeVisible();

    const entrees = await menu.locator('[role="menuitem"]').allTextContents();

    expect(entrees.map((e) => e.trim())).toEqual(['Edit', 'Find Usages', 'Delete']);

    const boiteMenu = (await menu.boundingBox())!;

    expect(boiteMenu.x).toBeGreaterThanOrEqual(0);
    expect(boiteMenu.x + boiteMenu.width).toBeLessThanOrEqual(geometrie.largeur);
    expect(boiteMenu.y + boiteMenu.height).toBeLessThanOrEqual(844);

    // Supprimer, depuis le menu : la ligne disparaît.
    await menu.locator('[role="menuitem"]', { hasText: 'Delete' }).tap();
    await expect(ligne).toBeHidden({ timeout: 20_000 });
  });

  test('zone de saisie : bordure basse du cadre visible, 8 px au-dessus du socle, sans défilement interne', async ({
    page,
    request,
  }) => {
    test.setTimeout(150_000);
    await ouvrirIde(page, request, { fil: true, long: true });

    /*
     * Avi, 07/09 07:59, capture entourée en rouge : « c'est de l'espace mort,
     * on peut redescendre, et on voit pas la bordure de la zone de saisie ».
     * Mesuré avant correction (Chromium et WebKitGTK, 390) : bordure à 754 px
     * pour un socle à 772 — 18 px de vide — et un composeur défilable en
     * interne (141 px de contenu pour 125 de boîte) à cause du svg d'effet
     * qui débordait de 25 px.
     */
    await expect(page.locator('.bolt-chat-message-row').last()).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(1500);

    const geometrie = await page.evaluate(() => {
      const composeur = document.querySelector<HTMLElement>('.bolt-project-agent-composer')!;

      const cadre = [...composeur.querySelectorAll<HTMLElement>('div')].find(
        (el) => parseFloat(getComputedStyle(el).borderBottomWidth) >= 1 && el.getBoundingClientRect().height > 60,
      );

      const socle = document.querySelector('.bolt-mobile-replit-nav')?.getBoundingClientRect();
      const boiteCadre = cadre?.getBoundingClientRect();

      const peintSousLaBordure = boiteCadre
        ? document.elementsFromPoint((boiteCadre.left + boiteCadre.right) / 2, boiteCadre.bottom - 0.5)
        : [];

      return {
        defilementInterne: composeur.scrollHeight - composeur.clientHeight,
        cadreBas: boiteCadre ? Math.round(boiteCadre.bottom) : null,
        composeurBas: Math.round(composeur.getBoundingClientRect().bottom),
        socleHaut: socle ? Math.round(socle.top) : null,
        bordurePeinte: Boolean(cadre && peintSousLaBordure.includes(cadre)),
      };
    });

    expect(geometrie.cadreBas, 'le cadre bordé de la zone de saisie doit exister').not.toBeNull();
    expect(geometrie.socleHaut).not.toBeNull();
    expect(geometrie.defilementInterne, 'le composeur ne doit pas défiler en interne quand tout tient').toBe(0);
    expect(geometrie.bordurePeinte, 'la bordure basse du cadre est peinte dans la boîte du composeur').toBe(true);
    expect(geometrie.cadreBas, 'plus de rembourrage transparent sous le cadre').toBe(geometrie.composeurBas);

    const vide = geometrie.socleHaut! - geometrie.cadreBas!;

    expect(vide, `${vide}px de vide entre la bordure et le socle`).toBeLessThanOrEqual(10);
    expect(vide, 'le cadre ne touche pas le socle').toBeGreaterThanOrEqual(4);
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

    // Depuis le 07/09 (barre d'icônes), le menu est plus étroit que l'écran : il tient entier, centré sous le doigt.
    expect(geometrie.width, 'une barre d’icônes, pas une liste de libellés').toBeLessThan(300);
    expect(geometrie.left).toBeGreaterThanOrEqual(12);
    expect(geometrie.right, `bord droit à ${geometrie.right}px pour ${geometrie.vw}px d’écran`).toBeLessThanOrEqual(
      geometrie.vw - 12,
    );

    // Les libellés français vivent dans `aria-label` ; à l'écran, rien n'est rogné.
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

/*
 * BUG-STREAM-JUMP-001 — « le contenu de l'agent n'arrête pas de sauter, c'est
 * impossible de suivre le streaming proprement » (Avi, 08/09).
 *
 * Mesuré à 390 sur le build de production, tour streamé, sonde
 * MutationObserver : `append` vient de `useChat` et change d'identité à chaque
 * lot de jetons ; la table `components` de react-markdown en dépendait, donc
 * chacune de ses entrées changeait de TYPE à chaque lot et react-markdown
 * remontait tout le sous-arbre. Le markdown de TOUS les messages du fil — y
 * compris des tours terminés depuis longtemps — était recréé toutes les 25 à
 * 65 ms : 387 recréations sur 400 mutations relevées, un bloc de code qui
 * apparaissait et disparaissait 39 fois, un à-coup de défilement de −159 px.
 * Après correctif, même sonde et même build : 3 recréations sur 135 mutations,
 * 3 clignotements, plus aucun à-coup négatif.
 *
 * Le flux est piloté DANS la page : `route.fulfill` livrerait le corps d'un
 * seul coup — ce ne serait pas un flux, et le défaut ne se produirait pas.
 */
test.describe('agent — le fil ne se recrée pas pendant le streaming (téléphone)', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

  test('un tour streamé ne recrée pas le markdown des messages déjà affichés', async ({ page, request }) => {
    test.setTimeout(180_000);

    await page.addInitScript(() => {
      const prose =
        'Voici une explication détaillée de ce que je viens de faire, avec assez de ' +
        'texte pour que le fil dépasse la fenêtre de lecture d’un téléphone. ';

      const bouts: string[] = [];

      for (let tour = 0; tour < 4; tour += 1) {
        bouts.push(prose, prose, '\n\n```ts\n', `export const v${tour} = ${tour};\n`, '```\n\n');
      }

      // Morceaux de 12 caractères : la granularité d'un vrai modèle.
      const fins: string[] = [];

      for (const bout of bouts) {
        for (let i = 0; i < bout.length; i += 12) {
          fins.push(bout.slice(i, i + 12));
        }
      }

      const vrai = window.fetch.bind(window);

      window.fetch = ((entree: any, init?: any) => {
        const url = typeof entree === 'string' ? entree : (entree?.url ?? '');

        if (!String(url).includes('/api/chat')) {
          return vrai(entree, init);
        }

        const encodeur = new TextEncoder();

        const corps = new ReadableStream({
          start(controleur) {
            let i = 0;
            controleur.enqueue(encodeur.encode('f:' + JSON.stringify({ messageId: 'msg-flux' }) + '\n'));

            const pousser = () => {
              if (i >= fins.length) {
                controleur.enqueue(encodeur.encode('d:' + JSON.stringify({ finishReason: 'stop', usage: {} }) + '\n'));
                controleur.close();

                return;
              }

              controleur.enqueue(encodeur.encode('0:' + JSON.stringify(fins[i]) + '\n'));
              i += 1;
              setTimeout(pousser, 25);
            };

            setTimeout(pousser, 25);
          },
        });

        return Promise.resolve(
          new Response(corps, {
            status: 200,
            headers: { 'content-type': 'text/event-stream; charset=utf-8', 'x-vercel-ai-data-stream': 'v1' },
          }),
        );
      }) as typeof window.fetch;
    });

    await ouvrirIde(page, request, { fil: true, long: true });
    await page.waitForLoadState('load');
    await page.waitForTimeout(2500);

    const composeur = page
      .locator('.bolt-project-agent-composer textarea, .bolt-project-agent-composer [contenteditable]')
      .first();
    await expect(composeur).toBeVisible({ timeout: 30_000 });

    // On compte les recréations de markdown ET les allers-retours des blocs de code.
    await page.evaluate(() => {
      const w = window as any;
      w.__recrees = 0;
      w.__pre = [];

      const cible = document.querySelector('.bolt-project-agent-transcript');

      if (cible) {
        new MutationObserver((enregistrements) => {
          for (const enr of enregistrements) {
            for (const n of enr.addedNodes) {
              if (n instanceof HTMLElement && /MarkdownContent/.test(String(n.className || ''))) {
                w.__recrees += 1;
              }
            }
          }

          w.__pre.push(document.querySelectorAll('.bolt-project-agent-transcript pre').length);
        }).observe(cible, { childList: true, subtree: true });
      }
    });

    const lignesAvant = await page.locator('.bolt-chat-message-row').count();

    await composeur.click();
    await composeur.fill('Explique-moi ce que tu as fait.');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(8000);

    const { recrees, clignotements, pre } = await page.evaluate(() => {
      const w = window as any;
      const suite: number[] = w.__pre;

      let n = 0;

      for (let i = 1; i < suite.length; i += 1) {
        if (suite[i] !== suite[i - 1]) {
          n += 1;
        }
      }

      return { recrees: w.__recrees as number, clignotements: n, pre: suite[suite.length - 1] ?? 0 };
    });

    // Le flux a bien eu lieu : sans cela, « 0 recréation » ne dirait rien (règle 14).
    const lignesApres = await page.locator('.bolt-chat-message-row').count();

    expect(lignesApres, 'le tour streamé doit avoir ajouté des messages').toBeGreaterThan(lignesAvant);
    expect(pre, 'le flux doit avoir rendu au moins un bloc de code').toBeGreaterThan(0);

    /*
     * Mesuré : 387 avant correctif, 3 après. Le seuil laisse la place aux
     * montages légitimes (le message neuf) tout en restant vingt fois sous le
     * défaut.
     */
    expect(recrees, 'le markdown des messages déjà affichés ne doit pas être recréé').toBeLessThanOrEqual(20);
    expect(clignotements, 'un bloc de code ne doit pas apparaître et disparaître en boucle').toBeLessThanOrEqual(8);
  });
});

/*
 * BUG-PILL-LEAKS-PANELS-001 — « parfois je vois dans la tab preview le scroll
 * icon de l'agent » (Avi, 08/09 20:53, capture iPhone : le disque ↓ posé en bas
 * à droite du cadre d'aperçu).
 *
 * Mesuré à 390 AVANT correctif : sur les panneaux Aperçu ET Déploiements, la
 * pastille restait `display: flex` / `visible` / `opacity: 1` à [324, 708], et
 * `elementFromPoint` en son centre la rendait — elle se peignait donc bien
 * par-dessus l'autre panneau. Sur 164 éléments du fil, elle était la SEULE à
 * s'échapper : le panneau actif est un calque `position: absolute; inset: 0` en
 * `z-index: auto`, la pastille est `sticky` en `z-index: 20`, et toute la
 * chaîne jusqu'à `body` est en `z-index: auto` — vingt bat zéro.
 *
 * Le test tient les DEUX moitiés, sans quoi supprimer la pastille suffirait à
 * le faire passer : elle doit se peindre au-dessus du fil DANS le panneau
 * Agent, et ne plus rien disputer aux autres panneaux.
 */
test.describe('agent — la pastille « descendre » ne déborde sur aucun autre panneau', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

  test('elle se peint sur le fil, et sur rien d’autre', async ({ page, request }) => {
    test.setTimeout(150_000);

    await ouvrirIde(page, request, { fil: true, long: true });
    await page.waitForLoadState('load');
    await attendreLeFilStable(page);

    // Remonter le fil : la pastille n'existe que lorsqu'on n'est PAS en bas.
    await page.evaluate(() => {
      const candidats = [...document.querySelectorAll<HTMLElement>('*')].filter(
        (el) =>
          /(auto|scroll)/.test(getComputedStyle(el).overflowY) &&
          el.scrollHeight > el.clientHeight + 4 &&
          el.querySelector('.bolt-chat-message-row'),
      );

      const sc = candidats.find((el) => !candidats.some((a) => a !== el && el.contains(a))) ?? candidats[0];

      if (sc) {
        sc.scrollTop = 0;
      }
    });

    const pastille = page.locator('.bolt-agent-scroll-to-bottom');
    await expect(pastille, 'la pastille doit apparaître quand on remonte le fil').toBeVisible({ timeout: 20_000 });

    /* Se peint-elle au point qu'elle occupe ? C'est la seule question qui compte. */
    const sePeint = () =>
      page.evaluate(() => {
        const p = document.querySelector<HTMLElement>('.bolt-agent-scroll-to-bottom');

        if (!p) {
          return { existe: false, dessus: false, quoi: null as string | null };
        }

        const r = p.getBoundingClientRect();
        const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);

        return {
          existe: true,
          dessus: Boolean(el && (el === p || p.contains(el))),
          quoi: el ? `${el.tagName}.${String(el.className).slice(0, 40)}` : null,
        };
      });

    // MOITIÉ 1 — dans le panneau Agent, elle est bien là et cliquable.
    const surLeFil = await sePeint();

    expect(surLeFil.existe, 'la pastille doit exister dans le panneau Agent').toBe(true);
    expect(surLeFil.dessus, 'dans le panneau Agent elle se peint au-dessus du fil').toBe(true);

    // MOITIÉ 2 — sur les autres panneaux, elle ne dispute plus rien.
    for (const outil of ['preview', 'git']) {
      await ouvrirOutil(page, outil);
      await page.waitForTimeout(1500);

      const ailleurs = await sePeint();

      expect(
        ailleurs.dessus,
        `la pastille de l’agent ne doit rien peindre par-dessus le panneau ${outil} (trouvé : ${ailleurs.quoi})`,
      ).toBe(false);
    }
  });
});

/*
 * RP-PUBLISH-01…06 — le panneau Publication à la Replit (captures d'Avi,
 * 08/09 21:00-21:02), et BUG-SECURITY-FIX-AGENT-001 — « Réparer avec l'agent »
 * doit ramener sur le panneau Agent.
 *
 * Ce que ce test tient, c'est ce qui a réellement cassé pendant la mise au
 * point : la coquille de l'IDE impose ses tailles en `!important`, et une
 * première correction n'a pas suffi parce que les deux sélecteurs étaient à
 * ÉGALITÉ de spécificité (0,2,0) — le `:not([class*="i-"])` de la coquille
 * compte pour une classe, et à égalité l'ordre du fichier tranche. Mesuré : le
 * titre sortait à 13 px au lieu de 30, le bouton d'action à 14 au lieu de 17.
 * Un vert sur « le bloc est visible » n'aurait rien vu de tout cela.
 */
test.describe('publication à la Replit — le panneau et ses tailles', () => {
  for (const format of [
    { nom: 'téléphone', width: 390, height: 844 },
    { nom: 'tablette', width: 820, height: 1180 },
  ]) {
    test.describe(`format ${format.nom}`, () => {
      test.use({
        viewport: { width: format.width, height: format.height },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2,
      });

      test('le bloc se rend aux bonnes tailles, sans rien déborder', async ({ page, request }) => {
        test.setTimeout(180_000);

        const { token, projectId } = await ouvrirIde(page, request, { fil: false });

        // Un déploiement réel : la carte d'étapes et l'historique ont de quoi s'afficher.
        const cree = await request.post(`${apiBaseUrl}/projects/${projectId}/deployments`, {
          headers: { authorization: `Bearer ${token}` },
          data: { provider: 'static', timeoutSeconds: 30 },
        });

        expect(cree.ok(), `création du déploiement : ${cree.status()}`).toBe(true);

        await ouvrirOutil(page, 'deployments');

        const bloc = page.getByTestId('publication');
        await expect(bloc).toBeVisible({ timeout: 30_000 });

        // Les pièces maîtresses de la maquette.
        await expect(page.getByTestId('publication-etapes')).toBeVisible();
        await expect(page.getByTestId('publication-pastille')).toBeVisible();
        await expect(page.getByTestId('publication-republier')).toBeVisible();

        const mesures = await page.evaluate(() => {
          const taille = (sel: string) => {
            const el = document.querySelector<HTMLElement>(sel);

            return el ? Math.round(parseFloat(getComputedStyle(el).fontSize)) : null;
          };

          const racine = document.querySelector<HTMLElement>('.bolt-publication');
          const rr = racine?.getBoundingClientRect();

          const deborde =
            racine && rr
              ? [...racine.querySelectorAll<HTMLElement>('*')].filter((el) => {
                  const r = el.getBoundingClientRect();

                  return r.width > 0 && (r.right > rr.right + 1 || r.left < rr.left - 1);
                }).length
              : 0;

          return {
            titre: taille('.bolt-publication-entete h2'),
            sousTitre: taille('.bolt-publication-entete p'),
            titreDeCarte: taille('.bolt-publication-carte-entete h3'),
            segment: taille('.bolt-publication-segment'),
            bouton: taille('.bolt-publication-republier'),
            deborde,
            scrollWidth: document.documentElement.scrollWidth,
            innerWidth: window.innerWidth,
          };
        });

        // Les tailles de la maquette Replit, à l'échelle 3,0 px par px CSS.
        expect(mesures.titre, 'le titre résiste au reset de police de la coquille').toBe(30);
        expect(mesures.sousTitre).toBe(15);
        expect(mesures.titreDeCarte).toBe(17);
        expect(mesures.segment).toBe(15);
        expect(mesures.bouton, 'le bouton d’action résiste lui aussi').toBe(17);

        expect(mesures.deborde, 'rien ne sort du panneau').toBe(0);
        expect(mesures.scrollWidth, 'et la page ne défile pas latéralement').toBeLessThanOrEqual(mesures.innerWidth);
      });
    });
  }

  /*
   * RP-PUBLISH-07…12 — l'écran « Ajuster les réglages ».
   *
   * Ce qu'il tient surtout : le PRIX est CALCULÉ depuis la carte tarifaire
   * active, jamais recopié de la capture Replit (« $15 per month »). Et le
   * panneau ne doit pas se démonter en basculant — premier essai, « Ajuster
   * les réglages » changeait aussi d'onglet et la vue disparaissait.
   */
  test.describe('écran des réglages', () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

    test('les gabarits portent un prix calculé, et les gestes sont ceux qui existent', async ({ page, request }) => {
      test.setTimeout(150_000);

      const { token, projectId } = await ouvrirIde(page, request, { fil: false });

      const cree = await request.post(`${apiBaseUrl}/projects/${projectId}/deployments`, {
        headers: { authorization: `Bearer ${token}` },
        data: { provider: 'static', timeoutSeconds: 30 },
      });

      expect(cree.ok(), `création du déploiement : ${cree.status()}`).toBe(true);

      await ouvrirOutil(page, 'deployments');
      await expect(page.getByTestId('publication')).toBeVisible({ timeout: 30_000 });

      await page.getByTestId('publication-reglages').click();

      const corps = page.getByTestId('publication-reglages-corps');
      await expect(corps, 'la bascule ne doit pas démonter le panneau').toBeVisible({ timeout: 15_000 });

      const gabarits = page.locator('[data-testid="publication-gabarits"] li');
      await expect(gabarits.first()).toBeVisible();

      const textes = await gabarits.allTextContents();

      expect(textes.length, 'les gabarits viennent de la carte tarifaire').toBeGreaterThan(0);

      /*
       * Un prix par heure à quatre décimales, dérivé des unités de calcul —
       * c'est la signature d'un calcul, pas d'une constante.
       */
      expect(textes.join(' ')).toMatch(/\$\d+\.\d{4}/u);

      // Et le gabarit du déploiement est marqué comme courant.
      await expect(page.locator('[data-testid="publication-gabarits"] li[data-courant="true"]')).toHaveCount(1);

      // Les gestes proposés sont ceux que l'API sait faire, pas ceux de Replit.
      const gestes = await page.locator('[data-testid="publication-gestes"] li button').allTextContents();

      expect(gestes.length).toBeGreaterThan(0);
      expect(gestes.join(' ')).not.toMatch(/Unpublish|Dépublier/u);

      // Rien ne déborde du panneau.
      const deborde = await page.evaluate(() => {
        const racine = document.querySelector<HTMLElement>('.bolt-publication');
        const rr = racine?.getBoundingClientRect();

        if (!racine || !rr) {
          return -1;
        }

        return [...racine.querySelectorAll<HTMLElement>('*')].filter((el) => {
          const r = el.getBoundingClientRect();

          return r.width > 0 && (r.right > rr.right + 1 || r.left < rr.left - 1);
        }).length;
      });

      expect(deborde).toBe(0);
    });
  });

  test.describe('« Réparer avec l’agent » ramène sur l’agent', () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

    test('depuis n’importe quel panneau, la demande bascule sur le panneau Agent', async ({ page, request }) => {
      test.setTimeout(150_000);

      await ouvrirIde(page, request, { fil: true });
      await ouvrirOutil(page, 'deployments');

      const coque = page.locator('.bolt-responsive-ide-mobile');
      await expect(coque).toHaveAttribute('data-mobile-panel', /deploy/, { timeout: 30_000 });

      /*
       * On émet l'événement que les trois surfaces émettent (Sécurité, Git,
       * Publication). Avant correctif, l'invite partait dans une zone de
       * saisie que l'utilisateur ne voyait pas : il restait sur son panneau.
       */
      await page.evaluate(() =>
        window.dispatchEvent(
          new CustomEvent('vibecore:agent-task', {
            detail: { kind: 'fix-publication', prompt: 'Corrige la publication.' },
          }),
        ),
      );

      await expect(coque, 'la demande doit ramener sur le panneau Agent').toHaveAttribute('data-mobile-panel', 'chat', {
        timeout: 15_000,
      });

      // Et l'invite est bien déposée dans la zone de saisie, prête à partir.
      const composeur = page.locator('.bolt-project-agent-composer textarea').first();
      await expect(composeur).toHaveValue(/Corrige la publication\./, { timeout: 15_000 });
    });
  });
});

/*
 * RP-DB-05 — « Tables », avec « N rows » (captures d'Avi, 08/09 21:07).
 *
 * Défaut MESURÉ le 08/09 : la vue lisait `t.name` / `t.rowCount`, l'API rend
 * `table_name` / `rowsEstimate`. Les deux formes ne se rencontraient jamais —
 * chaque table sortait avec un nom VIDE, et la clé React valait ce vide pour
 * toutes. Relevé à l'écran : 0 table rendue. Après : 127.
 *
 * Ce test frappe une VRAIE base (celle de la pile) : c'est ce qui distingue un
 * mappage juste d'un mappage qui compile.
 */
test.describe('base de données — les tables portent leur nom et leur compte', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

  test('la liste des tables n’est pas vide, et chaque ligne est nommée', async ({ page, request }) => {
    test.setTimeout(180_000);

    const urlBase = process.env.DATABASE_URL;

    test.skip(!urlBase, 'DATABASE_URL absente : ce test veut une VRAIE base, pas une simulation');

    const { token, projectId } = await ouvrirIde(page, request, { fil: false });

    await request.put(`${apiBaseUrl}/projects/${projectId}/env-vars`, {
      headers: { authorization: `Bearer ${token}` },
      data: { key: 'DATABASE_URL', value: urlBase },
    });

    await ouvrirOutil(page, 'database');

    /*
     * On ATTEND la carte de la base avant de cliquer. Une première version
     * balayait tous les boutons après un délai fixe : quand la liste n'était
     * pas encore chargée elle ne cliquait rien, et le test devenait
     * intermittent (vu une fois sur la suite complète, passé au réessai).
     * Un délai n'est pas une condition (règle 17).
     */
    const carte = page.getByTestId('db-carte').first();

    await expect(carte, 'la liste des bases doit se charger').toBeVisible({ timeout: 30_000 });
    await carte.click();

    const lignes = page.getByTestId('db-table');

    await expect(lignes.first(), 'les tables de la base doivent s’afficher').toBeVisible({ timeout: 30_000 });

    const noms = await lignes.evaluateAll((elements) =>
      elements.slice(0, 10).map((el) => (el.querySelector('span')?.textContent ?? '').trim()),
    );

    expect(noms.length, 'une vraie base a des tables').toBeGreaterThan(0);

    // Le défaut exact : des noms VIDES, tous identiques.
    expect(
      noms.every((nom) => nom.length > 0),
      `noms relevés : ${JSON.stringify(noms)}`,
    ).toBe(true);
    expect(new Set(noms).size, 'et des noms distincts, pas la même clé partout').toBe(noms.length);

    // Le compte de lignes est rendu, y compris « 0 » pour une table vide.
    const comptes = await lignes.evaluateAll((elements) =>
      elements.slice(0, 5).map((el) => (el.querySelectorAll('span')[1]?.textContent ?? '').trim()),
    );

    expect(
      comptes.some((compte) => /\d/u.test(compte)),
      `comptes relevés : ${JSON.stringify(comptes)}`,
    ).toBe(true);
  });
});
