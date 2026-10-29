# Preuves synthétiques d'ordre des couches — 29 octobre 2026

## Preuve exécutée et conservée

Les six logs `original-{a,b,c}.log`, `reordered-{a,b,c}.log`,
[cache-observations.json](cache-observations.json) et [receipt.json](receipt.json)
sont copiés sans modification de la preuve locale initiale
`/workspace/lite-selector-evidence/cache-order-proof`, exécutée le 29 octobre 2026.
Ils ne proviennent pas de la variante isolée du protocole ci-dessous.

A→B modifie uniquement START_CMD ; B→C modifie uniquement l'artefact.
Ordre initial : A→B réexécute installation synthétique, COPY et nettoyage ; B→C
réexécute COPY et nettoyage. Ordre réorganisé : A→B conserve ces trois instructions
en cache ; B→C ne réexécute que COPY. Config Docker et fichiers synthétiques sont
identiques entre chaque paire. Aucun export comparatif du filesystem de base.
Les durées locales du reçu ne sont pas des estimations de gain de production.

## Protocole reproductible isolé

[probe.py](probe.py) requiert Python3, Docker/Buildx et la base postgres:17-alpine
DÉJÀ locale. Il inspecte cette base avant toute construction et enregistre son ID
réel, revérifié avant chaque build. Il refuse une sortie existante et utilise un
nonce pour les tags et le WORKDIR : les couches de fixture des essais précédents
ne sont pas réutilisées. Il compare les configurations/fichiers et exige les
statuts CACHED/DONE attendus pour les six variantes.

```sh
python3 docs/bugs/runtime-cache-order-proof-20261029/probe.py --output /workspace/lite-selector-evidence/cache-order-proof-NOUVEL-ESSAI
```

Le script définit seulement BUILDX_CONFIG dans la sortie writable et sélectionne
le socket Docker local. DOCKER_CONFIG, credentials et proxy sont conservés. Pas de
buildx create, de driver nouveau, de docker prune, d'apt ou de commande réseau dans
les fixtures. Build : --pull=false --network=none ; vérification : --pull=never
--network=none --rm. Le processus PostgreSQL ne démarre pas. Tags/cache locaux
conservés pour examen ; aucune ressource cloud créée.

## Échec de validation de la variante isolée

La première exécution de cette variante utilisait par erreur l'ID de configuration
`sha256:...` directement dans FROM. BuildKit l'a interprété comme le dépôt
`docker.io/library/sha256` et a tenté une résolution de registre, refusée
`pull access denied`, avant de construire une couche de fixture. Voir
[isolated-protocol-first-error.log](isolated-protocol-first-error.log).
Les options --network=none/--pull=false ne bloquent donc pas à elles seules toutes
les résolutions de métadonnées de base. Aucune nouvelle tentative immédiate n'a été faite.

Le script a été corrigé pour conserver FROM postgres:17-alpine, comme la preuve
initiale réussie. Avant l'unique reprise supplémentaire autorisée, inspection
locale : ID strictement identique à la base des six succès initiaux ; journal de
l'échec : arrêt à la résolution des métadonnées, aucune instruction de fixture
exécutée. Il s'agissait d'une référence FROM erronée, pas de credentials manquants.

## Validation réussie du protocole corrigé

L'unique reprise autorisée a exécuté les SIX constructions dans une nouvelle sortie
avec nonce, sans réutiliser les couches de fixture précédentes. Tous les contrôles
automatiques ont réussi : configurations complètes identiques par paire, checksums
des fichiers créés identiques, états CACHED/DONE attendus pour chaque instruction.

Preuves récentes : [reçu](isolated-success/receipt.json),
[observations](isolated-success/cache-observations.json), six logs et deux Dockerfiles
avec nonce dans `isolated-success/`. Source locale :
`/workspace/lite-selector-evidence/cache-order-proof-isolated-corrected-20261029`.
Le script versionné est celui exécuté avec succès. Aucun login, pull explicite,
builder supplémentaire, changement de driver/permissions/credentials ni prune.
L'incident de résolution réseau de la variante erronée reste documenté ci-dessus ;
les options réseau ne sont pas présentées comme un blocage du résolveur de base.

## Portée

Mécanisme de cache seulement : ni build réel des services, ni cache distant/inline,
ni débit de registre, ni mesure production. Un service dont le cache est déjà chaud
peut déjà réutiliser ses couches système avec l'ordre initial. Aucun gain de durée
production n'est prouvé. Aucune modification des contrôles de sécurité.
