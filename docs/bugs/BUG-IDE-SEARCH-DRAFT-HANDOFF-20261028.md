---
id: BUG-IDE-SEARCH-DRAFT-HANDOFF-20261028
---

## Bug

**Le brouillon Search disparaît au remplacement de la coquille IDE.** La recette Chromium locale a observé une requête saisie puis vidée, avec l'ancien nœud détaché et la route Search conservée. Plusieurs restaurations de layout ont été observées ; leur causalité exacte avec chaque transition de coquille n'est pas certifiée. L'incident est distinct des réponses API obsolètes corrigées dans le lot précédent.

## 📤 Dispatché

☑ 28/10/2026 — lot Search isolé, hors modèles, budget, workbench store et menus Terminal.

## 💻 Codé

☐ main — correctif local revu, prêt pour build et recette ; aucune publication ni livraison établie.

## ✅ Testé live

☐ production — tests de composants locaux uniquement pour ce correctif ; nouvelle recette navigateur et production non exécutées.

## Correction

Un contexte placé au-dessus des coquilles ClientOnly/Suspense conserve uniquement requête, texte de remplacement et options casse/regex. Sa portée utilise projectId, currentWorkspaceId du loader et fenêtre d'édition, avec un brouillon par identifiant réel de panneau. Un changement de portée abandonne les brouillons précédents.

Le panneau desktop reçoit son paneId ; la surface mobile reçoit activePaneId par Workbench et EditorPanel. Les appels historiques sans identifiant restent locaux. Résultats, requêtes en vol, confirmations et opérations de remplacement ne sont pas partagés. Aucun remplacement automatique, stockage persistant ou nouvel appel de mutation n'est ajouté. Les corrections antérieures contre les réponses obsolètes sont conservées.

## Validation locale

- Avant raccord Search : 2 tests rouges sur 6, perte au remontage et au retour vers un panneau.
- Avant raccord mobile : 1 test rouge sur 7, perte en passant à EditorPanel mobile réel.
- Après correction : 19 tests réussis, aucun ignoré, dans Search.draft, Search.lifecycle, Search.i18n et EditorPanel.i18n.
- Scénarios : remontage de composant, champs/options, effacement durable, isolation projet/workspace/fenêtre/panneau, fallback historique, passage desktop/mobile/desktop et absence d'écriture ou sauvegarde au remontage.
- Typage web, ESLint ciblé, Prettier et diff-check réussis. Runtime/API simulés dans les tests ; aucune donnée client utilisée.
- Revue indépendante : accord limité au périmètre local ; build et recette du nouvel assemblage restent nécessaires. Les tests de composants ne certifient ni navigateur physique ni service backend.

## Reste à vérifier

Recette Chromium mobile/tablette/desktop avec saisie pendant chargement et redimensionnement, identité du panneau lors des transitions, puis validations complètes et livraison normale. Le menu Terminal éphémère reste un incident distinct ; aucune globalisation de son état n'est incluse.
