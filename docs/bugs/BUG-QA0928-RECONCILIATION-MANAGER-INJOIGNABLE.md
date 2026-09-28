---
id: BUG-QA0928-RECONCILIATION-MANAGER-INJOIGNABLE
section: "2026-09-28 — Balayage QA avant lancement"
---

## Bug

**GÊNANT — si le workspace-manager est injoignable, démarrer un projet bascule en STOPPED les workspaces VIVANTS des autres projets de l'organisation.**

`reconcileOrphanedActiveWorkspaces` (`services/api/src/app.ts:17546`) libère un créneau quand
`isRuntimeWorkspaceGone(error)` est vrai. Or `isRuntimeWorkspaceGone` (`:16224`) inclut
`isRuntimeManagerUnavailable` — exactement le cas que le commentaire de la réconciliation déclare
interdit : « A TRANSIENT manager fault (502/timeout …) must NOT flip a live workspace to STOPPED:
that would mislabel a running pod and let the org under-count its active quota ».

Conséquence mesurée : le quota `workspaces.active` est sous-compté pendant une indisponibilité du
manager (redéploiement, coupure réseau), et la ligne `Workspace` d'un IDE ouvert dans un autre
onglet affiche `STOPPED`. Conséquences en aval (aperçu, facturation du temps d'exécution) :
**à confirmer** — le manager lit sa propre table `WorkspaceRuntime`, donc pas de suppression de
disque directe.

## Repro (LOCAL, rejouée en isolation)

```sh
# API locale sur 127.0.0.1:3011, aucun workspace-manager, Postgres du projet compose vc-qa0928
node docs/bugs/qa-2026-09-28/repro-reconciliation.mjs
# → {"ligneOccupeeAvant":"RUNNING","demarrageProjet2":502,"ligneOccupeeApres":"STOPPED"}
```

Attendu selon le commentaire du code : créneau gardé → `429`. Obtenu : créneau libéré, ligne
vivante marquée `STOPPED`, démarrage envoyé au manager (`502`).

Non reproduit en production (il faudrait couper le manager).

## Correctif suggéré

Dans la réconciliation, n'utiliser que `managerStatus === 404` ; garder `isRuntimeWorkspaceGone`
(qui inclut l'indisponibilité) pour les opérations d'arrêt idempotentes, où c'est voulu.

## 📤

☐

## 💻

☐

## ✅

☐

## Preuve

Repro locale ci-dessus. Aucun test — point OUVERT.
