---
id: BUG-UX-010
---

## Bug

Le panneau du tiroir mobile reste translaté à `-280px` lorsqu'il est fermé et étend la zone de scroll du document racine

## 📤 Dispatché

✅

## 💻 Codé

✅

## ✅ Testé live

✅

## Preuve

`44e89509` retire la translation persistante du panneau fermé et limite l'animation à l'ouverture, avec respect de `prefers-reduced-motion`. Vérifié sans débordement racine à 390 px, navigation et clés API utilisables, capture sombre `user-area-locale-dark-390.jpg`.

