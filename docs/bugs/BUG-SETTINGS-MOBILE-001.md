---
id: BUG-SETTINGS-MOBILE-001
---

## Bug

**P2 — Paramètres sur téléphone : la bande d'onglets collante (88 px, titres + descriptions) masque le formulaire en défilant, et la liste des raccourcis clavier défile DANS la page** (« cmd+shift+p » coupé sous le bouton d'enregistrement). Captures iPhone 06/09 11:02.

## 📤 Dispatché

☑ 06/09

## 💻 Codé

☑ 06/09 (`main`) — **déployé run 1490 (84a913c), 10:27 UTC** — sur téléphone : onglets titres seuls à 44 px collés au bord haut, liste des raccourcis sans hauteur maximale (un seul défilement). Épinglé par `app/styles/ide-mobile-panels.spec.ts` (§8) + `tests/e2e/ide-mobile-chrome.spec.ts` (bande ≤ 60 px, descriptions masquées, liste non coupée).

## ✅ Testé live

☐

## Preuve

Captures 06/09 11:02.

