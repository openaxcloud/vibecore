---
id: BUG-PUBLIC-TEMPLATES-CARD-CLIPPING-20261026
---

## Bug

Catalogue public Templates : cartes et liens d’action coupés sur petit mobile.

Sur /templates anonyme EN320 clair/sombre,12 cartes atteignent x366,81 et les liens Use template x341,81, alors que document.scrollWidth reste320. La largeur du document seule masque donc le défaut. Piste de grille implicite et groupes flex non repliables identifiés ; aucune couverture transférée depuis /dashboard/templates ni vers /marketplace/templates.

## 📤 Dispatché

☑ 26/10/2026 — Mission UI globale, lot local isolé ; périmètre revu avec le parent.

## 💻 Codé

☐ Sur main. Correctif local uniquement ; aucune fusion ni livraison déclarée par cette fiche.

Delta local dans EcodePublicResourcePages.tsx : piste explicite grid-cols-1, min-w-0 et repli des groupes/titres/métadonnées. Images, badges, texte et actions conservés. Source appliquée localement ; résultats compilés détaillés dans Validation locale.

## ✅ Testé live

☐ En production. Chromium local et données synthétiques uniquement ; aucune authentification production, mutation réelle, achat ou nouvel accès.

## Validation locale

Avant10799 :32 observations communes Templates/Docs et8 parcours communs ; la contrepreuve DOM reste distincte du résultat compilé.

Après10899 :88 observations communes sur11 formats ×FR/EN ×clair/sombre,8 groupes d’interactions et4 zooms natifs200% FR/EN clair. Part Templates :44 observations,4 groupes et2 zooms ; cartes et actions contenues, aucun retrait de contenu. Recherche, réinitialisation, filtre clavier, Tab/Escape, resize et Retour passent. Aucun import, téléchargement ou création.

[Archives avant/après10899](ui-coverage-2026-10-26/public-next/README.md). Ces44 géométries Templates ne sont pas rejouées11099. Le GET503 aux libellés indistincts reste ouvert ; aucun succès backend ni certification de toutes les variantes.

## Preuves et limites

[Synthèse et chemins des preuves10799](ui-coverage-2026-10-26/README.md). [Reçus et captures archivés](ui-coverage-2026-10-26/public-next/README.md). Le défaut GET503 aux libellés indistincts reste séparé et non corrigé par ce patch.

Pas de certification globale des routes/états, Safari/Firefox, clavier virtuel physique ou safe areas matérielles. Les comptes de cas partagés ne s’additionnent pas entre fiches.
