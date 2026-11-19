---
id: BUG-MANAGER-TERMINAL-PODS-READINESS-20261101
section: "Déploiement et sécurité"
---

# Attestation du manager : distinguer les pods terminaux sans masquer le drainage

## 📤 Dispatché

☑ 01/11 — analyser le refus `STAGED_MANAGER_MANAGER_POD_COUNT` du déploiement
41345864256 sur main41fd. Le stage avait effectué son upgrade ; le rollback1341
a réussi. API finale, rollout final et attestation globale imageID non exécutés.

## 💻 Codé

☑ — correctif local préparé, pas encore livré. Exclure uniquement les pods
Failed/Succeeded dont Ready=False et les états courants des conteneurs sont
Terminated cohérents. Une phase terminale seule, lastState historique, un statut
absent ou contradictoire ne suffisent pas. Tous les autres pods restent comptés,
y compris les anciens et ceux marqués pour suppression. Chaque réplique requise
doit être Running, non supprimée, prête et au digest attendu.

Les compteurs réels du Deployment restent obligatoires. La convergence est
observée dans un budget total de22minutes commencé avant rollout status ; aucun
nouvel upgrade ni retry de commande/autorisation/JSON. Chaque lecture reçoit le
délai restant. Un timeout reste un échec avec le dernier diagnostic structurel.

Diagnostic borné à16pods et2owners/pod : compteurs, identités, phases et booléens,
jamais env, labels/annotations arbitraires, messages ni chaînes imageID brutes.
Le reçu de succès contient desired/active/terminalExcluded/observations et le reçu
du Job de migration déjà vérifié ; ce dernier n’atteste pas le ledger Prisma.

## ✅ Testé live

☐ — aucune mutation cluster ni recette production effectuée pour ce correctif.

## Preuves et limites

Contre-épreuve locale sur le helper initial : deux répliques prêtes au bon digest
plus un ancien pod terminal conservé provoquent un faux refus de comptage.
Un ancien Running/Ready en suppression était inversement ignoré. Les tests
couvrent désormais ces deux phases, les contradictions, le drainage, HPA,
compte exact, digest, absence, limites du diagnostic et refus sans retry.
Le bundle est reconstruit avec la dépendance yaml physique, sans préfixe d’un
autre workspace, et vérifié reproductible. Les workflows et permissions restent
inchangés ; aucune chaîne de propriétaires ReplicaSet nouvelle n’est imposée.

La sélection reste name+instance, identique au chart. Un pod étranger non terminal
n’est pas caché par un filtre de révision ; la chaîne ownerUID n’est toutefois
pas une nouvelle attestation de ce lot. Les UID sont diagnostiques uniquement.

Les pods, phases et comptes réels de l’échec41fd restent inconnus. Ces défauts
sont démontrés synthétiquement, sans attribution certaine de la cause production.
Source primaire des phases et de la conservation des pods terminaux :
https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/#pod-phase
https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/#garbage-collection-of-pods


## Complément diagnostic — livraison main1e64

La livraison suivante, après intégration de la correction de readiness, s’est
arrêtée avec `STAGED_MANAGER_COMMAND_FAILED` après24min04. Le rollback vers1343
a réussi, avec sept rollouts confirmés selon les preuves du coordinateur. La
commande qui a échoué et sa cause restent inconnues : la durée n’établit pas
un timeout. Le reçu manager-stage n’est pas accessible par le canal actuellement
autorisé ; aucun transfert alternatif n’a été tenté.

Un correctif **d’observabilité uniquement** est préparé séparément. Les neuf
opérations existantes reçoivent des identifiants et phases constants. En cas
d’échec, le log expose uniquement le statut de sortie entier, le signal et le
code OS s’ils appartiennent aux listes fermées, ainsi que le dernier diagnostic
readiness déjà filtré lorsqu’il existe. Les valeurs inconnues restent nulles.
Ni texte d’erreur fournisseur, arguments, stdout/stderr, environnement, secrets
ou valeurs Helm ne sont publiés. Gardes, commandes, délais, permissions et
politique de retry restent inchangés.

