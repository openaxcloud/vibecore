import { expect, test, type APIRequestContext } from '@playwright/test';

/**
 * AGENT-MOBILE-04/09 — trois points relevés par Avi sur capture iPhone, MESURÉS
 * à l'écran sur le vrai panneau Agent (fil semé par l'API, IDE ouvert).
 *
 *   1. la liste d'actions d'un artefact : lignes serrées, pastille « Terminé »
 *      à la taille du chemin de fichier à sa gauche ;
 *   2. la pastille « descendre » juste au-dessus de la zone de saisie ;
 *   3. la zone de saisie à la taille des messages de l'agent.
 *
 * Mesuré AVANT correctif (Chromium, 390×844, commit bf4f6a6) : pas de ligne
 * 47,25 px ; pastille 14 px contre 11 px pour le chemin ; pastille « descendre »
 * à 63 px au-dessus du composeur ; libellés du composeur à 17 px contre 14 px
 * pour les messages. Chaque seuil ci-dessous est ROUGE sur ces valeurs.
 *
 * Les garde-fous de feuille (`app/styles/agent-action-list-density.spec.ts`)
 * figent les règles ; ce test vérifie qu'elles produisent bien l'écran voulu.
 */

const appBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';
const apiBaseUrl = process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';

const FICHIERS = [
  'package.json',
  'tsconfig.json',
  'vite.config.ts',
  'index.html',
  'src/types.ts',
  'src/data/catalog.ts',
  'src/lib/format.ts',
];

const TOURS = 6;

async function semerLeFil(request: APIRequestContext) {
  const suffixe = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  let corps = '';

  for (let essai = 0; essai < 4; essai += 1) {
    const inscription = await request.post(`${apiBaseUrl}/auth/register`, {
      data: {
        email: `action-list-${suffixe}-${essai}@local.test`,
        password: 'Password123!',
        name: 'Liste d’actions',
        organizationName: `Liste d’actions ${suffixe}-${essai}`,
      },
    });

    corps = await inscription.text();

    if (!inscription.ok()) {
      // /auth/register est limité par IP ; on patiente plutôt que de rougir la suite.
      if (inscription.status() === 429 && essai < 3) {
        await new Promise((resolve) => setTimeout(resolve, 11_000));
        continue;
      }

      break;
    }

    const auth = JSON.parse(corps) as { token: string; organization: { id: string } };
    const headers = { authorization: `Bearer ${auth.token}` };

    const projet = await request.post(`${apiBaseUrl}/orgs/${auth.organization.id}/projects`, {
      headers,
      data: { name: 'Nova Market' },
    });
    expect(projet.ok(), await projet.text()).toBeTruthy();

    const projectId = (await projet.json()).project.id as string;

    const conversation = await request.post(`${apiBaseUrl}/projects/${projectId}/ai/conversations`, {
      headers,
      data: { title: 'Nova Market' },
    });
    expect(conversation.ok(), await conversation.text()).toBeTruthy();

    const conversationId = (await conversation.json()).conversation.id as string;

    const artefact =
      '<boltArtifact id="nova-market" title="Nova Market — boutique en ligne React + Vite + TypeScript">' +
      FICHIERS.map((f) => `<boltAction type="file" filePath="${f}">// ${f}\n</boltAction>`).join('') +
      '</boltArtifact>';

    const messages = Array.from({ length: TOURS }).flatMap((_, index) => [
      {
        clientId: `u${index}`,
        role: 'user',
        content: `Question ${index + 1} — assez longue pour occuper de la hauteur et forcer le défilement du panneau.`,
      },
      {
        clientId: `a${index}`,
        role: 'assistant',
        content: `Réponse ${index + 1}. ${'Texte de remplissage pour donner de la hauteur au message. '.repeat(4)}`,
      },
    ]);

    messages.push({ clientId: 'u-artefact', role: 'user', content: 'Crée la boutique Nova Market.' });
    messages.push({
      clientId: 'a-artefact',
      role: 'assistant',
      content: `Je crée le projet.\n\n${artefact}\n\nC'est prêt.`,
    });

    const transcript = await request.put(
      `${apiBaseUrl}/projects/${projectId}/ai/conversations/${conversationId}/transcript`,
      { headers, data: { messages } },
    );
    expect(transcript.ok(), await transcript.text()).toBeTruthy();

    const ideState = await request.put(`${apiBaseUrl}/projects/${projectId}/ide-state`, {
      headers,
      data: { state: { chat: { metadata: { aiConversationId: conversationId } } } },
    });
    expect(ideState.ok(), await ideState.text()).toBeTruthy();

    return { token: auth.token, projectId };
  }

  throw new Error(`Impossible de préparer la conversation de test : ${corps}`);
}

