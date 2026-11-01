# Coût IA affiché — 1 novembre 2026

L'observation utilisateur (294 781 jetons entrants, 696 641 sortants, estimation
à zéro) a conduit à une divergence de contrat vérifiable : `/ai/usage` retourne
le registre `AiCostLedger` avec `costCents`, tandis que `BaseChat.tsx` additionnait
`costUsd ?? cost ?? 0`. Une ligne de 123,45 cents donnait donc zéro dans ce panneau.

Le panneau utilise désormais un helper typé qui convertit les cents USD en
dollars. Il conserve un zéro explicitement renseigné, accepte l'ancien champ
explicitement dénommé `costUsd`, et affiche une estimation indisponible/incomplète
si un coût manque ou est invalide. Une réponse vide ou en erreur ne devient pas
un coût nul. Le champ ambigu `cost` n'est pas interprété comme des dollars.

La description FR/EN précise le périmètre réel du endpoint : organisation, tous
projets confondus, trente derniers jours. Une estimation n'est pas une facture.
Aucun coût réel n'est déduit des nombres de jetons de la capture et aucune
reconstitution de montant historique n'est revendiquée.

Validation locale : 11 tests du helper réussis (unités, priorité des cents, zéro
explicite, coûts partiellement manquants, absence, données invalides, alias de
jetons), typage strict du helper/tests et lint des quatre fichiers modifiés
réussis. Formatage de BaseChat vérifié sans réécriture générale. Aucun changement
backend, paiement, prix ni crédit. La recette navigateur/production demeure à
effectuer après livraison ; ceci constitue une correction locale du contrat
d'affichage, pas une preuve de facturation fournisseur.


## Complément de revue : organisation explicite

La revue a également trouvé une divergence de périmètre : `/ai/usage` choisissait
la première organisation accessible, alors que le panneau appartient à un projet
potentiellement situé dans une autre organisation. Le loader transmet désormais
l'identifiant d'organisation du projet, et l'API accepte ce filtre uniquement
après `requireOrg(..., 'usage:read')`. Une organisation explicitement interdite
ne déclenche aucun repli. Les appels historiques sans filtre restent compatibles.
Le billing du panneau utilise le même identifiant projet sans fallback vers
`orgs[0]` ; si cet identifiant manque, aucune requête de coût/billing n'est envoyée.

Contre-épreuves : quatre tests API et deux tests du loader échouaient avant
correction. Après correction : neuf tests API (quatre de portée et cinq de
provenance) réussis ; 53 tests des quatre suites ide-panel contenant settings
réussis. Typage API complet réussi, lint loader/tests sans erreur (un avertissement
préexistant dans le loader). Le formatage global historique de `app.ts` comporte
des divergences ; aucune réécriture hors de la route `/ai/usage` n'est incluse.
