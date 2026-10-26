# Témoin desktop palette — build intégré d24ec3a2b

Source exacte d24ec3a2b5dfacea3f52978f89ae78417f648388 (mainf380934e +807+fa85+c36), build root réussi. `source-build.json` conserve bundle SHA256 f829ae61464bfdf8c105d5c459420f4a9c11d8524c516c4edafd1248cfd17093 et hashBaseChat. Aucun fichier produit modifié, aucun ancien patch IDE appliqué.

## Résultat exact

Chromium1280×900, serveur partagé14699/API7899 propriétaire ui_review ; projet, cookie et GET entièrement synthétiques. Deux contextes séparés :

- **Chatdelay : défaut persistant.** Chunk réel Chat.client-BH-ZNCiR.js retenu. Alltools ouvre palette, Webview est saisi et champ focalisé. À la libération du chunk, ancien champ détaché, palette et combobox absents, focusBODY. Le locatorfill identique à celuiCI expire après la borne diagnostique3s. Deuxcycles réouverture/saisieWebview/Escape aprèschargement réussissent.
- **Normal : contrôle réussi.** Sans délai injecté, ancienchamp connecté, palette présente, focusinput conservé, fillWebview réussi. Deuxcycles réouverture/saisie/Escape réussissent.

0erreurJavaScript. Cinq PUT automatiques `/api/projects/synthetic-safearea-project/ide-state` interceptés/bloqués au navigateur ; aucune mutation n’atteint le backend. Tiers bloqués. Ne pas dire zéro tentative. `receipt.json` contient snapshotsDOM/ancêtres/événements focus et réponses du diagnostic. Quatre screenshots : before montre le champ avantlibération ; after est pris aprèscyclesEscape donc palette volontairementfermée (le reçu avantcycles établit la disparition).

## Comparaison et limites

Signature identique au témoin ancien807 `/tmp/ui-ci807-desktop/query-cycles/receipt.json` : delay échoue, normal réussit, anciens champs détachés seulement dans le premier. C’est un défaut préexistant toujours visible après intégration, pas une nouvelle régression imputée à Agents/Toast/Artifact. La correction de ces derniers ne prétend pas résoudre le handoffpalette.

Aucune assertionCI ni timeoutCI modifié ; le test original90000ms est un budgettotal, non une durée de fill connue. La reproduction locale démontre la perte d’état pendant remount du shell, sans attribuer avec certitude la tentativeCI initiale dépourvue de trace0. Elle ne couvre pas historique explicitementretardé, tousmoteurs, production, backendruntime ou projetsréels. Proposition provider partagée reste àcoordination propriétaireIDE ; aucuncorrectif appliqué.

Navigateurs fermés, GOcleanup envoyé à ui_review propriétaire14699/7899. Origines partagées : `/tmp/ui807-integrated-focus/process-origin.json`. Cet agent ne termine aucunprocess tiers, necommit/push/index rien.
