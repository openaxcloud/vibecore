---
id: BUG-USERAREA-SECONDARY-RESPONSIVE-20261025
---

## Bug

À320/390px, un numéro de facture long reste coupé malgré `break-words` : conteneur800,8px pour255px disponibles. Un sujet Support non sécable déborde aussi à l’intérieur du lien : largeur défilante1576px pour223,5px. Les largeurs du document peuvent rester correctes et masquer ces deux défauts. À1280/1440/1920px, l’en-tête accessible Actions du tableau Clés API échappe au conteneur défilant et agrandit la page (1833px pour1280px). Les identités Membres sont tronquées sans expansion ; un nom de projet non sécable ne se replie pas dans sa carte, malgré le clamp de deux lignes ; le CTA modèle mesure aussi36px. Le CTA Support ne mesure que36px car une règle globale écrase sa hauteur minimale ; plusieurs contrôles de préférences Workspace mesurent19,875 à31,5px.

## 📤 Dispatché

Mission UI/UX globale poursuivie en parallèle pendant CI #792. Factures, Support et Workspace modifiés uniquement dans un worktree séparé.29PR ouvertes inspectées, aucune ne touche ces fichiers. Pas de changement de style global ni du composant thème partagé.

## 💻 Codé

☑ Fusionné normalement dans main par [#795](https://github.com/openaxcloud/vibecore/pull/795), commit `5b09bf65bd65f004a35aa778d549deac1546b871`. [Livraison GitHub Actions confirmée](https://github.com/openaxcloud/vibecore/actions/runs/40246418278), sans recette UI authentifiée en production.

Correctifs locaux : conteneur Facture borné, élément texte flexible dans le lien Support, contexte de positionnement local du tableau Clés API pour contenir son libellé accessible, hauteur44px locale pour CTA et contrôles Workspace/Modèles, identités Membres intégrales et mots longs des cartes repliés en conservant leur clamp de deux lignes. 154 tests ciblés uniques verts pour le lot consolidé, typage web strict et lint sans erreur ; build final réussi après nettoyage des anciens serveurs locaux. Recettes géométrie et clavier après correction archivées par build. Voir [validation](user-area-secondary-2026-10-25/validation/README.md).

## ✅ Testé live

Non. Fixtures synthétiques et navigateur local uniquement. Aucun achat, téléchargement de facture réelle, ticket réel, création/révocation d’accès ni secret. Les tests de préférences sont limités au navigateur temporaire.

## Preuves

[Factures / comparaison](user-area-secondary-2026-10-25/invoices-plans/README.md), [Support / Workspace / Desktop](user-area-secondary-2026-10-25/workspace-support-desktop/README.md), [Sécurité sans défaut confirmé](user-area-secondary-2026-10-25/security/README.md), [cartographie explicite des limites](user-area-secondary-2026-10-25/coverage-map.md).

Autre défaut confirmé dans les cartes : le pluriel français `many` manque pour1million/1milliard de déploiements et affiche Unavailable. Deux clés EN/FR ajoutées, avec test i18next FR seul rouge→vert ; moteur inchangé. [Preuves](user-area-secondary-2026-10-25/templates-recent/deployment-count/README.md).

Contraste Workspace : lien vers les paramètres des modèles à3,02:1 en clair, mesuré sur fonds simples. Token texte accessible existant utilisé localement ; contre-épreuve5,73:1 clair /8,16:1 sombre. Recette compilée finale8899 : 4/4 cas et148 textes éligibles, zéro échec ; classe DOM réelle sans override. Les preuves distinguent ce build du relevé initial8699.
