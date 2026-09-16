---
id: BUG-DECL-001
section: "Balayage QA du 2026-09-04 — panneaux instables, lenteur, archive, état de l'IDE"
---

## Bug

**Deux déclarations lues par un test et par AUCUN code — elles décrivent le comportement au lieu de le commander.** `MOBILE_TOOLS_HORS_ROUTAGE` (`app/lib/mobile-ide-tabs.ts`) énumère les outils qu'`activateMobileTool` traite par une branche nommée ; rien dans `activateMobileTool` ne la lit. `IDE_NON_ADDRESSABLE_TAB_KEYS` (`app/lib/ide/panel-registry.ts`) énumère les clés qui n'ouvrent pas de panneau ; seul son spec la consomme. Avi, le 09/09 : « consommé par un test et jamais par le code, c'est une **déclaration sans effet** ». Une liste pareille ne peut pas empêcher la dérive qu'elle décrit : elle la constate après coup, et seulement dans un test.

## 📤

☐

## 💻

☐

## ✅

☐

## Preuve

**Réduit, pas résolu, par #509** : les deux ACTIONS (`share`, `commands`) sont sorties de `MOBILE_TOOLS_HORS_ROUTAGE` et vivent maintenant DANS la donnée (`kind: 'action'` sur l'entrée d'outil), d'où `MOBILE_TOOL_ACTIONS` est **dérivé** — un champ de l'entrée ne peut pas diverger de l'entrée. `IDE_NON_ADDRESSABLE_TAB_KEYS` consomme ce dérivé au lieu de recopier. **Reste ouvert** pour les sept panneaux à bascule propre (`agent`, `files`, `editor`, `preview`, `search`, `locks`, `terminal`) : le jour où l'un d'eux perd sa branche nommée, aucune garde ne rougit. Correction réelle = faire lire la liste par le dispatch.

