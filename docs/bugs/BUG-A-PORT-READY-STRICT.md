---
id: BUG-A-PORT-READY-STRICT
section: "2026-08-12 — Lot Avi « les bases » (5 bugs, priorité ABSOLUE)"
---

## Constat

`hasLivePreviewPort` exigeait `ready === true` **strictement**, là où le code voisin qui pose la même question accepte `ready !== false`.

## 📤

✅

## 💻

✅ `99015dca`

## ✅

🟠

## Preuve

Variante `hasAdoptablePreviewPort` **locale** à la décision de reattach ; le prédicat partagé n'est pas touché (il sert aussi à `isWorkspaceReallyRunning` et `preview-recovery`, où la sévérité est voulue). N'a pas suffi — voir ci-dessous.

