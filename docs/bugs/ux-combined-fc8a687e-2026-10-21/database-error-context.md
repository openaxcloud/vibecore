# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ide-mobile-chrome.spec.ts >> chrome de l’IDE sur téléphone — 390 >> Base de données, « Mes données » : le studio prend la hauteur de son contenu, sans défilement interne
- Location: tests/e2e/ide-mobile-chrome.spec.ts:876:3

# Error details

```
TimeoutError: locator.click: Timeout 30000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: /^DATABASE_URL/ }).first()

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - main [ref=e3]:
    - generic [ref=e4]:
      - generic [ref=e6]:
        - generic [ref=e7]:
          - button "Back to dashboard" [ref=e8] [cursor=pointer]
          - button "Activity" [ref=e10] [cursor=pointer]
        - button "Search tools and files" [ref=e12] [cursor=pointer]:
          - strong [ref=e15]: Database
        - generic [ref=e16]:
          - button "Open tools" [ref=e17] [cursor=pointer]
          - button "More options" [ref=e19] [cursor=pointer]
      - status: Connection healthy
      - generic [ref=e26]:
        - generic [ref=e27]:
          - heading "All databases" [level=2] [ref=e28]
          - button "Refresh" [disabled] [ref=e29]:
            - img [ref=e30]
            - text: Refresh
        - status [ref=e35]:
          - generic [ref=e36]: Loading databases…
      - navigation "IDE panels":
        - generic [ref=e39]:
          - button "Starting project" [pressed] [ref=e40]
          - generic [ref=e41]:
            - button "Open tab switcher" [ref=e42] [cursor=pointer]
            - group "Open tabs" [ref=e45]:
              - button "Switch to Webview tab" [ref=e46] [cursor=pointer]
              - button "Switch to Agent tab" [ref=e48] [cursor=pointer]:
                - img [ref=e49]
              - button "Switch to Publish tab" [ref=e54] [cursor=pointer]
              - button "Switch to Database tab" [pressed] [ref=e56] [cursor=pointer]
            - button "Add new tab" [ref=e60] [cursor=pointer]
          - button "More options" [ref=e62] [cursor=pointer]
  - status "Loading page"
  - generic:
    - generic:
      - generic:
        - img
      - generic: Loading E-Code…
  - region "Notifications Alt+T"
```

# Test source

