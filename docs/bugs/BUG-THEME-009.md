---
id: BUG-THEME-009
---

## Bug

**P1 — BADGE DE HÉROS `/about` ET `/careers` : couleur codée en dur par-dessus la paire du thème → 1,73:1 en clair, illisible.** Le badge « Our story » (et les 2 badges de `/careers`) affiche l'orange de marque sur son fond ambre.

## 📤 Dispatché

☐

## 💻 Codé

☑

## ✅ Testé live

☐ **Reproduit live 18/08, correctif poussé**

## Preuve

**Reproduction** (sonde contraste, `https://e-code.ai/about`, 390/768/1440, les 2 thèmes) : clair **1,73:1** (`#f26207` sur `rgb(251,175,35)`), sombre **4,33:1** (`#f26207` sur `rgb(38,44,59)`) — les deux sous le seuil AA de 4,5. **Cause racine** : `<Badge variant="secondary" style={{ color: '#F26207' }}>` — 3 occurrences (`About.tsx:67`, `Careers.tsx:84` et `:87`). Le style en ligne écrase la paire prévue par le thème : `--secondary` vaut ambre `39 96% 56%` en clair avec `--secondary-foreground` **noir**, et ardoise avec un quasi-blanc en sombre. La couleur en dur ignorait les deux. **Correctif** : suppression des 3 styles en ligne → **11,26:1** en clair (noir sur ambre) et **13,35:1** en sombre. **Garde-fou** : test qui refuse tout `style={{ color: '#…' }}` dans ces pages.

