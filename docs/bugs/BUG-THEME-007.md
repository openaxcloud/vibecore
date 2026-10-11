---
id: BUG-THEME-007
---

## Bug

**P2 — le gris discret restait sous le seuil sur les surfaces SURÉLEVÉES de l'IDE, dans les deux thèmes.** « Focused on … », « Context loaded », « App files changed. Detecting preview port… ».

## 📤 Dispatché

☐

## 💻 Codé

☑

## ✅ Testé live

☐ **Reproduit live 18/08, correctif poussé**

## Preuve

**Reproduction** : `#7d8590` (valeur retenue à BUG-THEME-002) donne 4,35:1 sur `--vc-ide-bg-card` et **3,42:1** sur `--vc-ide-bg-hover`. **Ma propre erreur de méthode** : au lot précédent je n'avais vérifié que `bg-app` et `bg-panel`, les deux surfaces les plus sombres — le garde-fou passait pendant que le défaut partait en production. **Correctif** : `#949ca6`, qui passe les QUATRE surfaces sombres (6,89 / 6,56 / 5,85 / 4,60) en gardant l'écart avec `--vc-ide-text-secondary` (9,61:1 sur la carte). Copies e2e + admin alignées. **Garde-fou élargi aux quatre surfaces.**

