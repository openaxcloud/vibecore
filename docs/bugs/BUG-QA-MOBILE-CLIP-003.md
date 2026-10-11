---
id: BUG-QA-MOBILE-CLIP-003
section: "Balayage QA du 2026-09-04 — panneaux instables, lenteur, archive, état de l'IDE"
---

## Bug

**P2 — sur iPhone (390 px), la page produit `/mobile` ampute 32 px de ses cartes de fonctionnalités.** Ironie du périmètre : c'est la page qui vante l'usage mobile. La carte mesure **406 px** dans 390 px ; le bord droit et la fin des lignes sortent de l'écran, sans défilement possible (même `overflow-x: clip`). **Cause racine mesurée** : `<div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">` (`app/components/marketing/EcodeProductMarketingPages.tsx:820`) — piste clampée seulement à `lg` ; en dessous, conteneur **358 px** et `grid-template-columns` calculé **406 px**. Sévérité moindre que CLIP-001/002 (32 px, marge de carte plutôt que colonnes de données), mais même mécanisme et même absence de recours pour l'utilisateur.

## 📤

☑ — porté par #336 (10/09)

## 💻

☑ 10/09 — **corrigé par #336** (`bcec1885`) : piste clampée `grid-cols-[minmax(0,1fr)]` déclarée au breakpoint de base sur la grille fautive (règle 7 : les trois pages du même mécanisme corrigées ensemble). **Épinglé par `tests/e2e/mobile-content-clipping.spec.ts`**, qui mesure `document.body.scrollWidth` — la seule métrique que `overflow-x: clip` ne borne pas — et embarque sa contre-épreuve (bloc de 3 000 px injecté). Re-mesuré le 16/09 sur build local (`d094df01`, Chromium 390×844, dpr 3) : `/mobile` → `body.scrollWidth = 390` pour `clientWidth = 390`, **0 px amputé** (était +32).

## ✅

☐ — défaut constaté live le 01/09 ; le correctif reste **à constater sur iPhone** (Safari, `app.e-code.ai`, /mobile en portrait) : rien d'amputé à droite, la page ne défile pas horizontalement.

## Preuve

Même env et build. `https://app.34.163.208.161.sslip.io/mobile`, 390×844. **Mesure** : `body.scrollWidth = 422` vs `clientWidth = 390` → **+32 px** ; `canScrollH = false`. **Correctif prouvé en direct** : `min-width: 0` sur les enfants de la grille → **32 → 0 px**. **768 px : sain**.

