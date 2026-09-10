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
/**
 * Remonte le fil, et DIT CE QUI S'EST PASSÉ.
 *
 * ⚠️ CETTE SONDE RENDAIT UN BOOLÉEN, et ce booléen confondait TROIS causes très
 * différentes. Mesuré le 2026-09-10, premier passage du canari WebKit iPhone :
 * elle rend `false` 3 fois sur 3 à 768 (donc pas une course — règle 17), et le
 * journal ne dit pas laquelle des trois. On ne peut RIEN conclure d'un échec
 * qui ne se distingue pas d'un autre :
 *
 *   - `zoneIntrouvable` — aucun élément défilant sous le panneau. Sur iOS, le
 *     défilement est souvent porté par le DOCUMENT plutôt que par un conteneur
 *     interne : ce serait un écart de moteur, pas un défaut de fil.
 *   - `dejaEnHaut` — le fil n'était PAS en bas au départ, donc il n'y avait
 *     rien à remonter. Ce serait le plus intéressant des trois : « le fil ne se
 *     met pas au dernier message au chargement » est un défaut produit visible.
 *   - `defilementRefuse` — la position a été posée et n'a pas tenu.
 *
 * La sonde rend donc un DIAGNOSTIC. L'assertion reste identique — on n'affaiblit
 * rien —, mais son message nomme désormais le cas, et le prochain run tranchera
 * au lieu de répéter « la mesure ne prouve rien ».
 */
type ResultatRemontee =
  | { ok: true }
  | { ok: false; cause: 'zoneIntrouvable' | 'dejaEnHaut' | 'defilementRefuse'; detail: string };

async function remonterLeFil(page: Page): Promise<ResultatRemontee> {
  return page.evaluate((): ResultatRemontee => {
    const panneau = document.querySelector('[data-testid="ide-agent-panel"]');
    const candidats = [...(panneau ? panneau.querySelectorAll('*') : [])];

    const zone = candidats.find(
      (element) =>
        element.scrollHeight > element.clientHeight + 20 &&
        ['auto', 'scroll'].includes(getComputedStyle(element).overflowY),
    );

    if (!zone) {
      /*
       * On rend de quoi trancher SANS relancer : combien d'éléments ont été
       * examinés, et si le DOCUMENT lui-même défile — l'hypothèse iOS.
       */
      const documentDefile = document.scrollingElement
        ? document.scrollingElement.scrollHeight > document.scrollingElement.clientHeight + 20
        : false;

      return {
        ok: false,
        cause: 'zoneIntrouvable',
        detail: `panneau=${Boolean(panneau)} candidats=${candidats.length} documentDefile=${documentDefile}`,
      };
    }

    const avant = zone.scrollTop;

    if (avant <= 0) {
      return {
        ok: false,
        cause: 'dejaEnHaut',
        detail: `scrollTop=${avant} scrollHeight=${zone.scrollHeight} clientHeight=${zone.clientHeight}`,
      };
    }

    zone.scrollTop = 0;
    zone.dispatchEvent(new Event('scroll', { bubbles: true }));

    if (zone.scrollTop !== 0) {
      return { ok: false, cause: 'defilementRefuse', detail: `avant=${avant} apres=${zone.scrollTop}` };
    }

    return { ok: true };
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
    /*
     * MESURÉ LE 10/09, canari WebKit iPhone du run E2E de #527 :
     * « "beforeAll" hook timeout of 30000ms exceeded » — le fil de test n'a
     * jamais été semé, et le test a été compté `flaky` alors qu'AUCUNE
     * assertion produit n'avait été tentée.
     *
     * Le délai de hook par défaut de `playwright.config.ts` vaut 30 s ; les
     * tests, eux, s'accordent 180 s. Le montage — inscription, projet,
     * conversation, transcription — n'a donc jamais eu le budget de ce qu'il
     * doit faire, et `test.setTimeout` posé DANS un test ne l'atteint pas.
     * Le budget porte sur la précondition, pas sur les assertions.
     */
    test.setTimeout(180_000);

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
      const remontee = await remonterLeFil(page);
      expect(
        remontee.ok,
        remontee.ok ? '' : `le fil n’a pas défilé (${remontee.cause}) : la mesure ne prouve rien — ${remontee.detail}`,
      ).toBe(true);
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
