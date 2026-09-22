---
id: BUG-CREATE-006
---

## Bug

**P2 — le démarrage à froid renvoie 502 au lieu d'un état réessayable.** `GET /api/runtime/workspaces/<id>/files?path=.` répond **502 `WORKSPACE_AGENT_REQUEST_FAILED`** pendant la fenêtre DNS (`getaddrinfo ENOTFOUND workspace-ws-….workspaces.svc.cluster.local`) : 5 à 7 erreurs console rouges à chaque première ouverture, sur les 3 chemins de création testés. La console d'un investisseur qui ouvre les outils de développement est rouge dès la création.

## 📤 Dispatché

☑

## 💻 Codé

☑ 10/09

## ✅ Testé live

☐ **Constaté live 17/08**

## Preuve

`parcours-vide-1440.json`, `parcours-modele-1440.json`, `parcours-prompt-1440.json` **REPRIS LE 10/09 — LE CODE ÉTAIT DÉJÀ BON, C'EST LA GARDE QUI MANQUAIT (règle 15).** La branche qui rend `425 WORKSPACE_NOT_STARTED` pendant la fenêtre DNS existe et fonctionne. Mais le test censé la tenir affirmait `expect([425, 502]).toContain(...)` — une tolérance qui passe dans LES DEUX MONDES, avec et sans le correctif : elle ne gardait rien. Et il n'exerçait que `/files/read?path=tree`, alors que le signalement nomme `GET /api/runtime/workspaces/<id>/files?path=.` — deux handlers distincts, et c'est le second que l'IDE appelle à l'ouverture. Corrigé : l'assertion exige `425` ET le code `WORKSPACE_NOT_STARTED` (c'est le CODE que `TRANSIENT_CODES` consomme pour continuer d'attendre ; un 425 portant autre chose laisserait l'erreur remonter), et un cas couvre la route du rapport. épinglé par `services/api/src/tests/lecture-declenche-provisionnement.spec.ts`. Contre-épreuve : branche 425 neutralisée → **les deux cas rougissent**. ⚠️ Reste ouvert et à traiter à part : la fenêtre « DNS résolu, agent pas encore à l'écoute » rend toujours 502, et le proxy d'aperçu comme les sockets ne passent pas par `agentRequest` — donc pas par cette branche.

