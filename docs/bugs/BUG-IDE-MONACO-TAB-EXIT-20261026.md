---
id: BUG-IDE-MONACO-TAB-EXIT-20261026
---

## Bug

Le build importe editor.api sans la contribution native toggleTabFocusMode. Tab indente normalement, mais Ctrl+M puis Tab ne permet pas de quitter l'éditeur sur Linux. Une régression navigateur comportementale sur le build témoin6f124189 confirme le défaut, sans retry.

`getAction()` n'est pas un oracle valide : la commande native est une Action2 globale et peut ne pas figurer dans les EditorActions même après correction. Le test vérifie désormais le focus et le contenu, pas cette API.

## 📤 Dispatché

26/10/2026 — correction locale distincte demandée après audit IDE ; #799 reste stable.

## 💻 Codé

☐ — local seulement, publication interdite avant coordination. La contribution native est chargée et attendue avec editor.api avant création de l'éditeur. L'indentation par défaut est préservée, ainsi que le raccourci natif propre à la plateforme (Ctrl+M Linux/Windows, Control+Shift+M macOS).

## ✅ Testé live

☐ — aucun Safari matériel, macOS réel ou environnement de production validé. 39 tests de package et typecheck strict passent ; build package passe. Reproduction navigateur rouge confirmée sur Linux. Sur le build corrigé, parcours entièrement clavier vert à 1440 px et en zoom Chromium natif 200 %, zéro retry sur les deux cas finaux : indentation initiale, sortie avant/arrière, retour, puis réactivation de l'indentation. Le test attend une bulle ChatImpl synthétique observable avant sa prise de focus initiale. Voir `ide-query-tab-exit-2026-10-26/local-qa-report.md`. Aucun backend ni fournisseur modifié.

## Limite distincte observée

Une trace du démarrage montre une instance Monaco focalisée remplacée par une nouvelle instance non focalisée avant le premier Tab. Ce lot ne corrige pas cette perte de focus ; la cause React exacte reste à établir. Les cas finaux vérifient le raccourci après disponibilité observable et ne revendiquent pas la stabilité du focus pendant ce remplacement. La preuve extraite est conservée avec le reçu local.
