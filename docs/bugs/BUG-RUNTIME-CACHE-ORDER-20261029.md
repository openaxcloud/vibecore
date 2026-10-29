---
id: BUG-RUNTIME-CACHE-ORDER-20261029
---

# Des paramètres applicatifs invalident des couches système indépendantes

📤 Dispatché : ☑ 29 octobre 2026, optimisation distincte de la livraison #850.
💻 Codé : ☑ Correctif préparé dans un lot distinct ; non fusionné et non livré.
✅ Testé live : ☐ Aucun gain de production mesuré ; preuve synthétique locale uniquement.

## Constat

Dans `infra/docker/node-service.Dockerfile`, `ARG/ENV START_CMD` précédaient
l'installation système et kubectl, alors que leurs commandes n'utilisent pas cette
variable. Les services utilisent plusieurs commandes de lancement. De plus, la
suppression de npm/corepack suivait la copie des artefacts `/runtime`, malgré son
indépendance vis-à-vis de ces artefacts.

Le dernier relevé communiqué donne runtime 32 min 14, web 11 min 01, agent 3 min 07,
admin 6 min 01, soit 52 min 23. Aucun taux de cache de production n'est connu : ces
durées ne permettent pas de chiffrer un gain attribuable à ce changement.

## Correction minimale

Déplacer la copie `/runtime` après la suppression de npm/corepack, puis déclarer
`ARG/ENV START_CMD` après tous les RUN et COPY, avant USER. Les commandes apt upgrade,
l'installation et le checksum kubectl, PATH, USER, CMD, les sources app et la base
deps restent identiques. Aucun changement de permissions, de parallélisme, de
ressources ou de contrôle de sécurité.

## Preuve locale et protocole

Preuves et protocole versionnés : [README](runtime-cache-order-proof-20261029/README.md),
[six logs et observations](runtime-cache-order-proof-20261029/cache-observations.json),
[reçu initial](runtime-cache-order-proof-20261029/receipt.json) et
[script isolé](runtime-cache-order-proof-20261029/probe.py). La variante isolée corrigée
a également réussi six constructions et toutes ses assertions après une unique
reprise autorisée ; voir le [reçu récent](runtime-cache-order-proof-20261029/isolated-success/receipt.json).
Les preuves initiales et récentes restent distinctes ; la tentative de résolution
réseau due au FROM erroné reste explicitement documentée dans le README. Base déjà locale postgres:17-alpine ; aucun téléchargement,
`--pull=false --network=none`, conteneurs de vérification avec `--pull=never`,
`--network=none` et `--rm`. Le processus PostgreSQL n'est pas lancé.

Pour chaque ordre, construire A puis B avec seul START_CMD modifié, puis C avec
seul artefact modifié. Dans l'ordre initial, A→B réexécute installation synthétique,
COPY et nettoyage ; après réorganisation, les trois sont CACHED. B→C réexécute le
nettoyage initialement ; après réorganisation, seul COPY est réexécuté. Les Config
Docker finales et tous les fichiers créés par la fixture sont identiques entre les
paires. Pas de comparaison intégrale des fichiers hérités de la base.

La première tentative n'avait rien construit : état Buildx impossible à écrire dans
`/home/agent/.docker/buildx`. Une reprise autorisée a utilisé le paramètre officiel
`BUILDX_CONFIG` dans le répertoire de preuve writable, sans modifier DOCKER_CONFIG,
credentials, proxy, daemon ou permissions. Les six constructions ont alors réussi.

## Validation et limites

Gardes existantes exécutées : 17/17 tests verts (élagage pnpm 8, image de base
à jour 7, npm hors image 2), journal `/tmp/runtime-cache-order-guards.log`.
Contrôle textuel réussi : seuls les déplacements demandés et un commentaire ont
changé ; les autres instructions sont identiques. Preuve `product-order-check.json`
et diff `product-order-only.patch` dans le répertoire de sonde. La sonde
prouve uniquement le mécanisme d'invalidation : pas de compilation Node réelle,
pas de cache distant/inline mesuré et pas de nouveau build des images produit.

Avant promotion : revue indépendante, CI et validation des images exactes selon
le pipeline normal. Attendre la livraison #850 avant toute fusion de ce lot.
Comparer ensuite les couches CACHED et les durées à contexte comparable ; aucune
promesse de durée ou de gain n'est formulée.

Un service dont le cache est déjà chaud peut déjà réutiliser les couches système
avec l’ordre initial. Le gain supplémentaire dépend donc du contexte et reste
non mesuré en production. Le protocole versionné et ses limites sont décrits dans
le README lié ci-dessus.
