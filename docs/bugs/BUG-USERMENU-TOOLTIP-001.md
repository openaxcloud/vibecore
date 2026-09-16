---
id: BUG-USERMENU-TOOLTIP-001
---

## Bug

**P2 — Menu du message utilisateur sur iPhone : « Modifier et renvoyer ce message » flotte sous le menu après l'appui long** (capture 06/09 17:57). Le bouton portait `data-vc-tooltip` ; au doigt le survol colle, et l'infobulle se rend sous le menu sur WebKit (non reproduit sur Chromium, où la règle mobile l'éteint ; WebKit indisponible ici).

## 📤 Dispatché

☑ 06/09

## 💻 Codé

☑ 06/09 (`main`), **déployé au plus tard run 1508 (b1b2475), 21:15 UTC** — plus d'attribut sur le bouton (son libellé est dans le menu) + règle qui éteint toute infobulle dans `.bolt-message-context-menu`. Épinglé par `app/styles/ide-mobile-panels.spec.ts` (§17). **Preuve iPhone à prendre.**

## ✅ Testé live

☐

## Preuve

Capture 06/09 17:57.

