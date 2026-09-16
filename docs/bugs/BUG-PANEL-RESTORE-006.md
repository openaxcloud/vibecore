---
id: BUG-PANEL-RESTORE-006
section: "Balayage QA du 2026-09-04 — panneaux instables, lenteur, archive, état de l'IDE"
---

## Bug

**Défaut de COMPORTEMENT, distinct de la performance — la restauration de l'IDE se ré-appliquait par-dessus ce que l'utilisateur venait de changer.** L'effet `BaseChat.tsx:5004-5220` dépendait de `projectFiles` (la carte ENTIÈRE des fichiers) : chaque vague de chargement le faisait rejouer, et chaque rejeu ré-appliquait **toute** la restauration — `rightPanelOpen`, `rightPanelMode`, `rightPanelWidth`, `workspaceTabs`, `mobilePanel`, `currentView`, `showWorkbench`, fichier sélectionné, éléments verrouillés — en écrasant les changements faits entre-temps. **Candidat sérieux pour les « l'IDE change tout seul » qu'on n'a jamais su reproduire** : la fenêtre de rejeu est le démarrage, exactement quand l'utilisateur commence à cliquer. Corrigé dans la même PR que BUG-PANEL-PERF-004 (dépendance retirée, lecture via miroir `useRef`).

## 📤

—

## 💻

✅

## ✅

❌ (non reproduit en tant que symptôme utilisateur)

## Preuve

PR #439. Le retrait est sûr parce que le seul usage de `projectFiles` dans cet effet — décider restaurer-maintenant vs différer — est **déjà mieux traité dix lignes plus bas** par `pendingProjectSelectedFile` + son effet consommateur (repli par suffixe compris), désormais extrait et testé : `app/lib/ide/pending-selected-file.spec.ts`. **Je n'ai PAS reproduit le symptôme utilisateur** — c'est un défaut lu dans le code, pas observé.

