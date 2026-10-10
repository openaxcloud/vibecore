# Préserver les diagnostics E2E avant l'envoi des artefacts

Les résultats du run `37890108457`, tranche 1, référencent des pièces jointes
de trace et d'erreur. L'artefact `11599217397` récupéré ne contient pourtant
que le JSON des résultats et les journaux API/web. Les pièces référencées ne
sont pas disponibles pour établir la cause du message de réparation manquant.

Le workflow lance la suite Chromium, puis `responsive-ide.spec.ts` sur la même
tranche avant l'upload final. Les deux invocations utilisaient le dossier par
défaut `test-results`. Le runner Playwright installé (1.59.1), fonction
`createRemoveOutputDirsTask`, efface le dossier de sortie au début de chaque
invocation. Cette succession détruit les pièces de la première suite avant
leur collecte, indépendamment de la cause produit des échecs.

Correction : dossiers distincts `test-results-tranche` et
`test-results-responsive`, tous deux envoyés avec `always()`. Le rapport JSON
de verdict, l'agrégateur, le découpage, les retries et les exemptions ne changent
pas. Le chemin historique `test-results` reste collecté si d'autres pièces
s'y trouvent.

Les trois gardes TypeScript strict vérifient les vrais paramètres YAML et
exécutent deux vrais processus Playwright, sans navigateur ni services :
le premier test échoue après avoir écrit un diagnostic ; le deuxième réussit.
Le diagnostic doit survivre. Cette pièce de fixture n'est pas une vraie trace
navigateur : elle mesure uniquement le comportement du dossier de sortie.
Revenir aux paramètres d'origine rend deux gardes rouges, dont la lecture du
diagnostic supprimé. Avec le correctif, les trois gardes réussissent.

La présence d'une véritable trace récupérable doit encore être constatée dans
un prochain échec E2E en CI après fusion. Aucun verdict de lancement ni cause
du défaut de réparation n'est déduit de cette correction de collecte.
