# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: snapshot-cancel-focus.spec.ts >> snapshot cancellation preserves keyboard position (fr)
- Location: tests/e2e/snapshot-cancel-focus.spec.ts:8:3

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false

Call Log:
- Timeout 5000ms exceeded while waiting on the predicate
```

# Page snapshot

```yaml
- generic [ref=e1]:
  - main [ref=e2]:
    - link "Aller au contenu" [ref=e3] [cursor=pointer]:
      - /url: "#main-content"
    - generic [ref=e5]:
      - generic [ref=e6]:
        - button "Ouvrir le menu de navigation" [ref=e7] [cursor=pointer]:
          - img [ref=e8]
          - generic [ref=e9]: Menu
        - generic [ref=e10]: Instantanés
        - button "Aide et visite guidée" [ref=e11] [cursor=pointer]:
          - img [ref=e12]
        - button "Notifications" [ref=e19] [cursor=pointer]:
          - img [ref=e20]
      - generic [ref=e23]:
        - generic [ref=e25]:
          - generic [ref=e26]:
            - paragraph [ref=e27]: Console de l’espace de travail
            - heading "Instantanés" [level=1] [ref=e28]
            - paragraph [ref=e29]: Points de contrôle manuels et automatiques pour revenir en arrière, sécuriser les modifications de l’IA et exporter le projet.
          - link "Ouvrir l’IDE" [ref=e31] [cursor=pointer]:
            - /url: /projects/cmvhu0ch1000swrr0e657b7ls/ide
        - navigation "Navigation du projet" [ref=e33]:
          - link "Vue d’ensemble" [ref=e34] [cursor=pointer]:
            - /url: /projects/cmvhu0ch1000swrr0e657b7ls
            - img [ref=e35]
            - text: Vue d’ensemble
          - link "Ouvrir l’IDE" [ref=e38] [cursor=pointer]:
            - /url: /projects/cmvhu0ch1000swrr0e657b7ls/ide
            - img [ref=e39]
            - text: Ouvrir l’IDE
          - link "Paramètres" [ref=e44] [cursor=pointer]:
            - /url: /projects/cmvhu0ch1000swrr0e657b7ls/settings
            - img [ref=e45]
            - text: Paramètres
          - link "Variables d’environnement" [ref=e48] [cursor=pointer]:
            - /url: /projects/cmvhu0ch1000swrr0e657b7ls/env
            - img [ref=e49]
            - text: Variables d’environnement
          - link "Secrets" [ref=e52] [cursor=pointer]:
            - /url: /projects/cmvhu0ch1000swrr0e657b7ls/secrets
            - img [ref=e53]
            - text: Secrets
          - link "Collaborateurs" [ref=e56] [cursor=pointer]:
            - /url: /projects/cmvhu0ch1000swrr0e657b7ls/collaborators
            - img [ref=e57]
            - text: Collaborateurs
          - link "Instantanés" [ref=e62] [cursor=pointer]:
            - /url: /projects/cmvhu0ch1000swrr0e657b7ls/snapshots
            - img [ref=e63]
            - text: Instantanés
          - link "Déploiements" [ref=e67] [cursor=pointer]:
            - /url: /projects/cmvhu0ch1000swrr0e657b7ls/deployments
            - img [ref=e68]
            - text: Déploiements
          - link "Domaines personnalisés" [ref=e73] [cursor=pointer]:
            - /url: /projects/cmvhu0ch1000swrr0e657b7ls/domains
            - img [ref=e74]
            - text: Domaines personnalisés
          - link "Journaux" [ref=e79] [cursor=pointer]:
            - /url: /projects/cmvhu0ch1000swrr0e657b7ls/logs
            - img [ref=e80]
            - text: Journaux
          - link "Activité" [ref=e82] [cursor=pointer]:
            - /url: /projects/cmvhu0ch1000swrr0e657b7ls/activity
            - img [ref=e83]
            - text: Activité
          - link "Git" [ref=e85] [cursor=pointer]:
            - /url: /projects/cmvhu0ch1000swrr0e657b7ls/git
            - img [ref=e86]
            - text: Git
        - generic [ref=e90]:
          - generic [ref=e92]:
            - generic [ref=e93]:
              - heading "Instantanés du projet" [level=2] [ref=e94]
              - generic [ref=e95]: 1 instantané
            - list [ref=e96]:
              - listitem [ref=e97]:
                - img [ref=e99]
                - generic [ref=e103]:
                  - heading "Focus mobile fr 1792570981127" [level=3] [ref=e104]
                  - paragraph [ref=e105]:
                    - generic [ref=e106]: Manuel · 22 o
                    - generic [ref=e107]: ·
                    - time [ref=e109]: maintenant
                  - paragraph [ref=e110]: "ID : cmvhuhanc00mpxxr01cll6s7d"
                - button "Restaurer Focus mobile fr 1792570981127" [active] [ref=e111] [cursor=pointer]:
                  - img [ref=e112]
                  - text: Restaurer Focus mobile fr 1792570981127
          - generic [ref=e115]:
            - generic [ref=e116]:
              - heading "Créer un instantané" [level=2] [ref=e117]
              - paragraph [ref=e118]: Capturez les fichiers persistants actuels du projet avant une modification importante.
            - generic [ref=e119]:
              - generic [ref=e120]: Nom de l’instantané
              - textbox "Nom de l’instantané" [ref=e121]:
                - /placeholder: Point de contrôle manuel
              - button "Créer l’instantané" [ref=e122] [cursor=pointer]
    - dialog "Parcourez votre espace de travail" [ref=e123]:
      - generic [ref=e124]:
        - generic [ref=e125]:
          - paragraph [ref=e126]: Visite guidée — Étape 1 sur 4
          - heading "Parcourez votre espace de travail" [level=2] [ref=e127]
        - button "Fermer la visite guidée" [ref=e128] [cursor=pointer]:
          - img [ref=e129]
      - progressbar "Progression de la visite guidée" [ref=e132]
      - paragraph [ref=e137]: Projets, utilisation, facturation, gestion de l’équipe et paramètres du compte sont regroupés dans le menu principal.
      - generic [ref=e138]:
        - button "Plus tard" [ref=e139] [cursor=pointer]
        - generic [ref=e140]:
          - button "Retour" [disabled]:
            - img
            - text: Retour
          - button "Suivant" [ref=e141] [cursor=pointer]:
            - text: Suivant
            - img [ref=e142]
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
  59  |     await page.locator('#snapshot-label').fill(label);
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
> 104 |     await expect
      |     ^ Error: expect(received).toBe(expected) // Object.is equality
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