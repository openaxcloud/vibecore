# Découverte et aide — audit local et correction Galerie

Source isolée b72c48322, groupe `discovery_help` de l’allocation146. Aucun build nouveau : recette initiale sur12999 avec build compilé existant du worktree safecontent (UI975 et intégration #798), API strictement locale6599. Les46 fichiers routes/dépendances directes comparés sont identiques au worktree détenteur du build avant correction (`source-provenance.json`) ; ce n’est pas une recette de production ni une certification de toutes dépendances transitives.

## Dénominateur et résultats

15 IDs correspondent ici à14URL, dont un parent Outlet sans écran autonome : community, community.post.$id (mobile-preview-checklist), explore, forum, gallery._index, gallery.$slug (synthetic-gallery), help, help-center, languages, marketplace._index, marketplace (parent indirect), marketplace.templates (réexport Templates), search, templates_.languages, tutorials. Les deux URL /help et /help-center sont distinctes ; aucun doublon supprimé par supposition.

[La matrice](matrix.json) trace280 observations =14URL ×5formats (320×740,390×844,844×390,820×1180,1440×900) ×FR/EN ×clair/sombre. Zéro erreur JavaScript ; les112 requêtes tierces bloquées sont des GET Google Fonts, aucun POST tenté dans cette matrice. Les mesures portent sur les headings/textes sélectionnés et le document, pas sur chaque descendant et chaque état possible.

Quatre groupes supplémentaires exercent une requête longue Search, son effacement, conservation pendant redimensionnement, recherche HelpCenter vide puis récupération et redirection d’un post communautaire inconnu vers /community. Le filtre HelpCenter s’exécute en mémoire ; Search utilise son catalogue serveur local. Ces parcours n’ont pas tenté de publication, remix, commentaire ou message.

La première mesure galerie dans `interactions.json` est **invalide pour certifier le détail/Retour** : `waitForLoadState` immédiatement après clic pouvait terminer avant la transition. Elle rapporte le titre de liste sous galleryDetail et une URL détail sous galleryBack. Ce reçu reste conservé. Le script `navigation.cjs.txt` attend ensuite titre exact du listing, URL détail, puis carte et URL liste après Back ; `navigation.json` confirme les4groupes FR/EN×thèmes, zéro erreurJS. Seul ce second reçu justifie le parcours galerie. Le complément `navigation-search.json` vérifie aussi, dans les4groupes, le clic sur un résultat vers Templates puis Back vers Search avec `q=api` et champ `api` conservés ; la répétition du parcours Galerie dans ce complément ne compte pas comme quatre nouveaux scénarios distincts.

`recovery.json` contient4cas503 (liste/détail ×FR/EN) avec écran d’erreur réellement localisé et récupération par **rechargement navigateur**, après restauration de la fixture ; pas un bouton Retry produit supposé. Deux états vides de liste sont exercés sous fixture. Aucun403/authentification réelle ni acquisition du modèle n’est testé.

## Défaut et delta local

À320px, titre de carte Galerie sans espaces : client246px mais scrollWidth287px. Tag long : largeur936px et bord droit973px, hors carte, masqué par son clipping malgré documentWidth320. Le contrat adminGalleryListingSchema (`services/api/src/app.ts:28428`) accepte titres/tags nonvides sans limite de longueur : données synthétiques valides pour ce contrat.

Contrepreuve DOM,4groupes : overflow-wrap:anywhere sur le titre et les tags, max-width100% sur tags suppriment ces deux dépassements. Voir `interactions.json.counterproof`, capture avant `_gallery-320.png` et `gallery-card-proposed.png`. La capture proposée est une **injection CSS de diagnostic**, pas un build corrigé.

Correction autorisée et revue par le parent : uniquement deux classes dans `app/routes/gallery._index.tsx`, sans tronquer ou supprimer le texte, sans changer composant partagé, navigation, API ou action. Sept tests existants Galerie SSR/detail passent ; lint ciblé et Prettier passent. Aucun test de source miroir ajouté pour prétendre démontrer une cascade CSS ; recette compilée après consolidation encore requise. Aucun build lancé ici pendant les travaux Auth/Org concurrents.

## Preuves et limites

`before12999/` conserve reçus, scripts exacts exécutés en `.txt`, journaux (y compris première navigation erronée), fixture, provenance et captures choisies. Les scripts exacts contiennent les chemins de cette session ; pour réexécution, adapter le require Playwright et le cwd du serveur à un environnement local isolé, pas à un backend réel. La fixture refuse toute méthode autre queGET et les requêtes tierces sont bloquées au navigateur. Les contrôles de panne/vide sont restaurés en fin de script.

Aucune recette native200%, Safari/Firefox, clavier virtuel, safe areas matérielles, lecteur d’écran, publication/remix, achat ni données réelles. Les captures initiales sont FRclair seulement ; mesures FR/EN×thèmes ne valent pas inspection visuelle exhaustive. Les15 IDs deviennent au mieux partiellement exercés après consolidation des preuves, jamais entièrement validés. L’inventaire global/index n’est pas modifié par ce lot.

## Recette du correctif compilé — build commun fbb678704

`after13099/receipt.json` :20 observations Galerie uniquement (5formats ×FR/EN ×clair/sombre) et4parcours clavier Enter sur la vraie carte→titre/URL détail→Back vers carte/URL liste. Zéro erreurJS, aucun POST tenté ; GET tiers bloqués. Ce complément ne rejoue ni ne prétend rejouer les280observations des autres surfaces.

Chaque titre et tag long mesuré conserve son contenu complet ; scrollWidth≤clientWidth+2 et bornes dans la carte, document sans débordement. La route du build commun et celle du worktree Discovery ont le même SHA256 `ef2d3bae50b93f5d81e325f1dadb71076d9a5819918138e735dfd277aa027efa` ; hash du build serveur archivé dans `source-sha256.json`. C’est cette recette compilée qui valide le delta local, au-delà de la contrepreuve injectée précédente.

La capture de carte seule FR320 recouvre le début avec le header fixe lors du scroll de capture : elle ne prouve pas l’affichage simultané de tout le titre. `gallery-fr-320-page.png`, capturée depuis le haut et inspectée, montre l’ensemble du titre et des tags repliés dans la carte. Aucune certification de contraste calculé ni de focus global déduite des images.

Les serveurs12999/13099 et fixture6599 ont été arrêtés après vérification de leurs PID/startTicks ; ports fermés et processus disparus, reçu `cleanup.json`. Les serveurs Node ont fermé leurs ports sur SIGTERM mais conservé leurs processus ; seuls les deux PID encore identiques ont ensuite reçu SIGKILL. Aucun serveur d’un autre agent n’a été visé.

Le parent a effectué le build commun ; ce complément ne revendique pas de build isolé, fusion, publication ou recette production. Les limites navigateur/matériel et la couverture partielle des15IDs restent inchangées.
