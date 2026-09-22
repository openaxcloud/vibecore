---
id: BUG-THEME-006
---

## Bug

**P1 — PANNEAU GIT : le libellé « Commit changes » est BLEU sur le bouton ORANGE — 1,07:1 en sombre, 1,54:1 en clair.** Le bouton d'action principal du panneau Git est illisible dans les DEUX thèmes.

## 📤 Dispatché

☐

## 💻 Codé

☑

## ✅ Testé live

☐ **Reproduit live 18/08, correctif poussé**

## Preuve

**Reproduction** (IDE réel, env d'audit au build courant `0581545c24`, `?panel=editor`, 390 et 768) : sombre `rgb(0,153,255)` sur `rgb(242,98,7)` = **1,07:1** ; clair `rgb(0,111,214)` sur `rgb(242,98,7)` = **1,54:1**. **Cause racine — une guerre de classes, pas une couleur oubliée** : `PanelButton` pose déjà `text-bolt-elements-button-primary-text` (le bleu d'action) dans sa base, et l'appel ajoutait `className="font-semibold text-white"` + `style={{ background: 'var(--ecode-accent, #F26207)' }}`. Entre deux utilitaires de couleur concurrents, c'est **l'ordre dans la feuille générée** qui tranche, pas l'ordre de l'attribut `class` — et le bleu gagnait. **Correctif** : variante `accent` sur `PanelButton`, qui porte le fond ET le premier plan ensemble ; plus de style en ligne ni de `text-white` en concurrence. **Garde-fou** : les 88 tests du panneau Git passent.

