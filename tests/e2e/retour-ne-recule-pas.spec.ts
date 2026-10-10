import { expect, test, type APIRequestContext } from '@playwright/test';
import JSZip from 'jszip';

/*
 * BUG-QA1001-RETOUR-PERD-LES-MODIFICATIONS — le retour sur un projet existant,
 * le geste le plus fréquent d'un utilisateur régulier.
 *
 * Mesuré le 2026-10-01 sur le chemin d'écriture de la production : 10
 * réouvertures sur 10, la copie SERVEUR repassait à la version de l'agent dans
 * les 5 s. L'écran restait juste ; c'est quand l'espace était recréé que le
 * travail disparaissait. Deux chemins y menaient :
 *   - le navigateur enregistrait, à la fermeture de chaque artefact REJOUÉ, le
 *     runtime vers le serveur avec `replaceExisting` ;
 *   - le serveur rematérialisait tout le fil à chaque `PUT /ide-state`
 *     (BUG-QA0929-IDE-STATE-HISTORIQUE-ECRASE).
 *
 * Ce test lit donc la copie SERVEUR, pas l'écran : l'écran était juste à chaque
 * fois.
 */

const appBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';
const apiBaseUrl = process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';

const CHEMIN = 'src/Contact.tsx';
const VERSION_AGENT = '// VERSION-AGENT';
const VERSION_UTILISATEUR = '// VERSION-UTILISATEUR-ENREGISTREE';

async function copieServeur(request: APIRequestContext, projectId: string, token: string) {
  const reponse = await request.get(`${apiBaseUrl}/projects/${projectId}/export/zip`, {
    headers: { authorization: `Bearer ${token}` },
  });

  expect(reponse.ok(), `export du projet : ${reponse.status()}`).toBe(true);

  const { archive } = (await reponse.json()) as { archive: { base64: string } };
  const zip = await JSZip.loadAsync(Buffer.from(archive.base64, 'base64'));
  const nom = Object.keys(zip.files).find((fichier) => fichier.endsWith(CHEMIN));

  return nom ? (await zip.files[nom].async('string')).trim() : null;
}

test('retour sur un projet : ce que l’utilisateur a enregistré reste sur le serveur après la réouverture', async ({
  page,
  request,
}) => {
  test.setTimeout(150_000);

  const suffixe = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const inscription = await request.post(`${apiBaseUrl}/auth/register`, {
    data: {
      email: `retour-${suffixe}@local.test`,
      password: 'Password123!',
      name: 'Retour',
      organizationName: `Retour ${suffixe}`,
    },
  });

  expect(inscription.ok(), await inscription.text()).toBe(true);

  const auth = (await inscription.json()) as { token: string; organization: { id: string } };
  const entetes = { authorization: `Bearer ${auth.token}` };

  const projet = await request.post(`${apiBaseUrl}/orgs/${auth.organization.id}/projects`, {
    headers: entetes,
    data: { name: 'Retour', framework: 'react' },
  });

  expect(projet.ok(), await projet.text()).toBe(true);

  const corpsProjet = (await projet.json()) as { id?: string; project?: { id: string } };
  const projectId = corpsProjet.project?.id ?? corpsProjet.id!;

  const messages = [
    { id: 'u1', clientId: 'u1', role: 'user', content: 'Ajoute une page de contact.' },
    {
      id: 'a1',
      clientId: 'a1',
      role: 'assistant',
      content:
        'La page de contact est créée.\n\n<boltArtifact id="contact" title="Page de contact">' +
        `<boltAction type="file" filePath="${CHEMIN}">${VERSION_AGENT}\n</boltAction>` +
        '</boltArtifact>',
    },
  ];

  // Le tour passé de l'agent, tel que le premier appareil l'a laissé : fil côté serveur ET dans l'état de l'IDE.
  const conversation = await request.post(`${apiBaseUrl}/projects/${projectId}/ai/conversations`, {
    headers: entetes,
    data: { title: 'Retour' },
  });

  const conversationId = ((await conversation.json()) as { conversation: { id: string } }).conversation.id;

  await request.put(`${apiBaseUrl}/projects/${projectId}/ai/conversations/${conversationId}/transcript`, {
    headers: entetes,
    data: { messages },
  });

  const etat = await request.put(`${apiBaseUrl}/projects/${projectId}/ide-state`, {
    headers: entetes,
    data: { state: { chat: { messages, metadata: { aiConversationId: conversationId } } } },
  });

  expect(etat.ok(), await etat.text()).toBe(true);
  expect(await copieServeur(request, projectId, auth.token), 'témoin : le tour de l’agent est matérialisé').toBe(
    VERSION_AGENT,
  );

  // L'utilisateur a modifié le fichier puis enregistré.
  const zip = new JSZip();
  zip.file(CHEMIN, `${VERSION_UTILISATEUR}\n`);

  const enregistrement = await request.post(`${apiBaseUrl}/projects/${projectId}/files/import/zip`, {
    headers: entetes,
    data: { zipBase64: await zip.generateAsync({ type: 'base64' }) },
  });

  expect(enregistrement.ok(), await enregistrement.text()).toBe(true);
  expect(await copieServeur(request, projectId, auth.token), 'témoin : l’enregistrement est sur le serveur').toBe(
    VERSION_UTILISATEUR,
  );

  // Il revient le lendemain, navigateur neuf.
  const importsDestructifs: string[] = [];

  page.on('request', (requete) => {
    if (
      /\/files\/import\/zip$/.test(new URL(requete.url()).pathname) &&
      /"replaceExisting":true/.test(requete.postData() ?? '')
    ) {
      importsDestructifs.push(requete.url());
    }
  });

  await page
    .context()
    .addCookies([{ name: 'vc_session', value: auth.token, url: appBaseUrl, httpOnly: true, sameSite: 'Lax' }]);
  await page.goto(`/projects/${projectId}/ide`, { waitUntil: 'domcontentloaded' });

  // Le fil est affiché : l'historique a bien été relu, sinon le test ne mesurerait rien.
  await expect(page.getByText('La page de contact est créée.').first()).toBeVisible({ timeout: 60_000 });
  await page.waitForLoadState('load');

  /*
   * Mesuré AVANT correctif : la copie serveur reculait dans les 5 s qui suivent
   * l'ouverture. On laisse 20 s à l'IDE pour finir de s'installer (fermeture des
   * artefacts rejoués, enregistrements de l'état de l'IDE).
   */
  await page.waitForTimeout(20_000);

  expect(importsDestructifs, 'aucun remplacement de la copie serveur à la réouverture').toEqual([]);
  expect(await copieServeur(request, projectId, auth.token)).toBe(VERSION_UTILISATEUR);
});