// Un seul projet pour les deux formats : le fil est en lecture seule.
test.describe.configure({ mode: 'serial' });

test.describe('panneau Agent en mobile — liste d’actions, pastille « descendre », zone de saisie', () => {
  let session: { token: string; projectId: string };

  test.beforeAll(async ({ request }) => {
    session = await semerLeFil(request);
  });

  for (const vue of [
    { label: 'mobile 390', width: 390, height: 844 },
    { label: 'tablette 768', width: 768, height: 1024 },
  ]) {
    test(`tient la capture de référence d’Avi — ${vue.label}`, async ({ page }) => {
      test.setTimeout(180_000);

      await page
        .context()
        .addCookies([{ name: 'vc_session', value: session.token, url: appBaseUrl, httpOnly: true, sameSite: 'Lax' }]);
      await page.setViewportSize({ width: vue.width, height: vue.height });
      await page.goto(`/projects/${session.projectId}/ide`, { waitUntil: 'domcontentloaded' });

      const lignes = page.locator('.bolt-action-row');
      await expect(lignes.first()).toBeVisible({ timeout: 120_000 });
      await expect(lignes).toHaveCount(FICHIERS.length, { timeout: 60_000 });

      /*
       * ------------------------------------------------------------------
       * 1. Liste d'actions — lignes serrées, cible tactile conservée.
       * ----------------------------------------------------------------
       */
      /*
       * La mesure se refait tant que le fil bouge encore. Sur le portail E2E de
       * production (commit fafed25) les lignes comptées à 7 avaient DISPARU
       * 800 ms plus tard : le magasin des artefacts était vidé par un
       * changement d'adaptateur de runtime après le premier rendu (corrigé dans
       * `workbenchStore.configureRuntime`). En cas d'échec, le message dit ce
       * que le DOM contenait — pas seulement « undefined ».
       */
      type Mesure = {
        pas: number[];
        hauteurs: number[];
        cible: number;
        policeCode: string | null;
        policePastille: string | null;
      };

      let liste: Mesure | undefined;

      await expect(async () => {
        const mesure = await page.evaluate(() => {
          const rows = [...document.querySelectorAll<HTMLElement>('.bolt-action-row')];

          if (rows.length === 0) {
            return {
              vide: {
                artefacts: document.querySelectorAll('.artifact').length,
                messages: document.querySelectorAll('.bolt-chat-message-row').length,
                alerte: document.querySelector('[role="alert"]')?.textContent?.slice(0, 160) ?? null,
              },
            };
          }

          const boxes = rows.map((r) => r.getBoundingClientRect());
          const first = rows[0];
          const bouton = first.querySelector<HTMLElement>('button');
          const code = first.querySelector<HTMLElement>('code');
          const pastille = first.querySelector<HTMLElement>('.bolt-action-status');

          return {
            pas: boxes.slice(1).map((b, i) => b.top - boxes[i].top),
            hauteurs: boxes.map((b) => b.height),
            cible: bouton?.getBoundingClientRect().height ?? 0,
            policeCode: code ? getComputedStyle(code).fontSize : null,
            policePastille: pastille ? getComputedStyle(pastille).fontSize : null,
          };
        });

        expect('vide' in mesure, `les lignes d’actions ont disparu du fil : ${JSON.stringify(mesure)}`).toBe(false);

        const posee = mesure as Mesure;
        expect(posee.hauteurs, 'le fil est encore en train de se poser').toHaveLength(FICHIERS.length);
        liste = posee;
      }).toPass({ timeout: 30_000, intervals: [500] });

      if (!liste) {
        throw new Error('mesure des lignes absente');
      }

      // 47,25 px mesurés avant : le plancher rem de 44px et le space-y-2.5 additionnés.
      for (const pas of liste.pas) {
        expect(pas, 'les lignes sont trop espacées').toBeLessThanOrEqual(40);
      }

      for (const hauteur of liste.hauteurs) {
        expect(hauteur, 'une ligne visible dépasse 32px').toBeLessThanOrEqual(32);
      }

      // La densité ne se paie pas avec la cible tactile.
      expect(liste.cible, 'le bouton du fichier est sous le plancher tactile').toBeGreaterThanOrEqual(44);

      // 14px contre 11px avant : la pastille doit être « comme à gauche ».
      expect(liste.policePastille, 'pastille de statut introuvable').not.toBeNull();
      expect(liste.policePastille).toBe(liste.policeCode);

      /*
       * ------------------------------------------------------------------
       * 3. Zone de saisie — la taille des messages de l'agent.
       * ----------------------------------------------------------------
       */
      const composeur = await page.evaluate(() => {
        const police = (el: Element | null) => (el ? getComputedStyle(el).fontSize : null);

        const message =
          document.querySelector('.bolt-assistant-message p') ?? document.querySelector('.bolt-assistant-message');

        const libelle = [
          ...document.querySelectorAll('.bolt-project-agent-composer .bolt-chatbox-toolbar-primary span'),
        ].find((el) => el.childElementCount === 0 && el.textContent?.trim());

        const champ = document.querySelector<HTMLTextAreaElement>('.bolt-project-chatbox textarea');

        return {
          message: police(message),
          libelle: police(libelle ?? null),
          champ: police(champ),
          invite: champ ? getComputedStyle(champ, '::placeholder').fontSize : null,
        };
      });

      expect(composeur.message, 'message de l’agent introuvable').not.toBeNull();
      expect(composeur.libelle, 'libellé du composeur introuvable').not.toBeNull();

      // 17px contre 14px avant.
      expect(composeur.libelle).toBe(composeur.message);

      /*
       * Le champ garde 16px : en dessous, Safari iOS zoome la page à la prise de
       * focus. Seule son invite descend à la taille des messages.
       */
      expect(parseFloat(composeur.champ ?? '0')).toBeGreaterThanOrEqual(16);

      if (test.info().project.name !== 'webkit-iphone') {
        // `getComputedStyle(el, '::placeholder')` n'est fiable que sur Chromium.
        expect(composeur.invite).toBe(composeur.message);
      }

      /*
       * ------------------------------------------------------------------
       * 2. Pastille « descendre » — juste au-dessus de la zone de saisie.
       * ----------------------------------------------------------------
       */
      const remonterLeFil = () =>
        page.evaluate(() => {
          const panneau = document.querySelector('[data-testid="ide-agent-panel"]');

          const zone = [...(panneau ? panneau.querySelectorAll('*') : [])].find(
            (element) =>
              element.scrollHeight > element.clientHeight + 20 &&
              ['auto', 'scroll'].includes(getComputedStyle(element).overflowY),
          );

          if (!zone) {
            return false;
          }

          const avant = zone.scrollTop;
          zone.scrollTop = 0;
          zone.dispatchEvent(new Event('scroll', { bubbles: true }));

          return avant > 0 && zone.scrollTop === 0;
        });

      const pastille = page.locator('.bolt-agent-scroll-to-bottom');

      /*
       * Remonter PUIS attendre la pastille, et recommencer si le fil s'est
       * recalé en bas entre-temps (un contenu qui finit de se poser le fait).
       * Témoin positif à chaque tour : sans défilement réel, « pas de
       * pastille » ne prouverait rien.
       */
      await expect(async () => {
        expect(await remonterLeFil(), 'le fil n’a pas défilé : la mesure ne prouve rien').toBe(true);
        await page.waitForTimeout(600);
        await expect(pastille).toHaveCount(1, { timeout: 3_000 });
      }).toPass({ timeout: 30_000, intervals: [1_000] });

      const ecart = await pastille.evaluate((element) => {
        const composer = document.querySelector('.bolt-project-agent-composer');

        if (!composer) {
          return null;
        }

        return composer.getBoundingClientRect().top - element.getBoundingClientRect().bottom;
      });

      // 63px mesurés avant : la pastille flottait au milieu du fil.
      expect(ecart, 'composeur introuvable').not.toBeNull();
      expect(ecart!, 'la pastille recouvre la zone de saisie').toBeGreaterThanOrEqual(0);
      expect(ecart!, 'la pastille n’est pas juste au-dessus de la zone de saisie').toBeLessThanOrEqual(24);
    });
  }
});
