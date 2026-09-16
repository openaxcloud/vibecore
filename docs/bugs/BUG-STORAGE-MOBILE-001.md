---
id: BUG-STORAGE-MOBILE-001
---

## Bug

**P2 — Stockage d'objets sur téléphone : cinq boutons empilés pleine largeur de 60 px** (Actualiser, Téléverser, Télécharger le dossier, Créer un dossier, Vérifier le bucket) — la règle mobile force `width: 100%` sur tous les boutons de barre. Capture iPhone 06/09 11:03. Même barre dans Paquets, Studio, Supervision, Extensions, Variables.

## 📤 Dispatché

☑ 06/09

## 💻 Codé

☑ 06/09 (`main`) — **déployé run 1490 (84a913c), 10:27 UTC** — barre en `flex-wrap`, deux boutons par rangée à 44 px, champ seul sur sa ligne. Épinglé par `app/styles/ide-mobile-panels.spec.ts` (§8) + `tests/e2e/ide-mobile-chrome.spec.ts` (Variables : deux boutons partagent leur rangée). Stockage non activé en local : preuve iPhone à prendre.

## ✅ Testé live

☐

## Preuve

Capture 06/09 11:03.

