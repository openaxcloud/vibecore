---
id: BUG-IDE-007
---

## Bug

**P1 — l'arbre de fichiers reste désynchronisé et « Actualiser les fichiers » ne le répare pas.** Après la génération, la Bibliothèque annonce « **9 fichiers** » puis « 10 » après clic sur *Actualiser les fichiers*, pendant que le badge Git du même écran annonce « **20 fichiers modifiés** » et que le store projet en contient bien 20 (`GET /api/projects/<id>/files` → 20 entrées). L'utilisateur ne voit donc pas les fichiers que l'agent vient de créer, et l'action de rafraîchissement explicite ne corrige pas l'écart.

## 📤 Dispatché

☐

## 💻 Codé

☐

## ✅ Testé live

☐ **Constaté live 15/08**

## Preuve

Badges relevés dans le DOM : `Bibliothèque, 9 fichiers` → clic `Actualiser les fichiers` → `Bibliothèque, 10 fichiers`, avec `Git, 20 fichiers modifiés` au même instant. `GET /api/projects/cmsusbw8q00040nbf7dddmsq1/files` = 20 chemins (dont `src/App.tsx`, `src/components/*`, `src/index.css`). Desktop 1440.

