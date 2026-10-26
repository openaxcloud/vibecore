# Notifications IDE — recette locale synthétique

Le problème est reproduit avec le vrai ToastContainer React-Toastify 11, le composant extrait de root.tsx et les feuilles réelles compilées. Le contenu des trois notifications, le marqueur IDE et le fond sont des fixtures explicites, pas une session de génération ni une recette de production. Les captures utilisateur n’ont pas pu être téléchargées : aucune inspection de ces images n’est revendiquée.

## Cause et correction

Les cartes empilées masquent leurs enfants avec opacity:0 tout en conservant leur grand fond opaque ; le sélecteur historique toast-body ne correspond plus au DOM v11. rich-before-390.png et rich-before.json montrent cette reproduction. Les IDs des émetteurs existent déjà : absence de déduplication non alléguée.

Le mode compact détecte les véritables marqueurs de coque IDE et la largeur <=1023 px, y compris paysage/tablette et anciennes routes. Les cartes deviennent une liste bornée défilable ; messages et actions conservés, limit=3 inchangé. Stacked reste activé dans Toastify pour préserver sa queue, et seuls les styles compacts neutralisent les restes position/transform/pseudo/opacity. Le retour desktop restaure le comportement de la bibliothèque. Le corps et le conteneur restent traversables aux gestes ; boutons/liens/summary/détails ouverts restent interactifs même sans footer statusbar. La fermeture a une cible 44×44 et une couleur de thème explicite : le blanc sur blanc provenait de la cascade réelle de la bibliothèque.

## Résultats exécutés

- E2E existant bandeau-toast-visible : 4/4 Chromium, zéro retry, CSS réel avec injection tardive de la bibliothèque. Deux cas historiques conservés, deux cas compact 390×844/844×390 ajoutés, avec marqueur legacy sans footer. Le rouge 2/4 avant correction pointer-events du conteneur est conservé dans e2e-legacy-container-red.txt.
- Vrai ToastContainer : 10 étapes de resize, deux thèmes × 390×844 → 844×390 → 820×1180 → 1440×900 → 390×844. Trois IDs identiques à chaque étape, position/transform/opacité vérifiés, commandes atteignables par Tab/Shift+Tab. resize-final.json.
- Huit parcours : 320/390/820/844 paysage × clair/sombre, fermeture clic puis Enter, détails focalisables et accessibles, conteneur défilé. interactions-final.json et captures visible-close-* correspondent au dernier CSS.
- 19 tests unitaires ciblés antérieurs du hook/toast et gardes visuelles verts (unit.txt). Lint final du test étendu : exit0. Build intégré et vérification application complète à réaliser par le parent après gel de source ; aucune validation production ici.

## Limites conservées

Un bouton déjà focalisé avant un changement de hauteur peut devenir hors de la fenêtre de défilement ; réappeler focus sur le même nœud ne le fait pas défiler. Le reçu intermédiaire resize-same-focus-clipped conserve ce constat. Tab puis Shift+Tab rétablit son accessibilité ; aucun remontage du conteneur ni perte de queue pour masquer ce cas. Les gestes sur le corps continuent à viser le fil derrière : la liste n’intercepte pas tout le toucher. Le parcours clavier et les commandes sont vérifiés, pas une recette physique VoiceOver/iPhone/clavier virtuel. Pas de certification de contraste WCAG, Safari ou Firefox.

Les scripts archivés conservent les chemins d’exécution exacts de cette machine et nécessitent adaptation des chemins pour être rejoués ailleurs. after.json est une mesure intermédiaire de tailles fixes, pas une preuve de resize final. Les données sont exclusivement synthétiques, sans POST ni appels tiers.
