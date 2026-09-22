---
id: BUG-THEME-008
---

## Bug

**P2 — les QUATRE couleurs de statut sont sous le seuil AA en thème clair, sur leur propre fond teinté.** « Idle », « No changes », le bandeau d'avertissement Git « Connect a source-control provider here… ».

## 📤 Dispatché

☐

## 💻 Codé

☑

## ✅ Testé live

☐ **Reproduit live 18/08, correctif poussé**

## Preuve

**Reproduction** (IDE réel, build courant, clair, 390/768/1440) : succès `#178a4c` **3,65:1** sur sa teinte et **4,13:1** même sur le panneau nu ; avertissement `#b45309` 4,02:1 ; information `#2563eb` 4,24:1 ; erreur `#dc2626` 3,78:1. **Cause racine structurelle** : chaque `--status-*-bg` est un `color-mix` de **son propre texte** à 10-12 %. La couleur se pose donc toujours sur sa propre teinte — le cas le plus défavorable, et celui qu'on ne voit jamais en lisant un jeton isolé. **Correctif** : `#0d6b39` / `#9a4708` / `#b91c1c` / `#1d4ed8` → 5,36 / 5,05 / 4,97 / 5,41 sur leur teinte, 6,21 / 6,02 / 6,08 / 6,30 sur le panneau. **Second défaut, même bandeau** : `text-amber-700/85` — l'opacité 85 % coûtait à elle seule ~1 point de contraste (4,39 → 3,47). Opacité retirée et ambre assombri à `amber-800` → **6,20:1**. **Garde-fou** : test qui recompose le `color-mix` de chaque statut et vérifie le contraste texte/teinte — vérifié rouge sur les 4 anciennes valeurs.

