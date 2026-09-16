---
id: BUG-ACTION-COMMAND-TOUCH-001
---

## Bug

**P2 — Fil de l'agent sur iPhone : « Afficher la commande » reste dans une boîte grise après l'appui, et la commande dépliée (« npm install ») flotte dans 20 px de marge** (capture 06/09 14:10). Mesuré à 390 après un appui tactile réel (sonde probe-actions.mjs) : `:hover` reste vrai sur l'élément touché — le survol colle au doigt, iOS comme Chromium — et le résumé prend le fond de survol des boutons (rgb 226 232 240) ; le `pre` hérite `padding: 20px 16px` du rendu Markdown et ses jetons Shiki prennent les 14 px `!important` de la règle de coquille dans un `pre` de 11 px à l'interligne de 16 px.

## 📤 Dispatché

☑ 06/09

## 💻 Codé

☑ 06/09 (`main`, 95618b4), **déployé run 1499, 13:15 UTC** — `@media (hover: none)` : le fond de survol de toute la famille bouton/résumé revient au repos (le retour d'appui reste sur `:active`) ; commande dépliée : 12 px mono, interligne 1.5, `padding: 8px 10px`, jetons alignés sur le `pre`. Épinglé par `app/styles/ide-mobile-panels.spec.ts` (§14) + `tests/e2e/ide-mobile-chrome.spec.ts` (fil de l'agent : appui tactile réel, fond transparent malgré `:hover`, marge ≤ 10 px, jetons 12 px).

## ✅ Testé live

☐

## Preuve

Capture 06/09 14:10.

