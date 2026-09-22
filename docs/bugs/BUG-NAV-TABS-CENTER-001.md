---
id: BUG-NAV-TABS-CENTER-001
---

## Bug

**P3 — Barre du bas sur iPhone : les trois onglets fixes (Webview, Agent, Déploiements) sont collés à gauche, avec du vide avant « + » — ils doivent être centrés** (Avi, 07/09 08:36, entourés en rouge). Mesuré Chromium : la rangée `.bolt-mobile-replit-panel-scroll` prend toute la place entre le sélecteur et « + » (`flex: 1 1 auto`) et range ses onglets à gauche — vide avant « + » de 55 px à 430, 39 à 414, 15 à 390.

## 📤 Dispatché

☑ 07/09

## 💻 Codé

☑ 07/09 (`main` — PAS EN PROD au 07/09 11:00 UTC, porte refusée : Production CI rouge sur l'empreinte du bloc gelé de BaseChat, re-scellée par 247eb27 ; redéploiement à confirmer) — marges automatiques aux deux bouts de la rangée (0 en débordement : défilement et ancrage intacts). Épinglé par `app/styles/ide-mobile-panels.spec.ts` (§25) + `tests/e2e/ide-mobile-chrome.spec.ts` « barre du bas : les onglets fixes sont centrés — 430 / 390 » (vide gauche = vide droit à 2 px près).

## ✅ Testé live

☐

## Preuve

07/09 08:36.

