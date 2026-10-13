# Pastille visible sur Preview — diagnostic séparé

Branche `codex/pastille-preview-20261013`, base `6ac094cc2f1d1cfcc84737d2675664827e0ccc35`. Correctif local non poussé et non fusionné pour ce lot. #732 a été poussée à cette tête après revue parent ; description actualisée, PR toujours brouillon.

## Signal CI et accès

Run `38331017541`, job `115080602377`, SHA confirmé par API `dc200e09764b679d33cb93b2a75ec9ea634a9a11`. Selon le relevé du parent : deux échecs ligne 2916 à 01:30:26 et 01:30:45 UTC, `SPAN.i-ph:arrow-down` trouvé sur Preview, puis retry 2 vert à 01:31:08. Ce signal est distinct de la préparation des douze messages corrigée par #728.

Logs et artefact `11783572202` redirigent vers **productionresultssa1.blob.core.windows.net**, destination refusée dans cette session ; les chemins sont arrêtés. Seul sa0 était annoncé autorisé. Aucune modification réseau ni contournement ; aucune URL signée conservée ici. Les captures CI restent non lues.

## Premiers faits locaux

Trois répétitions du test original sur le build 6ac094cc2 passent, un worker, zéro retry, 37,4 secondes. Instrumentation externe au dépôt : panneau actif, panneau URL, destination React Router et hit-test de la pastille toutes les 25 ms. Dans les trois passages, la pastille reste temporairement touchable après activation de Preview, environ 400 ms avant recouvrement par le Workbench. Exemple : `data-mobile-panel=preview`, URL preview, position (324,299), hit vrai ; ensuite position (324,708), hit faux. Le contrôle original attend 1500 ms, ce qui laisse ces passages verts. Cela établit un débordement local transitoire, sans prouver encore la cause des deux échecs CI.

La relecture indépendante constate que la pastille reste enfant du transcript, sans portail ; le wrapper Agent reçoit la classe `hidden` hors Agent. Les mesures suivantes ajoutent la chaîne des ancêtres et les règles de display applicables pour expliquer pourquoi elle reste peinte.

## Préparation de la contre-épreuve

Une rétention de la vraie réponse JavaScript `Workbench.client-*.js` est préparée, sans changer le délai d’assertion ni attendre avant le clic. Le premier checkout de référence sous `/tmp` a produit un build privé de styles utilitaires : `uno.config.ts` exclut explicitement les chemins `/tmp/`. Deux essais échouent avant Preview, sur l’apparition de la pastille, et la réponse visée n’est jamais retenue. Ces essais invalides ne constituent pas une reproduction du défaut. Capture inspectée. Le serveur de ce build a été arrêté ; la référence dc200e09 est reconstruite sous `/workspace/vibecore-pastille-ci-base`, sans modification de configuration.

Mémoire avant premier build : environ 10,4 Go / 17,18 Go cgroup ; avant reconstruction : environ 11,3 Go. pnpm 9.14.4 et dépendances existantes du lockfile, sans installation. Une seule exécution navigateur à la fois ; aucune génération, démarrage de workspace utilisateur ou écriture de contenu via le navigateur. API locale existante conservée. Sources du harnais et preuves : `/tmp/pastille-preview-repro` et `/tmp/pastille-preview-evidence`.

## Cause reproduite et correctif minimal

Sur le build dc200e09 sous `/workspace`, retenir la vraie réponse `Workbench.client-*.js` donne **deux échecs identiques ligne 2916**, `SPAN.i-ph:arrow-down`, après les 1500 ms inchangées. Les deux captures rouges sont inspectées : Webview est active, mais le transcript Agent et la pastille restent peints devant le chargement des panneaux. Le mauvais panneau n’est pas sélectionné : `data-mobile-panel=preview` et l’URL preview sont établis.

