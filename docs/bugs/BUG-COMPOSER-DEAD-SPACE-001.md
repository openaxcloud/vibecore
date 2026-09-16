---
id: BUG-COMPOSER-DEAD-SPACE-001
---

## Bug

**P2 — Zone de saisie sur iPhone : espace mort sous la rangée « Agent

## 📤 Dispatché

Léger », et la bordure basse du cadre de saisie n'est pas visible** (Avi, 07/09 07:59, capture entourée en rouge : « c'est de l'espace mort, on peut redescendre, et on voit pas la bordure de la zone de saisie »). Mesuré (Chromium et WebKitGTK, 390, f6c7ff5) : bordure du cadre à 754 px pour un socle à 772 — 18 px de vide, dont 8 px de rembourrage bas transparent du composeur et 10 px d'ancrage ; et le composeur DÉFILAIT en interne (141 px de contenu pour 125 de boîte) parce que le svg d'effet lumineux (`PromptEffectContainer`, `inset: -25px`) débordait du composeur, `overflow-y: auto` sur téléphone — un défilement interne qui, sur iPhone, laisse la bordure basse hors de la boîte.

## 💻 Codé

☑ 07/09

## ✅ Testé live

☑ 07/09 (`main`) — plus de rembourrage bas, ancrage à 8 px du socle (`bottom: calc(var(--mobile-nav-height) + 8px)`), effet ramené aux bords du cadre (`--prompt-container-offset: 0px` sur téléphone : le svg vaut exactement le cadre, le trait se dessine au même endroit), pastille « descendre » à 8 px au-dessus du cadre. Vérifié sur Chromium (E2E) et WebKitGTK à 390 : bordure du cadre = bas du composeur = 764, socle à 772, contenu 117 px pour 117 de boîte (plus aucune course interne), bordure peinte. Épinglé par `app/styles/ide-mobile-panels.spec.ts` (§20) + `app/styles/agent-action-list-density.spec.ts` (§2) + `tests/e2e/ide-mobile-chrome.spec.ts` (zone de saisie : bordure peinte, 8 px au-dessus du socle, sans défilement interne) — rouges sans le correctif.

## Preuve

☐

