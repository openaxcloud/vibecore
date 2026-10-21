# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: snapshot-cancel-focus.spec.ts >> snapshot cancellation preserves keyboard position (fr)
- Location: tests/e2e/snapshot-cancel-focus.spec.ts:8:3

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.fill: Test timeout of 30000ms exceeded.
Call log:
  - waiting for locator('#snapshot-label')

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - main [ref=e2]:
    - link "Aller au contenu" [ref=e3] [cursor=pointer]:
      - /url: "#main-content"
    - generic [ref=e5]:
      - generic [ref=e6]:
        - button "Ouvrir le menu de navigation" [ref=e7] [cursor=pointer]:
          - img [ref=e8]
          - generic [ref=e9]: Menu
        - generic [ref=e10]: Instantanés du projet
        - button "Aide et visite guidée" [ref=e11] [cursor=pointer]:
          - img [ref=e12]
        - button "Notifications" [ref=e19] [cursor=pointer]:
          - img [ref=e20]
      - generic [ref=e23]:
        - generic [ref=e25]:
          - generic [ref=e26]:
            - paragraph [ref=e27]: Console de l’espace de travail
            - heading "Instantanés du projet" [level=1] [ref=e28]
            - paragraph [ref=e29]: Les instantanés du projet sont temporairement indisponibles.
          - link "Voir les projets" [ref=e31] [cursor=pointer]:
            - /url: /projects
        - alert [ref=e32]:
          - generic [ref=e33]:
            - img [ref=e35]
            - generic [ref=e37]:
              - heading "Impossible de charger Instantanés du projet" [level=2] [ref=e38]
              - paragraph [ref=e39]: La dernière requête a échoué. Cette page reste masquée afin de ne pas afficher de données incomplètes. Aucune donnée n’a été modifiée.
          - button "Réessayer" [ref=e40] [cursor=pointer]:
            - img [ref=e41]
            - text: Réessayer
    - dialog "Parcourez votre espace de travail" [ref=e46]:
      - generic [ref=e47]:
        - generic [ref=e48]:
          - paragraph [ref=e49]: Visite guidée — Étape 1 sur 4
          - heading "Parcourez votre espace de travail" [level=2] [ref=e50]
        - button "Fermer la visite guidée" [ref=e51] [cursor=pointer]:
          - img [ref=e52]
      - progressbar "Progression de la visite guidée" [ref=e55]
      - paragraph [ref=e60]: Projets, utilisation, facturation, gestion de l’équipe et paramètres du compte sont regroupés dans le menu principal.
      - generic [ref=e61]:
        - button "Plus tard" [ref=e62] [cursor=pointer]
        - generic [ref=e63]:
          - button "Retour" [disabled]:
            - img
            - text: Retour
          - button "Suivant" [ref=e64] [cursor=pointer]:
            - text: Suivant
            - img [ref=e65]
  - status "Chargement de la page"
  - generic:
    - generic:
      - generic:
        - img
      - generic: Chargement d’E-Code…
  - region "Notifications Alt+T"