Le wrapper Agent porte simultanément `flex` et `hidden`. Le CSSOM énumère `.hidden` (`display:none`), puis `.flex` (`display:flex`), sans priorité `!important` ; le style calculé du wrapper est **flex**. L’isolation d’empilement historique empêche le dépassement une fois le Workbench monté, mais ne masque pas Agent pendant le chargement. Le correctif rend ces classes mutuellement exclusives, sans démontage du transcript, changement CSS global ou modification du menu bas.

Les deux tests durables à 390 et 768 sont ensuite rouges sur le même ancien build, précisément sur le hit-test Preview. Ils conservent le délai de 1500 ms et la vraie réponse retenue. Ils vérifient également le retour vers Agent avant libération, puis Preview chargé, Git et Agent. Les règles de sélection et de navigation de #732 ne sont pas modifiées par ce lot. Relecture indépendante favorable ; l’attribution exacte aux deux exécutions CI reste limitée par leurs traces inaccessibles.

[Capture rouge 390](captures/pastille-preview-2026-10-13/rouge-390.jpeg), [capture rouge 768](captures/pastille-preview-2026-10-13/rouge-768.jpeg), [mesures classifiées](captures/pastille-preview-2026-10-13/mesures-rouges.json). Les traces brutes locales ne sont pas ajoutées au dépôt.

Les captures rouges durables sont les dernières images de trace avant libération du module dans le finally du test : les screenshots automatiques après échec peuvent déjà montrer le Workbench chargé et ne prouvent pas le débordement.

Premier passage du nouveau parcours sur build corrigé : le hit-test de chargement, le masquage Agent et le retour Agent avant libération passent ; les deux tests échouent ensuite sur la visibilité du wrapper `.bolt-workbench-mobile`. Le contenu Preview est pourtant visible sur la capture. Le wrapper contient une surface `fixed`, hors flux ; le nouveau contrôle est corrigé pour viser `.bolt-workbench-mobile > .fixed`, la surface réellement affichée. Aucun contrôle historique ni délai modifié.

## Résultats corrigés

Après ciblage de la surface visible, les deux nouveaux parcours passent : **2/2**, 1 minute. Lot final : ancien test et deux contre-épreuves, chacun répété deux fois, **6/6**, 1,9 minute, un worker, zéro retry. Même build corrigé pour ces passages ; captures de chargement et de retour Agent inspectées. Les répétitions incluent les interruptions par retour Agent avant libération du vrai module.

[Chargement 390](captures/pastille-preview-2026-10-13/preview-loading-390.png), [chargement 768](captures/pastille-preview-2026-10-13/preview-loading-768.png), [retour Agent 390](captures/pastille-preview-2026-10-13/agent-return-390.png), [retour Agent 768](captures/pastille-preview-2026-10-13/agent-return-768.png).

Un dernier relevé des boutons réels pendant le chargement donne **2/2 parcours verts** : à 390 et 768, scrollX/Y=0, visualViewport à échelle 1 et sans décalage ; menu bas y=772, hauteur 72, bouton + y=782, hauteur 44, entièrement dans les 844 px. [Mesures](captures/pastille-preview-2026-10-13/geometrie-chargement.json). La lecture indépendante des captures ne constate pas de nouvelle régression du menu.

Validation ciblée : **44/44 tests Vitest**, six fichiers (transcript, pastille, keepalive, AST, dette BaseChat, index), 3,94 s. Typage E2E strict réussi. Build de production corrigé réussi. Les contrôles portent sur le périmètre touché, pas sur une suite globale ni sur Safari/iPhone réel. Aucun changement de dépendance, workflow ou dérogation. Le runtime local reste indisponible ; ces tests ne valident ni génération ni application déployée.

Contrôles finaux : types web (`tsconfig.web.json`), types E2E stricts, lint des deux sources, formatage des sources/docs/mesures et `git diff --check` réussis. Relecture indépendante finale favorable, introduction du rapport corrigée pour refléter le correctif local. Aucun push ni fusion du lot pastille ; revue parent requise avant publication.
