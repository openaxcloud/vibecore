import { expect, test, type APIRequestContext } from '@playwright/test';

/**
 * CONV-001 — « chaque ouverture du panneau Agent crée une conversation VIDE ».
 *
 * CE FICHIER ÉPINGLE UNE RÉFUTATION, et il faut le dire dans ce sens : le
 * symptôme a été mesuré, il était réel là où il a été mesuré, et il ne l'est
 * plus sur le code d'aujourd'hui.
 *
 * L'HISTOIRE MESURÉE, dans l'ordre :
 *   - 2026-09-05, environnement d'audit (SHA `fce8639ab3`), projet neuf, UN
 *     seul message envoyé : `GET …/ai/conversations?limit=20` rendait TROIS
 *     conversations, dont une à zéro message créée par le seul chargement de
 *     page.
 *   - Contre-mesure en base de PRODUCTION : 3 conversations vides sur 224
 *     (1,3 %), une par projet sur trois projets DISTINCTS. Aucune accumulation
 *     par ouverture — la forme du défaut d'audit n'existait pas là.
 *   - Lecture du chemin réel (règle 1) : `ensureProjectAiConversation` n'a que
 *     DEUX appelants. `syncProjectAiTranscript`, qui sort avant lui sur un fil
 *     vide (`nextMessages.length === 0`, puis `transcript.length === 0`), et
 *     « Nouvelle discussion », qui ouvre délibérément une conversation neuve —
 *     c'est le correctif BUG-HISTORY-CLEAR-001, et il explique exactement une
 *     conversation vide par projet.
 *
 * Ce que ce test tient : ouvrir le panneau ne crée RIEN. C'est l'invariant qu'un
 * appel « de confort » posé dans un effet de montage casserait — sans rougir
 * ailleurs, puisque plus rien ne le mesure une fois l'audit refermé (règle 15).
 *
 * Il mesure par l'API, sur un projet neuf, le chemin que l'utilisateur emprunte
 * — pas la source. Une garde de source dirait « il n'y a pas d'appel dans un
 * effet » ; celle-ci dit « rien n'a été créé », ce qui reste vrai quelle que
 * soit la forme que prendrait la régression.
 */

const appBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';
const apiBaseUrl = process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';

async function createProjectSession(request: APIRequestContext) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  let lastBody = '';

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const registration = await request.post(`${apiBaseUrl}/auth/register`, {
      data: {
        email: `agent-conv-${suffix}-${attempt}@local.test`,
        password: 'Password123!',
        name: 'Agent conversation sans création',
        organizationName: `Agent conversation ${suffix}-${attempt}`,
      },
    });

    lastBody = await registration.text();

    if (registration.ok()) {
      const auth = JSON.parse(lastBody) as { token: string; organization: { id: string } };

      const project = await request.post(`${apiBaseUrl}/orgs/${auth.organization.id}/projects`, {
        headers: { authorization: `Bearer ${auth.token}` },
        data: { name: 'Agent conversation sans création' },
      });

      expect(project.ok(), await project.text()).toBeTruthy();

      return { token: auth.token, projectId: (await project.json()).project.id as string };
    }

    // `/auth/register` est limité par IP ; on patiente plutôt que de rougir la suite.
    if (registration.status() === 429 && attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, 11_000));
      continue;
    }

    break;
  }

  throw new Error(`Impossible de préparer une session de test : ${lastBody}`);
}

test('CONV-001 — ouvrir le panneau Agent ne crée aucune conversation', async ({ page, request }) => {
  /*
   * `/auth/register` est limité à ~10 par minute et par IP : la préparation du
   * fixture peut attendre plusieurs paliers de repli avant d'obtenir une
   * session. Le délai par défaut de 30 s ne le couvre pas.
   */
  test.setTimeout(120_000);

  const { token, projectId } = await createProjectSession(request);
  const headers = { authorization: `Bearer ${token}` };

  async function conversations(): Promise<string[]> {
    const reponse = await request.get(`${apiBaseUrl}/projects/${projectId}/ai/conversations?limit=50`, { headers });
    expect(reponse.ok(), await reponse.text()).toBeTruthy();

    const charge = (await reponse.json()) as { conversations?: Array<{ id?: string }> };

    return (charge.conversations ?? []).map((conversation) => conversation.id ?? '');
  }

  expect(await conversations(), 'un projet neuf porte déjà des conversations').toEqual([]);

  await page
    .context()
    .addCookies([{ name: 'vc_session', value: token, url: appBaseUrl, httpOnly: true, sameSite: 'Lax' }]);
  await page.goto(`/projects/${projectId}/ide`, { waitUntil: 'domcontentloaded' });

  /*
   * Deux signaux, et il en faut DEUX. Le champ apparaît avant l'hydratation :
   * s'arrêter là mesurerait une page que React n'a pas encore animée, donc un
   * « rien créé » qui ne dit rien (règle 4). L'étiquette de puissance ne sort
   * que du rendu client — c'est le signal d'hydratation qu'utilisent déjà les
   * autres specs du panneau.
   */
  await expect(page.locator('.bolt-project-chatbox textarea')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('agent-mode-advanced')).toBeVisible({ timeout: 60_000 });

  /*
   * L'effet qui charge les conversations dépend de l'identifiant d'espace de
   * travail, qui arrive APRÈS l'hydratation : on laisse le réseau se taire
   * avant de conclure, sinon on mesurerait avant le moment où le défaut
   * d'origine se produisait.
   */
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(3_000);

  expect(
    await conversations(),
    'le seul chargement du panneau Agent a créé une conversation — c’est CONV-001 qui revient',
  ).toEqual([]);

  /*
   * TÉMOIN POSITIF (règle 14) : « zéro » n'informe que si le compteur sait
   * compter. On en crée une par l'API et on vérifie qu'elle apparaît — sans
   * cela, une requête cassée rendrait « zéro » et le test serait vert à jamais.
   */
  const creation = await request.post(`${apiBaseUrl}/projects/${projectId}/ai/conversations`, {
    headers,
    data: { title: 'Témoin' },
  });
  expect(creation.ok(), await creation.text()).toBeTruthy();

  const apresCreation = await conversations();
  expect(apresCreation.length, 'le compteur ne voit pas une conversation créée : sa mesure ne vaut rien').toBe(1);
});
