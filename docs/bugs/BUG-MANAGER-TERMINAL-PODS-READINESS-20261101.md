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
