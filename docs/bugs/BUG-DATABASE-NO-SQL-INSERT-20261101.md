---
id: BUG-DATABASE-NO-SQL-INSERT-20261101
---

# Database : insérer une ligne sans écrire de SQL

📤 Dispatché : ☑

💻 Codé : ☐ main — complément séparé de #870, validation en cours.

✅ Testé live : ☐ production — données synthétiques locales uniquement.

## Défaut reproduit et correction

Après création d'une table, l'ancien raccourci préparait un INSERT avec des chaînes vides, y compris pour un entier : PostgreSQL rejette réellement cette saisie avec SQLSTATE 22P02. Le nouvel écran propose les colonnes éditables, leurs types, les modes valeur/NULL/défaut et les valeurs automatiques. Les métadonnées inconnues ne deviennent pas implicitement éditables. Les dialectes non PostgreSQL conservent un raccourci explicitement nommé vers l'éditeur SQL.

Une route structurée vérifie projects:write et recherche la connexion dans le projet courant. Elle relit les métadonnées dans une transaction verrouillant la table, omet les colonnes générées/identity, valide les modes et utilise exclusivement des paramètres pour les valeurs. Les identifiants sont échappés, les doublons refusés, les délais de requête/verrou bornés ; aucune donnée de ligne dans l'audit. Les erreurs ne démontent pas le formulaire. Un résultat tardif ne rafraîchit pas un autre projet ou une autre connexion. Une réponse perdue après commit reste incertaine : actualiser avant de réessayer, aucun retry automatique.

Une première recette avancée a établi un second défaut du contrat proposé : une colonne nommée __proto__ envoyée comme clé JSON est rejetée par Fastify avant le handler. La contre-épreuve isolée confirme FST_ERR_CTP_INVALID_JSON_BODY. Le contrat final transmet une liste {column, mode, value?}, sans désactiver la protection JSON globale. Les noms spéciaux restent des chaînes.

## Validation et limites

Revue indépendante statique : autorisations/isolation, modes, brouillons, synchronisation et erreurs relus ; aucun nouveau blocage identifié. Tests backend : 22 réussis, dont transport Fastify et rejets avant connexion. Tests web ciblés : 171 réussis. Typage web, scripts, aides navigateur, Electron et API réussis. L'orchestrateur de typage échoue ensuite sur le lanceur pnpm global (ENOENT création du store hors espace) avant le contrôle des autres packages ; ce n'est pas un verdict de typage de ces packages. La CI exacte reste nécessaire.

Lint du delta UI/BFF/backend dédié : zéro erreur, deux avertissements préexistants UI/BFF. Le fichier historique app.ts conserve 403 erreurs et 13 avertissements, comme sa base ; aucun diagnostic dans la nouvelle route. Pas de reformatage global. Garde i18n inchangé et réussi. Compilation client/SSR réussie. Une invocation du test inventaire utilisait par erreur le suffixe .ts : aucun test exécuté ; la commande corrigée .spec.mjs passe ses 16 tests.

La recette emploie une vraie API Fastify et PostgreSQL 16.15 natif dédié, mais TestApiStore en mémoire pour identités et métadonnées des projets. Elle ne prouve ni persistance Prisma après redémarrage API, ni permissions/provisioning de production. Aucun projet client, secret réel, OAuth ou appel IA utilisé.

La préparation d'une recette Prisma locale reste bloquée : téléchargement public de l'index officiel apt.postgresql.org (bookworm-pgdg/main/binary-amd64/Packages.gz) refusé HTTP 403. Aucun autre chemin, miroir ou nouvelle tentative utilisé. PostgreSQL natif manque de pgvector et des en-têtes de développement ; les migrations ne sont pas amputées. Le service pgvector déjà prévu dans la CI reste une voie de validation à coordonner.

## Recette finale locale

[Reçu navigateur](database-row-form-evidence-20261101/browser-receipt.json) : Chromium compilé1440×1000,768×1000 et390×844, trois passages directs réussis, aucune erreur JavaScript. Création puis insertion simple exécutées à1440. À chaque largeur, contrainteSQL invalide → brouillon conservé et aucune ligne ; correction → insertion confirmée par lecture indépendante ; double clic → une seule requête ; annulation sans insertion ; rechargement retrouve la ligne. Précision numérique, false, NULL versus chaîne vide, défaut versus valeur explicite, identité/génération et offset horaire conservés.

[Navigation interprojet](database-row-form-evidence-20261101/navigation-receipt.json)390 : insertionA réellement commise, réponse navigateur retenue puis libérée après navigationB ; aucune insertionB ni message de succèsA dansB. Cette contre-épreuve utilise deux projets synthétiques et une connexion locale.

Chaîne : #864 → #870 (46c376fab) → #874. #872 a intégré #864 dans main ddac2968a. La première tête847a32e13 ciblait la branche #870 ; ce choix n'activait pas les workflows réservés aux PR vers main (qualité, sécurité et agrégateur). Le complément intègre donc main et sera reciblé vers main pour obtenir ces contrôles, sans modifier #870. Les fichiers Database étaient identiques entre la base de #870 et main ; les nouveaux blocs Skills de main sont préservés. L'index est régénéré. Fusion et livraison restent réservées au coordinateur.

[Zoom natif Chromium200%](database-row-form-evidence-20261101/row-zoom-receipt.json) : innerWidth720, DPR2 et CSSzoom1 ; saisie précise, booléen au clavier, actions accessibles après scroll, aucun débordement et annulation sans soumission. Premier essai : carte Database absente avant ouverture du formulaire, sans erreurJS ; cause non établie, [échec conservé](database-row-form-evidence-20261101/row-zoom-first-failure.json). Après ajout de capturediagnostic au banc, même scénario strict réussi. Ce passage ultérieur ne résout pas l'instabilité initiale. WebKit non disponible dans ce banc ; Safari physique non testé.

Complément de typage sur847a32e13 : les31 scripts workspace ont finalement été exécutés directement avec le compilateur installé et leurs arguments d'origine, tous exit0. Le défaut du lanceur pnpm n'est donc pas un échec de typage des packages.

## Assemblage avec main ddac2968a

Revue indépendante : aucun fichier propre à main altéré ; delta BFF/API/catalogue public identique aux ajouts attendus, blocs Skills conservés. Tests intégrés :193 web/inventaire et22 backend réussis ;36 contrôles TypeScript directs réussis ; build client/SSR et garde i18n réussis. Lint app.ts :405 erreurs/13 avertissements préexistants sur main et exactement les mêmes nombres après intégration.

[Nouvelle recette intégrée](database-row-form-evidence-20261101/integrated/browser-receipt.json) :1440/768/390 réussis directement ; [navigation interprojet](database-row-form-evidence-20261101/integrated/navigation-receipt.json) réussie. Zoom natif200% : [premier chargement refuséHTTP429](database-row-form-evidence-20261101/integrated/zoom-429.json), avant le formulaire ; origine précise du limiteur non établie. Après récupération naturelle (lectureHTTP200), une reprise unique donne [clavier/scroll/annulation verts](database-row-form-evidence-20261101/integrated/zoom-receipt.json), sans modifier les seuils. Ne pas présenter cette série zoom comme sans reprise.
