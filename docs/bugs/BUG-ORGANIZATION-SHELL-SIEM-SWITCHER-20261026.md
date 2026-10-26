---
id: BUG-ORGANIZATION-SHELL-SIEM-SWITCHER-20261026
---

## Bug

Organisation : description longue masquée, tableau SIEM débordant et dialogue Switcher peu accessible.

À320px, un nom synthétique non sécable de324 caractères (valide pour le contrat API) donne une description Security client255/scroll2330, malgré un document contenu. Le tableau SIEM agrandit le document à371px FR ou403px EN : son libellé Actions `sr-only` absolu échappe au scrollport non positionné. Sur Switcher, le CTA Nouvelle organisation mesure33px à1440 et Escape rend le focus à BODY après fermeture. Le seuil44px est l’objectif produit, sans déduction automatique de violation WCAG.

## 📤 Dispatché

☑ 26/10/2026 — Mission UI globale, lot local isolé ; périmètre revu avec le parent.

## 💻 Codé

☐ Sur main. Correctif local uniquement ; aucune fusion ni livraison déclarée par cette fiche.

Repli local de la description AppShell ; conteneur de tableau SIEM `relative` ; hauteur44px et option existante `restoreOpenerFocus` sur Switcher. Aucun changement de permission, API, navigation ou modal partagé. Ces symptômes du même parcours organisation sont regroupés ; ils sont distincts des noms de rôles/labels de permissions de BUG-ORGANIZATION-TEXT-TARGETS-20261025.

## ✅ Testé live

☐ En production. Chromium local et données synthétiques uniquement ; aucune authentification production, mutation réelle, achat ou nouvel accès.

## Validation locale

37 tests existants et lint ciblé verts. Recette compilée10599 :48 observations sur trois routes ×320/390/768/1440 ×FR/EN ×clair/sombre,8 groupes d’interactions, puis quatre fermetures depuis le vrai déclencheur et défilement clavier SIEM. Aucun débordement document ni erreur JS. Ces48 observations restent attribuées à10599, sans être recomptées comme un replay11099.

Complément11099 ciblé FR clair844×390 : dialogue Switcher contenu, Escape restitue le focus ; Security retrouve molette/PageDown et récupération par molette après resize. Champ Security x43 pour une limite sûre47 :4px de marge horizontale restent non traités. L’entrée directe ?create=1 sans déclencheur est exclue de la promesse de retour au bouton. [Complément compilé](ui-coverage-2026-10-26/safeareas/after11099/README.md).

## Preuves et limites

[Avant10499 et contrepreuves](ui-coverage-2026-10-26/organization-after10599/before10499/README.md), [après compilé10599 et limites](ui-coverage-2026-10-26/organization-after10599/README.md).

Pas de certification globale des routes/états, Safari/Firefox, clavier virtuel physique ou safe areas matérielles. Les comptes de cas partagés ne s’additionnent pas entre fiches.
