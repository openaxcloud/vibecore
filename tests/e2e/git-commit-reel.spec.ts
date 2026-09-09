import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import JSZip from 'jszip';

/**
 * BUG-GIT-001 — « Committer les modifications » répondait `200` et ne
 * committait RIEN.
 *
 * Audit du 15/08, DEUX projets sur deux : le client émettait exactement un
 * `POST /api/projects/<id>/ide-panel/git` qui répondait `200`, sans erreur ni
 * alerte ; côté serveur `HEAD` n'avait pas bougé, `git diff --cached` était
 * vide, et les fichiers restaient non suivis. L'utilisateur croyait son
 * travail versionné.
 *
 * LA CAUSE : l'intention est portée par le BOUTON d'envoi
 * (`<button type="submit" name="intent" value="commit">`), et
 * `new FormData(form)` ne l'inclut pas. Elle partait vide, la route ne
 * reconnaissait aucun cas, n'appelait aucune route git — et répondait 200.
 *
 * CE QUE CE TEST TIENT, et qu'aucune garde statique ne peut tenir : que le
 * commit EXISTE VRAIMENT après le geste. C'est la seule assertion qui aurait
 * rougi le 15/08.
 */
const appBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';
const apiBaseUrl = process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';

async function projetAvecSession(request: APIRequestContext) {
  const suffixe = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  let dernier = '';

  for (let essai = 0; essai < 4; essai += 1) {
    const inscription = await request.post(`${apiBaseUrl}/auth/register`, {
      data: { email: `git-commit-${suffixe}-${essai}@local.test`, password: 'Password123!', name: 'Git commit' },
    });

    if (inscription.status() === 429 && essai < 3) {
      await new Promise((resoudre) => setTimeout(resoudre, 11_000));
      continue;
    }

    if (!inscription.ok()) {
      dernier = `${inscription.status()} ${await inscription.text()}`;
      continue;
    }

    const corps = (await inscription.json()) as any;
    const token = corps.token ?? corps.session?.token;
    const orgId = corps.organization?.id ?? corps.organizations?.[0]?.id;

    const creation = await request.post(`${apiBaseUrl}/orgs/${orgId}/projects`, {
      headers: { authorization: `Bearer ${token}` },
      data: { name: 'Commit reel' },
    });

    expect(creation.ok(), `création du projet : ${creation.status()}`).toBe(true);

    return { token, projectId: (await creation.json()).project.id as string };
  }

  throw new Error(`Impossible de préparer un projet : ${dernier}`);
}

function commits(request: APIRequestContext, token: string, projectId: string) {
  return request
    .get(`${apiBaseUrl}/projects/${projectId}/git/graph`, { headers: { authorization: `Bearer ${token}` } })
    .then(async (reponse) => {
      expect(reponse.ok(), `graphe git : ${reponse.status()}`).toBe(true);

      const corps = (await reponse.json()) as { commits?: Array<{ message?: string; sha?: string }> };

      return Array.isArray(corps.commits) ? corps.commits : [];
    });
}

/*
 * Le VRAI chemin d'ouverture — la feuille « + » puis l'outil, comme le doigt
 * d'Avi. `?panel=git` ne monte pas le panneau : un test bâti dessus ne
 * mesurerait rien.
 */
async function ouvrirLePanneauGit(page: Page, token: string, projectId: string) {
  await page.context().addCookies([
    { name: 'vc_session', value: token, url: appBaseUrl, httpOnly: true, sameSite: 'Lax' },
  ]);
  await page.goto(`/projects/${projectId}/ide`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('button-add-tab')).toBeVisible({ timeout: 60_000 });
  await page.getByTestId('button-add-tab').click();
  await page.getByTestId('tool-item-git').click({ timeout: 20_000 });
  await expect(page.getByTestId('git-tab-pr-source')).toBeVisible({ timeout: 60_000 });
}

test.describe('panneau Git — le commit committe pour de vrai', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

  test('après « Committer les modifications », le commit existe dans l’historique', async ({ page, request }) => {
    test.setTimeout(180_000);

    const { token, projectId } = await projetAvecSession(request);
    const avant = await commits(request, token, projectId);

    /*
     * Il faut quelque chose à committer. Le projet fraîchement créé a un arbre
     * PROPRE — vérifié : `changedFiles` vide. On dépose donc un fichier par
     * l'import zip, qui écrit dans le dépôt porté par le pod API, là où le
     * commit aura lieu. (La route d'écriture de l'éditeur passe, elle, par le
     * runtime d'espace de travail, absent de la pile locale : elle rend 502
     * ici, et le test ne mesurerait plus rien.)
     */
    const marqueur = `garde-bug-git-001-${Date.now()}`;
    const archive = new JSZip();
    archive.file(`${marqueur}.txt`, `Ce fichier existe pour prouver que le commit a lieu.\n${marqueur}\n`);

    const depot = await request.post(`${apiBaseUrl}/projects/${projectId}/files/import/zip`, {
      headers: { authorization: `Bearer ${token}` },
      data: { zipBase64: await archive.generateAsync({ type: 'base64' }) },
    });
    expect(depot.ok(), `dépôt du fichier : ${depot.status()} ${await depot.text()}`).toBe(true);

    // Contrôle de la MESURE : sans changement à committer, le test ne prouve rien.
    const statut = await request.get(`${apiBaseUrl}/projects/${projectId}/git/status`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const changements = ((await statut.json()) as any).status?.changedFiles ?? [];
    expect(changements, 'rien à committer : le test ne mesurerait rien').toContain(`${marqueur}.txt`);

    await ouvrirLePanneauGit(page, token, projectId);

    // Indexer, puis saisir un message, puis committer — le parcours de l'audit.
    const toutIndexer = page.getByRole('button', { name: /^(Tout indexer|Stage all)$/ });
    await expect(toutIndexer).toBeVisible({ timeout: 30_000 });
    await toutIndexer.click();

    const message = `garde BUG-GIT-001 ${marqueur}`;
    const champ = page.locator('textarea[name="message"], input[name="message"]').first();
    await expect(champ).toBeVisible({ timeout: 15_000 });
    await champ.fill(message);

    const committer = page.getByRole('button', { name: /^(Committer les modifications|Commit changes)$/ });
    await expect(committer).toBeEnabled({ timeout: 15_000 });
    await committer.click();

    /*
     * L'ASSERTION QUI COMPTE. Le serveur, pas l'écran : le panneau affichait
     * « action effectuée » exactement de la même façon quand rien ne se
     * passait.
     */
    await expect
      .poll(async () => (await commits(request, token, projectId)).some((c) => (c.message ?? '').includes(marqueur)), {
        timeout: 45_000,
        message: `aucun commit portant « ${marqueur} » — le geste n'a rien produit`,
      })
      .toBe(true);

    const apres = await commits(request, token, projectId);
    expect(apres.length, 'l’historique n’a pas grandi').toBeGreaterThan(avant.length);
  });
});
