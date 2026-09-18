import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

/**
 * États du panneau Agent : chargement échoué, et planchers tactiles réels.
 *
 * Deux défauts mesurés sur le panneau :
 *
 * 1. Quand le fil ne se charge pas, le panneau retombait sur son écran de
 *    DÉPART — « Agent prêt », suggestions de démarrage, « 1 message » pour zéro
 *    — c'est-à-dire qu'il présentait une conversation existante comme neuve. Le
 *    seul signal était un toast, déjà disparu quand l'utilisateur regarde.
 *
 * 2. Les cibles tactiles étaient exprimées avec `min-h-11` / `min-w-11`. En
 *    Tailwind c'est 2,75rem — 44 px avec une base de 16, mais la base rem est
 *    posée sur `html` et vaut 14 px sous 1024 px : la classe rendait 38,5 px.
 *    Mesuré à 390 : « Copier le code » 39×39, « Ouvrir <chemin> » 244×39,
 *    « Afficher la commande » 88×39, le repli des actions 42 de large. Une
 *    cinquantaine de fichiers de test vérifiaient la PRÉSENCE de la classe : ils
 *    étaient verts sur des cibles trop petites.
 */

const appBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';
const apiBaseUrl = process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';

const CODE_FENCE = [
  '```ts',
  "export const schema = z.object({ email: z.string().email('adresse invalide') });",
  '```',
].join('\n');

/**
 * Chaque scénario part d'un projet NEUF.
 *
 * Le fil est aussi mis en cache dans l'état IDE du projet dès la première
 * ouverture réussie : un projet déjà visité n'a plus besoin de `/messages`, et
 * l'état d'erreur y devient inatteignable. Réutiliser un projet ferait donc
 * passer le test sans jamais exercer le chemin visé.
 */
async function seedProject(request: APIRequestContext, tag: string) {
  const suffix = `${Date.now()}-${tag}-${Math.random().toString(36).slice(2)}`;

  let lastBody = '';

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const registration = await request.post(`${apiBaseUrl}/auth/register`, {
      data: {
        email: `panel-states-${suffix}-${attempt}@local.test`,
        password: 'Password123!',
        name: 'Panel states',
        organizationName: `Panel states ${suffix}-${attempt}`,
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
      data: { name: 'Panel states' },
    });
    expect(project.ok(), await project.text()).toBeTruthy();

    const projectId = (await project.json()).project.id as string;

    const conversation = await request.post(`${apiBaseUrl}/projects/${projectId}/ai/conversations`, {
      headers,
      data: { title: 'États' },
    });
    expect(conversation.ok(), await conversation.text()).toBeTruthy();

    const conversationId = (await conversation.json()).conversation.id as string;

    const transcript = await request.put(
      `${apiBaseUrl}/projects/${projectId}/ai/conversations/${conversationId}/transcript`,
      {
        headers,
        data: {
          messages: [
            { clientId: 'u1', role: 'user', content: 'Ajoute la validation du formulaire de contact.' },
            {
              clientId: 'a1',
              role: 'assistant',
              content: `Je pose un schéma déclaratif plutôt qu'une cascade de \`if\`.\n\n${CODE_FENCE}\n\nVérifié avec \`npm run test -- contact\`.`,
            },
          ],
        },
      },
    );
    expect(transcript.ok(), await transcript.text()).toBeTruthy();

    const ideState = await request.put(`${apiBaseUrl}/projects/${projectId}/ide-state`, {
      headers,
      data: { state: { chat: { metadata: { aiConversationId: conversationId } } } },
    });
    expect(ideState.ok(), await ideState.text()).toBeTruthy();

    return { token: auth.token, projectId };
  }

  throw new Error(`Impossible de préparer un projet de test : ${lastBody}`);
}

async function useSession(page: Page, token: string) {
  await page
    .context()
    .addCookies([{ name: 'vc_session', value: token, url: appBaseUrl, httpOnly: true, sameSite: 'Lax' }]);
}

