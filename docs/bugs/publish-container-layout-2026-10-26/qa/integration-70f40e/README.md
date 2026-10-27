# Contrôle après intégration de main 70f40edb8

**4/4 scénarios verts au premier passage, zéro retry automatique.** Trois cas standard en19,4s et un cas au zoom natif Chromium200% en16,9s. Chaque scénario parcourt Overview, Logs, Domains et Manage avec les mêmes fixtures isolées et gardes de mutation que la recette précédente.

- Conteneurs320 et1120 dans un viewport2560.
- Viewport exact2048, Agent480 et Library380 : largeur centrale disponible1089, sans recouvrement ni débordement de page.
- Conteneur320 au zoom natif200%, vérifié avec les métriques Chromium.

Le build et le typecheck web passent sur l’arbre staged `b5f248a060de9580689036077df2a18821a83d18`, intégrant main70f40edb8 au lot Publish bcd068704. Aucune source n’a changé pendant le build. Le blob CSS reste `ee52ef788861c0cd893e465ff5d748ca2ba8ece5313a530270c879ae9bb0a9e9` et le test durable est inchangé.

Les douze résultats antérieurs restent attribués à la base90d92ff12 ; ce dossier contient uniquement le contrôle d’intégration ciblé. API/PostgreSQL locaux pour les fixtures, réponses GET contrôlées pour domaines et historique. Aucune mutation DNS/publication, aucun fournisseur exécuté. Manage peut afficher la détection du workspace indisponible : aucune publication fonctionnelle n’est revendiquée. Pas de validation production ou Safari matériel.

Les mesures et hashes sont expurgés. Traces, cookies, sessions et journaux serveur restent hors dépôt.
