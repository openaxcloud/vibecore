---
id: BUG-AGENT-002
---

## Bug

**P1 — les 429 ne sont pas gérés sur le chemin d'écriture de l'agent, et sont rejoués.** `app/lib/runtime/retry.ts` sait pourtant classer les 429 (`TRANSIENT_STATUSES`, `isHardQuota429`) et son commentaire documente déjà l'incident (« observed in prod as 100+ file-write retries »), mais `withRuntimeRetry` **n'est branché nulle part sur ce chemin** (seulement `ProjectWorkspaceProvider.tsx:174/187`, `workbench.ts:942`, `workbench.ts:3259`). Résultat : `RemoteRuntimeAdapter.#requestOnce` (`packages/runtime-remote/src/index.ts:954-978`) ne retient que `502/503/504` comme transitoires et remonte le 429 sec ; `ActionRunner.#runActionWithRetry` (`action-runner.ts:530-570`) le rejoue **3×** sans respecter `Retry-After` → amplification supplémentaire. Un seul utilisateur consomme ~37 % de son budget minute (`API_RATE_LIMIT_MAX ?? 2000`, `services/api/src/app.ts:8023`) sur une seule génération.

## 📤 Dispatché

☐

## 💻 Codé

☑ 09/09

## ✅ Testé live

☐ **Constaté live 15/08**

## Preuve

Logs API sur la génération ci-dessus : **32× `429` sur `POST /projects/<id>/snapshots`** et **10× `429` sur `POST /api/runtime/workspaces`**, pour un seul utilisateur en usage nominal. Code identique sur `origin/main`. **Revérifié le 09/09** : la colonne Codé était restée à ☐ alors que le correctif ET sa garde existent. Contrôlé en exécutant les gardes, pas en les lisant — épinglé par `packages/runtime-remote/src/index.spec.ts` (vertes ce jour). ⚠️ « Testé live » reste ☐ : j'ai vérifié des GARDES, pas un écran.

