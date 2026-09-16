---
id: BUG-TAB-CLOSE-CONTRAST-001
---

## Bug

**P2 — Sélecteur d'onglets, thème clair : la croix qui ferme un onglet est blanche sur fond clair, on la voit à peine** (Avi, 07/09 08:22 : « à part les trois panneaux fixes — webview, agent, déploiements — les autres ont une croix pour les fermer, mais en thème clair elle est blanche sur du clair ; il faut la même couleur que le contenu »). Mesuré Chromium 390, thème clair, tuile « Secrets » : glyphe `i-ph:x` masquée, peinte en **rgb(246, 248, 251)** — la couleur de FOND — pour un texte de tuile à rgb(17, 24, 39). Cause : la « pastille » (`background: var(--vc-ide-bg-app)`) était posée sur le span de l'icône ; une icône Phosphor est un masque dont la couleur de trait est sa `background-color`. Ni opacité ni survol : le garde AV-UX point 4 verrouillait précisément ce défaut. « Déploiements » en double : non reproduit (4 tuiles : Webview, Déploiements, Agent, Secrets), à revoir sur capture.

## 📤 Dispatché

☑ 07/09

## 💻 Codé

☑ 07/09 (`main` — PAS EN PROD au 07/09 11:00 UTC, porte refusée : Production CI rouge sur l'empreinte du bloc gelé de BaseChat, re-scellée par 247eb27 ; redéploiement à confirmer) — pastille et glyphe séparées (`.bolt-mobile-tab-switcher-close-chip` > `i-ph:x`), glyphe 18 px peinte en `currentColor` = couleur du contenu ; mesuré après : clair rgb(17, 24, 39) sur rgb(246, 248, 251), sombre rgb(245, 249, 252) sur rgb(10, 15, 28). Épinglé par `app/styles/av-ux-12points.spec.ts` (point 4 : pastille à part, glyphe en currentColor, plus jamais `> span`) + `tests/e2e/ide-mobile-chrome.spec.ts` (croix de fermeture, clair ET sombre : peinture = couleur du contenu, contraste ≥ 4,5:1, 18 px).

## ✅ Testé live

☐

## Preuve

07/09 08:22.

