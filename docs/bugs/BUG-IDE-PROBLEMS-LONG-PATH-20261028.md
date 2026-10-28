---
id: BUG-IDE-PROBLEMS-LONG-PATH-20261028
---

## Bug

Dans Problems, un chemin de fichier long déborde du bouton ouvrir-fichier et de la largeur visible de la liste. Le texte du diagnostic en dessous se replie, mais le lien exige un défilement horizontal. Reproduit sur le bundle IDE local, avec état frontend synthétique, à390/820/1280px.

## 📤 Dispatché

☑ 28/10/2026 — correction CSS locale autorisée dans un worktree distinct de #837.

## 💻 Codé

☐ main — cinq propriétés locales de `.bolt-project-problem-open` bornent la largeur et permettent le repliement du chemin intégral. Aucun texte, gestionnaire, API ni fichier Locks modifié.

## ✅ Testé live

☐ Production non testée. Mesures avant et contrepreuve CSS navigateur sur trois formats ; build66352 terminé et six cas compilés verts (trois formats normaux et trois zoom200% natifs), avec focus/Entrée sur fichier synthétique. Aucun backend réel ni génération.

## Preuves

[Mesures, portée et limites](ui-problems-path-layout-2026-10-28/README.md).
