# #796 — diagnostic des trois tests instables

Lecture seule le 26 octobre 2026 des quatre journaux GitHub demandés, sans relance CI, test local, modification produit ou index. [Exécution 40246746430](https://github.com/openaxcloud/vibecore/actions/runs/40246746430), merge testé `bab7cde3cdb9e8066a61622e62e668729b42a0b1` (tête `1714415cb44fc5e1a377afc85601d2a2c0d696eb`, base `5b09bf65bd65f004a35aa778d549deac1546b871`). Les trois cas passent au retry #1 automatique de cette même exécution ; cela ne supprime pas leurs échecs initiaux.

## Erreurs initiales exactes

| Cas | Échec observé | Étape non atteinte |
|---|---|---|
| `dashboard.spec.ts:1252`, `all IDE service panels keep light theme containers readable` | `Le shell IDE (.bolt-project-ide-panels) n'est pas apparu pour le panneau « snapshots » après 2 navigations et 60 s. Ce n'est pas un défaut de thème : l'assertion de couleur n'a pas été atteinte.` Levé par `ouvrirPanneauIde`, ligne 1242 ; appel ligne 1314. | Assertion de couleur pour snapshots. |
| `ide-panel-visibility.spec.ts:62`, 1180px, `panels closes with Escape and restores focus` | `expect(locator).toBeVisible() failed`, `getByTestId('mobile-more-menu-sheet')`, `Timeout: 5000ms`, `Error: element(s) not found`, ligne 74. | Focus dans le dialogue, Escape et restauration de focus. |
| Même test, 1180px, `tabs closes with Escape and restores focus` | Même erreur ligne 74, cible `getByTestId('mobile-tab-switcher')`, 5000ms, élément absent. | Focus dans le sélecteur, Escape et restauration de focus. |

Sources : [tranche 1, job 121330537772](https://github.com/openaxcloud/vibecore/actions/runs/40246746430/job/121330537772), diagnostic à 00:12:18 UTC ; [tranche 2, job 121330537807](https://github.com/openaxcloud/vibecore/actions/runs/40246746430/job/121330537807), diagnostics à 00:17:27 UTC. Les essais initiaux de la tranche 2 durent chacun 7,6s ; leurs retries passent en 8,7s et 9,3s. Le test de thème échoue puis passe en environ 1,5 minute par tentative.

Les autres journaux demandés sont la [tranche 3, job 121330537805](https://github.com/openaxcloud/vibecore/actions/runs/40246746430/job/121330537805) et la [tranche 4, job 121330537928](https://github.com/openaxcloud/vibecore/actions/runs/40246746430/job/121330537928). Résumés respectifs des quatre tranches : 120 passed / 6 skipped / 1 flaky ; 125 passed / 2 flaky ; 187 passed / 19 skipped ; 46 passed / 1 skipped. Chacune termine avec `playwright exit: 0`. Ces résumés ne remplacent pas le bilan global 507/87 fourni par coordination, qui inclut d'autres catégories ; aucun nouveau total global n'est reconstruit ici.

## Composants et interprétation

- Le test de thème parcourt vingt panneaux avec des navigations complètes. Son helper conserve deux attentes de 30s, et son commentaire documente déjà des absences intermittentes du shell sous charge. Ici, les deux tentatives internes ont échoué pour snapshots. C'est une indisponibilité observée du shell, pas une preuve de mauvaise couleur ni une preuve que le moteur de restauration est fautif. La route `app/routes/projects.$projectId.ide.tsx` utilise `ClientOnly`/`Suspense`, `PendingComposerShell` et le chargement différé de `ProjectIdeChat`. Navigation, réponse serveur, chargement de modules et montage sont des pistes ; les logs consultés ne permettent pas de choisir entre elles.
- Les deux tests à 1180px font `goto`, puis `trigger.focus()` et `trigger.press('Enter')` sans attendre un marqueur explicite de stabilité du shell. L'échec porte sur l'ouverture, pas sur Escape. Dans `app/components/chat/BaseChat.tsx`, les handlers `openMobileMoreMenu` et `openMobileTabSwitcher` (vers 3252–3271) modifient l'état et le persistent ; les dialogues (10726/10780) nécessitent `showMobileChrome` et leur état ouvert. `showMobileChrome = useMobileIde && clientHydrated` (10135). Une course lors du montage/remplacement du shell ou une perte d'activation clavier est plausible, mais non prouvée. Le passage au retry ne permet pas de classer automatiquement le problème comme « seulement le test ».
- Les premiers essais 390px correspondants passent ; les transitions de panneaux à 1180px et le cas desktop 1280px passent aussi. Ce constat réduit le périmètre observé, sans garantir tous les états ou exclure une régression intermittente.

## Comparaison avec le diff #796

Le patch GitHub de [#796](https://github.com/openaxcloud/vibecore/pull/796/files), récupéré durant ce diagnostic, ne change aucun fichier IDE, ces deux tests E2E, les styles globaux, les dépendances ou la configuration CI. Les changements produit concernent uniquement `EcodeProductMarketingPages.tsx`, `ecode-exact/pages/{AIAgent,Privacy,Terms}.tsx` et les routes `invitations`, `organization-invitations`, `organization-roles`, `roles-and-permissions`, `privacy`, `terms`, `support-policy`. Le test unitaire de Support Policy et les documents/index accompagnent ces changements. Les handles SSR ajoutés sont locaux aux routes légales/Support Policy ; ils ne sélectionnent pas le rendu de la route IDE.

**Verdict : aucune régression IDE directement attribuable au diff #796 n'est démontrée. Trois instabilités réelles restent à diagnostiquer ; ni thème cassé ni Escape cassé ne sont établis par ces échecs.** L'absence de modification directe n'exclut pas une interaction indirecte de chargement, et aucun avant/après sur le même environnement n'a été exécuté ici.

## Suite utile, non exécutée

Lire les trois `error-context.md` et traces du premier essai archivés avec les jobs (pas uniquement les retries), relever URL finale, réponse navigation, erreurs console/réseau, shell présent et état `aria-expanded`/focus avant et après Enter. Pour snapshots, distinguer shell absent et panneau absent avant d'incriminer Restore/Fleet. Pour les menus, prouver une éventuelle course de montage avant de changer l'attente du test ou le produit ; ne pas simplement augmenter les délais ou ajouter des retries. Coordination requise avec les propriétaires de navigation IDE #788 et Restore/Fleet #793/#794. Aucun de ces périmètres n'a été modifié.

Limites : artefacts de traces/captures non téléchargés dans cette mission, aucune reproduction locale, aucun accès production, aucune donnée réelle, aucun waiver ni assouplissement ajouté. Les journaux complets ne sont pas copiés dans le dépôt ; seules les erreurs pertinentes et les liens sont conservés.
