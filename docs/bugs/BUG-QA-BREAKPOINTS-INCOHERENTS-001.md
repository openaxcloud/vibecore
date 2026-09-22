---
id: BUG-QA-BREAKPOINTS-INCOHERENTS-001
---

## Bug

**`/projects/new` : l'accordéon est un CHOIX ASSUMÉ, mais son seuil (640 px) ne correspond pas à celui de l'IDE (1199 px) — d'où l'écart 390 ↔ 768.** **Réponse à la question posée : choix assumé, pas dérive.** Le JSX ne conditionne rien au viewport — un seul état `advancedOpen` (`projects.new.tsx:740`), un seul balisage, le bouton bascule est toujours présent dans le DOM. C'est le CSS qui décide, et il le fait explicitement : règle **de base** (`app/styles/index.scss:25030`) → `.vc-new-project-advanced-toggle { display: none }` et `.vc-new-project-advanced-content { display: flex }`, autrement dit **tout est déplié** ; puis un bloc **`@media (max-width: 640px)`** (`:25276`) inverse : `.vc-new-project-advanced-toggle { display: flex; min-height: 44px; width: 100% }` et `.vc-new-project-advanced-content { display: none }`, rouvert par `[data-open='true']`. Le soin apporté — un bouton dédié à **`min-height: 44px`**, donc conforme au tactile — montre que la variante mobile est **voulue et pensée**, pas subie. **Le vrai défaut est ailleurs : deux définitions de « mobile » coexistent dans le produit.** L'accordéon bascule à **640 px**, alors que la coque compacte de l'IDE bascule à **1199 px** (`TABLET_MAX_WIDTH`, voir `BUG-QA-IDE-BREAKPOINT-1200-001`, clos comme voulu). À **768 px**, l'IDE est donc en mode mobile **tandis que** `/projects/new` est en mode desktop — c'est exactement l'écart mesuré (16 commandes visibles en 768, masquées en 390). Sous la règle d'Avi du 27/08 (« pour tablet ce doit être comme mobile »), **le seuil de 640 px devrait être aligné sur 1199 px** pour que la tablette reçoive le même traitement replié que le téléphone. **Le problème est systémique, pas local** : `index.scss` mélange les seuils — en `max-width` : **640** (×5), **1199** (×5), 900 (×3), 720 (×3), 1024 (×3), 960 (×2), 860 (×2), 767 (×2) ; en `min-width` : 1024 (×8), 768 (×7), 640 (×7), 1200 (×3), 980 (×2), 720 (×2). Sans grille de points de rupture partagée, chaque surface choisit le sien et la tablette tombe d'un côté ou de l'autre au hasard.

## 📤

☐

## 💻

☐

## ✅

✅ **28/08** cause lue dans le code + écart mesuré et capturé

## Preuve

Captures : `docs/audit/evidence-2026-08-27/creation-projet-390.png` (accordéon replié « Options avancées ») et `creation-projet-768.png` (10 puces de type + 3 exemples + section Modèles, tout déplié). **Correctif attendu** : (a) immédiat — passer le `@media (max-width: 640px)` de `index.scss:25276` à `max-width: 1199px` pour aligner `/projects/new` sur la frontière de l'IDE ; (b) de fond — définir une grille de points de rupture unique, dérivée des constantes déjà existantes dans `packages/editor/src/index.ts` (`MOBILE_BREAKPOINT=768`, `TABLET_MAX_WIDTH=1199`), et l'appliquer partout au lieu des 8 seuils actuels.

