# Recette navigateur Agent — Escape

## Avant

Vrai serveur compilé de #819 (`/workspace/vibecore-ui-contract812/build`), ancien code449daadfa dont l’arbre correspond au main6de692cf5 livré. Chromium local `/usr/bin/chromium`, viewport1180×757 CSSpx, pas Safari physique ni session production. Serveur18299 et API synthétique8299 possédés par l’agent initial_panel_diagnosis ; cette recette n’a ni créé ni arrêté ces processus. Hashes dans source-before.json.

`before.cjs` ouvre Power → Primary model, place le focus sur le bouton Retour, puis envoie `page.keyboard.press('Escape')` (événement clavier natif du navigateur). Résultat : dialogue présent avant ET après, focus toujours surBUTTON, zéro erreurpage dans la recette finale. Captures before-open.png, before-submenu.png, before-escape.png et reçu before.json. L’échec avec focusbody après ouverture avait également été observé lors d’un essai exploratoire ; il est conservé comme observation secondaire, pas comme preuve du scénario à focus enfant.

Fixture synthétique SSR existante, cookie factice local, aucun credential réel. Trois GET externes sont bloqués (deuxfontes +iframeheadless). Toutes requêtes nonGET/HEAD sont rejetées503 côté navigateur et les mutations backend sont rejetées par la fixture ; aucun projet réel touché. WebSockets fermés. La bannière de conversation indisponible est due aux lectures non configurées dans la fixture et n’est PAS un nouveau défaut production. L’ancien script exploratoire avait déclenché une erreurlocalStorage dans iframe ; le script final limite son init àwindow.top, résultatfinalsanspageerror.

## Après prévu

Vrai nouveau build attendu du parent. Recette `after.cjs` :320/390/768/1180/1440, ouverture/sous-menu/focusEscape, retourfocusdéclencheur,réouverture,Retour,redimensionnementavec brouillonconservé. GETide-state fourni avec enveloppe contractuelle neutre `{ideState:{version:1,state:{}}}` pour isoler Escape. À1180, flux SSE synthétique conservé sousEscape puis interruption parStop explicite, aucun fournisseurinvoké. Résultats seulement après exécution ; ce fichier ne constitue pas un verdict.

## Après exécuté — verdict séparé des interactions et de la géométrie

Le vrai build client/SSR du nouveau worktree `/workspace/vibecore-ui-agent-followup` a été servi par le parent sur18399 (processus du parent non arrêté). Hashes dans source-after.json. Le reçu final est **interactions-after.json**, script **interactions-after.cjs**, sortie0, cinq contextes Chromium1180×757 et320/390/768/1440×900. Chaque contexte attend le témoin applicatif `layout-restored` puis deux frames avant la saisie.

**Interactions : cinq formats réussis.** Focus sur le bouton enfant du sous-menu, Escape ferme les paramètres ; focus rendu au déclencheur ; réouverture et Retour possibles ; Escape après Retour ferme aussi quand le focus est retombé surbody ; redimensionnement320→390,390→320,768→320,1180→1440,1440→1180 avec brouillon conservé. À1180, popup déjà ouvert avant envoi d’un flux SSE purement synthétique : Escape ferme sans abort ; clicStop explicite déclenche ensuite abort. Zéro erreurpage dans les cinq contextes.

Les appels bloqués du reçu final comprennent15GET externes(fontes/iframe),6PUT locaux de mémoire et1POST local de conversation. Aucun de ces appels ne s’est exécuté contre un backend réel. Le flux modèle est une ReadableStream injectée au niveau fetch dans la recette seulement ; aucune génération/provider réel n’a été invoqué. Pas de preuve de cloudsave, d’écriture de fichier ou de QA produit.

**Géométrie : quatre formats réussis,1440 échoue.** L’assertion d’origine avec tolérance1px reste intacte dans after.cjs et son échec est conservé dans after.log. Le panneau secondaire desktop dépasse le bas de la fenêtre de5–6px : reçu finaly411.75+h493.34375=905.09375 pour hauteur900. Contrepreuve séparée strictement identique sur ancien et nouveau builds (`geometry-before/geometry.json`, `geometry-after/geometry.json`) : x389,y412.75,w240,h493.34375, stable après500ms, bottom906.09375. Captures inspectées : le bas du panneau/tip d’effort est coupé ; Retour et les modèles restent accessibles, slider encore visible. Il s’agit d’un défaut préexistant, pas d’une régression démontrée du correctifEscape. Le résultat géométrique n’est jamais compté vert à1440 ; le script interactions-after permet de tester la fermeture indépendamment et conserve `geometryFits:false`.

