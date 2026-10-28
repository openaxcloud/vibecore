---
id: BUG-IDE-SEARCH-DRAFT-HANDOFF-20261028
---

## Bug

**Le brouillon Search disparaît au remplacement de la coquille IDE.** La recette Chromium locale a observé une requête saisie puis vidée, avec l'ancien nœud détaché et la route Search conservée. Plusieurs restaurations de layout ont été observées ; leur causalité exacte avec chaque transition de coquille n'est pas certifiée. L'incident est distinct des réponses API obsolètes corrigées dans le lot précédent.

## 📤 Dispatché

☑ 28/10/2026 — lot Search isolé, hors modèles, budget, workbench store et menus Terminal.

## 💻 Codé

☐ main — correctif local revu, compilé et vérifié en navigateur ; CI exacte, fusion et livraison restent à obtenir.

## ✅ Testé live

☐ production — recette Chromium locale exécutée avec API synthétiques ; aucune recette production, Safari ou appareil physique.

## Correction

Un contexte placé au-dessus des coquilles ClientOnly/Suspense conserve uniquement requête, texte de remplacement et options casse/regex. Sa portée utilise projectId, currentWorkspaceId du loader et fenêtre d'édition, avec un brouillon par identifiant réel de panneau. Un changement de portée abandonne les brouillons précédents.

Le panneau desktop reçoit son paneId ; la surface mobile reçoit activePaneId par Workbench et EditorPanel. Les appels historiques sans identifiant restent locaux. Résultats, requêtes en vol, confirmations et opérations de remplacement ne sont pas partagés. Aucun remplacement automatique, stockage persistant ou nouvel appel de mutation n'est ajouté. Les corrections antérieures contre les réponses obsolètes sont conservées.

## Validation locale

- Avant raccord Search : 2 tests rouges sur 6, perte au remontage et au retour vers un panneau.
- Avant raccord mobile : 1 test rouge sur 7, perte en passant à EditorPanel mobile réel.
- Après correction complète : 34 tests réussis, aucun ignoré, dans les suites Search/EditorPanel et initialisation mobile ; six gardes index passent séparément.
- Scénarios : remontage de composant, champs/options, effacement durable, isolation projet/workspace/fenêtre/panneau, fallback historique, passage desktop/mobile/desktop et absence d'écriture ou sauvegarde au remontage.
- Typage web, ESLint ciblé, Prettier et diff-check réussis. Runtime/API simulés dans les tests ; aucune donnée client utilisée.
- Revues indépendantes favorables du scope, du transfert de focus et de l’initialisation Search. Build client/SSR final et typage web officiel passent. Le typage global officiel avait passé avant les deltas web finaux ; lint global sans erreur puis lint ciblé final vert. Les tests ne certifient ni appareil physique ni service backend.

## Focus et démarrage mobile

La sonde compilée a établi un défaut supplémentaire : après montage de la nouvelle coque, Search passait brièvement par Agent malgré son URL. Le reçu de focus expirait pendant cette absence de champ. La surface Search est désormais initialisée depuis la résolution canonique de son URL projet ; entrée nue Agent et autres routes restent inchangées. Le transfert de focus/sélection est limité au même scope/panneau/champ et au tour synchrone ; aucune prolongation arbitraire ni autofocus au retour ultérieur. Deux témoins focus et un témoin initialisation ont échoué avant correction.

La contre-preuve différant réellement le GET ide-state passe à 390 et 1280 : ancien nœud détaché, texte et sélection 1–4 conservés, focus rétabli et resize aller-retour réussi. À 390, Agent → Retour conserve le brouillon sans voler le focus, puis Suivant réaffiche Agent. [Captures et matrice](search-draft-handoff-evidence-20261028/README.md).

## Reste à vérifier

Le nouveau test E2E permanent a été collecté mais pas exécuté localement : un scénario Chromium à 390 px, deux projets supplémentaires explicitement ignorés. CI exacte puis livraison normale restent à obtenir. Le menu Terminal éphémère reste un incident distinct ; aucune globalisation de son état n'est incluse.
