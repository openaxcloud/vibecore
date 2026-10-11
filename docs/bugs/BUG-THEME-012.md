---
id: BUG-THEME-012
provenance: "extraite de la proposition #161, fermée sans fusion — le constat survit, le code non"
---

## Bug

**P2 — trois surfaces INVARIANTES par thème portaient un premier plan qui, lui, suivait le thème** (même classe que les pastilles blanches de BUG-THEME-006).

## 📤 Dispatché

☑

## 💻 Codé

☑

## ✅ Testé live

☑ **Corrigé + prouvé live 18/08**

## Preuve

(a) `/ai-agent` : légende en `text-muted-foreground` posée sur un panneau `bg-black` **permanent** → texte sombre sur noir en thème clair (**3.44:1**) ; encre claire constante. (b) `/changelog` : le badge `variant="secondary"` (aplat jaune `#fbaf23` dans les 2 thèmes) écrasait le premier plan prévu par sa variante avec l'orange AA → **3.16:1** ; override retiré, la variante reprend son `--secondary-foreground`. (c) `/mobile` : bloc de code en `bg-black/35`, soit un **gris moyen** une fois composité sur page claire → menthe `#a7f3d0` à **2.34:1** ; surface sombre opaque, comme les autres maquettes du même fichier. **Principe** : une surface invariante par thème exige un premier plan invariant.