```ts
  791 |
  792 |     expect(boutons.length).toBeGreaterThanOrEqual(3);
  793 |
  794 |     for (const m of boutons) {
  795 |       expect(m.w, `entrée « ${m.text} » large de ${m.w}px`).toBe(44);
  796 |       expect(m.h, `entrée « ${m.text} » haute de ${m.h}px`).toBe(44);
  797 |     }
  798 |
  799 |     const nommes = await menu
  800 |       .locator('button')
  801 |       .evaluateAll((els) => els.every((el) => (el.getAttribute('aria-label') ?? '').length > 3));
  802 |
  803 |     expect(nommes, 'chaque action porte son nom pour VoiceOver').toBe(true);
  804 |
  805 |     for (const m of await mesurer(page, '.bolt-message-context-menu .bolt-message-action-label')) {
  806 |       expect(m.w, `libellé « ${m.text} » encore affiché`).toBe(0);
  807 |     }
  808 |
  809 |     const menuBoite = await menu.evaluate((el) => {
  810 |       const r = el.getBoundingClientRect();
  811 |
  812 |       return { right: r.right, bottom: r.bottom, height: r.height, vw: innerWidth, vh: innerHeight };
  813 |     });
  814 |
  815 |     expect(menuBoite.right).toBeLessThanOrEqual(menuBoite.vw);
  816 |     expect(menuBoite.bottom).toBeLessThanOrEqual(menuBoite.vh);
  817 |     expect(menuBoite.height, 'une seule rangée').toBeLessThanOrEqual(60);
  818 |     await page.keyboard.press('Escape');
  819 |
  820 |     // Capture 12:19 : « Modérée / 0 active » sur 120 px par ligne.
  821 |     await ouvrirOutil(page, 'security');
  822 |     ideDiagnostics.mark('security-selected');
  823 |
  824 |     const lignes = page.locator('.bolt-panel-row');
  825 |
  826 |     await expect(lignes.first()).toBeVisible({ timeout: 30_000 });
  827 |
  828 |     for (const m of await mesurer(page, '.bolt-panel-row')) {
  829 |       // Une paire courte tient sur une ligne ; un détail long (« Résumé ») se replie dessous, deux lignes au plus.
  830 |       expect(m.h, `ligne « ${m.text} » haute de ${m.h}px`).toBeLessThanOrEqual(m.text.length > 28 ? 72 : 48);
  831 |     }
  832 |
  833 |     // Audit du 06/09 : le volet « Dernière analyse » faisait 437 px sur 390 — « Aucune an… » coupé au bord.
  834 |     const volet = await page
  835 |       .locator('.bolt-project-security-grid aside')
  836 |       .first()
  837 |       .evaluate((el) => {
  838 |         const r = el.getBoundingClientRect();
  839 |
  840 |         return { right: Math.round(r.right), w: Math.round(r.width), vw: innerWidth };
  841 |       });
  842 |
  843 |     expect(volet.right, `volet large de ${volet.w}px, bord droit à ${volet.right}px`).toBeLessThanOrEqual(volet.vw);
  844 |
  845 |     // Git, capture 13:08 : deux champs « main » sans libellé visible au-dessus.
  846 |     await ouvrirOutil(page, 'git');
  847 |     ideDiagnostics.mark('git-selected');
  848 |
  849 |     const source = page.getByTestId('git-tab-pr-source');
  850 |
  851 |     await expect(source).toBeVisible({ timeout: 30_000 });
  852 |     await expect(page.getByText(/^(Branche source|Source branch)$/)).toBeVisible();
  853 |     await expect(page.getByText(/^(Branche cible|Target branch)$/)).toBeVisible();
  854 |
  855 |     // Audit WebKitGTK 06/09 : « src/components/very/… » à 157 px dans l'arbre de travail — un chemin se replie.
  856 |     const rangeesGit = await mesurer(page, '.bolt-git-tab .truncate');
  857 |
  858 |     expect(rangeesGit.length, 'Git : aucun élément mesuré — le sélecteur ne vise plus le panneau').toBeGreaterThan(0);
  859 |
  860 |     for (const m of rangeesGit) {
  861 |       expect(m.sw, `Git : « ${m.text} » coupé, ${m.sw}px pour ${m.cw}px`).toBeLessThanOrEqual(m.cw + 1);
  862 |     }
  863 |
  864 |     // Même audit, Studio : « src/components/very/deep/directory/stru… » dans la carte de révision.
  865 |     await ouvrirOutil(page, 'studio');
  866 |
  867 |     const carte = page.locator('.bolt-project-agent-patch-card strong').first();
  868 |
  869 |     if (await carte.isVisible({ timeout: 15_000 }).catch(() => false)) {
  870 |       for (const m of await mesurer(page, '.bolt-project-agent-patch-card strong')) {
  871 |         expect(m.sw, `Studio : « ${m.text} » coupé, ${m.sw}px pour ${m.cw}px`).toBeLessThanOrEqual(m.cw + 1);
  872 |       }
  873 |     }
  874 |   });
  875 |
  876 |   test('Base de données, « Mes données » : le studio prend la hauteur de son contenu, sans défilement interne', async ({
  877 |     page,
  878 |     request,
  879 |     ideDiagnostics,
  880 |   }) => {
  881 |     test.setTimeout(150_000);
  882 |     await ouvrirIde(page, request, { fil: true });
  883 |     ideDiagnostics.mark('ide-ready');
  884 |     await ouvrirOutil(page, 'database');
  885 |     ideDiagnostics.mark('database-selected');
  886 |
  887 |     // La liste « Toutes les bases de données » d'abord : la carte DATABASE_URL ouvre l'atelier.
  888 |     await page
  889 |       .getByRole('button', { name: /^DATABASE_URL/ })
  890 |       .first()
> 891 |       .click({ timeout: 30_000 });
      |        ^ TimeoutError: locator.click: Timeout 30000ms exceeded.
  892 |
  893 |     const atelier = page.locator('.bolt-database-workbench');
  894 |
  895 |     await expect(atelier).toBeVisible({ timeout: 30_000 });
  896 |     await page.getByRole('tab', { name: /Mes données|My data/i }).click();
  897 |
  898 |     const studio = page.locator('.bolt-database-studio');
  899 |
  900 |     await expect(studio).toBeVisible({ timeout: 30_000 });
  901 |
  902 |     const geometrie = await page.evaluate(() => {
  903 |       const lire = (sel: string) => {
  904 |         const el = document.querySelector<HTMLElement>(sel)!;
  905 |         const cs = getComputedStyle(el);
  906 |
  907 |         return {
  908 |           display: cs.display,
  909 |           flexGrow: cs.flexGrow,
  910 |           overflowY: cs.overflowY,
  911 |           h: Math.round(el.getBoundingClientRect().height),
  912 |           sh: el.scrollHeight,
  913 |           ch: el.clientHeight,
  914 |         };
  915 |       };
  916 |
  917 |       return {
  918 |         corps: lire('.bolt-database-workbench-body'),
  919 |         studio: lire('.bolt-database-studio'),
  920 |         resultats: lire('.bolt-database-studio-results'),
  921 |       };
  922 |     });
  923 |
  924 |     // Capture 13:07 : une centaine de pixels visibles, le reste coupé par un défilement interne.
  925 |     expect(geometrie.corps.flexGrow).toBe('0');
  926 |     expect(geometrie.corps.overflowY).toBe('visible');
  927 |     expect(geometrie.corps.sh, 'le corps défile encore en interne').toBeLessThanOrEqual(geometrie.corps.ch + 1);
  928 |     expect(geometrie.studio.display).toBe('block');
  929 |     expect(geometrie.studio.h, `studio haut de ${geometrie.studio.h}px`).toBeGreaterThan(250);
  930 |     expect(geometrie.resultats.h, `résultats hauts de ${geometrie.resultats.h}px`).toBeGreaterThanOrEqual(120);
  931 |   });
  932 |   test('Déploiements « Gérer » : les actions d’un déploiement se partagent la ligne', async ({ page, request }) => {
  933 |     test.setTimeout(150_000);
  934 |
  935 |     const { token, projectId } = await ouvrirIde(page, request, { fil: false });
  936 |
  937 |     // Un déploiement statique mis en file (il échoue proprement sans pod) : la carte suffit.
  938 |     const cree = await request.post(`${apiBaseUrl}/projects/${projectId}/deployments`, {
  939 |       headers: { authorization: `Bearer ${token}` },
  940 |       data: { provider: 'static', timeoutSeconds: 30 },
  941 |     });
  942 |
  943 |     expect(cree.ok(), `création du déploiement : ${cree.status()}`).toBe(true);
  944 |
  945 |     await ouvrirOutil(page, 'deployments');
  946 |     await page
  947 |       .getByRole('button', { name: /^(Gérer|Manage)$/ })
  948 |       .first()
  949 |       .click({ timeout: 30_000 });
  950 |
  951 |     const actions = page.locator('.bolt-project-deploy-actions').first();
  952 |
  953 |     await expect(actions).toBeVisible({ timeout: 30_000 });
  954 |
  955 |     // L'état du déploiement est traduit : « QUEUED » en capitales anglaises n'est pas un libellé.
  956 |     const etat = page.locator('.bolt-project-deploy-card em[data-status]').first();
  957 |
  958 |     await expect(etat).toBeVisible();
  959 |     await expect(etat).not.toHaveText(/^[A-Z_]+$/);
  960 |
  961 |     // Capture 14:10 : trois formulaires de 44 px l'un sous l'autre, boutons étroits.
  962 |     const geometrie = await actions.evaluate((el) => {
  963 |       const enfants = [...el.children].map((c) => {
  964 |         const r = c.getBoundingClientRect();
  965 |         const bouton = c.querySelector('button, a') ?? c;
  966 |         const b = bouton.getBoundingClientRect();
  967 |
  968 |         return { y: Math.round(r.y), w: Math.round(r.width), bw: Math.round(b.width), bh: Math.round(b.height) };
  969 |       });
  970 |
  971 |       return { display: getComputedStyle(el).display, enfants };
  972 |     });
  973 |
  974 |     expect(geometrie.display).toBe('flex');
  975 |     expect(geometrie.enfants.length).toBeGreaterThanOrEqual(3);
  976 |
  977 |     /*
  978 |      * 308 px de carte à 390 : deux actions par ligne, la troisième prend la
  979 |      * ligne suivante en entier. Trois sur une ligne feraient 97 px chacune et
  980 |      * couperaient « Restauration ». Mesuré avant : trois lignes, boutons étroits.
  981 |      */
  982 |     const lignes = new Set(geometrie.enfants.map((e) => e.y));
  983 |
  984 |     expect(
  985 |       lignes.size,
  986 |       `les actions occupent ${lignes.size} lignes : ${JSON.stringify(geometrie.enfants)}`,
  987 |     ).toBeLessThanOrEqual(2);
  988 |
  989 |     for (const e of geometrie.enfants) {
  990 |       expect(e.bw, 'chaque bouton prend la largeur de sa part').toBeGreaterThanOrEqual(e.w - 2);
  991 |       expect(e.bw, `bouton large de ${e.bw}px : étroit comme avant`).toBeGreaterThanOrEqual(140);
```
