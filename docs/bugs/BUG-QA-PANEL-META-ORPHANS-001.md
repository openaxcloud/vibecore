---
id: BUG-QA-PANEL-META-ORPHANS-001
---

## Bug

**Deux incohérences mineures dans les registres de panneaux.** (a) `IDE_MANAGEMENT_PANELS` déclare **`'problems'` deux fois** (doublon dans le tableau `as const`) — sans effet à l'exécution (`includes()`), mais le registre et son type dérivé sont faux. (b) La clé **`web`** existe dans `ECODE_MOBILE_TAB_META` (donc un onglet peut porter ce libellé) mais n'est dispatchée **nulle part** : ni dans la chaîne `if` de `activateMobileTool`, ni dans `MOBILE_TOOL_TO_MANAGEMENT_PANEL`. Un onglet `web` restauré est donc affichable mais **inouvrable**, et via `?panel=web` il tombe dans le repli `deployments` de `BUG-QA-PANEL-AGENT-FALLBACK-001`.

## 📤

☐

## 💻

☐

## ✅

✅ **26/08** vérifié par lecture de `origin/main` (statique, non rejoué à l'écran)

## Preuve

Extraction automatisée sur `git show origin/main:app/components/chat/BaseChat.tsx` et `app/lib/mobile-ide-tabs.ts` : doublon `problems` dans `IDE_MANAGEMENT_PANELS` (26 entrées, 25 distinctes) ; `ECODE_MOBILE_TAB_META` \ (chaîne `if` ∪ `MOBILE_TOOL_TO_MANAGEMENT_PANEL`) = **`{web}`**. Contrôle : `commands` et `share`, d'abord suspectés, sont bien gérés par des branches dédiées (`activateMobileTool`, palette de commandes / panneau Collaborateurs) — **faux positifs écartés**.

