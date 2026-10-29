# Zoom natif — complément local du29octobre2026

Branche `fix/ide-native-zoom-controls-20261029`, distincte de #843 déjà publiée et en CI. Aucune publication de ce complément. Les reçus utilisent le build local parent, Chromium et API/runtime synthétiques ; aucun secret réel, appel IA, compte, permission, DNS, publication ou mutation client. Les scripts restent liés à l’environnement de recette et à ses fixtures ; ne pas les exécuter contre la production. Aucun profil/cache navigateur, image lourde ou journal sensible n’est copié ici. `sources.json` trace les originaux et SHA256.

## Méthode réellement mesurée

`method/native-receipt.json` établit le zoom natif Chromium via `chrome://settings/appearance`, zoomLevel=2, profil de test isolé :1280×900 devient640×450CSS, DPR1→2, CSSzoom reste1, visualViewport.scale reste1. Les recettes suivantes vérifient chaque format :390/820/1280physiques donnent195/410/640CSS. Ce n’est pas un appareil physique ni du pinch-zoom.

Ctrl++ en headless ne changeait aucune métrique ; la première alternative CSSzoom=2 laissait les media queries au viewport initial. Les reçus `tooltip/tooltip-secrets` et `css-method-studio-security` restent archivés comme méthode inadéquate pour prouver un défaut de zoom natif, pas comme bugs produit. Les assertions strictes n’ont pas été assouplies.

## Résultats natifs avant correction de ce complément

| Panneau | Preuve | Résultat ciblé |
| --- | --- | --- |
| Studio / Security | studio-security/*/receipt.json |9/9 : longs textes Studio3, Security3 et profil Security3. Vrai remplacement de coque vers2560physiques/1280CSS, ancien select détaché, texte et profil conservés ; aucun Save/Scan/IA. |
| Collaborators | collaborators/receipt.json |3/3 : formulaire synthétique conservé au parcours responsive, aucune soumission ni permission accordée. |
| Debugger | debugger/native/receipt.json |3/3 : texte, corps sans overflow, Remove contenu, focus et clic d’essai sans activation ; aucune session runtime réelle. |
| Env / Secrets | env-secrets/native-*-filter-desktop-height/receipt.json |5/6 : Env3, Secrets2. Secrets390physiques/195CSS échoue sur panneau client163/scroll249 ; filtre et remplacement réussissent avant cette assertion. Aucun secret ou valeur réelle. |
| Tooltip / menu Secrets | tooltip/tooltip-native/receipt.json |2/3 : à195CSS, tooltip280px àx−93 et menu220px àx8 dépassent. Texte intégral, pseudo:none, Escape/scroll et focus du tooltip passent ; contrôles du menu après l’échec géométrique non atteints.410/640CSS passent. |

Les défauts195CSS sont donc reproduits par le zoom natif ; ils ne sont pas déduits des seuls essais CSS. Le correctif local vise tooltip/menu et en-tête Secrets selon largeur réellement disponible. Validation compilée après correction encore attendue : aucun résultat « réparé » revendiqué ici.

## Préconditions et incidents ouverts

Env : trois premiers essais redimensionnaient vers2560×900physiques =1280×450CSS, encore compact ; absence de coque desktop, assertion du filtre non atteinte. Les recettes séparées utilisent2560×1800 pour produire un vrai changement de coque ; ce n’est pas une réparation produit ni une reprise sous précondition identique. Les reçus initiaux restent conservés.

`readme-834/README.md` distingue README absent au démarrage desktop (#840) et CodeMirror absent après Retour B→A768 (#834). Les hypothèses restent non prouvées et aucun correctif n’est déclaré. Aucune nouvelle lecture/téléchargement d’artefact n’a été réalisée pour cette synthèse ; l’hôte d’artefact historiquement refusé n’a pas été retenté ni contourné. Les notes de CI sont historiques, pas une nouvelle exécution.

La matrice reste31/31 panneaux avec au moins une recette ciblée, jamais31panneaux entièrement validés. WebKit local absent, aucun Safari/appareil physique, backend réel ou production authentifiée validé. Main et livraison ne sont pas certifiés par ce complément ; Gitlong réservé,834 et README restent ouverts.

## Mise à jour : correction horizontale et limite verticale

Le build corrigé passe Secretsheader3/3 en zoom natif (`env-secrets/final-native-secrets-filter/receipt.json`) et Tooltip horizontal3/3 (`tooltip/tooltip-native-corrected/receipt.json`). Ces résultats ne clôturent pas le tooltip : en français, viewport natif410×300CSS, la bulle de258px de hauteur atteint bottom452 au lieu de rester sous292. Le reçu `tooltip-native-vertical-corrected` conserve ce débordement. Une correction fondée sur la hauteur mesurée est en cours ; validation compilée finale encore attendue. Les anciens rouges demeurent dans le dossier.

Le canari WebKit de CI #843, job123211133065, compte19tests réussis et3ignorés, sans reprise signalée dans les logs. C’est une preuve de CI de #843, pas une recette de zoom locale ni une certification Safari. La tête #843 reste825 ; le complément zoom local ne lui est pas assimilé.

### README840 et retour834 : deux sélecteurs, deux incidents

Le diagnostic `readme-badge/README.md` et `receipt-two-locators.json` comparent les deux sélecteurs sur le même DOM synthétique isolé. Avec un badge Git frère du nom, le locator834 limité au span du nom trouve README (count1), tandis que le locator840 sur le texte exact de la ligne entière l’exclut (count0). Sans badge les deux passent. Cela établit une fragilité conditionnelle de840, sans prouver qu’un badge était présent lors de son échec CI. Le badge n’explique pas le symptôme834 ultérieur de CodeMirror absent après archive200. Causes CI toujours inconnues, aucune assertion modifiée, aucun correctif produit ni réexécution CI revendiqué. L’ancienne hypothèse globale « badge réfuté » ne s’applique donc qu’au locator834 inspecté. Aucun artefact téléchargé ni hôte historiquement refusé retenté.

## Verdict local final du complément zoom

Sources sauvegardées dans le commit local `c789d06bd`, basé sur825 ; aucun push ou déploiement déduit de cette sauvegarde. Les reçus `tooltip-native-vertical-final` et `tooltip-native-final` donnent4/4 cas compilés réussis : français vertical et trois formats natifs, marges8px et confinement sur tous les bords. Secretsheader dispose déjà de3/3 cas natifs verts. Les anciens rouges, notamment verticalFR410×300, restent conservés comme preuves avant correction.

Validation finale rapportée par le parent : build client/SSR et typage web réussis,98tests ciblés réussis, revue indépendante22tests réussis avec recouvrement (ne pas additionner), lint réussi. Aucun seuil ni assertion affaibli.

Limite restante explicite : une infobulle plus haute que le viewport n’est pas résolue par ce lot. Les4cas verts n’en constituent pas une certification. Chromium local synthétique uniquement ; pas de backend réel, authentification production, Safari/appareil physique ou WebKit local. Le canari WebKit de CI #843 reste une preuve distincte19réussis/3ignorés, sans recette zoom locale.31/31 signifie toujours recettes partielles. README840 reste une fragilité conditionnelle du locator de ligne entière, pas une causeCI prouvée ;834 reste distinct et ouvert. Aucun hôte d’artefact refusé retenté.
