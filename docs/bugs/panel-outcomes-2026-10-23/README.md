# Résultats d’exécution : preuves et limites

Base `05636a95f7c33b0c6fc90fe54484564d981fec27`, branche indépendante de #768/#764. Le BFF persistait des runs failed puis retournait le succès générique `{ok:true}`. Security déduisait completed du seul HTTP 2xx. Ce lot modifie uniquement le retour d’exécution, sa présentation UI et les métadonnées de scan ; aucune commande ou règle de détection, permission, credential, quota ou protection ne change.

## Contrat corrigé

Après persistance réussie, le BFF renvoie le run/scan avec son état : HTTP 200 / ok:true pour succeeded/completed ; HTTP 422 / ok:false / PANEL_EXECUTION_FAILED sinon. Les sorties/logs Terminal/Workflows déjà stockés restent accessibles. Les exceptions runtime conservent le masquage existant, sans exposer leurs détails internes dans le message utilisateur. Les opérations Terminal adossées à runTerminalCommand partagent ce retour, sans modification de leurs accès SSH.

Un sous-scan échoué rend Security failed même si l’audit de dépendances a réussi. Les constats précédents sont conservés et complétés par les résultats disponibles, au lieu d’être effacés comme si le scan était complet. Les métadonnées persistées contiennent nom/statut/code de sortie des sous-commandes, pas leurs sorties brutes pouvant contenir des secrets. Le message FR/EN signale l’échec, sans annoncer un résultat propre.

L’UI générique traite ok:false, recharge l’historique puis conserve l’erreur. Security exige également scan.status=completed et ignore une réponse reçue après abort, afin de préserver timeout/annulation.

## Contre-épreuves

- **Réelles, API/PostgreSQL/runtime locaux** : un script synthétique `exit 7` et le workflow synthétique correspondant enregistrent failed, mais le build main répond HTTP 200 / ok:true. Ces appels ne visent que les projets créés par la recette, jamais le projet utilisateur.
- **Security réel** : le scan local enregistre completed, exit 0. Ce résultat n’est pas présenté comme une reproduction réelle d’un scan failed.
- **Contrat contrôlé** : onze tests échouent avant correction (payload d’exécution absent sur succès, ok:true après échec/exception timeout, échec d’un sous-scan ignoré). Ils utilisent un double d’exécuteur et n’exécutent aucune commande. Après correction ils passent, dans un groupe ciblé de **56 tests / 5 fichiers**, sans omission.
- **UI contrôlée** : sur le build main, HTTP 200 avec ok:false et scan.status=failed affiche pourtant completed. Capture avant tirée de la trace locale et capture après jointes. Cette réponse est explicitement injectée et ne prouve pas une exécution runtime.

## Recette navigateur corrigée

Application compilée, web 5232/API 3019/PostgreSQL local dédié 55443, Chromium système, Node 24.19.0, pnpm 9.14.4. Configuration exacte jointe ; un worker, zéro retry, budget 90 s inchangé. Aucun clic forcé ni délai ajouté.

Premier passage : **5 succès / 1 échec**. Les observations réelles donnent Terminal failed/code 7 → HTTP 422/ok:false ; Workflows failed → HTTP 422/ok:false ; Security completed → HTTP 200/ok:true. Le seul échec était le sélecteur Workflows ambigu : quatre marqueurs failed existaient. Il cible désormais le marqueur de l’en-tête ; reprise du seul cas **1 succès direct en 4,8 s**, avec message d’erreur et historique visibles. Produit inchangé entre ces passages ; ne pas annoncer un unique run 6/6.

Les trois autres cas sont des **tests UI contrôlés** : réponse HTTP 200/ok:false/scan failed ; réponse HTTP 200/ok:true/scan failed ; timeout par horloge navigateur contrôlée sur requête retenue. Ils vérifient failed/failed/timeout. Le timeout n’est pas un délai runtime réel de 90 s. Une première tentative du test rouge UI a échoué à préparer l’API (variable de port omise) ; elle est conservée localement et exclue des preuves produit.

Build final : succès, 2306 fichiers compilés ; blobs produit du reçu inchangés après recette. Les hooks normaux de typage/lint sont exécutés avant commit et leur verdict figure dans la PR. Aucun remplacement des validations CI, aucune suite locale exhaustive.

## Limites et provenance

`receipt.json` conserve les statuts observés et les blobs compilés ; les groupes hexadécimaux SHA-256 et Git se concatènent sans séparateur. Rapports bruts, traces avec cookies et manifeste compilé restent privés. Les trois captures ont été inspectées : fixtures exclusivement synthétiques, aucun secret ou compte réel publié. Inventaire : 480 fiches conservées + cette fiche = 481.

Pas de certification production, Safari/mobile, exhaustivité du scanner ou disponibilité d’un runtime distant. Les commandes existantes (notamment les `|| true` des outils de scan) restent inchangées : ce lot garantit la fidélité aux états d’exécution enregistrés, pas la détection de toutes les erreurs internes qu’un outil pourrait masquer avec un code 0. Aucun audit général, Debugger, restauration cloud ou Sync inclus.

## Correction documentaire du contrôle de secrets

Le job gitleaks 120391711630 a échoué sur la tête `ea558d30`. Le téléchargement des logs a retourné HTTP 403 et n’a pas été retenté. Le scan local avec gitleaks 8.21.2 et la configuration inchangée de la CI reproduit une seule alerte `generic-api-key`, ligne 5 du reçu : l’empreinte Git du catalogue `api-runtime-routes.ts`. Sa correspondance avec le blob Git de cette tête est vérifiée, comme celles des deux autres sources compilées. Il s’agit d’une empreinte de provenance, pas d’un credential.

Les trois empreintes Git sont désormais représentées en groupes hexadécimaux de huit caractères, reconstituables par concaténation. Aucun contenu produit, résultat historique, règle, exclusion ou seuil du contrôle n’est modifié. Le scan local après conversion ne relève aucune alerte ; la CI de la nouvelle tête reste nécessaire.
