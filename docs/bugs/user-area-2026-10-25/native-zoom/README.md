# Zoom desktop natif 200 % — Chromium local

Build synthétique servi sur `http://127.0.0.1:6199`, Chromium154.0.8037.57. Aucun changement produit, navigateur utilisateur, dépendance système ou déploiement.

`probe.cjs` compare deux profils éphémères ne différant que par la préférence Chromium `partition.default_zoom_level: {"x": log(2)/log(1.2)}`. La fenêtre physique reste1280×800 : à100%, innerWidth1280/DPR1/visualViewport.scale1 ; à200%, innerWidth640/DPR2/visualViewport.scale1. Aucun deviceScaleFactor, setDeviceMetricsOverride, setPageScaleFactor, pinch ou zoomCSS. `viewport:null` laisse Chromium gérer son vrai viewport. `probe.json` conserve le témoin initial sur 6099 ; `billing-100.png` et les captures CDP `*-200-fullwindow.png` évitent le recadrage erroné observé avec la capture Playwright à 200 %.

Sources primaires GitHub Chromium consultées le25octobre2026 :
- https://github.com/chromium/chromium/blob/main/chrome/browser/ui/zoom/chrome_zoom_level_prefs.cc : partition_key est x + hex du chemin relatif (vide pour partition par défaut), lecture du dictionnaire et application à HostZoomMap.
- https://github.com/chromium/chromium/blob/main/third_party/blink/common/page/page_zoom.cc : conversion facteur/niveau logarithmique base1.2.
- https://github.com/chromium/chromium/blob/main/chrome/common/pref_names.h : noms des préférences de partition.

`pages.cjs` / `receipt.json` :20 observations =5pages (/dashboard, /projects, /billing, /account-settings profil, /account-settings/data) × FR/EN × clair/sombre. Toutes : fenêtre1280, largeurCSS640, DPR2, échellevisuelle1, aucun débordement horizontal. Douze groupes interactions : brouillons Facturation/Profil conservés pendant redimensionnement physique1280→1600→1280 (largeurCSS640→800→640) sans perte de focus ; navigation Profil→Données interrompue puis Échap préserve saisie ; dialogue Données défilable et focus rendu après Échap. Aucun POST et aucune erreur JavaScript observés.

Les captures par page/thème sont françaises. Un premier essai du script échouait sur un sélecteur de navigation ambigu (3liens), corrigé par navigation nommée ; journal et reçu partiel conservés dans initial-partial-receipt.json (journal local initial-locator-error.log). Ce n'était pas un défaut produit.

Limites : contexte desktop headlessLinux et fixtures seulement ; pas Safari/Firefox, lecteur d'écran, clavier virtuel physique ou production. Zoom200% appliqué au démarrage ; la recette redimensionne ensuite la fenêtre à zoom200% fixe, elle ne prétend pas basculer le zoom pendant la saisie. La sous-page Connexions n'est pas dans ces5pages zoomnatif (sa matrice responsive distincte demeure documentée ailleurs).300/400% hors périmètre.

Capture importante : Playwright page.screenshot a rogné les captures au rectangle CSS640×356 alors que le rendu natif occupe1280×713pixels. Ces premières images restent conservées mais NE représentent PAS toute la fenêtre. Les10images françaises `*-200-fullwindow.png` sont les captures de référence : CDP Page.captureScreenshot sans clip,1280×713pixels, vérification visuelle effectuée. `capture.cjs`/`capture.log` documentent cette prise de vue séparée, sans modifier la page ni le zoom. Le défaut de capture ne change pas les mesures DOM/zoom des20observations.

Les 20 cas et 12 groupes ont été rejoués sur le build final 6199 après correction locale des actions Facturation. `before-heading-receipt.json` et `billing-before-heading200.png` conservent la mesure précédente sur 6099. La géométrie ne débordait pas avant, mais le titre occupait quatre lignes ; la correction compilée lui rend deux lignes. Voir `../billing-heading/`.

Reproduction : dépendances du dépôt et Chromium installés, fixture API3199 active ; créer `/tmp/account-next/native-zoom`, puis `UI_BASE_URL=http://127.0.0.1:6199 node pages.cjs` et `capture.cjs`. Profils éphémères sous `/tmp`, aucune préférence du navigateur utilisateur modifiée.
