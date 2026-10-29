# Logs : états initiaux indépendants, mobile 390×844

Build parent e03b3f856 avant correctif Logs. Recette isolée Chromium tactile, API synthétique, aucun accès client ou secret, aucun changement de source. Navigateur fermé ; serveur parent préservé.

## Résultat : un parcours complet réussi
`mobile-initial/receipt.json` et `probe.cjs` :
1. GET Logs tenu : «Loading logs…», console absente. Chargement distinct de liste vide.
2. Réponses503 : alerte visible «The IDE panel could not be loaded (HTTP 503).» et boutonRetry. Trois GET503 correspondent aux reprises internes existantes, pas à des relances de la recette.
3. Retry200 : alerte supprimée, console rendue ; sélection expliciteSystem après stabilisation,3lignes (2synthèses +1activité).
4. Recherche sans correspondance :0ligne, message «No System logs results match this filter.» ; viderquery restaure3lignes.
5. GET avec statut expliciteAPIempty : console remplacée par «No logs yet», sans alerte ni chargement. Capture390-empty.jpg.

Capture erreur : `mobile-initial/390-error.jpg`. Pas d'injection CSS ni forçage d'état produit. Le fluxSystem synthétise2lignes même sans événements ; utiliser APIstatusempty pour tester le vrai panneau vide est volontairement distinct d'un tableau d'événementsvide.

## Limites et coordination
Recette mobile uniquement ; pasbackend réel, Safari ou production. Le bug de perte de flux System après remplacement de coque/reprise est réservé à l'autre agent : notre choixSystem intervient après stabilisation et ne prétend pas le corriger.

Clear/chargementretardé déjà testés par l'autre agent dans `/workspace/ui847-logs-diagnostic/clear-delay-error-recovery/receipt.json`, lu indépendamment sans rejouer : clear=true,delayedBusy=true,reloadedSystem=true,error=true,recovery=true MAIS after/recoveryBeforeReselect montrent pressed=false/lines0. Son champ globalpass=true ne signifie donc pas absence du défaut de flux ; garder ces états explicites. Aucun doublon de recette1440 réalisé ici.
