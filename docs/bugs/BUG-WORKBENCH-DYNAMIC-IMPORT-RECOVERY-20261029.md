---
id: BUG-WORKBENCH-DYNAMIC-IMPORT-RECOVERY-20261029
---

# L’échec d’import Workbench survit à Reload panel

## État

📤 Dispatché : ☑ incident de recette Aster transmis le 29 octobre à 16:14 UTC.
💻 Codé : ☐ correction locale validée, aucune publication.
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
