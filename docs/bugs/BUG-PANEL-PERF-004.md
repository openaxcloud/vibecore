---
id: BUG-PANEL-PERF-004
section: "Balayage QA du 2026-09-04 — panneaux instables, lenteur, archive, état de l'IDE"
---

## Bug

**P1 — jusqu'à 13 s avant le premier contenu, sur l'iPhone, en production.** Budget : ~3,4–4,0 s avant que le panneau demande quoi que ce soit, puis sa requête met 3,6–4,2 s alors que le MÊME appel seul met 1,0–1,4 s (×3,5 par contention), rendu 0,3–0,5 s. Contention causée par **28 doublons sur 52 requêtes** d'une ouverture à froid, chiffre identique quel que soit le panneau → défaut de la COQUE. Cause racine : (a) l'effet de restauration `BaseChat.tsx:5004-5220` dépend de `projectFiles` = `useStore(workbenchStore.files)`, la carte ENTIÈRE des fichiers, qui change à chaque vague de chargement → l'effet rejoue ; (b) `projectIdeMemory.ts:823` n'a AUCUNE coalescence des requêtes en vol (cache lu avant la requête, rempli après la réponse) → 9 sites d'appel = 9 requêtes. **`packages` CORRIGÉ** : `resolvePanelWorkspace` rejoint le `Promise.all` (saut supprimé : 0,27–0,45 s).

## 📤

—

## 💻

partiel

## ✅

❌

## Preuve

`PERFORMANCE.md`, `paint-perf.json`, `census-overview.json`, `engine-delta-prod.log`. Prod `overview` **13 066 ms** WebKit/iPhone contre 8 642 ms Chromium ; `integrations` 11 132 / 9 260. SHA prod `753b5ed38d` identique AVANT et APRÈS la campagne. **Limite : Mac sur bonne liaison, projet de gabarit à 7 fichiers — plancher, pas le vécu d'Avi.**

