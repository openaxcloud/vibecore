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

Le service pgvector déjà présent dans Production CI est réutilisé par un runner dédié, sans nouvelle image, dépendance ou credential. Il refuse une URL différente du service CI exact, une base database_audit préexistante ou des paramètres d'URL détournant l'hôte. Les migrations sont complètes. La suppression nécessite CREATE confirmé, OID, propriétaire et marqueur correspondant ; une création incertaine reste au nettoyage du service éphémère.

Le runner exige douze scénarios réussis et zéro ignoré. Le nouveau scénario ferme l'API et le client Prisma initiaux, démarre une API dans un processus enfant distinct, réutilise la session et la connexion persistées et relit par HTTP loopback. Il vérifie aussi des refus de droits. L'arrêt du seul enfant est borné ; une terminaison forcée peut être nécessaire et ne constitue pas une preuve de fermeture gracieuse. Ce n'est pas une recette navigateur après redémarrage ni une preuve production.

Les six tests unitaires de garde/rapport sont exécutés localement. L'exécution des douze scénarios PostgreSQL/Prisma doit être confirmée en CI : le PostgreSQL local n'a pas pgvector. Le téléchargement de l'index officiel PostgreSQL ayant répondu403 n'a été ni retenté ni contourné. L'utilisation du service CI existant a été explicitement autorisée séparément.

## Validation

Validations locales :190 tests web/runner,32 tests API ciblés et22 tests inventaire réussis ; typages web/API/scripts, build client/SSR et garde i18n réussis. Lint des nouveaux fichiers et du delta UI/BFF sans erreur nouvelle ; diagnostics historiques API inchangés. Deux revues indépendantes couvrent le transport local et les gardes/processus. Un premier contrôle de typage a relevé process.disconnect optionnel, corrigé ; le garde i18n a relevé des messages internes, remplacés par des codes techniques sans changer baseline/allowlist.

[Grille réelle compilée](database-special-column-evidence-20261101/grid-receipt.json) :390/768/1440, lecture initiale puis rechargement, six lectures strictes sans reprise ni erreurJavaScript. Noms spéciaux, précision numérique, booléen, JSON lisible etNULL conservés. Table horizontalement défilable ; seules les données synthétiques déjà présentes ont été relues. Le formatage JSON est limité à la lecture, le contrat d'édition reste inchangé.

[HTTP réel](database-special-column-evidence-20261101/http-receipt.json) et [types complémentaires](database-special-column-evidence-20261101/http-extra-types.json) : API Fastify et PostgreSQL16.15 natif réels, métadonnées/authentification TestApiStore en mémoire. Cela ne prouve pas encore la persistance Prisma/processus : les douze scénarios dédiés doivent être exécutés en CI. Aucun projet client ou appel IA ; aucune fusion autonome. Safari/WebKit et navigateur après redémarrageAPI non testés.

La correction BFF transporte uniquement les lignes du résultat Database comme JSON encodé, décodé localement dans la grille avec compatibilité des anciennes réponses. Les clés imbriquées traversent ainsi turbo-stream sans affectation dangereuse. Les données malformées donnent une erreur visible, jamais un succès vide. Aucun changement du pilote ou du sérialiseur global.
