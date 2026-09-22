---
id: BUG-THEME-010
---

## Bug

**P2 — le gris discret du marketing tombait à 3,57:1 sur les surfaces surélevées, en sombre.** Le sous-titre « Watch a real demo… » de l'accueil.

## 📤 Dispatché

☐

## 💻 Codé

☐

## ✅ Testé live

✅ **NE SE REPRODUIT PLUS — remesuré le 2026-08-31**

## Preuve

**Reproduction d'origine (18/08)** : `#7d8590` sur `--ecode-surface-tertiary` (`#2b3035`) = **3,57:1**. **Remesure sur `main` au 31/08, avant d'appliquer quoi que ce soit** : `--vc-ide-text-muted` vaut désormais `#a3adba` à `:root` (état non stampé et système-sombre) = **5,86:1**, et `#949ca6` sous `:root[data-theme='dark']` = **4,80:1** — les deux au-dessus de 4,5. Le défaut a été soldé en amont par un autre correctif. **Le correctif préparé sur cette branche a donc été RETIRÉ** : figer `--ecode-text-muted: #949ca6` à `:root` aurait fait *baisser* l'état par défaut de 5,86 à 4,80 et cessé de suivre le jeton de thème. **Garde-fou conservé et durci** : le test mesure maintenant les trois états de thème (non stampé, `[data-theme='dark']`, `[data-theme='light']`) au lieu du seul `:root`, qui passait dans les deux sens.

