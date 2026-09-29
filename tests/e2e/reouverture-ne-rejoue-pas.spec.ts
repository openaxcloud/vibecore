import { expect, test, type APIRequestContext } from '@playwright/test';
import JSZip from 'jszip';

/*
 * BUG-QA0929-REOUVERTURE-REJOUE — la PREMIÈRE ouverture d'un projet sur un
 * appareil rejouait les écritures historiques de l'agent.
 *
 * Mesuré en local le 2026-09-29 : le stockage du projet contient la version que
 * l'utilisateur a écrite APRÈS l'agent ; on ouvre l'IDE dans un navigateur neuf ;
 * le stockage contient ensuite l'ANCIENNE version de l'agent, et un toast annonce
 * « 1 file applied — The agent patches were applied successfully ». La seconde
 * ouverture ne rejouait rien : le fil était alors dans le cache local.
 *
 * C'est aussi ce toast, posé sur le haut du fil à 390 px, qui rendait instable
 * `ide-mobile-chrome.spec.ts` « menu contextuel sur le dernier message » : sur un
 * runner lent, le second appui long tombait sur le toast (3 réussites sur 14
 * tentatives en CI le 2026-09-29).
 */

const appBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';
const apiBaseUrl = process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';

const CHEMIN = 'src/Contact.tsx';
const VERSION_AGENT = '// VERSION-AGENT-ANCIENNE';
const VERSION_UTILISATEUR = '// VERSION-UTILISATEUR-RECENTE';

/*
 * À 390 px, le rejeu se produisait à CHAQUE première ouverture (3 sur 3 dans la
 * sonde du 2026-09-29) ; en desktop, seulement à la première hydratation réussie
 * du fil, dont le moment dépend de la vitesse de la machine.
 */
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

async function lireLeStockage(request: APIRequestContext, projectId: string, token: string) {
  const reponse = await request.get(`${apiBaseUrl}/projects/${projectId}/export/zip`, {
    headers: { authorization: `Bearer ${token}` },
  });

  expect(reponse.ok(), `export du projet : ${reponse.status()}`).toBe(true);

  const { archive } = (await reponse.json()) as { archive: { base64: string } };
  const zip = await JSZip.loadAsync(Buffer.from(archive.base64, 'base64'));
  const nom = Object.keys(zip.files).find((fichier) => fichier.endsWith(CHEMIN));

  return nom ? (await zip.files[nom].async('string')).trim() : null;
}

test('première ouverture d’un projet : l’historique de l’agent n’écrase pas le travail de l’utilisateur', async ({
  page,
  request,
}) => {
  test.setTimeout(150_000);

  const suffixe = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const inscription = await request.post(`${apiBaseUrl}/auth/register`, {
    data: {
      email: `reouverture-${suffixe}@local.test`,
      password: 'Password123!',
      name: 'Réouverture',
      organizationName: `Réouverture ${suffixe}`,
    },
  });

  expect(inscription.ok(), await inscription.text()).toBe(true);

  const auth = (await inscription.json()) as { token: string; organization: { id: string } };
  const entetes = { authorization: `Bearer ${auth.token}` };

  const projet = await request.post(`${apiBaseUrl}/orgs/${auth.organization.id}/projects`, {
    headers: entetes,
    data: { name: 'Réouverture', framework: 'react' },
  });

  const corpsProjet = (await projet.json()) as { id?: string; project?: { id: string } };
  const projectId = corpsProjet.project?.id ?? corpsProjet.id!;

  // L'agent a écrit le fichier… (dans un tour passé, conservé côté serveur)
  const conversation = await request.post(`${apiBaseUrl}/projects/${projectId}/ai/conversations`, {
    headers: entetes,
    data: { title: 'Réouverture' },
  });

  const conversationId = ((await conversation.json()) as { conversation: { id: string } }).conversation.id;

  await request.put(`${apiBaseUrl}/projects/${projectId}/ai/conversations/${conversationId}/transcript`, {
    headers: entetes,
    data: {
      messages: [
        { clientId: 'u1', role: 'user', content: 'Ajoute une page de contact.' },
        {
          clientId: 'a1',
          role: 'assistant',
          content:
            'La page de contact est créée.\n\n<boltArtifact id="contact" title="Page de contact">' +
            `<boltAction type="file" filePath="${CHEMIN}">${VERSION_AGENT}\n</boltAction>` +
            '</boltArtifact>',
        },
      ],
    },
  });
  await request.put(`${apiBaseUrl}/projects/${projectId}/ide-state`, {
    headers: entetes,
    data: { state: { chat: { metadata: { aiConversationId: conversationId } } } },
  });

  // … puis l'utilisateur l'a modifié : c'est cette version que porte le stockage.
  const zip = new JSZip();
  zip.file(CHEMIN, `${VERSION_UTILISATEUR}\n`);

  const importation = await request.post(`${apiBaseUrl}/projects/${projectId}/files/import/zip`, {
    headers: entetes,
    data: { zipBase64: await zip.generateAsync({ type: 'base64' }) },
  });

  expect(importation.ok(), await importation.text()).toBe(true);
  expect(await lireLeStockage(request, projectId, auth.token), 'témoin : la version utilisateur est posée').toBe(
    VERSION_UTILISATEUR,
  );

  // Première ouverture, navigateur neuf : aucun cache local du fil.
  await page
    .context()
    .addCookies([{ name: 'vc_session', value: auth.token, url: appBaseUrl, httpOnly: true, sameSite: 'Lax' }]);
  await page.goto(`/projects/${projectId}/ide`, { waitUntil: 'domcontentloaded' });

  // Le fil est bien affiché — sinon le test ne mesurerait pas l'hydratation.
  await expect(page.getByText('La page de contact est créée.').first()).toBeVisible({ timeout: 60_000 });
  await page.waitForLoadState('load');

  /*
   * On SURVEILLE pendant 30 s : un toast « fichier appliqué » ou un stockage
   * réécrit, à n'importe quel moment de la fenêtre, est le défaut. Une attente
   * fixe puis une seule lecture laissait passer le rejeu (toast déjà refermé,
   * ou rejeu survenu après la lecture).
   */
  const echeance = Date.now() + 30_000;

  let toastVu = false;
  let stockage: string | null = VERSION_UTILISATEUR;

  while (Date.now() < echeance) {
    toastVu ||= (await page.locator('.bolt-agent-applied-toast').count()) > 0;
    stockage = await lireLeStockage(request, projectId, auth.token);

    if (toastVu || stockage !== VERSION_UTILISATEUR) {
      break;
    }

    await page.waitForTimeout(1_000);
  }

  expect(toastVu, 'aucun « fichier appliqué » à l’ouverture : l’agent n’a rien fait').toBe(false);
  expect(stockage, 'le travail de l’utilisateur est intact').toBe(VERSION_UTILISATEUR);
});
