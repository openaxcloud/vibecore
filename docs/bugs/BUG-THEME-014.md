---
id: BUG-THEME-014
provenance: "extraite de la proposition #161, fermée sans fusion — le constat survit, le code non"
---

## Bug

**INFO — 3 remontées du balayage étaient de FAUX POSITIFS du harnais, écartées avant correction inutile.**

## 📤 Dispatché

—

## 💻 Codé

—

## ✅ Testé live

☑ **Analysé + harnais durci 18/08**

## Preuve

(1) Splash « Loading E-Code… » à 1.78:1 : son texte est à `opacity: 1` dans un conteneur à `opacity: 0` — **il est invisible** ; le harnais ne testait pas la visibilité HÉRITÉE. (2) Bouton « Build now » de l'accueil à 1.83:1 : il est `disabled` tant que le prompt est vide, et **WCAG 1.4.3 exempte explicitement les composants inactifs** — ce n'est pas une violation. (3) Initiales des avatars `/docs` : un `<text>` SVG peint via `fill`, pas `color` ; le harnais lisait `color`, donc un `fill="white"` **identique dans les 2 thèmes** ressortait comme un défaut du seul thème sombre — et le SVG est `role="img"` avec alternative textuelle, donc une illustration, pas du texte à lire. `scripts/theme-sweep.mjs` gère désormais les trois cas.

