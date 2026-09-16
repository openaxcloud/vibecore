---
id: BUG-RUNTIME-DIVERGENCE
section: "2026-08-12 — Lot Avi « les bases » (5 bugs, priorité ABSOLUE)"
---

## Bug (mots d'Avi)

« **Quand j'ouvre un projet, n'importe quel IDE, ça recharge et reconstruit le projet au lieu de voir directement l'app dans preview comme on l'a laissée.** »

## 📤 Dispatché

✅ 12/08

## 💻 Codé

☑ 09/09

## ✅ Testé live

☐

## Preuve / état

Diagnostic écrit : `docs/audit/RUNTIME_DIVERGENCE_FIX_PLAN.md` (branche `fix/runtime-divergence-files-revision`). **Défaut identifié** : le signal de fraîcheur `fetchPersistedProjectRevision()` lit l'ETag / `ideState.version` de `GET /api/projects/:id/ide-state`, or `ideState.version` n'est incrémentée que par `upsertProjectIdeState` (PUT `/ide-state`, `services/api/src/app.ts:20802`) — **aucune écriture de FICHIER ne la touche**. Une persistance de fichiers (agent, autre onglet, `files/import/zip`) laisse donc `currentRevision === seededRevision` → `storageNewerThanSeed = false` → **reattach chaud sur un pod tiède qui sert l'ancien arbre**, ou à l'inverse reseed aveugle depuis un storage en retard qui écrase une édition runtime. Correctif conçu : révision **dérivée sans état** `sha256(sorted(path:updatedAt:sizeBytes))` exposée par `GET /projects/:id/files/revision`, + réconciliation **par contenu** (jamais écraser plus récent par plus ancien) au lieu du wipe+reseed. **LOT SENSIBLE** (décide un reseed de pod → perte possible d'éditions) : à prouver rouge→vert puis remonter à l'expert, **PAS de merge sans feu vert d'Avi**. Repro live bloquée sur l'obtention d'un cookie `vc_session`. **Revérifié le 09/09** : la colonne Codé était restée à ☐ alors que le correctif ET sa garde existent. Contrôlé en exécutant les gardes, pas en les lisant — épinglé par `app/lib/runtime/project-workspace-revision.spec.ts`, `app/lib/runtime/serving-ports.spec.ts`, `app/lib/runtime/workspace-seed-marker.spec.ts`, `services/api/src/project-files-revision.spec.ts` (vertes ce jour). ⚠️ « Testé live » reste ☐ : j'ai vérifié des GARDES, pas un écran.

