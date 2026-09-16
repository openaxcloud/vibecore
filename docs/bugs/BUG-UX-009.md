---
id: BUG-UX-009
---

## Bug

La barre animée du loader global élargit le document lorsqu'un contexte desktop ou tablette est redimensionné à 390 px

## 📤 Dispatché

✅

## 💻 Codé

✅

## ✅ Testé live

✅

## Preuve

`44e89509` confine la piste du loader global. Le test réel redimensionne les contextes desktop/tablette jusqu'à 390 px et vérifie `document.scrollWidth <= window.innerWidth`; matrice Playwright locale verte sur les trois profils.

