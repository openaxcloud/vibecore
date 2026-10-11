---
id: BUG-THEME-013
provenance: "extraite de la proposition #161, fermée sans fusion — le constat survit, le code non"
---

## Bug

**P2 — pastilles/onglets « actifs » : l'accent lu sur SA PROPRE teinte passe sous AA en thème clair** — « All » (`/projects`, 4.35:1), « Web » (`/projects/new`, 4.21:1), et les mêmes pastilles dans l'IDE (3.96:1).

## 📤 Dispatché

☑

## 💻 Codé

☑

## ✅ Testé live

☑ **Corrigé + prouvé live 18/08**

## Preuve

Ces contrôles associent une BORDURE d'accent, une TEINTE d'accent à 12–14 % et un LIBELLÉ de la même couleur. Baisser la teinte ne suffit pas — vérifié : même à 4 % on plafonne à **4.61:1** sur `#f6f8fb` — c'est donc le libellé qui doit foncer. Nouveau `--vc-accent-action-text`, aliasé sur l'accent en SOMBRE (déjà 5.18–5.64:1) et assombri dans les deux portées CLAIRES seulement (`#0060ba` pour l'IDE, `#a83c07` pour la zone connectée).

