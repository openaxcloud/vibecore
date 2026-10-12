# B-20 et B-21 — protections multi-locataires reprises

## État

| Préparation | Sur main | Testé en production |
|---|---|---|
| Code et tests ciblés repris | Non | Non |

La branche ancienne appelait trois symboles absents et omettait les méthodes de
store et les messages publics nécessaires. Le premier essai HTTP a rendu neuf
échecs, et le typage a confirmé les contrats manquants. Le module complet et ses
dépendances ciblées ont été repris depuis `958dcafa9`, sans reprendre les autres
fonctionnalités de cet ancien commit ni remplacer les stores actuels.

La réservation de créneau déjà livrée est conservée. Elle relit l’état sous
verrou, vérifie réputation et rafale pour le redémarrage et le démarrage à la
demande, puis réserve uniquement un espace inactif. Un espace déclaré RUNNING
mais injoignable ne contourne plus le mur horaire. Les tentatives disposent d’un
registre indépendant des quotas commerciaux, qui subsiste après suppression.

## Mesures locales

- 88 tests API dans cinq suites : décision pure, capacité, modération, vrais appels
  HTTP et états de runtime. Deux nouveaux appels HTTP refusent le démarrage à la
  demande avant toute requête au gestionnaire, pour STOPPED et RUNNING.
- Contre-épreuve : retirer uniquement le contrôle d’admission du helper partagé
  produit trois échecs et 18 succès dans la suite HTTP. Correction restaurée,
  les 88 tests repassent.
- Trois gardes de métriques lisent l’AST TypeScript, y compris les appels
  optionnels, avec témoins positifs dans les trois services examinés. Retirer la
  déclaration `tenant_guardrail_refusals_total` produit un échec et deux succès ;
  restauration : trois succès. L’ancien détecteur par expression régulière
  passait à tort cette contre-épreuve.
- Typage et build de l’API réussis ; typage observabilité réussi. Lint des nouveaux
  modules et tests : zéro erreur. Comparaison ESLint des grands fichiers avec
  main : zéro nouvelle erreur (imports relatifs NodeNext autorisés pour la mesure),
  erreurs préexistantes conservées : API 322 contre 327, Prisma 61, store 111,
  store de test 6. Aucun vert global de lint n’est revendiqué.

## Réserves ouvertes

Le chart garde explicitement `TENANT_GUARDRAILS_ENABLED=false` : ces protections
ne sont pas actives en production. Une variable absente ou différente de `false`
active les contrôles côté API. L’observation des refus et leur effet sur la
publication gratuite doivent précéder une activation.

Les comptes de facturation et dossiers GCP sont des identifiants logiques ; leur
séparation réelle n’a pas été provisionnée. Deux preuves PostgreSQL ont été exécutées sur une base locale isolée après toutes
les migrations : concurrence de deux pools pour le dernier projet disponible,
agrégat des abus sévères malgré 101 incidents anodins et préférences de modération
de tous les membres. PostgreSQL 16.10 avec pgvector 0.8.0 ; image
`sha256:a132765ec351c65111b5b675928a3a0515a466a40f97277329db8b8209ad8bc9`.
Ce résultat n’est pas une preuve de déploiement ni de séparation GCP. Aucun point
B-20 n’est déclaré clos.
