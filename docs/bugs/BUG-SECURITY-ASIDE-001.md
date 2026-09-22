---
id: BUG-SECURITY-ASIDE-001
---

## Bug

**P2 — Sécurité sur téléphone : le volet « Dernière analyse » sort de l'écran à droite** (« Aucune an… », « workspace-ru… » coupés au bord). Trouvé par l'audit des 33 panneaux du 06/09 (rapport-final : aside à 453 px de bord droit pour 390). Mesuré (sonde probe-aside.mjs) : grille de 358 px, piste unique de 437 px — la règle mobile des panneaux impose `grid-template-columns: 1fr !important`, et une piste `1fr` nue prend pour minimum la largeur min-content de son contenu.

## 📤 Dispatché

☑ 06/09

## 💻 Codé

☑ 06/09 (`main`), **déployé au plus tard run 1508 (b1b2475), 21:15 UTC** — `minmax(0, 1fr)` dans les deux blocs mobiles (vaut pour tous les panneaux listés : Déploiements, Intégrations, Paramètres, Sécurité…). Épinglé par `app/styles/ide-mobile-panels.spec.ts` (§16 : plus aucune piste `1fr` nue dans le bloc mobile) + `tests/e2e/ide-mobile-chrome.spec.ts` (Sécurité : bord droit du volet ≤ écran).

## ✅ Testé live

☐

## Preuve

Audit local 06/09, pas de capture Avi.

