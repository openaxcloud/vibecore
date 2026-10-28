# Recette ciblée des interactions IDE — 28 octobre 2026

Base : `9ec6ebf75d88573e58b84e926bfaeb308e4159ac`. Composants de production compilés, Chromium local ; données et réponses réseau synthétiques isolées. Aucun compte client, commande shell distante, écriture Memory réelle ou backend production testé. Cette recette ne certifie pas l'ensemble de l'IDE.

## Matrice de couverture

| Surface | Contrôle exécuté | Résultat et limite |
| --- | --- | --- |
| Settings / Usage / Memory | 320, 390, 768, 1024, 1280, 1440 px ; contenu FR long, tableau, erreur puis reprise, vide | Recette locale après compilation ; captures et reçus conservés dans l'espace de travail. Aucun défaut d'overflow établi sur ces états. |
| Settings / Usage / Memory | Zoom Chromium natif 200 %, viewport CSS 1280×856, DPR 2, visualViewport.scale 1 | Contrôlé ; ce n'est pas une simple émulation DPR. |
| Settings / Memory | Redimensionnement avec saisie, après stabilisation : 320→1280, 390→1280, 1280→768 | Trois échecs : remplacement de coque, onglet réinitialisé, brouillon perdu. Correctif séparé en préparation ; non résolu par ce lot. |
| Search | Réponse ancienne après nouvelle recherche | Tests isolés de réponses et erreurs différées ; navigateur 390 et 1280 px avec réponse ancienne explicitement terminée. Incident distinct confirmé : saisie alpha acceptée puis nœud input démonté et remplacé vide, route inchangée ; transition responsable encore à établir, hors correction des réponses réseau obsolètes. |
| Files | Entrée pendant composition IME, Entrée ordinaire, Escape | Tests composants sur saisie réelle React ; pas de création de fichier client. |
| Shell | Ouverture clavier, Escape, focus et menus | Avant : échecs navigateur 390/1280 ; conflit Escape global et autofocus différé établis. Après correction clavier : 390/768/1280/1920 verts une fois stabilisés, huit contrôles atteignables en paysage 844×390. Après le correctif d’autofocus : cas précoce 390/768 verts ; à 1280 un échec puis une recette instrumentée verte, origine du premier non établie. CSS final : les huit contrôles à 390 et 844×390 passent les hit-tests du centre et du bord inférieur, avec bas du contrôle au-dessus de la navigation. |
| Breadcrumb historique | Bouton natif, ouverture clavier, Escape et retour focus | Tests avec Radix et hook global réels, enfant FileTree simulé. Pas de preuve de parcours entièrement clavier dans le vrai arbre ; ce composant n'est pas la barre Monaco de la route IDE principale. |
| Monaco, transport terminal et sauvegarde cloud | Affichage de README via archive synthétique | Pas de validation fonctionnelle du runtime ou de persistance backend. |

## Tests et revue

- 50 tests ciblés passent dans sept fichiers (Search lifecycle/i18n, FileTree, TerminalTabs, Breadcrumb, raccourcis globaux, catalogue FR).
- 14 tests existants de remplacement Search passent ; 16 gardes d'inventaire passent.
- Build client/SSR et typage global passent après le correctif d’autofocus TerminalManager. Lint global vert (52 avertissements préexistants) et lint du delta TerminalManager vert.
- Trois nouveaux scénarios E2E Shell sont collectés (390/768/1280) ; leur exécution CI reste à obtenir. Aucun résultat collecté n'est compté comme test réussi.
- Revue indépendante favorable du premier périmètre et du delta autofocus ; 28 tests passent dans les quatre suites terminal (8 Manager, 15 menus, 3 focus, 2 collage), sans cumul avec les suites déjà citées.
- Analyse de secrets sur les fichiers modifiés : aucun secret détecté, sortie masquée.

## Non contrôlé

Safari/WebKit, appareils physiques, clavier virtuel et safe areas réelles, lecteur d'écran, tous les thèmes et toutes les sous-pages Settings. Le paysage et 1920 px sont contrôlés seulement pour les menus Shell ; ultralarge non contrôlé. Aucune recette authentifiée production de ce lot ; aucune livraison annoncée avant contrôles et rollout vérifiés.

Le message Shell indisponible visible sur les captures correspond au transport synthétique sans PTY réelle ; il ne constitue ni une panne de production reproduite ni une validation du démarrage du Shell.

Un contrôle mobile a aussi révélé le bas du sélecteur Profil sous la navigation (bottom 833,125 px contre navigation vers 828 px). La réserve CSS est corrigée localement et les trois gardes source passent ; la compilation finale confirme la visibilité intégrale des huit contrôles à 390 px (navigation y=828) et en paysage 844×390 (navigation y=318). Le simple hit-test de son centre ne suffisait pas.

Captures synthétiques : [Shell avant](shell-390-before.png), [Shell après](shell-390-after.png), [paysage après](shell-landscape-after.png), [Memory](memory-390-local.png). Elles concernent le lot compilé sur base 9ec6ebf75, avant intégration de main 63e663830.
