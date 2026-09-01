import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

/**
 * Pilule « descendre au dernier message » du panneau Agent.
 *
 * Trois promesses, et une seule d'entre elles était protégée : un garde-fou
 * lisait la feuille de style (`app/styles/agent-scroll-to-latest.spec.ts`), donc
 * il vérifiait que la RÈGLE existe — pas que la pilule apparaisse, ni qu'elle
 * ramène en bas, ni qu'elle disparaisse ensuite.
 *
 * Ce test mesure le comportement, aux quatre formats, et il tourne aussi sous le
 * projet `webkit-iphone` : c'est une interaction TACTILE, et un vert Chromium ne
 * prouve rien pour Safari iOS (cf. la règle de méthode dans CLAUDE.md).
 */

const appBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';
const apiBaseUrl = process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';

const TOURS = 14;

async function seedLongueConversation(request: APIRequestContext) {
  const suffixe = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  let corps = '';

  for (let essai = 0; essai < 4; essai += 1) {
    const inscription = await request.post(`${apiBaseUrl}/auth/register`, {
      data: {
        email: `scroll-pill-${suffixe}-${essai}@local.test`,
        password: 'Password123!',
        name: 'Scroll pill',
        organizationName: `Scroll pill ${suffixe}-${essai}`,
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
      data: { name: 'Pilule de descente' },
    });
    expect(projet.ok(), await projet.text()).toBeTruthy();

    const projectId = (await projet.json()).project.id as string;

    const conversation = await request.post(`${apiBaseUrl}/projects/${projectId}/ai/conversations`, {
      headers,
      data: { title: 'Long' },
    });
    expect(conversation.ok(), await conversation.text()).toBeTruthy();

    const conversationId = (await conversation.json()).conversation.id as string;

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

/**
 * Remonte le fil en pilotant le VRAI conteneur défilant du panneau.
 *
 * Ma première sonde visait `.bolt-project-agent-scroll`, qui ne défile rien :
 * elle concluait « pas de pilule » sur un panneau jamais remonté. On cherche
 * donc le descendant dont le contenu dépasse, et on RETOURNE s'il a bougé —
 * un défilement qui n'a pas eu lieu doit faire échouer le test, pas le rendre
 * vert.
 */
async function remonterLeFil(page: Page): Promise<boolean> {
  return page.evaluate(() => {
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
}

/*
 * Un SEUL projet pour les quatre formats.
 *
 * Une première version en semait un par test : huit inscriptions, et
 * `/auth/register` étant limité par IP, la suite mettait 21 minutes avec ses
 * paliers de repli. Le fil est en lecture seule ici — rien ne justifie de le
 * recréer à chaque format.
 */
test.describe.configure({ mode: 'serial' });

test.describe('pilule « descendre au dernier message »', () => {
  let session: { token: string; projectId: string };

  test.beforeAll(async ({ request }) => {
    session = await seedLongueConversation(request);
  });

  for (const vue of [
    { label: 'mobile 390', width: 390, height: 844 },
    { label: 'tablette 768', width: 768, height: 1024 },
    { label: 'bascule 1024', width: 1024, height: 900 },
    { label: 'bureau 1440', width: 1440, height: 900 },
  ]) {
    test(`elle ramène au dernier message — ${vue.label}`, async ({ page }) => {
      test.setTimeout(180_000);

      /*
       * Le projet `webkit-iphone` sert à vérifier le TACTILE sur le moteur
       * d'Avi ; l'y faire tourner en 1024 ou 1440 px, c'est un contexte
       * d'iPhone étiré à la largeur d'un écran de bureau — une fiction.
       *
       * Mesuré : dans cette seule combinaison, le fil se recale tout seul en bas
       * après la remontée, la pastille disparaît et le test bascule au hasard
       * (vert, rouge, vert sur trois passages). Les mêmes largeurs passent de
       * façon stable sur les projets Chromium, qui les couvrent déjà.
       */
      test.skip(
        test.info().project.name === 'webkit-iphone' && vue.width >= 1024,
        'largeur de bureau dans un contexte d’iPhone : couvert par les projets Chromium',
      );

      await page
        .context()
        .addCookies([{ name: 'vc_session', value: session.token, url: appBaseUrl, httpOnly: true, sameSite: 'Lax' }]);
      await page.setViewportSize({ width: vue.width, height: vue.height });
      await page.goto(`/projects/${session.projectId}/ide`, { waitUntil: 'domcontentloaded' });

      const lignes = page.locator('.bolt-chat-message-row');
      await expect(lignes.first()).toBeVisible({ timeout: 120_000 });
      await expect(lignes).toHaveCount(TOURS * 2, { timeout: 120_000 });

      const pilule = page.locator('.bolt-agent-scroll-to-bottom');

      // En bas du fil, elle n'a rien à dire.
      await expect(pilule, 'la pilule s’affiche alors qu’on est déjà en bas').toHaveCount(0);

      /*
       * Témoin positif : si le fil n'a pas réellement défilé, « pas de pilule »
       * ne prouve rien — c'est exactement l'erreur que ma première sonde faisait.
       */
      expect(await remonterLeFil(page), 'le fil n’a pas défilé : la mesure ne prouve rien').toBe(true);
      await page.waitForTimeout(1200);

      await expect(pilule, 'la pilule n’apparaît pas après avoir remonté le fil').toHaveCount(1);

      const boite = await pilule.boundingBox();
      expect(boite!.height, 'la pilule est sous le plancher tactile').toBeGreaterThanOrEqual(44);

      /*
       * Elle doit être DANS la fenêtre et réellement touchable.
       *
       * « Présente dans le DOM » ne suffit pas : mesuré sur WebKit, la pastille
       * existait, faisait bien 176×44, et était rendue à y=795 dans une fenêtre
       * de 659 px — hors écran, 0 point sur 430 de sa surface atteignable par un
       * appui. Elle avait perdu son `position: sticky`, écrasé par la règle
       * d'ancrage des infobulles, plus spécifique.
       */
      const atteignable = await pilule.evaluate((element) => {
        const b = element.getBoundingClientRect();
        const cx = Math.round(b.left + b.width / 2);
        const cy = Math.round(b.top + b.height / 2);
        const dessus = document.elementFromPoint(cx, cy);

        return {
          position: getComputedStyle(element).position,
          dansLaFenetre: b.top >= 0 && b.bottom <= window.innerHeight,
          auCentre: dessus === element || element.contains(dessus),
        };
      });

      expect(atteignable.position, 'la pastille a perdu son ancrage collant').toBe('sticky');
      expect(atteignable.dansLaFenetre, 'la pastille est rendue hors de la fenêtre').toBe(true);
      expect(atteignable.auCentre, 'un appui au centre de la pastille tombe sur autre chose').toBe(true);

      /*
       * `click()` et non `tap()` : `tap()` exige que le CONTEXTE ait le tactile
       * activé, ce que `setViewportSize` ne change pas — la première version
       * expirait sur les formats redimensionnés. La pilule est un vrai
       * `<button>` : elle s'active de la même façon sur les deux moteurs, et
       * c'est justement ce que le projet `webkit-iphone` vérifie.
       */
      await pilule.click();

      await expect(pilule, 'la pilule reste affichée après être revenu en bas').toHaveCount(0, { timeout: 15_000 });
    });
  }
});
