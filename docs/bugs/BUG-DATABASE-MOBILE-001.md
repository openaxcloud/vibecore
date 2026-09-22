---
id: BUG-DATABASE-MOBILE-001
---

## Bug

**P1 — Base de données, « Mes données » sur iPhone : le studio coupé à une centaine de pixels sous les onglets**, le reste de l'écran vide (captures 06/09 13:07). La chaîne `h-full min-h-0 flex-col` → `flex-1 overflow-auto` est faite pour un volet de bureau à hauteur fixe ; sur téléphone la hauteur est indéfinie et Safari résout `flex: 1 1 0%` à zéro — Chromium retombe sur le contenu, d'où un vert local qui ne prouvait rien.

## 📤 Dispatché

☑ 06/09

## 💻 Codé

☑ 06/09 (`main`, bb26e92), **déployé run 1498 (abaa279), 12:35 UTC** (runs 1492, 1495–1497 annulés ou refusés par la concurrence) — classes posées sur la chaîne (`bolt-database-workbench`, `-body`, `bolt-database-studio`, `-grid`, `-tables`, `-main`, `-results`) ; sur téléphone : blocs, plus de `flex-1`, plus de défilement interne, plafonds 40vh / 60vh pour tables et résultats. Épinglé par `app/styles/ide-mobile-panels.spec.ts` (§12) + `tests/e2e/ide-mobile-chrome.spec.ts` (studio en bloc, corps sans défilement interne, > 250 px). **Preuve iPhone à prendre** : le défaut n'existe que sur WebKit.

## ✅ Testé live

☐

## Preuve

Captures 06/09 13:07.