Contre-épreuve CLI locale avec un faux exécutable Helm quittant7 : l’ancien
bundle affiche seulement le code générique ; le nouveau indique l’opération
read-release-manifest, sa phase preflight et le statut7, sans les canaris placés
dans les sorties et l’environnement. Les31tests historiques et17nouveaux cas
passent, soit48/48 sans test ignoré ; lint et bundle reproductible validés.

Ce complément ne corrige pas une cause de panne encore inconnue et n’autorise
pas un nouveau déploiement aveugle. Prochain point : PR diagnostic validée puis
obtenir les preuves de l’opération réelle par un accès autorisé. Aucune nouvelle
mutation cluster n’a été exécutée pour ces tests.


## Complément local du 4 novembre — réponses JSON invalides

Les quatre lectures JSON Kubernetes sont désormais associées à des identifiants
fixes (déploiement conservé, Job de migration, Deployment manager, pods manager).
Une réponse invalide produit `STAGED_MANAGER_JSON_INVALID` avec opération et phase,
sans contenu brut ni message SyntaxError. Les erreurs de commande restent traitées
avant le parsing ; aucune commande, permission, garde, durée ou politique de retry
ne change. Huit contre-tests avec sentinelle privée échouent avant correction.
Le test historique conserve l'arrêt immédiat, sans pause ni répétition.

Le parent a lu le reçu de l'artefact 13105703664 : phase
`migration-job-verified`, succeeded=1, Complete=true. Cela localise la progression
mais n'identifie pas la commande fautive et ne démontre pas une erreur JSON en
production. Aucun nouveau téléchargement, appel IA, push, CI ou déploiement dans
ce complément local.


## Échec observé af0ea860 — 4 novembre 2026

Run41853078231, job126671968610, terminal failure. Le diagnostic à16:20:05
rapporte trois pods Running/Ready au digest attendu et douze pods Failed du
ReplicaSet6c9ccf8f84, sans suppression, non reconnus terminaux. Les compteurs du
Deployment sont tous3 et sa génération observée17589 concorde. Rollback vers
le contenu1345 confirmé16:21:14, étape réussie16:21:22. Aucun nouveau lot livré.
La forme des conditions et états conteneurs des douze Failed n'a pas été
collectée : aucune attribution à Evicted, NodeLost ou condition manquante.

Correction locale ciblée : Ready est optionnel dans PodStatus. Un pod terminal
avec tous les états courants explicitement arrêtés ne doit pas être compté
simplement parce que Ready est absent. Absence, liste vide et autres conditions
sont acceptées ; Ready=True, Unknown, malformé et tous états actifs restent
bloquants. L'absence de containerStatuses reste bloquante. Init/ephemeral actifs,
les pods en suppression actifs, compte exact, disponibilité et digests restent
vérifiés. Aucun pod supprimé, aucune permission, commande ou durée modifiée.

Le diagnostic ajoute uniquement des catégories fixes : phaseTerminal,
readyCondition, regular, init, ephemeral. Il distingue champs absents, invalides,
incomplets et états non arrêtés sans publier messages, valeurs ni raisons libres.
Trois nouveaux contre-tests échouent avant correction ; la suite finale inclut
également les variantes actives en suppression et Ready inconnu/malformé.

Sources primaires :
- https://github.com/kubernetes/api/blob/v0.34.0/core/v1/types.go#L4944-L4951
- https://github.com/kubernetes/kubernetes/blob/v1.34.0/pkg/kubelet/status/status_manager.go#L498-L566

Limite : Kubernetes peut conserver des états Waiting pour des conteneurs jamais
initialisés ; ce correctif conservateur ne les exclut pas. Une phase Failed seule
ne prouve pas l'arrêt physique d'un processus sur un noeud perdu. Sans observation
supplémentaire des douze pods, la correction locale n'est pas une preuve de
résolution de cette livraison. Pas de nouvelle reconstruction de production
lancée uniquement pour présumer la cause.
