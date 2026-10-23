---
id: BUG-IDE-PANEL-VIEWPORT-ESCAPE-001
---

# Panneaux tablette : barres hors écran et Échap intercepté

## 📤 Dispatché

23 octobre 2026 : reprise bornée sur main `8197fb55ac6813350d991e4adb70c3a444edd8ad`. Boutons Shell/Webview masqués après transitions et Échap inopérant dans Panels et le sélecteur d’onglets. Aucun contenu de #768, changement de breakpoint ou action sur le projet utilisateur.

## 💻 Codé

Correctif local : le viewport partagé Workbench utilise `overflow-clip` et reste borné en hauteur ; les scrollers internes restent actifs. Les feuilles mobiles écoutent Échap en capture comme le gestionnaire global de raccourcis, puis rendent le focus au déclencheur sans faire défiler la page. Non intégré/déployé.

## ✅ Testé live

Contre-épreuves sur le build compilé de main, API/PostgreSQL locaux et fichiers synthétiques réellement importés. À 1180×757, après Files → README/Editor → Problems → Shell → Webview puis répétition, le viewport de hauteur 637 contient un débordement de 2768 px ; `scrollTop=89`, vues à `y=-41`, barre Shell masquée. Un fichier long seul ne reproduisait pas ce défaut ; l’import de 60 fichiers et la sélection réelle dans Files le reproduisent. Aucun DOM modifié pour fabriquer la géométrie.

Panels reste ouvert après Échap sur son bouton focalisé. Un test séparé confirme le sélecteur d’onglets restant ouvert après Échap dans sa recherche. Le gestionnaire global en capture consomme la touche avant les anciens handlers en propagation.

Recette corrigée et limites : [voir le rapport du lot](panel-visibility-2026-10-23/README.md). Aucune certification production, runtime distant ou Safari ; aucun panneau entièrement certifié.