```

# Test source

```ts
  1   | import { readFile } from 'node:fs/promises';
  2   | import { expect, test } from '@playwright/test';
  3   | 
  4   | const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173';
  5   | const apiURL = process.env.SAAS_API_URL ?? 'http://127.0.0.1:3001';
  6   | 
  7   | for (const language of ['en', 'fr'] as const) {
  8   |   test(`snapshot cancellation preserves keyboard position (${language})`, async ({ page, context, request }, info) => {
  9   |     let projectId: string;
  10  | 
  11  |     if (process.env.UX_QA_SESSION_FILE) {
  12  |       expect(new URL(baseURL).hostname).toBe('127.0.0.1');
  13  | 
  14  |       const fixtures = JSON.parse(await readFile(process.env.UX_QA_SESSION_FILE, 'utf8'));
  15  |       const width = page.viewportSize()?.width ?? 1440;
  16  |       const fixtureProfile = width >= 1200 ? 'desktop' : width >= 600 ? 'tablet' : 'mobile';
  17  |       const fixture = fixtures.cases?.[`${fixtureProfile}-${language}`] ?? fixtures;
  18  |       await context.addCookies(fixture.cookies);
  19  |       projectId = fixture.projectId;
  20  |     } else {
  21  |       const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  22  | 
  23  |       const registered = await request.post(`${apiURL}/auth/register`, {
  24  |         data: {
  25  |           email: `snapshot-focus-${suffix}@local.test`,
  26  |           password: 'Password123!',
  27  |           name: 'Snapshot focus E2E',
  28  |           organizationName: `Snapshot focus ${suffix}`,
  29  |         },
  30  |       });
  31  |       expect(registered.ok()).toBe(true);
  32  | 
  33  |       const auth = await registered.json();
  34  | 
  35  |       const created = await request.post(`${apiURL}/orgs/${auth.organization.id}/projects`, {
  36  |         headers: { authorization: `Bearer ${auth.token}` },
  37  |         data: { name: 'Snapshot focus E2E' },
  38  |       });
  39  |       expect(created.ok()).toBe(true);
  40  |       projectId = (await created.json()).project.id;
  41  |       await context.addCookies([
  42  |         { name: 'vc_session', value: auth.token, url: baseURL, httpOnly: true, sameSite: 'Lax' },
  43  |       ]);
  44  |     }
  45  | 
  46  |     await context.addCookies([{ name: 'vibecore-lang', value: language, url: baseURL }]);
  47  | 
  48  |     const label = `Focus ${info.project.name} ${language} ${Date.now()}`;
  49  |     const restoredRequests: string[] = [];
  50  |     page.on('request', (req) => {
  51  |       if (
  52  |         req.method() === 'POST' &&
  53  |         /(?:intent=restore(?:&|$)|name="intent"\r\n\r\nrestore\r\n)/.test(req.postData() ?? '')
  54  |       ) {
  55  |         restoredRequests.push(req.url());
  56  |       }
  57  |     });
  58  |     await page.goto(`/projects/${projectId}/snapshots?lang=${language}`);
> 59  |     await page.locator('#snapshot-label').fill(label);
      |                                           ^ Error: locator.fill: Test timeout of 30000ms exceeded.
  60  | 
  61  |     const createdResponse = page.waitForResponse(
  62  |       (response) =>
  63  |         response.request().method() === 'POST' &&
  64  |         new URL(response.url()).pathname.startsWith(`/projects/${projectId}/snapshots`),
  65  |     );
  66  |     await page
  67  |       .getByRole('button', { name: language === 'fr' ? 'Créer l’instantané' : 'Create snapshot', exact: true })
  68  |       .click();
  69  |     expect([200, 202, 302, 303]).toContain((await createdResponse).status());
  70  | 
  71  |     const opener = page.getByRole('button', {
  72  |       name: `${language === 'fr' ? 'Restaurer' : 'Restore'} ${label}`,
  73  |       exact: true,
  74  |     });
  75  |     await expect(opener).toBeVisible();
  76  |     await page.reload();
  77  |     await expect(opener).toBeVisible();
  78  |     await opener.focus();
  79  |     await page.keyboard.press('Enter');
  80  | 
  81  |     const dialog = page.getByRole('dialog', { name: new RegExp(label) });
  82  |     await expect(dialog).toBeVisible();
  83  | 
  84  |     const cancel = dialog.getByRole('button', { name: language === 'fr' ? 'Annuler' : 'Cancel', exact: true });
  85  |     await expect(cancel).toBeFocused();
  86  |     await page.keyboard.press('Shift+Tab');
  87  |     await expect(dialog.getByRole('button').last()).toBeFocused();
  88  |     await page.keyboard.press('Tab');
  89  |     await expect(cancel).toBeFocused();
  90  |     await page.screenshot({ path: info.outputPath(`dialog-${language}.png`) });
  91  | 
  92  |     const hasTouch = Boolean(info.project.use.hasTouch);
  93  |     expect(await page.evaluate(() => navigator.maxTouchPoints > 0)).toBe(hasTouch);
  94  |     info.annotations.push({ type: 'input-mode', description: hasTouch ? 'touch' : 'keyboard' });
  95  | 
  96  |     if (!hasTouch) {
  97  |       await page.keyboard.press('Enter');
  98  |     } else {
  99  |       await cancel.tap();
  100 |     }
  101 | 
  102 |     await expect(dialog).toBeHidden();
  103 |     await expect(opener).toBeFocused();
  104 |     await expect
  105 |       .poll(() =>
  106 |         opener.evaluate((element) => {
  107 |           const rect = element.getBoundingClientRect();
  108 |           const x = rect.left + rect.width / 2;
  109 |           const y = rect.top + rect.height / 2;
  110 | 
  111 |           return (
  112 |             x >= 0 && y >= 0 && x < innerWidth && y < innerHeight && element.contains(document.elementFromPoint(x, y))
  113 |           );
  114 |         }),
  115 |       )
  116 |       .toBe(true);
  117 |     await page.screenshot({ path: info.outputPath(`cancel-${language}.png`) });
  118 |     await page.keyboard.press('Enter');
  119 |     await expect(dialog).toBeVisible();
  120 |     await page.keyboard.press('Escape');
  121 |     await expect(dialog).toBeHidden();
  122 |     await expect(opener).toBeFocused();
  123 |     expect(restoredRequests).toEqual([]);
  124 |     await expect(page.locator('#snapshot-label')).toBeEnabled();
  125 | 
  126 |     const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  127 |     expect(overflow).toBe(false);
  128 |   });
  129 | }
  130 | 
```