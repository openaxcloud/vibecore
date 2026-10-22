---
id: BUG-DESKTOP-PREVIEW-TOOLBAR-CLIP-001
---

# Commandes Webview hors de la zone visible avec Library ouvert

## 📤 Dispatché

Audit desktop du22octobre sur main18745bd : viewport1440×900, Webview avec Library àdroite. La barre mesure735px (x410→1145), son groupe d’actions dépasse jusqu’à1314 ; le bouton Logs atteint1280 et est hors de la zone visible initiale. Captures et mesures réelles conservées.

## 💻 Codé

Correctif local en cours, non publié : Preview.tsx et style local Preview.module.scss autorisent les groupes à revenir à la ligne selon la largeur disponible du panneau desktop. Aucune commande retirée ; styles mobile préservés.

## ✅ Testé live

Rouge géométrique reproduit sur le build réel attesté : bouton Logs dépasse le bord de barre. Le clic Playwright seul peut réussir grâce au défilement automatique préalable ; il ne faut donc pas revendiquer une action définitivement inaccessible. Un premier sélecteur de panneau Logs erroné a été identifié comme erreur de recette, pas comme bug produit. La recette verte sur build corrigé reste à exécuter. Aucun succès production revendiqué.

### Validation locale du lot desktop — 22 octobre

Build `c382137ad72eeb983b40493e40bc296cd85e61c1`, arbre `f26a295f50a7ddb890f8f5800db457d563a70630` : cinq scénarios ciblés et deux scénarios tactiles passent directement, zéro retry et zéro omission. API et données synthétiques locales, interface compilée ; aucune certification production ni des actions métier non exercées. Voir [recette et limites](desktop-panels-2026-10-22/README.md). Les échecs antérieurs sont conservés.
