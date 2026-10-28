---
id: BUG-IDE-PANEL-INTERACTIONS-20261028
---

## Bug

Audit ciblé sur main `9ec6ebf75` : une recherche ancienne peut remplacer les résultats ou afficher son erreur après une nouvelle requête ; les anciens résultats restent remplaçables pendant la temporisation. Une recherche programmée survit aussi au démontage. Dans Files, Entrée pendant une composition IME crée prématurément le fichier. Les menus Shell n'ouvrent pas au clavier et Escape global intercepte leur fermeture locale. Le fil d'Ariane du Workbench historique utilise des spans non accessibles au clavier et ignore l'ouverture demandée par Radix. Memory traduit « Save memory » par « Économiser de la mémoire ».

## 📤 Dispatché

☑ 28/10/2026 — lot indépendant des fichiers workbench store, modèles et budget réservés au hub #828/#829. Audit, corrections, revue indépendante et validations ; livraison sérialisée avec les autres lots.

## 💻 Codé

☐ main — corrections locales en validation, aucune livraison de ce lot encore établie.

## ✅ Testé live

☐ production — aucun test authentifié production de ces corrections. Composants réels en tests isolés ; recette Chromium locale avec API synthétique, résultats et limites à consigner dans la fiche de validation.

## Correction

Invalidation des réponses, erreurs et résultats remplaçables dès changement de recherche, annulation du délai au démontage. Entrée/Escape locaux et protection IME dans Files. Menus Shell avec focus, navigation clavier et fermeture locale explicite ; Escape global délègue seulement aux propriétaires identifiés et laisse les autres raccourcis inchangés. Déclencheurs natifs et ouverture contrôlée du fil d'Ariane historique. Libellé Memory corrigé sans modifier la persistance.

Le fil d'Ariane appartient au Workbench historique : ce correctif ne doit pas être présenté comme une recette du toolbar Monaco de `/projects/:id/ide`. Les tests de transport et résultats simulés ne constituent pas un test du runtime production.

## Incident distinct conservé

Le navigateur a aussi établi un autofocus Shell différé de 100 ms qui reprend le focus après ouverture du menu, provoquant sa fermeture. TerminalManager ne propose désormais ce focus que si aucun contrôle n'est déjà focalisé et annule la proposition dès une interaction utilisateur. Les actions explicites de focus restent inchangées. La recette et les limites sont suivies dans [la matrice du lot](ui-panel-usability-evidence-20261028/README.md).

Settings/Memory perd son onglet et son brouillon après remplacement de coque responsive : reproduit localement trois fois après stabilisation, 320→1280, 390→1280 et 1280→768. Ce lot ne corrige pas cet incident ; aucune modification gratuite de CSS ne le masquerait. Un correctif séparé doit préserver l'état au bon scope projet/fenêtre sans toucher aux modèles ni au budget.
