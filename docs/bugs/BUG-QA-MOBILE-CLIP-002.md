---
id: BUG-QA-MOBILE-CLIP-002
section: "Balayage QA du 2026-09-04 — panneaux instables, lenteur, archive, état de l'IDE"
---

## Bug

**P1 — sur iPhone (390 px), le fil de la communauté (`/community`) ampute 150 px de CHAQUE ligne, sans défilement possible.** Le bloc du fil mesure **540 px** dans 390 px. Conséquences visibles : le titre de section est coupé (« Discussions, showcases an▌ »), le texte courant est coupé en plein mot (« the E-Code marketing head▌ »), le bord droit du champ de recherche est hors écran, la puce de filtre `Tutorials` est tronquée, et **le titre de chaque publication est coupé** (« How are teams routing agent memory▌ production? »). Comme pour CLIP-001, `overflow-x: clip` empêche tout défilement horizontal : le contenu est perdu, pas repoussé. **Cause racine mesurée** : `<div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_22rem]">` (`app/components/marketing/EcodePublicResourcePages.tsx:531` sur `origin/main`) ne déclare la piste clampée **qu'à partir de `xl`**. En dessous, la colonne implicite `auto` prend le min-content : conteneur **358 px**, `grid-template-columns` calculé **524,469 px**. L'élément qui gonfle est la rangée de puces `flex gap-2 overflow-x-auto` (min-content 524 px) — et, gonflée, **elle cesse de défiler** (`chipsScrollable: false`). Sévérité utilisateur : page communauté illisible sur iPhone, y compris pour un visiteur non connecté (route publique).

## 📤

☐

## 💻

☐

## ✅

✅ **01/09** mesuré live + captures avant/après

## Preuve

Même env et build. `https://app.34.163.208.161.sslip.io/community`, 390×844, thème clair. **Mesure** : `body.scrollWidth = 540` vs `clientWidth = 390` → **+150 px** ; `canScrollH = false`. **Capture avant** : `proof-community-feed-390.png`. **Correctif prouvé en direct** : `min-width: 0` sur les enfants de la grille → `bodyScrollW` **540 → 390**, piste **524,469 → 358 px**, largeur des puces **524 → 358 px** et `chipsScrollable` **false → true** (la rangée redevient défilable comme prévu par son `overflow-x-auto`). Capture après : `fix-community-A-390.png`. **768 px : sain**.

