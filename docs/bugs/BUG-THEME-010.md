---
id: BUG-THEME-010
provenance: "extraite de la proposition #161, fermée sans fusion — le constat survit, le code non"
---

## Bug

**P1 (défaut de RENDU, pas seulement de contraste) — 66 utilitaires perdaient SILENCIEUSEMENT leur opacité.** `bg-[var(--ecode-accent)]/10` ne rend pas une teinte à 10 % : il peint un **orange PLEIN**. Concerne teintes d'accent, tuiles d'erreur, voiles de surface et bordures « à 30 % », sur 13 fichiers (marketing, IDE, zone connectée).

## 📤 Dispatché

☑

## 💻 Codé

☑

## ✅ Testé live

☑ **Corrigé + prouvé live 18/08**

## Preuve

**Cause racine** : UnoCSS n'applique pas le modificateur d'opacité `/N` quand la couleur est une `var()` CSS — le modificateur est ignoré sans erreur. Repéré parce que la carte sélectionnée de `/mobile` échouait à **3.04:1 en sombre** : mesurée en réel, son fond valait `rgb(242,98,7)` PLEIN au lieu de la teinte à 10 % annoncée par la classe. **Correctif** : les 66 occurrences passent en `color-mix(in srgb, var(--x) N%, transparent)` explicite. **Vérifié live** : la carte rend désormais `color(srgb … / 0.1)` dans les 2 thèmes. ⚠️ **Impact visuel réel à revoir par Avi** : des éléments aujourd'hui pleins redeviennent subtils — c'est l'intention déclarée dans le code qui est restituée, mais ça se verra sur la Deploy Preview.

