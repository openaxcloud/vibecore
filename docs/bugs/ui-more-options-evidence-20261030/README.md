# Petit dossier de preuves — More options

Les scripts sont copiés sans modification depuis le diagnostic local. Ils ne sont pas des fichiers `.spec` et ne sont pas enregistrés dans une suite CI. Ils utilisent Chromium local, des composants compilés et des données synthétiques ; aucun résultat production n'est inclus.

## Prérequis explicites

`probe.cjs` et `probe-initial.cjs` référencent les dépendances Playwright/JSZip dans `/workspace/vibecore-ui-panel-usability/node_modules`, la fixture existante `/workspace/ui-settings-usability-browser/runtime-fixture.cjs`, le serveur local `http://127.0.0.1:21999` et `/usr/bin/chromium`. La fixture et le build ne sont pas dupliqués ici. Ils écrivent dans `/workspace/ui-more-options-20261030/<LABEL>`. Ne pas lancer sans coordination avec le propriétaire du serveur partagé.

Exemples du script courant, après disponibilité explicite du serveur/fixture :

```sh
TRACE=0 CPU=4 ACTION=forced LABEL=quiet-recheck node probe.cjs
TRACE=0 CPU=4 EVENTS=1 ACTION=normal LABEL=normal-recheck node probe.cjs
TRACE=0 CPU=4 EVENTS=1 ACTION=native MODE=press-across-release LABEL=press-verified-recheck node probe.cjs
```

`probe-initial.cjs` préserve la version initiale instrumentée ; les traces CPU ×1/×4 ont passé 8/8, tandis que la version peu instrumentée a reproduit trois échecs. Ne pas confondre absence de reproduction sous instrumentation et résolution.

## Lecture des reçus

Chaque JSON correspond à une exécution. `receipt-provenance.json` donne le SHA-256 du reçu complet original et les champs retirés lors de l'export compact. `SHA256SUMS` couvre les fichiers de ce dossier sauf lui-même.

Dans `press-verified-cpu4.json`, seule la famille `actualPressed*` mesure la vraie cible pointerdown. `detachedDuringPress` concerne un ancien handle et peut être vrai alors que la cible effectivement pressée reste connectée. Ne pas réutiliser ce champ comme preuve d'échec ou de succès de la garde.

Les reçus comprennent les échecs et les réussites contradictoires du clic forcé. La capture unique `iphone-se-forced-failure.png` est l'état final après échec, avec données synthétiques.