test.describe('panneau Agent — chargement du fil en échec', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('affiche un état d’erreur persistant, pas une conversation neuve', async ({ page, request }) => {
    /*
     * `/auth/register` est limité à ~10 par minute et par IP : la préparation du
     * fixture peut attendre plusieurs paliers de repli.
     */
    test.setTimeout(180_000);

    const { token, projectId } = await seedProject(request, 'erreur');
    await useSession(page, token);

    let enPanne = true;
    let tentatives = 0;
    await page.route('**/ai/conversations/**/messages', async (route) => {
      if (!enPanne) {
        await route.continue();
        return;
      }

      tentatives += 1;
      await route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"boom"}' });
    });

    await page.goto(`/projects/${projectId}/ide`, { waitUntil: 'domcontentloaded' });

    const bloc = page.getByTestId('agent-transcript-error');
    await expect(bloc).toBeVisible({ timeout: 90_000 });

    /*
     * Témoin positif : sans lui, un fil servi depuis un autre cache ferait passer
     * ce test sans que le chemin d'erreur ait jamais été emprunté.
     */
    expect(tentatives, 'aucune tentative de chargement interceptée').toBeGreaterThan(0);

    // L'écran de démarrage ne doit PAS présenter la conversation comme neuve.
    await expect(page.locator('[class*="mobile-agent-start"]')).toHaveCount(0);
    await expect(page.locator('.bolt-chat-message-row')).toHaveCount(0);

    const reprise = bloc.getByRole('button');
    const boite = await reprise.boundingBox();
    expect(boite!.height, 'le bouton de reprise est sous le plancher tactile').toBeGreaterThanOrEqual(44);

    // La reprise recharge réellement le fil.
    enPanne = false;
    await reprise.click();

    await expect(page.locator('.bolt-chat-message-row')).toHaveCount(2, { timeout: 30_000 });
    await expect(bloc).toHaveCount(0);
  });
});

for (const viewport of [
  { label: 'mobile 390', width: 390, height: 844 },
  { label: 'tablette 768', width: 768, height: 1024 },
]) {
  test(`toutes les cibles du panneau tiennent 44px — ${viewport.label}`, async ({ page, request }) => {
    test.setTimeout(180_000);

    const { token, projectId } = await seedProject(request, `cibles-${viewport.width}`);
    await useSession(page, token);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(`/projects/${projectId}/ide`, { waitUntil: 'domcontentloaded' });

    // Le fil doit être là : les cibles à mesurer vivent dans les messages.
    await expect(page.locator('.bolt-chat-message-row')).toHaveCount(2, { timeout: 90_000 });

    // Déplier les actions de l'artefact et le bloc de code met leurs cibles à l'écran.
    await page.locator('.bolt-project-agent-panel pre, .bolt-project-agent-panel .shiki').first().hover();
    await page.waitForTimeout(400);

    const mesures = await page.evaluate(() => {
      const panel = document.querySelector('[data-testid="ide-agent-panel"]');

      if (!panel) {
        return null;
      }

      return [...panel.querySelectorAll('button, a[href], summary, [role="button"], input, textarea')]
        .map((el) => ({ el, b: el.getBoundingClientRect() }))
        .filter(({ el, b }) => {
          const s = getComputedStyle(el);
          return b.width > 0 && b.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0';
        })
        .map(({ el, b }) => ({
          w: Math.round(b.width),
          h: Math.round(b.height),
          nom: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30),
        }));
    });

    /*
     * Témoin positif : sans lui, un sélecteur périmé donnerait « aucune cible
     * trop petite » sur un panneau où rien n'a été mesuré.
     */
    expect(mesures, 'panneau introuvable').not.toBeNull();
    expect(mesures!.length, 'aucune cible mesurée dans le panneau').toBeGreaterThanOrEqual(6);

    const tropPetites = mesures!.filter((c) => c.w < 44 || c.h < 44);

    expect(
      tropPetites,
      `cibles sous 44px en ${viewport.label} :\n${tropPetites.map((c) => `  ${c.w}x${c.h} ${c.nom}`).join('\n')}`,
    ).toEqual([]);
  });
}
