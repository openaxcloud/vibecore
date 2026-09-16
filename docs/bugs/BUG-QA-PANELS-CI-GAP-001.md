---
id: BUG-QA-PANELS-CI-GAP-001
section: "Balayage QA du 2026-09-04 — panneaux instables, lenteur, archive, état de l'IDE"
---

## Bug

**P2 — 6 des 32 onglets de l'IDE n'ont AUCUNE couverture dans le smoke des panneaux, dont le panneau Agent, qui est la surface centrale du produit.** `tests/e2e/ide-panel-smoke.spec.ts` couvre 26 panneaux (`ideServicePanels` + `editor`/`preview`/`files`/`search`/`locks`). Les 6 absents sont **`agent`**, **`skills`**, **`studio`**, **`ports`**, **`commands`**, **`share`**. Le cas `agent` est le plus gênant : c'est à la fois le panneau le plus utilisé et celui qui concentre le plus de correctifs récents non encore en ligne (5 commits sur `main` absents de la prod au 01/09 : `7fe97070b`, `c6197a225`, `ff290b502`, `9f36084fd`, `9a3fcd18f` — dont « 54 % des messages d'assistant sont VIDES en base » et « le fil d'un projet rouvert était reçu puis jeté »). Un panneau qui casse à répétition et qu'aucun smoke ne couvre est exactement la combinaison qui laisse passer les régressions. ⚠️ **`share` n'est pas un panneau** mais une action (« copier le lien du projet »), donc son absence du smoke des *panneaux* est normale ; elle est comptée ici parce que l'action elle-même n'est couverte nulle part.

## 📤

☐

## 💻

☐

## ✅

✅ **01/09** recoupement mécanique

## Preuve

Recoupement des **32** ids déclarés dans `app/lib/mobile-ide-tabs.ts` avec la liste `ideServicePanels` de `tests/e2e/ide-panel-smoke.spec.ts` (26 entrées après ajout des 5 cas spéciaux). Différence exacte : `['agent','commands','ports','share','skills','studio']`. Contrôle en sens inverse : **aucun** panneau couvert par la CI n'est absent des onglets (`ci - tabs = []`), donc l'écart n'est pas un artefact de nommage.

