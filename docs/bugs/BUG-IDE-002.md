---
id: BUG-IDE-002
---

## Bug

**P2 — des panneaux affichent leur identifiant brut au lieu de leur nom** : `panelTitle()` n'a pas d'entrée pour `skills`, `studio` ni `ports`, donc le repli `?? panel` laisse fuiter l'id dans l'onglet, le titre et l'état vide — littéralement « studio » et « No studio yet ». Desktop uniquement : le mobile lit déjà `ECODE_MOBILE_TAB_META`, qui nomme correctement chaque panneau.

## 📤 Dispatché

✅ 06/08

## 💻 Codé

✅ mergé `d3081c34` (PR #120, branche `fix/cluster-d-ide-panels`) — **correction de suivi 11/08** : la cellule annonçait « PAS sur main » alors que la branche est ancêtre de `origin/main`

## ✅ Testé live

✅ **Prouvé live 06/08**

## Preuve

Captures prod : desktop `?panel=skills` → titre « skills », `?panel=studio` → « studio » + « No studio yet » ; mobile même projet → « Skills ». Visible dans les deux thèmes. Fix : `panelTitle()` retombe sur `ECODE_MOBILE_TAB_META` au lieu d'entretenir une seconde liste.

