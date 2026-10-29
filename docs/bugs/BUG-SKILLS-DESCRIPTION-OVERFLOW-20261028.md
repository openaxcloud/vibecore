---
id: BUG-SKILLS-DESCRIPTION-OVERFLOW-20261028
---

## Bug

Une URL longue dans la description Built-in Skills déborde du panneau sans possibilité de lire normalement sa suite.

## 📤 Dispatché

☑ 28/10/2026 — reproduction locale Chromium à390/820/1280/1536.

## 💻 Codé

☐ main — correction locale ciblée overflow-wrap:anywhere, aucune fusion ni livraison.

## ✅ Testé live

☐ production — données synthétiques exclusivement, aucune installation ni modification de compétence réelle.

## Diagnostic

Description synthétique example.invalid, aucune donnée cliente. ScrollWidth avant→contre-preuve DOM :3123→358 à390,3123→771 à820,2680→588 à1280,3176→815 à1536. Le test strict sans override reste rouge sur ancien build390. Le correctif conserve texte complet et actions, ne touche que le span description Built-in.

14 gardes AST/Problems passent, hash du bloc mobile gelé inchangé. Revue indépendante favorable. [Quatre recettes du build corrigé](ui-skills-overflow-evidence-20261028/README.md) passent sans override CSS ; build et lint réussis. aucun Safari, zoom200% ni backend réel validé. États vide et recherche Community vérifiés séparément, pas de certification des descriptions Installed/Community.
