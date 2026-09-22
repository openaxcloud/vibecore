---
id: BUG-PREVIEW-MOBILE-001
---

## Bug

**P2 — carte de démarrage de la Webview sur mobile** (capture 05/09 23:05) : étapes tronquées « Compilation des dépend… », « Démarrage du serveur d… » (deux colonnes à 390 px) ; barre d'onglets « Journaux de la webview / Journaux du serveur / Ancrer à droite » sur deux lignes, et « Ancrer à droite » n'a pas de sens sur un téléphone.

## 📤 Dispatché

☑ 05/09

## 💻 Codé

☑ 06/09 (`main` `0e1361c`, déployé run 1480) — ⚠️ visait `.bolt-preview-splash-steps` alors que la capture montrait `.bolt-preview-loading-steps` (règle 1 non respectée, mesuré après : étapes toujours « Compilation des d… »). Repris le 06/09 : le bon élément en deux colonnes, libellés entiers à 11 px ; barre d'adresse 53 → 36 px, port 44 → 30 px ; onglets 12 px. Épinglé par `app/styles/ide-mobile-panels.spec.ts` (§2) + `tests/e2e/ide-mobile-chrome.spec.ts` (« Webview »).

## ✅ Testé live

☐

## Preuve

Capture iPhone 23:05 ; captures 06/09 (onglets, barre d'adresse).

