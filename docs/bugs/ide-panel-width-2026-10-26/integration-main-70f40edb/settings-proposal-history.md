# Settings Usage/Memory — proposition isolée, 26 octobre 2026

Base examinée : 90d92ff12e12dc72b0516eb7da9bfea52552d44b dans /workspace/vibecore-ui-panel-width. Aucune modification de source appliquée par cet agent, aucun commit/publication. BaseChat est réservé : accord de périmètre encore attendu avant application.

## Delta proposé

`proposed.patch` modifie seulement BaseChat.tsx : import du module local, classe racine ProjectSettingsPanel (16403), grille Usage (16717), tableau limites (16744, classe et tabIndex=0), grille Memory (16982). Le nouveau fichier proposé `ProjectSettingsPanel.module.scss` adapte la grille à la largeur du conteneur, conserve les colonnes du tableau via défilement horizontal et contraint les champs locaux. Ni API, ni handlers, ni valeurs, ni navigation globale modifiés. `BaseChat.proposed.tsx` est la copie complète résultante. Le patch ne contient pas le nouveau module : les deux livrables doivent être examinés ensemble.

Cause : les anciennes grilles dépendent du viewport (seuil900px), alors que le panneau peut mesurer360–640px sur un écran2048px. La première colonne Usage tombe à0px ; les champs Memory imposent une largeur supérieure à leur carte.

## Preuves finales réellement exécutées

- `react-receipt.json` :36 observations (18 avant/18 après), Usage/Memory, écrans1280/1536/2048, panneaux360/640/1000, EN sombre. Le vrai JSX ProjectSettingsPanel est extrait par AST (`extract.cjs`) avec ses handlers, helpers et imports produit, puis monté par Vite avec les styles et catalogues réels. Ce n'est pas le shell IDE complet.
- Les18 observations après ont une racine contenue. Usage panneau640 : première cellule0→356px ; Memory panneau360 : débordement273px→0. Le brouillon Memory survit au redimensionnement. Le tableau Usage à360 reste accessible et défile avec ArrowRight.
- `zoom-receipt.json` :16 cas après, FR/EN × clair/sombre × Usage/Memory × panneaux360/640. Zoom natif Chromium200% : fenêtre externe2048, innerWidth1024, DPR2 et visualViewport.scale1. Les brouillons et le focus survivent au passage du panneau à320 puis au retour. `zoom.cjs` utilise un profil temporaire avec partition.default_zoom_level, pas une simulation deviceScaleFactor.
- `stored-memory-receipt.json` :2 passages supplémentaires avec mémoire synthétique longue, ouverture Edit, brouillon, resize et Cancel ; aucune sauvegarde/suppression.
- Zéro erreur JavaScript dans ces reçus finaux. Captures `react-before-*`, `react-after-*`, `zoom-*`. La capture Memory après comporte la mémoire longue supplémentaire.

## Reproduction et limites

`vite.config.mjs`, `main.tsx`, `Settings.before.tsx`, `Settings.after.tsx`, `react-check.cjs`, `zoom.cjs` et `stored-memory.cjs` constituent le harness local réexécutable. Dépendances existantes uniquement. Serveur Vite14899 ; `react.html` monte la variante before/after suivant les paramètres du script. Données et GET interceptés synthétiques ; aucune opération client réelle, quota, facturation ou écriture exercée.

La première recette JSX/zoom avait des catalogues incomplets (libellés Unavailable) : ses reçus `incomplete-i18n-*` sont conservés mais INVALIDES pour valider le rendu. Les reçus sans ce préfixe ont été rejoués après chargement des vrais catalogues IDE. `receipt.json` et les captures sans préfixe react sont un diagnostic HTML/CSS antérieur, pas la preuve JSX finale.

Pas de build intégré, typage global, tests backend, recette production, Safari/iOS physique ni validation complète de tous les onglets Settings. Les captures utilisateur Library n'ont pas été obtenues : la description reçue n'est pas assimilée à une capture inspectée. Le module SCSS a été formaté avec Prettier ; l'intégration et sa revue restent à faire après accord sur BaseChat.

## Révision de périmètre après revue indépendante

La classe racine du module est désormais appliquée UNIQUEMENT si settingsTab vaut usage ou memory. Tous les sélecteurs du module nécessitent cette classe ; les autres onglets ne reçoivent ni correction de grille/sidebar/champs ni container-name local.

`scoped-check.cjs`, `scoped-receipt.json`, `scoped-check.log` :16 observations supplémentaires sur le JSX final (avant/après × panneaux360/640 × Project/Usage/Memory/Account), viewport2048. Les mesures rootWidth/rootScroll, colonnes de layout, position/display du sidebar et containerName de Project/Account sont identiques avant/après. Usage/Memory restent contenus ; brouillon ET focus Memory préservés pendant resize320 puis retour. Zéro erreur JavaScript. Les36 observations et16 zooms précédents portent sur la même correction active Usage/Memory ; la dernière modification ne change que son activation selon l'onglet. Ces suites n'ont pas été répétées inutilement et ne sont pas présentées comme rejouées après ce changement. Toujours aucun fichier produit appliqué.
