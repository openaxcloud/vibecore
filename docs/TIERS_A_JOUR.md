# `tiers-a-jour` : migration du contrat de sortie

Ce script compare les **références sources configurées dans Helm** au dernier
commit de chaque tier sur `main`, actualisé par un fetch explicite avant mesure.
Il ne vérifie ni les pods en cours d'exécution, ni leurs `imageID`, ni la réussite
d'un rollout. Des références courantes ne prouvent donc pas une production à jour.

## Sortie JSON et codes de retour

`node scripts/tiers-a-jour.mjs --json` renvoie désormais un objet, et non le tableau
historique. Les consommateurs doivent lire **`.services`** à la place de la racine.
Les autres champs sont `scope: "configured-source-references"`,
`runtimeVerification: "not-performed"`, `verdict: "unverified"` et
`configuredSourcesCurrent` (booléen). Par défaut, le code de retour est **2**,
même si toutes les références configurées sont courantes : l'exécution réelle
reste non vérifiée.

Pour demander explicitement la seule comparaison des références :

```sh
node scripts/tiers-a-jour.mjs --configured-only --json
```

Dans ce mode, **0** signifie `configured-current`, **1** signifie
`configured-behind`, et **2** signifie preuve ou référence invérifiable.
`runtimeVerification` reste `not-performed`. Une erreur avant comparaison peut
ne produire aucun JSON ; ne jamais interpréter une sortie vide comme un succès.

## Preuve des images épinglées par digest

Un digest de service (ou son repli global Helm) prime sur le tag. Chaque digest,
y compris celui du workspace-agent, doit correspondre exactement à une entrée
unique du manifeste : service, registre, image, digest et SHA source complet.
La provenance doit être connue et la signature marquée vérifiée par le workflow.
Aucun digest n'est tronqué en SHA source ; aucun tag mutable n'est deviné.

Le script utilise `gh` authentifié pour télécharger les artefacts des **dix
plus récents runs réussis au maximum** de `deploy-main.yml`, sur `main`, dans
`openaxcloud/vibecore`, issus de `push` ou `workflow_dispatch`. La recherche est
bornée à une page de dix runs, sans pagination ni recherche supplémentaire.
Il vérifie l'identité de chaque run, du dépôt et l'URL inscrite dans le manifeste.
Les preuves sont résolues par image/digest : le web peut provenir d'une livraison
récente, et les images inchangées de manifestes antérieurs. Une entrée explicitement
sans provenance ne remplace pas une attribution connue pour les mêmes octets.

Tous les artefacts sélectionnés sont examinés, même après avoir trouvé une source
pour chaque image. Deux SHA sources différents pour la même image/digest sont
contradictoires et entraînent un refus. Une seule attribution cohérente est requise
par image configurée. Une preuve malformée ou non fiable n'est pas ignorée.

On peut choisir explicitement un ensemble de runs (dix maximum, sans doublons) :

```sh
node scripts/tiers-a-jour.mjs --configured-only --json \
  --release-run 38165474193 --release-run 38156140310
```

Cette sélection remplace la recherche automatique ; elle ne contourne aucune
vérification. Artefact sélectionné expiré ou absent, échec de lecture, provenance
encore inconnue, contradiction, image différente sans preuve correspondante,
commit local inconnu ou fetch impossible : code 2. L'absence de contradiction est
établie uniquement dans cet ensemble borné, pas sur tout l'historique du dépôt.

Cette preuve repose sur l'artefact du workflow de livraison de confiance. Le
script ne revérifie pas lui-même les signatures et n'atteste pas l'état du cluster.
Les anciens tags SHA restent des références de code configurées, sans preuve des
octets servis. Prérequis : Git, Helm et, pour les digests, `gh` authentifié.

## Régressions typées

Le harnais `scripts/tiers-a-jour.regressions.ts` est inclus par le glob TypeScript
racine `**/*.ts` et par `scripts/**/*.ts`. La suite Vitest existante
`tiers-a-jour.spec.mjs` importe ces mêmes cas, sans copie parallèle.

```sh
pnpm exec tsc --project tsconfig.tiers-a-jour.json
node scripts/tiers-a-jour.regressions.ts
```

L'exécution directe exige Node 22.18+ ou 24+ (effacement natif des types) ; Vitest
transforme le fichier TypeScript dans sa suite native. Le projet ciblé étend les
options strictes du projet racine, utilise les déclarations Node réelles et ne
remplace pas la vérification complète du dépôt.

Le vérificateur opérationnel reste un point d'entrée `.mjs`. Son import dynamique,
les fixtures JSON et les réponses JSON du CLI passent par des frontières `unknown`
et des validations de forme exécutées avant tout usage typé. Cela ne prétend pas
convertir son implémentation en TypeScript. `TIERS_MODULE` reste disponible pour
exécuter les contre-épreuves sur une version historique du vérificateur.
