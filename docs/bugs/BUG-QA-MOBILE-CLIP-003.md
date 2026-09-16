---
id: BUG-QA-MOBILE-CLIP-003
section: "Balayage QA du 2026-09-04 — panneaux instables, lenteur, archive, état de l'IDE"
---

## Bug

**P2 — sur iPhone (390 px), la page produit `/mobile` ampute 32 px de ses cartes de fonctionnalités.** Ironie du périmètre : c'est la page qui vante l'usage mobile. La carte mesure **406 px** dans 390 px ; le bord droit et la fin des lignes sortent de l'écran, sans défilement possible (même `overflow-x: clip`). **Cause racine mesurée** : `<div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">` (`app/components/marketing/EcodeProductMarketingPages.tsx:820`) — piste clampée seulement à `lg` ; en dessous, conteneur **358 px** et `grid-template-columns` calculé **406 px**. Sévérité moindre que CLIP-001/002 (32 px, marge de carte plutôt que colonnes de données), mais même mécanisme et même absence de recours pour l'utilisateur.

## 📤

☐

## 💻

☐

## ✅

✅ **01/09** mesuré live

## Preuve

Même env et build. `https://app.34.163.208.161.sslip.io/mobile`, 390×844. **Mesure** : `body.scrollWidth = 422` vs `clientWidth = 390` → **+32 px** ; `canScrollH = false`. **Correctif prouvé en direct** : `min-width: 0` sur les enfants de la grille → **32 → 0 px**. **768 px : sain**.

