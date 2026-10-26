# Portfolio demandé remplacé par un starter statique

## Défaut reproduit et portée

Sur la base `951ceb8d5653bee4df30b010753c859c0c4a44c0`, la demande :

> Créez un portfolio soigné avec études de cas, articles de blog et formulaires de contact dédié à l’ia

sélectionne automatiquement `shouldUsePortfolioTemplate` lorsque les fichiers
sont vides ou correspondent au starter. La route `api.chat.ts` émettait alors
les fichiers du portfolio statique, une consommation de zéro jeton et les
marqueurs de fin, puis quittait le tour avant le générateur.

Le contenu produit comporte `lang="en"`, `hello@example.com`, « Have a product
worth sharpening? », Work/Services/Contact, aucun fichier de blog ni formulaire.
Ces constats portent sur le template complet inspecté localement, pas sur une
déduction à partir d'une seule section d'une capture utilisateur.

Le parcours création enveloppe la demande avec `consignePremierProjet`. La
consigne contient « charts or tables where the data calls for them ». La regex
`projectNameFromPrompt`, qui cherche un nom après `for`, `called` ou `named`
dans le message entier, capture alors **them**. Le prompt brut seul produisait
**Alex Morgan**. Les fonctions exportées réelles reproduisent les deux cas.

[Preuve compacte et chemins du code à la base inspectée](portfolio-generation-2026-10-26/reproduction.json).

Les liens du projet et de sa preview ont répondu 403 depuis l'environnement
d'enquête. Aucun historique authentifié ni fichier du projet réel n'a été lu.
La concordance avec les captures étaye cette cause, mais ne remplace pas la
preuve d'exécution historique. Aucun mauvais workspace ou cache croisé n'a été
établi ; « cached template » désigne ici un contenu fixe dans le dépôt.

## Correctif

La route chat ne remplace plus une demande de création par ce portfolio sur la
base de mots-clés. Elle passe par le pipeline de génération existant avec le
message complet. Les quotas, la planification, les autorisations, le contexte de
fichiers et la fermeture des transports restent ceux du parcours normal.

Il ne s'agit ni de traduire le starter ni de renommer « them » : cela laisserait
les demandes blog, formulaires et spécialisation IA sans traitement. Les
utilitaires de template restent dans le dépôt, mais ne court-circuitent plus la
route de génération.

## Validation sans appel payant

Le test `api.chat.portfolio-generation.spec.ts` invoque la vraie action et le vrai
flux du SDK. Seules les frontières modèle/API/MCP/mémoire/référence web sont
substituées par des fixtures ; toute requête réseau non prévue fait échouer le
banc. Le modèle de test émet un artefact synthétique, pas un site présenté comme
une génération réelle.

Avant correction : les cas FR exact et EN sur projet neuf échouent avec zéro
appel au modèle et émission du starter ; les témoins projet existant et quota
refusé passent. Après correction : les cinq cas passent, avec en plus le prompt
FR enveloppé par le véritable helper de création. La demande est transmise au
modèle, les fichiers existants restent dans le contexte, et un quota refusé
interdit toujours la génération.

La qualité d'un nouveau site généré en production n'est pas certifiée par ce
banc. Aucun appel fournisseur payant, aucune modification du projet utilisateur,
aucune relance de sa génération et aucun nouveau credential n'ont été effectués.
Le projet déjà créé n'est pas réparé rétroactivement par ce changement.

## Coordination

Branche séparée de #805, aucun `app.ts`, aucune route Git/GitHub ni index partagé
modifié. #799 conserve la priorité d'intégration. Les nouveaux fichiers et la
suppression du raccourci de `app/routes/api.chat.ts` forment le périmètre du lot.

Validation locale : 100 tests ciblés passent dans 12 fichiers, revue indépendante
favorable, build web/SSR et commande officielle `pnpm typecheck` réussis, lint
0 erreur / 52 avertissements existants. Une tentative directe de typage du
monorepo a épuisé son heap local ; la validation officielle partitionnée a
ensuite réussi sans modification des limites CI.
