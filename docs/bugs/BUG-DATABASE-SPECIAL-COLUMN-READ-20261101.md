---
id: BUG-DATABASE-SPECIAL-COLUMN-READ-20261101
---

# Database : conserver les noms de colonnes spéciaux et leurs valeurs

📤 Dispatché : ☑

💻 Codé : ☐ main — branche distincte de #874, tête #874 conservée.

✅ Testé live : ☐ production — recettes locales synthétiques seulement.

## Causes reproduites

Le pilote pg installé construit ses lignes objets par affectation de propriétés. Une colonne __proto__ disparaît ; avec une valeur JSON, elle peut changer le prototype de la ligne, sans pollution globale observée. La correction locale demande des lignes tableaux puis reconstruit les objets avec Object.fromEntries avant la sérialisation existante. Le pilote global reste inchangé.

Une recette réelle API/PostgreSQL confirme ensuite texte, JSON, NULL, constructor, prototype, précision numérique, bigint, booléens, tableaux et dates. Mais la première recette de grille390 échoue : React Router/turbo-stream perd encore __proto__ lors du transport du résultat. Cette seconde cause est reproduite avec le sérialiseur installé ; le correctif doit donc protéger aussi ce passage Database et les valeurs JSON imbriquées, sans modifier le sérialiseur global.

## Persistance et CI

Le workflow dédié Scheduled task PostgreSQL utilisait déjà le service pgvector, les migrations complètes et une base database_audit isolée pour huit scénarios. Le passage à douze scénarios conserve toutes ses exigences : tête exacte, arbre propre, sortie zéro, rapport réussi, douze réussites, aucun échec, ignoré ou todo. Les empreintes de l’API et du processus enfant complètent celle de la suite. La revue indépendante a relevé que ce workflow dédié ne figure pas dans required-checks.json du déploiement. Le runner déjà ajouté à Production CI est donc conservé : la duplication est explicite et préserve cette barrière. Il utilise le service CI existant et une base isolée avec contrôles de propriété avant nettoyage.

Le nouveau scénario ferme l’API et le client Prisma initiaux, démarre une API dans un processus enfant distinct, réutilise la session et la connexion persistées et relit par HTTP loopback. Il vérifie aussi des refus de droits. L’arrêt du seul enfant est borné ; une terminaison forcée peut être nécessaire et ne constitue pas une preuve de fermeture gracieuse. Ce n’est pas une recette navigateur après redémarrage ni une preuve production.

Sur la première tête publiée, la suite dédiée a terminé avec une sortie zéro et un rapport réussi ; le contrôle obsolète exigeant huit scénarios a ensuite échoué. L’étape Production CI « PostgreSQL row-form persistence regressions » du run 41303557269 a ensuite réussi pour la tête b106f02f9 (checkout de fusion CI 9b19b6e68ea0f7af0211b50a7ed5d88644ee7a4e) : les logs confirment douze réussites, zéro non-réussite et le nettoyage de la seule base possédée. Le workflow dédié corrigé et la tête finale doivent encore être validés. Le PostgreSQL local n’a pas pgvector. Le téléchargement de l’index officiel PostgreSQL ayant répondu 403 n’a été ni retenté ni contourné. Le téléchargement de l’artefact CI 13082640582 a également répondu 403 sans fichier reçu et reste arrêté. Aucun accès supplémentaire n’est demandé pour utiliser le workflow déjà prévu.

## Validation

Validations locales :190 tests web/runner sur la première tête (dont six tests du runner CI),32 tests API ciblés et22 tests inventaire réussis ; typages web/API/scripts, build client/SSR et garde i18n réussis. Lint des nouveaux fichiers et du delta UI/BFF sans erreur nouvelle ; diagnostics historiques API inchangés. Deux revues indépendantes couvrent le transport local et les gardes/processus. Un premier contrôle de typage a relevé process.disconnect optionnel, corrigé ; le garde i18n a relevé des messages internes, remplacés par des codes techniques sans changer baseline/allowlist.

[Grille réelle compilée](database-special-column-evidence-20261101/grid-receipt.json) :390/768/1440, lecture initiale puis rechargement, six lectures strictes sans reprise ni erreurJavaScript. Noms spéciaux, précision numérique, booléen, JSON lisible etNULL conservés. Table horizontalement défilable ; seules les données synthétiques déjà présentes ont été relues. Le formatage JSON est limité à la lecture, le contrat d'édition reste inchangé.

[HTTP réel](database-special-column-evidence-20261101/http-receipt.json) et [types complémentaires](database-special-column-evidence-20261101/http-extra-types.json) : API Fastify et PostgreSQL16.15 natif réels, métadonnées/authentification TestApiStore en mémoire. La preuve Prisma/processus distincte est obtenue par l’étape PostgreSQL de Production CI mentionnée plus haut, sans l’assimiler à cette recette locale. Aucun projet client ou appel IA ; aucune fusion autonome. Safari/WebKit et navigateur après redémarrageAPI non testés.

La correction BFF transporte uniquement les lignes du résultat Database comme JSON encodé, décodé localement dans la grille avec compatibilité des anciennes réponses. Les clés imbriquées traversent ainsi turbo-stream sans affectation dangereuse. Les données malformées donnent une erreur visible, jamais un succès vide. Aucun changement du pilote ou du sérialiseur global.
