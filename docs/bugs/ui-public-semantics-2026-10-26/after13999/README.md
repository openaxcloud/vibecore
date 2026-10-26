# Recette compilée commune après correction

Source cc5574d67ec1b37809fb7bbdfaa7519ac163cc38, build SHA256 e2b7f974c130bb239d1c1d9d7d132d648e39b2a2b8f4c606a47368bbe7a6f23c. HTML et JS200 avant démarrage. Les4composants et le test sont identiques aux hashes du correctif isolé (after-source-comparison.json). Serveur13999/API6999 partagé avec recette contraste de ui_remaining, sans réel backend.

- Sémantique/géométrie :48observations =3composants×320/768/1024/1440×FR/EN×2thèmes,192CTA. Texte/href identiques baseline ; mainunique/navfooterhorsmain, absenceboutonimbriqué, contrôle≥44px, Range/intrinsic/document contenus. Aucun changement de largeur/hauteur des192CTA supérieur à1px (geometry-deltas.json vide).
-48séquences clavier : focus initial programmatique du premier lien puis vrais Tab, lien→lien sans doublearrêt.12parcours activation réelle Entrée du deuxième CTA, GET vers contact-sales oudocs, puis Back restitue routeorigine. AucunPOST/externe. La duplication alias marketing/bounties n'est pas recomptée comme composant supplémentaire ; baseline8séquences mobiles prouvait son défaut, composantsource commun vérifié.
- Hero Deployments :44observations =11formats320/360/390/844paysage/768/820/1024/1280/1440/1920/2560×FR/EN×2thèmes ;3cartes conservées, contenu/Range/intrinsic/doccontenus, CTA docs≥44 après asChild et href docs/contact-sales inchangés.8séquences focusTab/ShiftTab/Escape à320/1024. Ces44observations recouvrent partiellement les48 et ne représentent pas de nouvelles pages distinctes.
- Zéro pageerror dans les2recettes. Requêtes nonGET/tiers interdites ; interceptions conservées dans chaque reçu, pas de tests réseau réel.

Inspection visuelle ciblée : heroFRclair320 montre CTA complet sur2lignes et contourfocus visible, carte lisible ; TeamsFRclair320 montre ses2CTA de baspage complets. CaptureTeams prise aprèsTab, hautduheading est horszone sousheader à cause de la position de scroll ; aucune conclusion de clipping intrinsèque du titre à partir de ce cadrage. Pas de certification contrasteWCAG, lecteurd'écran, Safari/Firefox ou production.

Les48géométriesavant et leurs doublesarrêts restent archivés séparément dans ../before. Le premier échecconnexionbaseline est conservé comme harness, pasdéfautproduit. Aucun rebuild ni changementsource durant recette. Les scripts *.executed.txt conservent le code lancé et ses chemins de provenance.

Cleanup terminé après fermeture des navigateurs sémantique/hero et confirmation contraste : PID212685/212686 résiduels étatZ sanscmdline, ports13999/6999 libres. Aucun serveur vivant ; ne pas assimiler ces zombies à une disparition de /proc.
