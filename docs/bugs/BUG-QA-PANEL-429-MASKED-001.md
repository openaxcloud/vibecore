---
id: BUG-QA-PANEL-429-MASKED-001
section: "2026-08-12 — Lot Avi « les bases » (5 bugs, priorité ABSOLUE)"
---

## Bug

**Un 429 (quota atteint) affiché en « les données du panneau n'ont pas pu être chargées ».** L'échelle de codes traitait 401/403/404/5xx ; 429 tombait dans le fourre-tout `PANEL_REQUEST_FAILED` — alors que la ligne `retryable` juste en dessous le reconnaissait déjà explicitement. L'utilisateur perdait une cause qu'il peut corriger.

## 📤

✅

## 💻

✅ `ed2b1022`

## ✅

✅

## Preuve

Branche `PANEL_QUOTA_EXCEEDED` dédiée, message nommant la cause **et** l'action possible, en anglais et en français, appliquée aux **deux** chemins d'erreur de la route.

