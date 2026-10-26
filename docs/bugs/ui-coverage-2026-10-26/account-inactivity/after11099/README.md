# Recette ciblée compilée11099

Build final avec union CSS réelle, serveur/API5499 synthétique gelés par parent. Aucun patchDOM/CSSOM dans cette recette. Empreintes sources archivées. Commande depuis racine dépôt : `node docs/bugs/ui-coverage-2026-10-26/account-inactivity/after11099/audit.cjs` ; AUDIT_BASE optionnel pour serveur local équivalent. Requêtes nonGET et tierces bloquées, aucun vc_session, mailto jamais activé.

**4 groupes FR/EN×clair/sombre à844×390**, pas une répétition des20 géométries initiales. Chaque groupe contient : molette260 réelle puis mesure de déplacement ; navigation fraîche et PageDown réel ; navigation fraîche et petits gestes molette60 pour atteindre le dernier paragraphe ; menu mobile ouvert/scroll bloqué/Escape/restitution du focus/reprise du scroll ; focus mailto320→844→390, Escape/Tab et logoAccueil→Back.

- 8 gestes de progression passent : molette déplace le paragraphe260px dans les4cas ; PageDown227–300px au moment où la mesure passe>100px. Ces chiffres ne prétendent pas mesurer la fin complète de l'animation.
- Dernier paragraphe réellement accessible via molette, sans focus/click/scrollIntoView/script de scroll : FRtop332,25/bottom352,125 ; ENtop312,375/bottom332,25, viewport390. Headersticky top0/bottom110 dans les4cas. CaptureFRclair inspectée : section4 et texte final visibles.
- MenuRadix : fond immobile pendant molette, data-scroll-locked présent ; Escape ferme, restitue le focus au déclencheur ; molette reprend le scroll. Les4 groupes passent.
- Retour navigateur restitue URL/langue. Focus mailto conservé aprèsresize, **mais pas visibilité** : FRtop−123,75, ENtop1,375 sousheader110. Le correctif de scroll ne corrige pas cette relocalisation de focus, et aucun succès global focusresize n'est revendiqué. La reprise par Tab suivante n'est pas une preuve de visibilité du mailto resté actif.
- Zéro erreurJavaScript, zéro requête nonGET tentée. Aucun envoi, suppression, désactivation ou donnée réelle.

`receipt.json`, `logs.txt`, quatrecaptures et script sont conservés. Navigateurs fermés ; serveur parent intact. Cette recette prouve le correctif sur cette route ; conservation IDE et autres layouts sont des preuves séparées de ui_remaining. Aucun Safari/Firefox, OSkeyboard, safeareas physiques, zoom200%, lecteurécran, recetteproduction ou matricefonctionnelleglobale.
