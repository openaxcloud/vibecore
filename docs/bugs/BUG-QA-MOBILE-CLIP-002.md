---
id: BUG-QA-MOBILE-CLIP-002
section: "Balayage QA du 2026-09-04 — panneaux instables, lenteur, archive, état de l'IDE"
---

## Bug

**P1 — sur iPhone (390 px), le fil de la communauté (`/community`) ampute 150 px de CHAQUE ligne, sans défilement possible.** Le bloc du fil mesure **540 px** dans 390 px. Conséquences visibles : le titre de section est coupé (« Discussions, showcases an▌ »), le texte courant est coupé en plein mot (« the E-Code marketing head▌ »), le bord droit du champ de recherche est hors écran, la puce de filtre `Tutorials` est tronquée, et **le titre de chaque publication est coupé** (« How are teams routing agent memory▌ production? »). Comme pour CLIP-001, `overflow-x: clip` empêche tout défilement horizontal : le contenu est perdu, pas repoussé. **Cause racine mesurée** : `<div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_22rem]">` (`app/components/marketing/EcodePublicResourcePages.tsx:531` sur `origin/main`) ne déclare la piste clampée **qu'à partir de `xl`**. En dessous, la colonne implicite `auto` prend le min-content : conteneur **358 px**, `grid-template-columns` calculé **524,469 px**. L'élément qui gonfle est la rangée de puces `flex gap-2 overflow-x-auto` (min-content 524 px) — et, gonflée, **elle cesse de défiler** (`chipsScrollable: false`). Sévérité utilisateur : page communauté illisible sur iPhone, y compris pour un visiteur non connecté (route publique).

## 📤

☑ — porté par #336 (10/09)

## 💻

☑ 10/09 — **corrigé par #336** (`bcec1885`) : piste clampée `grid-cols-[minmax(0,1fr)]` déclarée au breakpoint de base sur la grille fautive (règle 7 : les trois pages du même mécanisme corrigées ensemble). **Épinglé par `tests/e2e/mobile-content-clipping.spec.ts`**, qui mesure `document.body.scrollWidth` — la seule métrique que `overflow-x: clip` ne borne pas — et embarque sa contre-épreuve (bloc de 3 000 px injecté). Re-mesuré le 16/09 sur build local (`d094df01`, Chromium 390×844, dpr 3) : `/community` → `body.scrollWidth = 390` pour `clientWidth = 390`, **0 px amputé** (était +150).

## ✅

☐ — défaut constaté live le 01/09 ; le correctif reste **à constater sur iPhone** (Safari, `app.e-code.ai`, /community en portrait) : rien d'amputé à droite, la page ne défile pas horizontalement.

## Preuve

Même env et build. `https://app.34.163.208.161.sslip.io/community`, 390×844, thème clair. **Mesure** : `body.scrollWidth = 540` vs `clientWidth = 390` → **+150 px** ; `canScrollH = false`. **Capture avant** : `proof-community-feed-390.png`. **Correctif prouvé en direct** : `min-width: 0` sur les enfants de la grille → `bodyScrollW` **540 → 390**, piste **524,469 → 358 px**, largeur des puces **524 → 358 px** et `chipsScrollable` **false → true** (la rangée redevient défilable comme prévu par son `overflow-x-auto`). Capture après : `fix-community-A-390.png`. **768 px : sain**.

