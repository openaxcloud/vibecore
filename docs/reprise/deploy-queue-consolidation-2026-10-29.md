# Consolidation locale des contrôles avant déploiement

Base annoncée par la session principale : main `63e66383055c632865b7ebd27df19aa1a6f6f37f`.
Lot préparé dans une copie isolée ; aucune publication ni exécution cloud.

## Modification

Les étapes Install gitleaks, Secret scan, policy signature (avec son auto-test et
les tests diagnostics de rollout), policy exact-SHA (avec son auto-test) passent
du job preflight-gates à la fin de release-gate, après le verdict exact-SHA.
Les quatre blocs de commandes sont conservés dans une seule étape plafonnée à
15 minutes, avec des groupes de logs nommés. Ils utilisent le runner et le checkout SHA
unique déjà vérifié. Le build dépend explicitement de resolve-target et release-gate.

Le timeout du job passe de 100 à 115 minutes, conservant l'enveloppe totale des
anciens jobs (100 + 15). Le plafond collectif de 15 minutes des contrôles
preflight est conservé par timeout-minutes au niveau de leur unique étape.
Les commandes et la politique d'attente des checks restent inchangées. Aucune permission, taille de machine, ressource
cloud, signature, vérification de digest ou procédure de rollback ne change.
Les permissions release-gate restent contents:read/actions:read ; aucun id-token,
aucune authentification cloud. GITHUB_TOKEN reste limité à l'environnement de
l'étape de verdict ; aucun env de job ajouté aux scans/policies. Le checkout
release-gate utilise persist-credentials:false : son token n'est pas conservé
dans la configuration Git pour les contrôles suivants. Ce job n'utilise ensuite
aucune commande Git distante (seulement rev-parse HEAD).

## Mesure et limites

Mesures transmises par la session principale : #828 a attendu 31 min 30 pour
preflight, puis 5 min 09 pour build ; construction web 11 min 29. Pour #827,
l'ensemble des attentes de jobs représentait seulement 10 secondes.

Contrefactuel structurel : cette modification supprime une allocation de runner,
son attente et un checkout redondant. Les 31 min 30 observées sur #828 sont une
attente candidate éliminée, pas une durée gagnée démontrée : l'ordonnancement des
autres jobs peut varier. Aucun gain de production n'est mesuré ni promis.
L'attente du build, le coût de construction et les caches restent hors périmètre.

## Validation

La suite release-gate teste le workflow réel et des mutations négatives : chaque
contrôle supprimé, ordre inversé, scan conditionnel/non bloquant, code de sortie
neutralisé, token étendu, permission WIF, authentification cloud, deuxième checkout,
budget réduit et dépendances perdues. Les auto-tests du validateur exercent les
mêmes mutations ; les protections existantes de signature/rollout restent testées.
Les tests sont locaux et synthétiques : aucun appel fournisseur, aucune recette
cloud ou production. Une revue indépendante et CI sur la future tête sont requises
avant promotion. Ce lot n'est pas une condition à la livraison urgente en cours.
