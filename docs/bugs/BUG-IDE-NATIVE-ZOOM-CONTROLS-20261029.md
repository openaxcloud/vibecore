---
id: BUG-IDE-NATIVE-ZOOM-CONTROLS-20261029
---

# Contrôles Secrets/tooltip hors écran au zoom natif200%

## Reproduction établie

Chromium local, zoom navigateur réellement réglé à200%,390px physiques donnant195px CSS, DPR2 et CSSzoom1. Le tooltip mesure280px avec x−93 ; le menu Secrets220px dépasse le viewport à droite. Une recette indépendante de filtre Secrets confirme le panneau client163px/scroll249px, avec défaut d’en-tête étroit. Les formats410/640CSS passent les recettes correspondantes. Aucun secret réel utilisé.

Les premiers échecs sous CSSzoom=2 ne sont pas utilisés comme preuve produit : media queries et coordonnées diffèrent du zoom navigateur. Les reçus natifs constituent la preuve du défaut195CSS.

## États distincts

| 📤 Dispatché | Correctif local | 💻 Codé sur main | ✅ Testé live production |
| --- | --- | --- | --- |
| ☑ Diagnostic29/10 | Validé localement sur les cas ciblés ; limite hauteur supérieure au viewport conservée | ☐ Non fusionné | ☐ Non testé en production |

## Portée et limites

Branche locale `fix/ide-native-zoom-controls-20261029`, distincte de #843 en CI ; aucun push de ce complément. Adapter tooltip/menu/en-tête à la largeur disponible sans cacher texte/actions ni affaiblir focus/Escape. Aucun correctif compilé final revendiqué avant les reçus correspondants.

[Preuves et méthode](ui-native-zoom-controls-evidence-20261029/README.md) : résultats natifs, erreurs de méthode conservées, préconditions incorrectes distinguées. Chromium synthétique uniquement ; aucun backend/runtime réel, authentification production, Safari/WebKit local, secret, droit ou opération client.31/31 reste ciblé/partiel. Gitlong réservé et incidents834/README restent ouverts.

## Mise à jour : correction horizontale et limite verticale

Le build corrigé passe Secretsheader3/3 en zoom natif (`env-secrets/final-native-secrets-filter/receipt.json`) et Tooltip horizontal3/3 (`tooltip/tooltip-native-corrected/receipt.json`). Ces résultats ne clôturent pas le tooltip : en français, viewport natif410×300CSS, la bulle de258px de hauteur atteint bottom452 au lieu de rester sous292. Le reçu `tooltip-native-vertical-corrected` conserve ce débordement. Une correction fondée sur la hauteur mesurée est en cours ; validation compilée finale encore attendue. Les anciens rouges demeurent dans le dossier.

Le canari WebKit de CI #843, job123211133065, compte19tests réussis et3ignorés, sans reprise signalée dans les logs. C’est une preuve de CI de #843, pas une recette de zoom locale ni une certification Safari. La tête #843 reste825 ; le complément zoom local ne lui est pas assimilé.


## Verdict local final du complément zoom

Sources sauvegardées dans le commit local `c789d06bd`, basé sur825 ; aucun push ou déploiement déduit de cette sauvegarde. Les reçus `tooltip-native-vertical-final` et `tooltip-native-final` donnent4/4 cas compilés réussis : français vertical et trois formats natifs, marges8px et confinement sur tous les bords. Secretsheader dispose déjà de3/3 cas natifs verts. Les anciens rouges, notamment verticalFR410×300, restent conservés comme preuves avant correction.

Validation finale rapportée par le parent : build client/SSR et typage web réussis,98tests ciblés réussis, revue indépendante22tests réussis avec recouvrement (ne pas additionner), lint réussi. Aucun seuil ni assertion affaibli.

Limite restante explicite : une infobulle plus haute que le viewport n’est pas résolue par ce lot. Les4cas verts n’en constituent pas une certification. Chromium local synthétique uniquement ; pas de backend réel, authentification production, Safari/appareil physique ou WebKit local. Le canari WebKit de CI #843 reste une preuve distincte19réussis/3ignorés, sans recette zoom locale.31/31 signifie toujours recettes partielles. README840 reste une fragilité conditionnelle du locator de ligne entière, pas une causeCI prouvée ;834 reste distinct et ouvert. Aucun hôte d’artefact refusé retenté.

## Dernier verdict : occlusion corrigée et captures inspectées

Les quatre recettes géométriques précédemment vertes ne prouvaient pas une visibilité complète : l’inspection visuelle française par le parent a révélé les premières lignes derrière le header. `tooltip-layer-before/receipt.json` confirme header11002 contre tooltip10000, sans ancêtre créant une couche concurrente. Ce résultat antérieur reste une preuve de placement/interactions seulement.

Le delta source local `e520a1b2a` place uniquement le tooltip à11003 : au-dessus du header11002, sous menus12041/12045 et modales12059. La garde exige aussi que toutes les couches lues soient finies et strictement positives, pour ne pas réussir si un sélecteur disparaît. Base locale rebasée `5bca3e301`, parent `ef764` ; tête source avant documentation `e520a1b2a`. Aucun push/main ou déploiement n’est déduit de ces commits locaux.

Le build client/SSR et typage web sont verts. Les tests agent35/35, revue indépendante21/21 puis garde renforcée21/21 réussissent ; ces ensembles se recouvrent, ne pas les additionner. Les reçus `tooltip-native-vertical-layer-final` et `tooltip-native-layer-final` passent4/4, sans injection CSS ni reprise, avec couches calculées11003>11002 et assertions de bords/texte/focus/Escape/menus. Les quatre captures ont été ouvertes et inspectées ; le parent confirme en français la première ligne « Actions pour » intégralement visible, ainsi que les dernières lignes contenues. Les anciens rouges et les verts géométriques insuffisants restent conservés.

Limite inchangée : tooltip plus haut que le viewport non résolu. Recette Chromium native locale synthétique uniquement, pas Safari/WebKit local, appareil physique, backend ou production authentifiée. Secretsheader3/3 reste documenté.31/31 reste ciblé/partiel ; Gitlong réservé,840 conditionnel et834 ouverts. CanariCI84319réussis/3ignorés reste distinct du zoom local. Aucun artefact historiquement refusé retenté.
