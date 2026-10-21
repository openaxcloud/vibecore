---
id: BUG-UX-TOUR-OCCLUSION-001
---

# La visite guidée recouvre les actions Instantanés

## 📤 Dispatché

Revue #753 du 21 octobre 2026. ProductTour explicitement autorisé, autres chemins dashboard/signup réservés.

## 💻 Codé

Correctif sur la branche de #753, non intégré à main : mesurer le panneau fixe et réserver du défilement dans la coque user area ; marge de défilement des contrôles hors visite et recentrage du contrôle focalisé lorsqu’il intersecte la carte (ouverture/redimensionnement/changement de focus). Le menu bas mobile est conservé.

## ✅ Testé live

Production non vérifiée. Avant : focus DOM sur Créer en mobile 390×844 mais centre recouvert par ProductTour. Le profil standard Chromium 1280×720 reproduit aussi une interception en EN ; la première correction limitée aux petites largeurs est insuffisante. Les preuves et limites de la correction toutes largeurs sont consignées dans [la recette](ux-confirmation-2026-10-21/review/README.md). Aucun panneau entier certifié.

Recette finale locale : six cas FR/EN sur trois formats et deux cas standard Chromium passent ; création avec visite ouverte, focus visible après annulation, défilement tactile à 390×320 et persistance des deux fermetures vérifiés. Captures avant/après et manifestes dans la recette liée. Pas de certification production.
