---
id: BUG-UX-002
---

## Bug

Le menu de navigation mobile et tablette ne peut pas défiler sur les écrans de faible hauteur

## 📤 Dispatché

✅

## 💻 Codé

✅

## ✅ Testé live

✅

## Preuve

`7cf6d1cc` poussé sur `main`. Scroll réellement exécuté à 390×600, 768×600 et 1024×600 ; `scrollHeight > clientHeight`, `scrollTop > 0`, dernière entrée visible, cibles ≥44 px et aucun débordement horizontal. Captures clair/sombre 390 px dans `docs/ui-ux-evidence/2026-07-14/`.

