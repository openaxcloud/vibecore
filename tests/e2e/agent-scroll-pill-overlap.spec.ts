import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

/**
 * La pastille de descente ne doit jamais être posée sur du texte.
 *
 * BUG-UX-021. Mesuré en production, fil réel, iPhone 13 : **100 % de sa surface
 * sur des nœuds texte** — le disque mangeait « comme le nom du projet » en plein
 * mot. Rétrécir ne réglait rien : `position: sticky` + `margin-inline: auto` la
 * posaient au MILIEU de la colonne de lecture. C'est sa position qui était
 * fautive, pas sa taille.
 *
 * ⚠️ LA MÉTHODE COMPTE, et une version naïve ment deux fois :
 *
 * - Filtrer sur `children.length === 0` rate le texte d'un `<p>` qui contient
 *   des `<code>` : la garde dit « aucun texte masqué » et elle est creuse.
 * - `caretPositionFromPoint` renvoie la position la PLUS PROCHE, pas celle sous
 *   le point. Mesuré : il rapportait 6 points sur du texte alors que la bulle
 *   s'arrêtait 4px avant la pastille.
 *
 * On demande donc le caret, puis on vérifie que le rectangle du CARACTÈRE
 * désigné contient réellement le point.
 */

const appBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';
const apiBaseUrl = process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';

const TOURS = 8;

async function ouvrirUnFil(request: APIRequestContext) {
  const suffixe = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  let dernier = '';

  for (let essai = 0; essai < 4; essai += 1) {
    const inscription = await request.post(`${apiBaseUrl}/auth/register`, {
      data: {
        email: `pastille-${suffixe}-${essai}@local.test`,
        password: 'Password123!',
        name: 'Pastille',
        organizationName: `Pastille ${suffixe}-${essai}`,
      },
    });

    dernier = await inscription.text();

    if (inscription.ok()) {
      const auth = JSON.parse(dernier) as { token: string; organization: { id: string } };
      const entetes = { authorization: `Bearer ${auth.token}` };

      const projet = await request.post(`${apiBaseUrl}/orgs/${auth.organization.id}/projects`, {
        headers: entetes,
        data: { name: 'Pastille' },
      });

      const projectId = (await projet.json()).project.id as string;

      const conversation = await request.post(`${apiBaseUrl}/projects/${projectId}/ai/conversations`, {
        headers: entetes,
        data: { title: 'Recouvrement' },
      });

      const conversationId = (await conversation.json()).conversation.id as string;

      await request.put(`${apiBaseUrl}/projects/${projectId}/ai/conversations/${conversationId}/transcript`, {
        headers: entetes,
        data: {
          messages: Array.from({ length: TOURS }).flatMap((_, index) => [
            {
              clientId: `u${index}`,
              role: 'user',
              content:
                `Question ${index + 1} : peux-tu renommer le service de déploiement pour qu'il porte ` +
                `exactement le même identifiant que le nom du projet, puis relancer la synchronisation ` +
                `de l'environnement afin que les variables reprennent la valeur attendue ?`,
            },
            {
              clientId: `a${index}`,
              role: 'assistant',
              content:
                `Réponse ${index + 1} : c'est fait. J'ai renommé le service, propagé l'identifiant dans ` +
                `la configuration, relancé la synchronisation de l'environnement, et vérifié que les ` +
                `variables reprennent bien la valeur attendue après le redémarrage complet du runtime.`,
            },
          ]),
        },
      });

      /* Sans ce lien, l'IDE ouvre une AUTRE conversation et le fil reste vide. */
      await request.put(`${apiBaseUrl}/projects/${projectId}/ide-state`, {
        headers: entetes,
        data: { state: { chat: { metadata: { aiConversationId: conversationId } } } },
      });

      return { token: auth.token, projectId };
    }

    if (inscription.status() === 429 && essai < 3) {
      await new Promise((resoudre) => setTimeout(resoudre, 11_000));
      continue;
    }

    break;
  }

  throw new Error(`Impossible d'ouvrir un fil de test : ${dernier}`);
}

async function mesurerLeRecouvrement(page: Page) {
  return page.evaluate(() => {
    const pastille = document.querySelector('.bolt-agent-scroll-to-bottom');

    if (!pastille) {
      return null;
    }

    const surTexte = (x: number, y: number) => {
      const doc = document as Document & {
        caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
      };

      const position = doc.caretPositionFromPoint?.(x, y);
      const noeud = position?.offsetNode;

      if (!noeud || noeud.nodeType !== Node.TEXT_NODE || !(noeud.textContent ?? '').trim()) {
        return null;
      }

      const texte = noeud.textContent ?? '';
      const decalage = Math.min(position.offset, Math.max(0, texte.length - 1));
      const plage = document.createRange();
      plage.setStart(noeud, decalage);
      plage.setEnd(noeud, Math.min(decalage + 1, texte.length));

      const r = plage.getBoundingClientRect();
      const dedans = x >= r.left - 0.5 && x <= r.right + 0.5 && y >= r.top - 0.5 && y <= r.bottom + 0.5;

      /* Le libellé masqué de la pastille est sous elle par construction. */
      return dedans && !pastille.contains(noeud) ? (noeud.textContent ?? '').trim().slice(0, 40) : null;
    };

    const boite = pastille.getBoundingClientRect();
    const touches: string[] = [];

    let total = 0;

    for (let x = boite.left + 2; x < boite.right - 2; x += 4) {
      for (let y = boite.top + 2; y < boite.bottom - 2; y += 4) {
        total += 1;

        const trouve = surTexte(x, y);

        if (trouve) {
          touches.push(trouve);
        }
      }
    }

    return { total, touches: [...new Set(touches)], nombre: touches.length };
  });
}

test('la pastille de descente n’est jamais posée sur du texte', async ({ page, request }) => {
  test.setTimeout(180_000);

  const session = await ouvrirUnFil(request);

  await page.setViewportSize({ width: 390, height: 664 });
  await page.context().addCookies([
    { name: 'vc_session', value: session.token, url: appBaseUrl, httpOnly: true, sameSite: 'Lax' },
    { name: 'vibecore-auto-lang', value: 'fr', url: appBaseUrl, sameSite: 'Lax' },
  ]);
  await page.goto(`${appBaseUrl}/projects/${session.projectId}/ide`, { waitUntil: 'domcontentloaded' });

  await expect(page.locator('.bolt-chat-message-row').first()).toBeVisible({ timeout: 120_000 });

  /* Remonter le fil : la pastille n'existe que si l'on n'est plus en bas. */
  await expect
    .poll(
      async () => {
        await page.evaluate(() => {
          for (const element of document.querySelectorAll('*')) {
            if (element.scrollHeight > element.clientHeight + 50) {
              element.scrollTop = 0;
              element.dispatchEvent(new Event('scroll', { bubbles: true }));
            }
          }
        });

        return page.locator('.bolt-agent-scroll-to-bottom').count();
      },
      { timeout: 30_000 },
    )
    .toBeGreaterThan(0);

  const mesure = await mesurerLeRecouvrement(page);

  expect(mesure, 'la pastille n’est pas montée').not.toBeNull();
  expect(mesure!.total, 'grille vide : la mesure ne prouverait rien').toBeGreaterThanOrEqual(80);
  expect(mesure!.nombre, `texte sous la pastille : ${mesure!.touches.join(' | ')}`).toBe(0);
});
