---
id: BUG-REATTACH-REVISION-LOOP
section: "2026-08-12 — Lot Avi « les bases » (5 bugs, priorité ABSOLUE)"
---

## Boucle

Le marqueur enregistrait la révision lue **avant** le seed. Le seed et l'hydratation font bouger le stockage : le marqueur naissait déjà périmé, la réouverture suivante concluait « le stockage a changé » et reseedait, ce qui refaisait bouger le stockage. Mesuré : `022b27d2…` → `745d6429…` sans qu'un fichier soit édité. Révision désormais **relue** au moment de l'écriture.

## 📤

✅

## 💻

✅ `f11b9266`

## ✅

✅

