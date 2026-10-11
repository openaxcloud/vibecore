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

Le script utilise `gh` authentifié pour télécharger l'artefact du dernier run
réussi de `deploy-main.yml`, sur `main`, dans `openaxcloud/vibecore`, issu de
`push` ou `workflow_dispatch`. Il vérifie aussi l'identité du run, du dépôt et
l'URL du run inscrite dans le manifeste. `--release-run <id>` permet de choisir
un ancien run réussi conservant la provenance d'une image inchangée ; la même
correspondance exacte reste obligatoire. Artefact expiré ou absent, provenance
inconnue, image différente, commit local inconnu ou fetch impossible : code 2.

Cette preuve repose sur l'artefact du workflow de livraison de confiance. Le
script ne revérifie pas lui-même les signatures et n'atteste pas l'état du cluster.
Les anciens tags SHA restent des références de code configurées, sans preuve des
octets servis. Prérequis : Git, Helm et, pour les digests, `gh` authentifié.
