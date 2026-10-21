# Recette locale complète du chrome IDE — 21 octobre 2026

Aucune fusion ni certification production. Le main vérifié est `4af4dd1a0ba14473affb2ee7fdeabbac23b1274f`. Les quatre cas floating restent au chantier éditeur. Aucun fichier BaseChat, Monaco, dashboard/signup ou workflow n’est modifié ici.

## Première passe complète

[Résultats par cas](baseline-results.json) : **44/45 réussites, zéro omission, zéro retry**, durée 415,7 s. Front compilé combinant #750 et #753, empreinte `3ce63e8e60bcbd4a4315f562c89835ae9849c49f3b2a45665b01e1e566196eb4`, API main exacte. Les deux cas initialement rouges CI (Git/Sécurité et Mes données) passent ; les cas précédemment omis ont tous été exécutés, dont les deux requêtes SQL réelles sur PostgreSQL local. Les tests vocaux et streaming emploient leurs doubles existants : ils ne certifient pas un fournisseur réel.

Le cas publication FR à 390 px échoue réellement : « Voir les journaux » occupe deux lignes dans un bouton de 116,7×44 px. [Capture avant](publication-wrap-before-fr.png), [mesures](publication-wrap-before-fr.json). Correction limitée à `flex-wrap: wrap` du groupe `.bolt-publication-echec-actions`, sans changer les libellés ni les actions.

Le test d’affichage « Mes données » utilise la connexion nommée historique `e2e` : une lecture de schéma échoue avec `ECONNREFUSED` sur le port local 5432. Son vert atteste la carte et sa géométrie, pas une connexion SQL. Les deux tests SQL dédiés utilisent le PostgreSQL réel de la fixture locale sur 55443.

Les deux erreurs initiales du run CI #748 ne sont pas reproduites sur cette pile locale. Les métadonnées des requêtes et les assertions de préparation ont été renforcées pour distinguer une donnée absente d’un défaut visuel, sans modifier les assertions produit, délais ou budgets. Cela ne démontre pas la cause du rouge CI. Le téléchargement autorisé de l’artefact de résultats a reçu Forbidden/403 ; aucune tentative de contournement, et aucune prétention d’avoir inspecté les traces binaires CI.

## Reproduction

Configuration exacte : [playwright.mobile-gate-audit.config.ts](../../../playwright.mobile-gate-audit.config.ts), configuration standard héritée, projet chromium, Chromium système, un worker, zéro retry, budgets inchangés. Exécuter `playwright test -c playwright.mobile-gate-audit.config.ts` avec `PLAYWRIGHT_BASE_URL`, `SAAS_API_URL`, `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` et `DATABASE_URL` pointant exclusivement vers la pile synthétique locale autorisée.

`UX_QA_AUTH_FILE` peut référencer un fichier privé contenant un tableau de sessions synthétiques existantes `{ projectId, cookies }`. Le test exige alors deux hôtes `127.0.0.1`, vérifie l’accès API et crée encore un projet réel par cas. Les quotas restent actifs. Sans cette variable, le parcours normal d’inscription CI reste inchangé. Aucun cookie ni DSN n’est publié. Les archives compilées sont conservées localement, pas ajoutées à Git.

## Dépendances et limites

La concurrence `enterpriseOrganizationSettings.organizationId` est documentée avec request IDs, pile et chronologie dans [BUG-API-ENTERPRISE-SETTINGS-RACE-001](../BUG-API-ENTERPRISE-SETTINGS-RACE-001.md). Le déclenchement est une lecture produit concurrente après préparation séquentielle ; la généralisation au parcours d’inscription réel reste à établir par le chantier API. Elle est distincte du pool PostgreSQL et du panneau ProductTour interceptant les clics.

