---
id: BUG-IDE-008
---

## Bug

**P3 — `lost+found` du PVC ext4 est exposé dans l'arbre de fichiers du projet, et sa lecture rend `400`.** Le répertoire système du volume remonte dans la liste des fichiers utilisateur ; le lecteur le refuse ensuite.

## 📤 Dispatché

☐

## 💻 Codé

☑ 09/09

## ✅ Testé live

☐ **Constaté live 15/08**

## Preuve

Logs API : `GET /api/runtime/workspaces/<id>/files/read?path=lost%2Bfound` → **400** (×4, sur deux workspaces distincts). **Revérifié le 09/09** : la colonne Codé était restée à ☐ alors que le correctif ET sa garde existent. Contrôlé en exécutant les gardes, pas en les lisant — épinglé par `services/workspace-agent/src/app.fixes.spec.ts` (vertes ce jour). ⚠️ « Testé live » reste ☐ : j'ai vérifié des GARDES, pas un écran.

