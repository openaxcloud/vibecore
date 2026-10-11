import { expect, test, type Page } from '@playwright/test';

/*
 * BUG-QA0928-IDEE-PERDUE-INSCRIPTION, seconde moitié — mesuré le 2026-09-30 en
 * PRODUCTION sur iPhone (WebKit), sans compte :
 *
 *   départ https://app.e-code.ai/ → /login : idée gardée (correctif #611)
 *   départ https://e-code.ai/     → /login : idée PERDUE
 *
 * Un visiteur qui découvre la plateforme arrive sur `e-code.ai`. `/login` le
 * renvoie (301) vers `app.e-code.ai`, une AUTRE origine : le `sessionStorage`
 * où l'accueil avait rangé l'idée ne la suit pas. Le premier test de #611 ne
 * partait que de l'application — il était vert sur le seul point d'entrée qui
 * marchait.
 *
 * Ce parcours se prouve ENTIER, depuis ses DEUX points d'entrée : arrivée,
 * idée, connexion, inscription, arrivée dans l'application — puis retour du
 * visiteur, où l'idée ne doit pas ressurgir. `e-code.localhost` et
 * `app.e-code.localhost` reproduisent le saut de domaine de la production
 * (`*.localhost` résout vers 127.0.0.1 ; même règle que `e-code.ai`, voir
 * `app/utils/origine-application.ts`).
 */

const base = new URL(process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173');
const port = base.port ? `:${base.port}` : '';
const VITRINE = `${base.protocol}//e-code.localhost${port}`;
const APPLICATION = `${base.protocol}//app.e-code.localhost${port}`;

async function decrireSonIdee(page: Page, entree: string, idee: string) {
  await page.goto(`${entree}/`);

  const champ = page.getByPlaceholder(/Describe your app idea|Décrivez votre idée/i).first();

  await expect(champ).toBeVisible({ timeout: 60_000 });
  await page.waitForLoadState('load');

  await expect(async () => {
    await champ.fill(idee);
    await expect(champ).toHaveValue(idee, { timeout: 1_000 });
  }).toPass({ timeout: 30_000 });

  await page
    .getByRole('button', { name: /^(Build now|Créer maintenant)$/i })
    .first()
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Build the full app|Créer l.application complète/i })
    .click();
}

async function sInscrire(page: Page, suffixe: string) {
  // Toujours sur l'APPLICATION : c'est là que vivent la connexion et l'inscription.
  await expect(page).toHaveURL(new RegExp(`^${APPLICATION}/login\\?returnTo=%2Fprojects%2Fnew`), { timeout: 30_000 });

  const lienInscription = page.locator('a[href^="/register"]').first();

  // Premier chargement de l'application dans ce navigateur : la page peut compiler à froid (mesuré sur WebKit).
  await expect(lienInscription).toBeVisible({ timeout: 30_000 });
  await expect(lienInscription).toHaveAttribute('href', /returnTo=%2Fprojects%2Fnew/);
  await lienInscription.click();
  await expect(page).toHaveURL(/\/register\?/, { timeout: 30_000 });

  await page.getByLabel(/Full name|Nom complet/i).fill('Visiteur QA');
  await page
    .getByLabel(/e-?mail/i)
    .first()
    .fill(`entre-domaines-${suffixe}@local.test`);

  for (const champ of await page.locator('input[type=password]').all()) {
    await champ.fill(`Domaines-${suffixe}-Qa!9`);
  }

  for (const caseACocher of await page.getByRole('checkbox').all()) {
    await caseACocher.check().catch(() => undefined);
  }

  await page.getByRole('button', { name: /^(Create account|Créer le compte)$/i }).click();
}

/** Aucune adresse demandée pendant le parcours ne doit porter l'idée (journaux de tous les intermédiaires). */
function surveillerLesAdresses(page: Page, temoin: string) {
  const fautives: string[] = [];

  page.on('request', (requete) => {
    const adresse = decodeURIComponent(requete.url());

    if (adresse.includes(temoin)) {
      fautives.push(requete.url());
    }
  });

  return fautives;
}

const suffixeUnique = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

test.describe('l’idée tapée sur l’accueil survit à l’inscription, quel que soit le domaine d’arrivée', () => {
  test('ENTRÉE 1 — domaine principal (e-code.ai) : l’idée franchit le saut vers l’application, puis ne ressurgit pas', async ({
    page,
  }) => {
    test.setTimeout(180_000);

    const suffixe = suffixeUnique();
    const idee = `Herbier ${suffixe} avec rappels d’arrosage`;
    const adressesFautives = surveillerLesAdresses(page, suffixe);

    await decrireSonIdee(page, VITRINE, idee);
    await sInscrire(page, suffixe);

    // L'inscription ramène au composeur de l'APPLICATION, l'idée posée dedans — jamais au tableau de bord vide.
    await expect(page).toHaveURL(new RegExp(`^${APPLICATION}/projects/new`), { timeout: 60_000 });

    const composeur = page.locator('textarea').first();

    await expect(composeur, 'l’idée a traversé les deux domaines').toHaveValue(idee, { timeout: 30_000 });

    // RETOUR du visiteur : l'idée a été rendue une fois ; elle ne doit plus revenir.
    await page.goto(`${APPLICATION}/projects/new`);
    await page.waitForLoadState('load');
    await expect(page.locator('textarea').first()).not.toHaveValue(idee, { timeout: 15_000 });

    const cookies = await page.context().cookies();

    expect(
      cookies.filter((cookie) => cookie.name === 'ecode_relais_idee').map((cookie) => cookie.value),
      'le jeton de relais est effacé une fois l’idée rendue',
    ).toEqual([]);

    expect(adressesFautives, 'l’idée n’apparaît dans aucune adresse du parcours').toEqual([]);
  });

  test('ENTRÉE 2 — application (app.e-code.ai) : l’idée devient le premier projet, comme avant', async ({ page }) => {
    test.setTimeout(180_000);

    const suffixe = suffixeUnique();
    const idee = `Carnet ${suffixe} de recettes par ingrédient`;
    const adressesFautives = surveillerLesAdresses(page, suffixe);

    await decrireSonIdee(page, APPLICATION, idee);
    await sInscrire(page, suffixe);

    await expect(page, 'l’inscription ne mène pas au tableau de bord vide').not.toHaveURL(/\/dashboard(\?|$)/, {
      timeout: 5_000,
    });
    await expect(page).toHaveURL(new RegExp(`carnet-${suffixe}`), { timeout: 90_000 });

    // RETOUR : un nouveau projet plus tard ne relance pas l'ancienne idée.
    await page.goto(`${APPLICATION}/projects/new`);
    await page.waitForLoadState('load');
    await expect(page.locator('textarea').first()).not.toHaveValue(idee, { timeout: 15_000 });

    // Seule exception : les adresses du PROJET créé, dont le nom reprend les premiers mots de l'idée (par conception).
    expect(adressesFautives.filter((adresse) => !new RegExp(`/@[^/]+/carnet-${suffixe}`).test(decodeURIComponent(adresse)))).toEqual([]);
  });
});
