---
id: BUG-MENU-LABELS-001
---

## Bug

**P1 — le menu contextuel d'un message (appui long) n'affichait que des icônes muettes** sur téléphone (capture iPhone 06/09 12:18 : copier, régénérer, modifier, avis — sans un mot). Mesuré sur Chromium 390 (`probe-menu.mjs`) : le libellé était un `::after` en `attr(aria-label)`, et la règle mobile qui éteint les infobulles `[data-vc-tooltip]::after` rendait `content: none`.

## 📤 Dispatché

☑ 06/09

## 💻 Codé

☑ 06/09 (`main`) — **déployé run 1490 (84a913c), 10:27 UTC** — libellé réel `.bolt-message-action-label` dans les six boutons (caché dans les pieds de message, montré dans le menu). Épinglé par `app/styles/ide-mobile-panels.spec.ts` (§10) + `tests/e2e/ide-mobile-chrome.spec.ts` (menu ouvert par `contextmenu`, ≥ 3 libellés larges).

## ✅ Testé live

☐

## Preuve

Capture 06/09 12:18.