La validation combinée de Dialog/menu sur le précédent build et son manifeste complet restent dans [la recette #753](../ux-confirmation-2026-10-21/review/README.md). Le manifeste contient uniquement chemins relatifs et empreintes ; son reçu décrit une comparaison locale, pas une attestation indépendante.

## Provenance et contrôles GitHub

[Manifeste intégral du nouveau build](manifest.json), [comparaison locale](comparison.json) : 4 980 sources et 2 304 fichiers compilés, seule superposition attendue `HeaderOverflowMenu.tsx` de #750, aucune différence inattendue. L'empreinte du build est `241de187a98047cded75517835b0e4d94665cd30b3e54368ee00d41f9857e22c`. L'archive de 26 Mo est conservée dans l'exécuteur ; elle n'est pas publiée dans la PR.

Les [contrôles #753 à 2b68724](ci-753-at-2b68724.txt) et [#750 à e996671](ci-750-at-e996671.txt) sont terminés : 29 réussis et 2 ignorés chacun. Ces résultats ne sont pas transférables à une nouvelle tête de PR.

Le script [publication-matrix.cjs](publication-matrix.cjs) vérifie le libellé, le centre recevant les événements, le focus, les cibles tactiles puis l'ouverture et la fermeture des journaux dans les trois formats et les deux langues. Il requiert `UX_QA_SESSION_FILE` vers une session locale existante avec un projet contenant un déploiement échoué persistant ; `UX_QA_OUTPUT_DIR` reçoit les mesures et captures. Aucune nouvelle tentative de déploiement n'est nécessaire pour cette recette de l'état d'erreur.

## Passe finale sur API #748

[Résultats complets](final-results.json) : **45/45 réussites, zéro retry, zéro omission, zéro flaky**, 496,1 s, démarrage 09:29:06 UTC. API exacte `2d37c65eb94046c55813625a3c2cc648ae9df57b`, build `241de187…`. Les deux échecs initiaux CI passent ; les dix-huit cas omis sont couverts par cette exécution intégrale. Le cas publication FR précédemment rouge passe sans modifier son assertion.

Les [métadonnées API](api-request-metadata.json) contiennent uniquement identifiants de requête, catégories/routes, statuts, durées et codes d’erreur, sans corps ni en-têtes. Une erreur de schéma `ECONNREFUSED` correspond à la connexion nommée du test d’affichage ; les deux tests SQL dédiés passent sur PostgreSQL réel. `/health` final : 200 en 8,3 ms. Aucun diagnostic de fuite de pool n’est déduit de cette passe.

| Actions | Résultat local | Limite |
| --- | --- | --- |
| Sécurité puis Git, champs attendus, menu contextuel | Réussi sur API #748 | Cause du rouge CI non reproduite |
| Mes données, géométrie de la carte | Réussi | Connexion nommée de ce cas non joignable |
| SQL, types des colonnes, pagination, tables | Deux cas réels réussis | PostgreSQL synthétique local |
| Menus, fermeture au défilement, retour arrière, conversation neuve persistante | Cas du fichier intégral réussis | Pas de certification de panneau complet |
| Publication FR mobile : libellés non repliés | Échec avant, réussite après | État d’erreur de déploiement local, pas de publication fournisseur validée |
| Voix et streaming | Tests UI existants réussis | Doubles existants, pas de validation fournisseur |

Les contrôles unitaires de métadonnées passent 23/23 ; inventaire 6/6 et migrateur 16/16. Une invocation initiale erronée du migrateur avec `node --test` a échoué avant exécution ; la commande correcte Vitest passe. Le build de production local est réussi.

## Gestes et captures de publication

[Mesures des six combinaisons](publication-results.json) : FR/EN à 390×844, 768×1024 et 1440×900. Toutes passent : libellé sur une ligne, bouton non recouvert au centre, absence de débordement horizontal, journaux persistants réellement ouverts puis refermés. Téléphone/tablette : `tap`, hauteur 44 px. Desktop : `Enter`, hauteur 40 px. Le focus DOM est mesuré séparément du hit-test ; aucune certification globale de navigation clavier n’est déduite de ce script.

Captures inspectables en thème clair : [mobile FR après](publication-after-390-fr.png), [mobile EN](publication-after-390-en.png), [tablette FR](publication-after-768-fr.png), [tablette EN](publication-after-768-en.png), [desktop FR](publication-after-1440-fr.png), [desktop EN](publication-after-1440-en.png). Comparer au [mobile FR avant](publication-wrap-before-fr.png), même largeur/hauteur. Le fichier complet E2E exerce aussi les cas de thème clair/sombre existants.

La première exécution complémentaire a réussi les quatre cas téléphone/tablette puis échoué en cherchant le sélecteur mobile sur desktop. Le script corrigé utilise le vrai bouton `tab-add` et l’entrée `feature-deployments` desktop ; seuls les deux cas desktop ont été exécutés ensuite. Aucun délai ni assertion de résultat n’a été assoupli. La commande sans argument couvre les six cas ; un argument numérique sélectionne une largeur.
