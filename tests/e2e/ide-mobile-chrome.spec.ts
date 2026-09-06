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
      expect(m.h, `bouton « ${m.text} » haut de ${m.h}px`).toBe(36);
    }
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

    const [m] = await mesurer(page, '.bolt-action-file-path');

    // `mesurer` ne garde que 40 caractères du texte.
    expect(m.text).toBe(CHEMIN_PROFOND.slice(0, 40));
    expect(m.sw, `chemin tronqué : ${m.sw}px de texte pour ${m.cw}px`).toBeLessThanOrEqual(m.cw + 1);

    // Replié sur plusieurs lignes, pas coupé : plus haut qu'une ligne de 11 px.
    expect(m.h, `chemin haut de ${m.h}px`).toBeGreaterThan(24);

    await expect(page.locator('.bolt-action-row button.bolt-action-target').first()).toBeVisible();

    const [cible] = await mesurer(page, '.bolt-action-row button.bolt-action-target');

    expect(cible.h, `cible du fichier de ${cible.h}px`).toBeGreaterThanOrEqual(44);

    // Le repli de la commande : 44 px de cible, 32 px dans le flux (mesuré avant : 44).
    await expect(page.locator('.bolt-action-row-details').first()).toBeVisible({ timeout: 30_000 });

    const [repli] = await mesurer(page, '.bolt-action-row-details');
    const [resume] = await mesurer(page, '.bolt-action-row-details > summary');

    expect(resume.h, `cible du résumé de ${resume.h}px`).toBeGreaterThanOrEqual(44);
    expect(repli.h, `repli de ${repli.h}px dans le flux`).toBeLessThanOrEqual(34);
  });
});
