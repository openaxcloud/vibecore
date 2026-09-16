---
id: BUG-API-004
---

## Bug

**P2 — course au provisioning : l'API tape le workspace agent avant que le DNS du Service soit résolvable et rend un `502` sec au lieu d'un état « en cours de provisionnement ».** `GET /api/runtime/workspaces/:id/files?path=.` → **42×** `502 WORKSPACE_AGENT_REQUEST_FAILED` / `getaddrinfo ENOTFOUND workspace-ws-<id>.workspaces.svc.cluster.local`. Le Service et ses endpoints existent bien (créés à la même seconde que le pod) : l'erreur est une fenêtre de propagation DNS, mais elle est rendue à l'utilisateur comme une panne serveur pendant le chargement de l'IDE.

## 📤 Dispatché

☐

## 💻 Codé

☑ 09/09

## ✅ Testé live

☐ **Constaté live 15/08**

## Preuve

Logs API (3 réplicas) sur 15 min : 42 occurrences, horodatages 19:45:16→19:45:20 UTC pour `ws-8837656e73850f1c` (pod+svc créés 19:45:18Z) et 19:47:25 pour `ws-417afdf7cc9ffb2d` (créé 19:47:31Z). `kubectl -n workspaces get endpoints` : endpoints présents et sains après la fenêtre. **Revérifié le 09/09** : la colonne Codé était restée à ☐ alors que le correctif ET sa garde existent. Contrôlé en exécutant les gardes, pas en les lisant — épinglé par `services/api/src/workspace-dns-window.spec.ts` (vertes ce jour). ⚠️ « Testé live » reste ☐ : j'ai vérifié des GARDES, pas un écran.