Deux erreurs de recette exploratoire conservées : le déclencheur est normalement désactivé pendant un flux, donc tenter d’ouvrir APRÈS démarrage échoue (stream-disabled-trigger-diagnostic.log) ; le scénario final ouvre AVANT démarrage. Une saisie avant restauration mémoire terminée pouvait être effacée, donc la recette finale attend le marqueur d’application plutôt que d’attribuer ce comportement au resize. Aucune assertion produit n’a été affaiblie.

Limites : Chromium local, langueEN, thèmeclair, fontes externes bloquées/fallback local. Pas d’iPhone physique, de WebKit local, de zoom200% ou de production authentifiée dans cette recette. L’autre défaut mémoire initiale est couvert par l’agent initial_panel_diagnosis ; ne pas additionner ces preuves comme des tests backend réels. Tous les handles navigateur ont été fermés en finally ; aucun serveur possédé par cet agent, aucune interruption des serveurs empruntés (cleanup.json).

## Assemblage final avec borne du portail — exécuté

Le parent a ajouté dans le même lot une hauteur maximale du second panneau calculée depuis sa position et100dvh, en conservant le défilement existant. Nouveau build client/SSR servi par18399 après redémarrage par le parent ; hashes **source-final.json**. Le reçu pré-correctif géométrique est préservé dans **preclip-interactions/** et les contrepreuvesgeometry-before/after restent inchangées.

**interactions-after.json a été rejoué sur cet assemblage final : cinq formats réussis, `geometryFits:true` pour les cinq**, mêmes tests Escape/focus/Retour/réouverture/redimensionnement/saisie, flux1180 conservé parEscape puis stoppé explicitement, zéroerreurpage. Toutes les capturesafter-* de ce dossier correspondent désormais à ce dernier build. Le reçu final ne remplace pas la contrepreuve pré-correctif préservée.

**final-bounds.cjs : quatre cas stricts supplémentaires réussis** (sortie0, preuve **final-bounds/receipt.json**) :

| Fenêtre / zoom | Zone CSS réellement mesurée | Résultat |
| --- | --- | --- |
|1440×900,100%|1440×900|borne1px, contrôle final, scroll, Escape/focus verts|
|1280×720,100%|1280×720|idem|
|1440×1000,200% natif|720×456,DPR2,visualViewport.scale1|idem, disposition compacte|
|2560×1440,200% natif|1280×676,DPR2,visualViewport.scale1|idem, disposition desktop|

Zoom via `chrome.settingsPrivate.setDefaultZoom(2)` dans un profil temporaire Chromium, pas CSSzoom, deviceScaleFactor ou pinch. La hauteur utile inclut44pxCSS consommés par le chrome dans le mode natif ; les dimensions théoriques720×500/1280×720 figurent dans les clés de fichiers mais les dimensions **réelles** sont consignées dans `dims` et le tableau ci-dessus.

Le dernier modèle est atteignable par `click({trial:true})` après scroll (aucune sélection changée). Le railEffort est visible et le hit-test vise bien l’input ; il reste normalement désactivé pour le modèleAuto testé, donc aucune modification d’effort n’est revendiquée. Un défilement jusqu’au bas confirme que le texte final est contenu : scrollTop18px à1440/1280normaux,90px surcompactzoom,19px surdesktopzoom. La marge desktop rend bottom888 pour viewport900,708pour720 et664.5pour676. Aucune action retirée pour obtenir ces résultats.

Les profils temporaires du zoom ont été supprimés après fermeture de leur contexte ; aucun serveur emprunté n’a été arrêté. Les captures finales1440x900 et zoom ont été inspectées. Ces preuves restent locales/synthétiques et ne constituent pas une recette production ou une validation exhaustive de Safari.

Les captureszoom finales utilisent CDP `Page.captureScreenshot` :2560×1353 et1440×913pixels. Les capturesinitiales via `page.screenshot` étaient rognées à la tailleCSS enzoomnatif ; elles ont été remplacées par les capturescomplètes après une nouvelle exécution des mêmes assertions, sortie0. Aucun changement du produit ni des seuils.
