---
id: BUG-COMPOSER-SHEET-TABLET-001
---

## Bug

**P2 — Feuilles du composeur (« Agent », « Économique », outils) étirées sur toute la largeur des tablettes et des téléphones en paysage.** Avi, 07/09 07:58, devant les deux feuilles sur son iPhone : « es-tu sûr que c'est adapté pour tout type de screen mobile ? Ça me paraît bien large ». Mesuré sur Chromium, 320 / 360 / 375 / 390 / 414 / 430 px : la feuille vaut l'écran, sans débordement, texte 14 px, hauteur bornée et défilante — c'est la forme voulue (référence Replit), pas un défaut. Mais le gabarit mobile sert AUSSI les tablettes et le paysage (`useMobileIde = isMobile \

## 📤 Dispatché

\

## 💻 Codé

isTablet`, jusqu'à 1366 px au doigt) : mesuré 820 px de feuille sur iPad portrait et 844 px sur Pixel en paysage pour un menu de deux lignes, parce que la règle posait `width: 100% ; max-width: none`, alors que les autres feuilles mobiles (« + », menus) s'arrêtent à `--vc-mobile-sheet-max-width` (760 px).

## ✅ Testé live

☑ 07/09

## Preuve

☑ 07/09 (`main`) — même plafond, centrée (`width: min(100vw, var(--vc-mobile-sheet-max-width))`, `left` calculé), quatre coins arrondis dès 761 px. Vérifié sur Chromium (E2E) et sur WebKitGTK à 820×1180 : 760 px à x = 30 pour les deux feuilles ; à 390, toujours 390. Épinglé par `app/styles/ide-mobile-panels.spec.ts` (§19) + `tests/e2e/ide-mobile-chrome.spec.ts` (zone de saisie : 760 px centrée sur tablette, plein écran à 390).

