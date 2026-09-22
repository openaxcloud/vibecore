---
id: BUG-UX-013
---

## Bug

Un échec d'enregistrement des préférences ou de lecture des notifications peut laisser l'utilisateur sans restauration fiable ni action Réessayer locale

## 📤 Dispatché

✅

## 💻 Codé

✅

## ✅ Testé live

✅

## Preuve

Requêtes annulables, rollback vers le dernier état confirmé, panneau conservé et retry de la requête réelle pour préférences, mark-all et mark-read. 3 tests de récupération verts ; Playwright réel sur 390/768/1024/1440 avec PATCH interrompu, restauration, retry ≥44 px, persistance après reload et zéro débordement. Captures erreur/récupération clair 1440 et sombre 390 dans `docs/ui-ux-evidence/2026-07-15/`.

