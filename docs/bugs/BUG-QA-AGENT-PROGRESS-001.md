---
id: BUG-QA-AGENT-PROGRESS-001
section: "2026-08-12 — Lot Avi « les bases » (5 bugs, priorité ABSOLUE)"
---

## Bug

**Progression de l'agent figée à 67 % après une erreur terminale — et affichée comme un SUCCÈS.** `ProgressAnnotation` ne connaît que `in-progress` et `complete` : après une erreur, plus rien n'est `in-progress` et tout n'est pas `complete`. Le composant en concluait « pas de travail actif ⇒ terminé » et rendait la **coche verte** avec la barre bloquée à 67 %.

## 📤

✅

## 💻

✅ `ed2b1022`

## ✅

✅

## Preuve

`deriveProgressState()` est extraite et **exportée** (donc testable seule) et prend les signaux que l'appelant possède déjà — `isStreaming`, `llmErrorAlert`. Règle : « terminé » **uniquement** si tout est réellement complet ; toute autre fin devient un état **« interrompu »** explicite (icône d'alerte ambre, libellé et aria dédiés, `data-progress-state`). 8 cas testés, dont « l'échec prime sur le streaming » et « aucune étape connue n'est pas un succès ».

