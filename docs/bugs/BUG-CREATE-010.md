---
id: BUG-CREATE-010
---

## Bug

**P0 — rouvrir un projet sur un NOUVEL appareil efface le workspace et le reconstruit.** Trace réelle à la réouverture en mobile 390 : `GET /files?path=.` (les fichiers sont là), puis `POST /api/runtime/workspaces`, puis **`DELETE` de chaque fichier** (`README.md`, `index.html`, `package-lock.json`, `package.json`, `src`, `vite.config.ts`), puis `POST /import?targetPath=.`. L'arbre clignote 9 → 8 → 9, `package-lock.json` est détruit, et aucun aperçu n'apparaît en 68 s. **Cause** : la décision de rattachement est `reused && seededThisSession`, et `seededThisSession` vient d'un marqueur `localStorage` **local au navigateur**. Vérifié en deux temps sur le même navigateur : 1ʳᵉ ouverture `seededThisSession:false` → 6 `DELETE` + 1 import ; réouverture `seededThisSession:true` → **0 `DELETE`, 0 import**. Donc le mécanisme marche, mais **tout appareil qui n'a jamais ouvert ce projet reconstruit** — c'est exactement le cas d'Avi qui teste sur son téléphone. ⚠️ Même après un rattachement réussi, **aucun aperçu ne s'affiche** (0 iframe).

## 📤 Dispatché

☑

## 💻 Codé

☑ 09/09

## ✅ Testé live

☐ **Constaté live 17/08**

## Preuve

`reouverture-390.json` (trace des DELETE), sortie du test en deux temps, trace `[workspace] reattach decision` **Revérifié le 09/09** : la colonne Codé était restée à ☐ alors que le correctif ET sa garde existent. Contrôlé en exécutant les gardes, pas en les lisant — épinglé par `app/lib/.server/llm/anthropic-thinking-effectivity.spec.ts`, `app/lib/runtime/workspace-reseed.spec.ts`, `services/api/src/ide-state-files-guard.spec.ts`, `services/api/src/project-manifest-durability.spec.ts` (vertes ce jour). ⚠️ « Testé live » reste ☐ : j'ai vérifié des GARDES, pas un écran.

