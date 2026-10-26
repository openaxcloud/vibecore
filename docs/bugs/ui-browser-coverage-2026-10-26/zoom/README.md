# Zoom natif200 % — Support, Quota et Downgrade

Build local corrigé11799, commit `975db321b` annoncé par le parent ; API6099 entièrement synthétique. Aucune recette de production. Aucun fichier source, index, commit ou publication modifié par cet agent pendant cette recette.

## Défaut reproduit puis corrigé

La première tentative11699 s’est arrêtée sur le vrai bouton « Envoyer le message » de Support : hauteur et min-height calculées36px, malgré sa classe min-h44. Les deux seuls éléments du sélecteur étaient le champ de réponse et ce bouton, tous deux dans main ; ce n’était pas un autre formulaire masqué. La règle globale body button[data-vc-button=true][data-size=default] imposait36px.

`before11699/control-diagnostic.json` et les captures avant conservent cette preuve. La contrepreuve DOM inline!important donne44px (`send-counterproof.json/png`) ; elle n’est pas une validation compilée. Le parent a ensuite ajouté uniquement !min-h44 sur ce bouton et adapté une assertion existante. Aucun style global ni composant partagé n’a été changé.

## Recette compilée11799

48 observations DOM :3 routes réellement visitées (`/support/synthetic-ticket`, `/quota-exceeded`, `/downgrade`) × FR/EN × clair/sombre ×4 demandes de taille de fenêtre. DPR2 et visualViewport.scale1 sont vérifiés : il s’agit du zoom natif Chromium, sans CSS zoom ni pinch.

| Largeur demandée au navigateur | outerWidth rapporté par JS | innerWidth CSS mesuré |
|---:|---:|---:|
|1440|1440|720|
|390|500|195|
|640|640|320|
|1280|1280|640|

La ligne390 distingue volontairement la demande Browser.setWindowBounds, la largeur externe rapportée par Chromium et la largeur CSS effective. Elle ne constitue pas une recette «390px CSS». Hauteur externe900, hauteur CSS406 dans ces observations.

Résultats DOM :0 violation de hauteur minimale44px,0 débordement horizontal détecté parmi les descendants mesurés, dernier contrôle accessible par défilement dans chaque cas. Le bouton Support mesure44px dans ses16 cas. Ces mesures ne certifient pas un contraste ou l’absence universelle de tout problème visuel.

4 parcours Support FR/EN et thèmes : saisie à100 %, passage vivant à200 % via chrome.settingsPrivate.setDefaultZoom(2), redimensionnements demandés640→1280→1440, texte et focus conservés ; confirmation de départ, bouton Annuler accessible par scroll, Escape conserve le brouillon. Aucun envoi testé dans cette phase. Zéro mutation tentée et zéro erreurJS dans le reçu final.

## Captures : limite identifiée et diagnostic

Les captures Playwright initiales du lot48 sont conservées, mais **non exploitables pour conclure sur le rendu visuel** : plusieurs montrent un fond vide ou des fragments malgré des contrôles DOM visibles. Elles ne sont pas comptées comme48 revues visuelles.

Deux diagnostics ciblés ont capturé le même rendu avec Page.captureScreenshot, captureBeyondViewport:false, fromSurface:true, après défilement et attente du paint. CDP produit les pixels physiques attendus, là où la capture Playwright réduite était mal cadrée. `capture-diagnostic.json` consigne positions, scroll, DPR et élément présent au point visible.

- Support FR clair : fenêtre640, CSS320, CDP640×813 ; formulaire et bouton44px entièrement visibles.
- Quota FR sombre : demande de lancement390, Chromium l’a bornée à outerWidth500 et innerWidth250 ; CDP500×813, deux actions entièrement visibles. **Cette contrepreuve visuelle est à250px CSS, pas195.** Elle n’est pas équivalente à la ligne390 demandée par resize dans la matrice DOM.

Ces deux diagnostics ne font pas passer le total à50 parcours. Revue visuelle indépendante favorable sur ces deux captures CDP seulement ; les autres limites demeurent.

## Validation et arrêt

Logs véritables du parent dans validation : build, typage strict,28 tests Support, lint ciblé et formatage réussis selon les codes0 confirmés. Le log harness-syntax-diagnostic indique une erreur de ponctuation avant démarrage du navigateur, corrigée avant la recette48 ; il ne décrit pas un défaut produit. La sonde probe-dynamic avait passé un niveau logarithmique au lieu du facteur attendu par l’API ; ses mesures3,8x ne sont pas comptées comme200 %. Le harness final utilise le facteur2 et vérifie les métriques.

Tous les navigateurs sont fermés. Les serveurs11699 puis11799 et l’API6099 ont été arrêtés après coordination et vérification PID/startTicks ; cleanup.json confirme les ports fermés. Aucun autre processus n’a été touché. Aucun cache ou profil Chromium n’a été copié dans cette archive.

WebKit est indisponible dans cet environnement, documenté séparément par l’autre agent. Pas de validation Safari, appareil mobile matériel, clavier virtuel, lecteur d’écran, contrasteWCAG ou backend réel revendiquée.
