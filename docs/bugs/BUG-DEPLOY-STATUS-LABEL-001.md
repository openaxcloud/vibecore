---
id: BUG-DEPLOY-STATUS-LABEL-001
---

## Bug

**P3 — Déploiements « Gérer » : l'état « QUEUED » (puis « BUILDING ») s'affiche en capitales anglaises pendant qu'« Échec » est traduit.** Mesuré le 06/09 sur la maquette après un déploiement semé : `platformStateLabel` n'avait pas de cas pour les deux états du début du cycle et retombait sur la valeur brute.

## 📤 Dispatché

☑ 06/09

## 💻 Codé

☑ 06/09 (`main`), **déployé au plus tard run 1508 (b1b2475), 21:15 UTC** — `platformStateLabel` extrait dans `app/components/chat/platform-state-label.ts` avec les cas `queued` / `building` (« En file d’attente », « Construction en cours »). Épinglé par `app/components/chat/platform-state-label.spec.ts` + `tests/e2e/ide-mobile-chrome.spec.ts` (Déploiements « Gérer » : l'état n'est jamais une chaîne brute en capitales).

## ✅ Testé live

☐

## Preuve

Vu en sondant BUG-DEPLOY-ACTIONS-MOBILE-001.

