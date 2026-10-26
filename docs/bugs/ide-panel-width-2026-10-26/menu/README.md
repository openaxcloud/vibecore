# Menu Agent : largeur du panneau et conservation des interactions

Base : main90d92ff, worktree `vibecore-ui-panel-width`. Les captures utilisateur n’ont pas pu être téléchargées : aucune inspection de ces images n’est revendiquée.

## Delta gelé

Cinq fichiers : `ChatBox.tsx`, `ComposerToolsPortal.tsx` et son test, `IconButton.tsx` et son test tooltip. Les 35 PR ouvertes ont été inspectées avec pagination complète : aucun chevauchement sur ces sources. #424 touche le test existant ChatBox.toolbar et index.scss, laissés inchangés. Voir `pr-overlap.json`.

Le portail conserve un nœud DOM constant entre les racines desktop et mobile. Son positionnement tient compte de l’ancre, de la largeur du panneau et du viewport disponible. Le focus initial ne se déplace que pour une ouverture explicite au clavier, après insertion du portail. Escape restaure le déclencheur ; Escape dans le dialogue enfant conserve le menu. Aucune action supprimée. `hideTooltip` est optionnel et conserve le nom accessible.

## Recettes exécutées

Le harness extrait le vrai JSX du menu et son effet de fermeture ; il utilise les vrais IconButton, portail, WebSearch, ColorSchemeDialog et GlobalTooltip. Les autres entrées et la coque sont des fixtures. CSS index compilée et Uno réelles. Ce n’est pas l’IDE complet.

- `before.json` : trois fenêtres 2048/1536/1280, panneau 320. Menu x308→568 pour un panneau terminant à348 ; centre du premier bouton et bord droit inaccessibles. `after.json` : x80→340 et hits positifs.
- `interactions.json` : brouillon URL WebSearch, même nœud et focus conservés sur 390→1280→390→2048 ; Escape vers le déclencheur et clic extérieur vérifiés.
- `palette.json` : vrai dialogue Radix, couleur #123456 et focus conservés sur 390→1280→390 ; Escape ferme le dialogue enfant mais garde le menu.
- `zoom.json` : 18 cas, zoom natif 100/200 % × fenêtres 2048/1536/1280 × panneaux 220/320/480. Chromium settingsPrivate et CDP ; DPR1/2, scale1. Bounds et six contrôles accessibles dans chaque cas. Le rouge vertical initial est conservé dans `zoom-viewport-height-red.json`.
- `tooltip.json` : enrichissement BaseChat exact, transpilé et exécuté pendant l’ouverture. Tooltip Global et pseudo CSS absents, nom accessible conservé ; une nouvelle interaction après fermeture retrouve l’aide. **Le titre natif est néanmoins réinjecté par BaseChat** : `nativeTitleReinjectionLimit=true`. Aucune suppression native complète revendiquée.

## Vérifications

18 tests verts sur quatre suites : Portal3, IconButton1, ChatBox.i18n5, ChatBox.toolbar9. `unit-final3.txt`, `typecheck-final.txt` (tsc web exit0), `lint-confirm.txt` (exit0) et empreintes dans `source-hashes.json`. Build intégré coordonné par le parent.

Les échecs intermédiaires sont conservés : référence parent indisponible au premier montage, ResizeObserver absent dans jsdom, autofocus RAF trop tôt, input WebSearch démonté avant le traitement Escape, et ancre sortant du viewport au zoom. Les corrections conservent les assertions. Les premières sondes tooltip avaient des erreurs de harness (TS non transpilé, attente d’un nouvel événement sur un élément déjà focalisé), non attribuées au produit.

## Restes

Le toast desktop reste non corrigé : `/tmp/ui-toast-wide-panel/receipt.json`, viewport2048 et panneau Agent320, mode compact désactivé, carte riche blanche ~298.6px avec enfants opacity0. Les sources root/toast/hook sont identiques entre #807 et main90d92 : ce n’est pas la preuve d’une livraison absente. Une adaptation à la largeur réelle du panneau nécessite un lot coordonné distinct.

Recettes FR synthétiques uniquement, sans POST ni tiers. Pas de production, Safari/Firefox, clavier virtuel ou validation du remontage complet de BaseChat. Le titre natif réinjecté reste documenté. Navigateurs fermés et deux serveurs propres arrêtés, PID disparus (cleanup.json dans chaque dossier). Aucun commit, push, index ou fichier documentaire du dépôt modifié par cet agent.
