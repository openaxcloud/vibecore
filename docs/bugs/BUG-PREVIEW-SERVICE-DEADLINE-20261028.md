---
id: BUG-PREVIEW-SERVICE-DEADLINE-20261028
section: "Preview et runtime"
---

# Le serveur preview actif expire comme une commande ponctuelle

## 📤 Dispatché

☑ 28/10 — diagnostic sur main `58fa0702a`, contenant #821.

## 💻 Codé

☐ — investigation et validation isolée ; aucun correctif livré à ce stade.

## ✅ Testé live

☐ — aucun lancement ni changement du projet client par cette session.

## Preuve et périmètre

Observation production transmise : Vite démarre à 09:02:50 UTC, puis le flux
émet `COMMAND_TIMEOUT` avec une limite de 1800000 ms à 09:32:49. L'aperçu
récupère après relance automatique à 09:33. Des SIGTERM antérieurs au démarrage
existent aussi ; leur cause n'est pas établie par cette preuve.

Le code lance le serveur preview via le même `streamCommand` que les commandes
ponctuelles. `runCommandStream` arme sans distinction la limite absolue
`WORKSPACE_STREAM_TIMEOUT_MS` (30 minutes par défaut), émet ce code d'erreur et
termine le groupe de processus même si l'utilisateur consulte l'aperçu.

Le correctif doit distinguer service preview et commandes bornées, conserver
une échéance d'inactivité, l'arrêt explicite, les plafonds de processus et de
sortie ainsi que les autorisations existantes. La politique d'inactivité du
workspace n'est pas modifiée. Les tests doivent utiliser de vrais processus
et sockets isolés, avec durées réduites, sans les présenter comme recette
production ou comme une observation réelle de trente minutes.

## Correctif préparé

Le workbench marque uniquement le lancement du serveur dev avec
`lifecycle: preview-service`. Les étapes d'installation/préparation et les
commandes agent ne reçoivent pas ce marqueur. L'agent remplace pour ce service
le délai absolu par une échéance renouvelable utilisant la fenêtre existante
`WORKSPACE_DEV_SERVER_GRACE_MS` (dix minutes par défaut). Chaque consultation
`/ports` authentifiée renouvelle cette échéance ; `/health`, une nouvelle
socket et les requêtes refusées ne la renouvellent pas.

Le service est séparé du registre des commandes orphelines. Fermer sa socket
ne le tue pas ; consulter les ports permet de retrouver le même processus.
Sans consultation, même avec une socket ouverte, il expire avec
`PREVIEW_SERVICE_IDLE_TIMEOUT`, SIGTERM puis SIGKILL à cinq secondes si besoin.
L'arrêt explicite escalade après une seconde si SIGTERM est ignoré, dans le
budget de confirmation d'arrêt existant. Une expiration ou un arrêt engagé ne
peut pas être annulé par une observation tardive. La fermeture de l'agent
arrête ses previews suivies. Plafonds, autorisations, contrôles d'abus et idle
policy du workspace restent inchangés.

La route API `ports/watch` doit aussi arrêter ses polls lorsqu'un client ferme
pendant l'autorisation ou le premier poll/probe. L'ancien listener de fermeture
était installé après le premier `await sync()` ; un poll pouvait continuer sans
client et prolonger le service indéfiniment. Le listener précède désormais les
attentes, les polls sont sérialisés et chaque attente est suivie d'une garde.
Une requête déjà engagée peut se terminer ; aucun nouveau cycle ne commence
après fermeture.

## Validation et limites

Reproduction rouge : trois tests de durée échouent avec l'ancien agent, puis
dix tests à vrais processus/HTTP/WebSocket passent avec le correctif. Les
limites sont réduites à 500 ms pour la commande et 1200 ms pour l'inactivité :
ce n'est pas une observation réelle de trente minutes. Sont vérifiés : même PID
et réponse HTTP après reconnexion, expiration sans observation, health et
accès refusé sans renouvellement, commande ordinaire toujours bornée, sortie
naturelle, arrêt malgré SIGTERM ignoré, expiration irréversible et fermeture
de l'agent. Deux tests API rouges sur l'ancienne route deviennent verts ; la
suite finale couvre quatre fermetures/concurrences avec sockets réelles.

La marque est compatible avec les anciens agents : ils l'ignorent et gardent
leur délai historique, sans obtenir une exemption implicite. Le correctif
nécessite donc le nouvel agent et un lancement preview utilisant le nouveau
contrat. Il ne transforme pas un processus déjà lancé ni un pod déjà existant
avec une ancienne image. Aucun redémarrage du workspace client n'est effectué
pour cette validation. Les SIGTERM initiaux observés avant Vite restent non
attribués. Aucun changement aux vignettes/logs de #821.

Validation locale complémentaire : 158 tests de l'agent workspace, 97 tests
workbench/transport et 33 régressions API réussissent. Les dix tests de durée
sont inclus dans la suite agent ; les quatre tests de watcher sont séparés.
La course Stop près de l'échéance a été renforcée et retestée indépendamment.
Typage officiel complet et build web/SSR réussis ; lint web sans erreur avec
52 avertissements préexistants. Les diagnostics historiques des gros fichiers
API/agent et de la spec remote ont été comparés à la base : aucun ajout.
Revue indépendante favorable, dont réexécution des quatorze tests de régression.
Le premier build parallèle a été arrêté par manque de mémoire ; son exécution
séquentielle a réussi. Les liens locaux de packages pointant vers un ancien
checkout ont été corrigés avant le typage final, sans modification du dépôt.
