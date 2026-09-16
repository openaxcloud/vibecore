---
id: BUG-PREVIEW-CUTOFF-001
---

## Bug

**P2 — Onglet Aperçu : des éléments sont coupés** (Avi, 08/09, point 8 : « rien ne doit être coupé pour tous les types de devices, et toujours faire des écrans clairs et compréhensibles, comme si c'est pas un ingénieur »).

## 📤 Dispatché

☑ 08/09

## 💻 Codé

🟡 09/09 — **écran de DÉMARRAGE corrigé, sur le format WEB**. ⚠️ Ma première mesure annonçait des coupures aux trois formats : elle avait été prise hors de la coque de l'IDE, donc sans l'override mobile qui existait DÉJÀ (`.bolt-responsive-ide-mobile …`, sous `@media (max-width: 1199px)`). Téléphone et tablette étaient corrects. Le défaut vivait au-dessus de 1199 px, où la règle de base s'applique seule : à 1280 px, « Démarrage du serveur de développement » = 259 px de texte dans 102 px. La règle de base fait désormais ce que faisait l'override. ⚠️ Les états ERREUR et PRÊT n'ont PAS pu être mesurés — ils exigent un espace de travail que cette machine n'a pas

## ✅ Testé live

☐ live iPhone

## Preuve

preuve live 09/09 (4 → 0 débordements en web) + épinglé par `app/components/workbench/Preview.splash-coupures.spec.ts` et `tests/e2e/apercu-demarrage-coupures.spec.ts` (3 formats, ascendance réelle reproduite) — contre-épreuve : règle de base remise → SEUL le web rougit, ce qui situe le défaut exactement **SECOND TOUR, LE 10/09 — J'AVAIS CORRIGÉ LA CARTE QUI NE S'AFFICHE PAS.** L'écran de démarrage a DEUX implémentations qui s'excluent (`Preview.tsx:3015-3044`). `shouldShowStartupOverlay` rend **TRUE** au démarrage à froid ordinaire — `autoStart` vaut `true` par défaut et `!workspaceReady` suffit à lui seul. C'est donc `PreviewLoadingOverlay` (`.bolt-preview-loading-*`) qui est à l'écran, et `PreviewSplashSequence` (`.bolt-preview-splash-*`) — **celui que j'avais corrigé le 09/09** — n'est que le repli. Mon correctif visait la surface qui n'a pas le problème, et mes trois tests étaient verts dessus : **la définition même du faux vert**, celui-là même que le CLAUDE.md décrit pour Chromium contre Safari. Vérifié moi-même dans le code avant d'agir, pas seulement rapporté. La règle fautive était intacte : `.bolt-preview-loading-steps strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 10px }`. La carte réelle est alignée sur ce qui avait déjà été démontré sur l'autre : repli du libellé, deux colonnes sous 640 px, pastille numérotée arrimée à la PREMIÈRE ligne (`align-items: flex-start` + `flex: 0 0 auto`), et `max-height: 100%; overflow-y: auto` sur la carte — sans quoi on échange une troncature horizontale contre une VERTICALE, l'override mobile portant déjà cette garde que la règle de base n'avait pas (donc ni ordinateur ni tablette). Contre-épreuve : `nowrap` remis → rouge. épinglé par `app/components/workbench/Preview.splash-coupures.spec.ts` (4 tests de plus, qui visent désormais LES DEUX cartes)

