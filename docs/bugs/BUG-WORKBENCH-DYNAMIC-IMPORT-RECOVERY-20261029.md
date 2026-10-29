---
id: BUG-WORKBENCH-DYNAMIC-IMPORT-RECOVERY-20261029
---

# L’échec d’import Workbench survit à Reload panel

## État

📤 Dispatché : ☑ incident de recette Aster transmis le 29 octobre à 16:14 UTC.
💻 Codé : ☐ correctif publié dans #853, sans fusion ni validation en production ; complément UI local en validation.
✅ Testé live : ☐ aucun correctif validé en production.

## Observations et reproduction

En production attendue #852, l’ouverture de `src/App.tsx` a échoué sur le module Workbench avec `Failed to fetch dynamically imported module`, puis `[panelBoundary] Workbench crashed`. Le testeur distinct a confirmé qu’un unique rechargement normal rétablit l’éditeur. L’action inline précédente sans panneau visible reste une observation distincte non diagnostiquée.

Localement, à 390×844 et 1180×757, l’interception fait échouer uniquement le premier GET du chunk Workbench, pas son CSS. L’erreur persiste après reprise automatique et Reload panel : aucun nouveau GET. L’import direct du même URL échoue également sans requête ; une URL de diagnostic distincte déclenche un GET et réussit. Un rechargement de page local rétablit l’éditeur. À 1280, le parcours utilise un autre chemin et ne demande pas ce chunk ; ce témoin négatif est conservé.

La limite de reprise concerne donc le rejet retenu par React.lazy et le cache de modules du navigateur. Elle ne prouve pas la cause initiale de production : indisponibilité transitoire, version ancienne après déploiement et asset supprimé restent des hypothèses. La requête HEAD depuis cet exécuteur a été bloquée par son proxy (CONNECT 403 avant l’origine), sans contournement ; aucun statut HTTP de production n’en est déduit.

## Correctif validé localement et limites

Une reprise unique et bornée du chunk Workbench strictement identifié, de même origine, avant le rejet final du lazy loader. Aucun rechargement automatique de page, aucune écriture de projet, modification CDN, nouveau secret ou accès. Un asset réellement absent ou une dépendance cassée doit rester en erreur explicite. Implémentation et build corrigé validés : une seule URL de secours fixe du chunk strictement identifié, avant le rejet final de React.lazy.

Recettes compilées **4/4 à 390/1180** : deux GET exactement, éditeur visible après succès du secours ; double échec conservé comme erreur accessible après auto-reprise et Reload panel, sans nouvelle boucle. Revue indépendante25 tests helper/Boundary. Validation globale parent :59 tests (43 UI+16 inventaire), typage officiel complet, build client/SSR, lint 0 erreur / 52 avertissements préexistants, i18n et typage E2E verts. Les ensembles se recouvrent ; ne pas les additionner. Aucun E2E complet backend réel local, exécution CI encore à venir. Publication et production restent non validées.

La cause de l’échec initial en production et l’action inline Open sans panneau visible restent inconnues ; le succès de récupération locale ne les résout pas.

Preuves : [archive et manifeste](ui-responsive-recovery-evidence-20261029/README.md). Réponses d’échec injectées sur fichiers applicatifs locaux, pas d’appel IA ou d’accès à la session Aster.

## Retour CI de #853 et correction du focus initial

La première tête publiée `78f28ed92` de [#853](https://github.com/openaxcloud/vibecore/pull/853) n’est pas validée globalement :

- Unitaires : 11261 réussis, 4 ignorés, 1 échec de garde d’empreinte. La revue indépendante confirme exactement six lignes ajoutées (`ref` et `tabIndex`) dans la tranche protégée. Le commit local `fca8125f2` actualise l’empreinte selon le cas 12 documenté, sans retirer la garde.
- E2E tranche 3 : port PostgreSQL 55432 occupé avant les tests ; blocage de préparation, pas échec produit ni validation.
- E2E tranche 2 : 7 échecs de `mobile-device-matrix` ligne 217, 133 réussis et 1 reprise liée au sélecteur d’onglets 1180 absent. Le champ de recherche Outils ne doit pas recevoir automatiquement le focus à l’ouverture pointeur : cette régression réelle n’était pas couverte par les premières recettes locales vertes.

Le nouveau correctif focalise le conteneur du dialogue plutôt que l’input. La première tabulation reste dans la modale ; le champ redevient focalisable volontairement. Le témoin rouge unitaire compte 3 échecs / 3 réussites, puis la revue indépendante 19 réussites. Validation finale : 57 tests ciblés réussis, build client/SSR et typage officiel complet réussis ; lint des fichiers modifiés sans erreur ni avertissement. Ces comptes se recouvrent et ne doivent pas être additionnés.

Les reçus `menus/final-container-matrix`, `final-container-handoff` et `final-pointer-seven` sont archivés : respectivement 5/5 formats (15 dialogues), 1/1 handoff query/focus, 7/7 profils pointeur. Verdicts terminaux confirmés par le propriétaire, tous sans reprise. Focus initial sur le conteneur exact, input Outils non focalisé, puis Tab atteint le premier contrôle ; bornes, hit-test et Escape passent. Le handoff détache l’ancien input 9 et restaure le focus Webview sur le nouvel input 12. Navigateurs fermés, aucun profil résiduel. Les profils sont des viewports Chromium émulés, pas des appareils physiques. Les anciens reçus restent inchangés et ne sont pas requalifiés comme validation du nouveau comportement.

Cette nouvelle révision reste locale, non publiée et non validée en production. #853 existe déjà ; cela ne signifie ni fusion ni livraison. La perte d’Enter pendant remplacement de coque, la reprise Tabs 1180, #834, la cause initiale d’import production et l’ouverture inline ambiguë restent ouvertes. Aucun E2E complet avec backend réel local exécuté pour ce complément ; nouvelle CI à obtenir après publication.
