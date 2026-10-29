# Audit Studio / Security — 29 octobre 2026

Vrais composants compilés du build f978/47b1 (arbres identiques), Chromium local390/820/1280, API/runtime synthétiques. Aucun fichier produit modifié. Aucun scan, appel IA, approbation de patch, export, sauvegarde, réglage de permission ou mutation réelle. Les GET sont interceptés et les mutations/externe bloqués dans le navigateur. Les serveurs appartiennent à root et n'ont pas été modifiés. Tous les navigateurs de ces recettes sont fermés.

## Couverture ciblée

- Studio : vide/loading3/3 ;503→Retry clavier3/3 (`studio-empty`, `studio-recovery`). Long consensus ouvert par Enter : trois échecs de géométrie (`studio-long`). Pas de branche/patch/repair réel, les compteurs ne prouvent aucune exécution.
- Security : vide/loading + onglets Hidden/Compare/Reports/Settings/Active clavier3/3 ;503→Retry3/3 (`security-empty-corrected`, `security-recovery`). Données longues :390et1280 passent,820 échoue (`security-long-corrected`). Aucun Run full scan, Fix with Agent, Ignore, Restore, Save ou export cliqué.
- Les snapshots et la donnée de mémoire Studio sont entièrement synthétiques. Aucun service externe ou authentification supplémentaire requis pour ces recettes locales ; cela ne valide pas leurs backends réels.

## Studio : débordement des détails consensus établi

Claim et résumé contenant une URL longue traversent leur carte après ouverture au clavier. Panneaux358/771/588px, scrollWidth3260/3260/3302. Une seule règle de wrapping ne suffit pas au desktop : le grid implicite garde le min-content d'une section (mémoire tronquée notamment). Contrepreuve finale `studio-track-counterproof` : racine Studio min-width:0 + grid-template-columns:minmax(0,1fr) + overflow-wrap:anywhere,3/3vert, claim et résumé intégraux strictement égaux.

Patch proposé NON APPLIQUÉ : `studio-security-wrap.patch` ajoute classe unique `bolt-project-agent-studio` à la racine Studio dans BaseChat puis règle dédiée dans index.scss. Aucun style partagé Monitoring modifié.

## Security : wrapping absent au-dessus du seuil établi

À820, panneau771px, titre/détail d'une vulnérabilité et résumé du scan portent scrollWidth à4046. Les règles de repli existantes sont dans @container(max-width:760px), expliquant pourquoi390 et1280(panneau588) passent. Contrepreuve minimale `.bolt-project-security-tool { overflow-wrap:anywhere }`3/3verte. `security-preserved-counterproof` exige aussi le texte exact du titre/détail,3/3vert. Incluse dans le patch proposé.

## Security : brouillon perdu après changement de coque

`security-draft` puis deux essais `security-draft-repeat` : Settings surdesktop1280, sélectionner Scanner profile=sca sans soumettre ; vérifier valeur ; redimensionner390 ; attendre explicitement que l'ancien select soit détaché ; rouvrirSettings. Valeur observée workspace-runtime au lieu de sca,3/3rouge. Aucune requête de sauvegarde, scan ou changement de permission.

Proposition séparée, non implémentée : transfert de brouillon éphémère isolé par projet/panneau, incluant onglet et champs de formulaire non secrets, sans stockage persistant ni soumission automatique. `ProjectSecurityPanel` reçoit projectId mais pas encore paneId, que ProjectManagedPanelRenderer connaît ; s'inspirer de useIdeSettingsFormDraft seulement après adaptation du contrat d'isolation. Aucun correctif draft ne doit être revendiqué par le patch CSS.

## Erreurs de recette conservées

Premières recettes Security demandaient aria-pressed alorsque PanelToolTabs utilise aria-current=page : erreurs du harnais, corrigées sans changement produit. Un essai initial Security1280 et un essai contrepreuveStudio390 n'ont pas vu la première requête dans le délai5s de la sonde ; ce n'est pas une preuve de panneau cassé. Les recettes corrigées restent séparées, pas écrasées. Une contrepreuve Studio root-wrapping seule échoue desktop ; elle justifie la grille minmax0, pas un assouplissement de seuil.

## Validation compilée à faire après patch

Sans COUNTERPROOF :
`PANEL=studio MODE=long LABEL=compiled-studio node /workspace/ui841-studio-security/probe.cjs`
`PANEL=security MODE=long LABEL=compiled-security node /workspace/ui841-studio-security/probe.cjs`

La contrepreuve DOM ne vaut pas recette du produit corrigé. Pas de Safari/appareil physique,zoom200%,clavier virtuel,safe areas,backend réel ou production certifiés. Les deux panneaux ne sont que partiellement exercés.

## Implementation handoff 2026-10-29 01:12 UTC

Local branch `fix/ide-service-panel-drafts-20261029`, no commit/push/build performed by this agent.

- BaseChat.tsx: unique Studio root class; Security invocation receives paneId; Security scannerProfile uses existing `useIdeSettingsFormDraft(projectId, paneId, serverValues)` and controlled select. Backend baseline preserved; active tab intentionally remains local.
- index.scss: only `.bolt-project-agent-studio` root grid/wrap and `.bolt-project-security-tool` wrap. No shared Monitoring behavior change.
- New security-profile-draft.spec.tsx: actual Security component extracted from source, real draft provider, synthetic service summaries; no real Save/Scan. Six tests cover shell remount, project/window/pane separation, fresh server hydration, matching confirmation, and old submission completion after newer edit.
- Functional red: 3 failed / 3 passed before controlled draft fix. Final: 6/6 new + 10/10 existing SettingsFormDraft tests passed (draft-tests-final.log).
- ESLint new test passed; BaseChat remaining error line14765 belongs to concurrent Collaboration submit code, reported parent and untouched. Own errors fixed. `git diff --check` passed.
- One pnpm invocation attempted its automatic dependency check/install and failed mkdir /home/agent/.local/share/pnpm before tests; final successful tests used existing node_modules binaries, no install required.
- Parent owns integrated build and compiled-browser verification after these edits. Prior DOM counterproof/audit is not a post-build product validation. No production/backend/Safari/device validation performed here.

## Compiled assembled build verification

Local Chromium, served build on21999, synthetic API/runtime only, no CSS COUNTERPROOF injection, no Save/Scan/AI action. All browser instances closed by finally.

- `compiled-studio/receipt.json`: long consensus claim and summary exact text, 390/820/1280 pass3/3. Width/scroll358/358,771/771,588/588.
- `compiled-security/receipt.json`: long vulnerability title and detail exact text, keyboard tabs,390/820/1280 pass3/3; same widths, no horizontal panel overflow.
- `compiled-security-draft/receipt.json`:390→1280 and1280→390 pass2/2: old select genuinely detached, sca retained. Initial820→390 failed strict remount precondition because old node remained connected (tablet and phone share mobile shell: BaseChat useMobileIde=layout.isMobile||layout.isTablet). Failure screenshot preserved, no assertion relaxed.
- `compiled-security-draft-820-remount/receipt.json`:820→1280 passes with old node detached and sca retained. This changes only harness resize target to actually exercise shell replacement; no product change/retry under identical conditions. Combined intended nine cases pass, with one recorded harness-precondition failure.
- All nine passing receipts have empty pageerror lists. No Safari, real backend, production, physical device, zoom200 certification from these cases.
