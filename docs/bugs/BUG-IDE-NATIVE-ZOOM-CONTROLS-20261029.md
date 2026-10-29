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

## Complément en cours : lecture d’une aide réellement tronquée

La limite historique « tooltip plus haut que le viewport » a maintenant une preuve native ciblée :410×200CSS, clientHeight174/scrollHeight257, overflow:hidden ; PageDown ferme l’aide au lieu d’accéder aux dernières lignes. Le correctif local détecte le clipping et propose lecture complète explicite/F1 vers une surface non modale FR/EN, texte défilable focalisable, sans piège Tab ; Escape/focus et Ctrl+S préservés. Les parcours compilés sont encore en cours : ne pas déclarer cette limite résolue avant leur résultat final. Le bouton transitoire n’est pas revendiqué accessible via Tab depuis l’ancre ; F1 est l’entrée clavier explicite.

[Preuves de l’aide haute et diagnostic menu390](ui-tall-help-evidence-20261029/README.md). Les6/6 essais locaux du menu390 n’expliquent pas le retryCI ; aucune correction menu ni résolution834/840 revendiquée, aucun artefact refusé obtenu par une autre voie. Build/typage complet et lint0/52 verts rapportés, tests ciblés encore distincts de la validation compilée finale. Aucun nouvelID, index, publication ou livraison impliqué.

## Résultats compilés, avec limites d’intégration conservées

Les reçus distinguent strictement les sous-parcours atteints :

- Recette primaire `tall-help/compiled` : lecture clavier F1/PageDown/End jusqu’au marqueur final et texte intégral3/3, resize/Escape également vérifiés. Scénario complet1/3 seulement : les deux autres cas échouent avant le trajet pointeur, ancre Secrets derrière la navigation fixe à200CSSpx de hauteur. Ces échecs ne sont pas présentés comme résolus.
- Recette pointeur distincte `compiled-pointer` :2/2 à hauteur accessible, texte plus long pour rester tronqué. elementFromPoint prouve l’ancre atteignable avant déplacement réel12pas et clic ; lecture complète, resize, Escape et sortie ShiftTab passent. Ce n’est pas une répétition verte du même scénario bas en échec.
- Régression tooltip ordinaire :3/3, géométrie, texte, fermeture/focus et menus préservés.
- Revue indépendante `compiled-stable-fixture` :4/4 avec véritable renderer compilé et ancre DOM synthétique stable, EN/FR,100/200% natif. F1, PageDown/End/Home/roulette, clic20pas, navigation Tab non piégée et resize passent. Cette fixture ne valide pas la visibilité de la vraie ancre Secrets.
- Intégration indépendante `compiled-real-secret-anchor` :1/4 complet (390×320@100%),3/4 incomplets à200% avantF1. Ancres occultées par navigation/surface mobile ou horszone ; disparition de l’offre non isolée dans tous les cas. Aucun élargissement de seuil, nouvelle reprise ou correction de ces trois cas revendiqué.

Quatre échecs de harnais indépendants initiaux restent dans `compiled-independent` : locator sur dialogue déjà démonté, attribut réécrit parReact, et un cas de disparition non isolé. La fixture stable corrige la méthode, pas le produit. Aucun des quatre rouges n’est effacé ou compté vert.

La revue a aussi reproduit un défaut réel de survol périmé après changement de route (`independent/timer-route-receipt.json`). Le correctif est en préparation ; sa validation finale reste attendue. Les résultats précédents ne prouvent donc ni clôture complète de l’incident ni disponibilité sans réserve de tous les parcours. Les diagnostics menu390/834/840 restent distincts et ouverts.

Aucun accès à des profils/caches/logs bruts ou secrets dans ce dossier. Tests synthétiques Chromium local seulement, pas backend réel, Safari/WebKit local, appareil physique ou production. L’accès clavier de l’offre reste F1 depuis l’ancre : aucune promesse de Tab depuis celle-ci vers le bouton transitoire. Aucun index, publication ou livraison déduit des recettes.

## Correctif du timer de survol validé, contrôle navigateur final en cours

Le contre-exemple indépendant `timer-route-fixed-receipt.json` passe après le correctif : lecture ouverte, puis ni dialogue ni tooltip périmé après fermeture/navigation. L’ancien reçu rouge `timer-route-receipt.json` reste conservé. Le nettoyage du timer empêche le survol différé de rétablir une aide de l’ancienne route.

Validation transmise par le parent :45/45 suite agent et113/113 tests ciblés root (recouvrements, ne pas additionner), build client/SSR final et typage web verts. Typage complet réussi avant les trois lignes de nettoyage clearTimeout ; lint complet0erreur/52avertissements préexistants. Le dernier smoke navigateur sur build final est encore en cours : aucun résultat anticipé.

La limite de contenu plus haut que le viewport est traitée par une lecture complète explicite, pas par la promesse de faire tenir tout texte dans le tooltip court. F1 depuis l’ancre et la surface non modale défilable ont leurs preuves de lecture jusqu’à la dernière ligne. Les occlusions de la vraie ancre Secrets par la navigation aux petites hauteurs restent non résolues : recette indépendante réelle1/4, trois extrêmes200% incomplets avantF1, distincts des4/4 du renderer à ancre synthétique. Les premiers rouges et le scénario primaire complet1/3 restent visibles ; aucune certification générale ni réparation de ces occlusions n’est revendiquée.

Toujours Chromium local/synthétique, pas Safari/WebKit local, appareil physique, backend réel ou production authentifiée ;31/31 ciblés partiels. Publication et livraison du lot ne sont pas déduites de cette documentation.

## Verdict du dernier smoke compilé

`final-timer-build/receipt.json` passe1/1 sur le build final du correctif timer : F1, lecture jusqu’à la dernière ligne, redimensionnement, Escape, déplacement réel de souris à travers l’espace, sortie Tab et changement de route sans aide périmée. L’attente de ce contrôle est clôturée ; ce cas ne remplace pas les scénarios distincts incomplets ou en échec décrits plus haut. Les occlusions de navigation aux petites hauteurs et la recette indépendante de vraie ancre Secrets1/4 restent explicitement non résolues. Aucun verdict global Safari/production ou31/31 fonctionnel.

### Captures synthétiques pour revue

Deux images originales820×400 sont copiées sans édition dans `captures/` : `before-820-tooltip.png` montre l’aide courte tronquée ; `after-820-fr-last-line.png` montre la lecture complète explicite après F1 puis End, avec dernière ligne visible. Même format, mais états d’interaction différents : ce n’est pas une comparaison pixel à pixel du même état. La capture après provient du build de lecture complète précédent ; le dernier correctif timer ne change pas ce rendu visuel. Les textes sont synthétiques, aucune donnée cliente ou secret réel. Empreintes des originaux dans le manifeste.

Ces preuves rendent le lot prêt pour la revue/publication coordonnée, sans prétendre qu’une publication, fusion ou livraison a déjà eu lieu.

## Première validation distante et correction i18n

La PR brouillon #844 a été publiée sur `0fb8dca4`. Production CI a identifié quatre nouveaux libellés visibles hors catalogue dans GlobalTooltip ; le contrôle requis PR Validation a donc échoué. Les trois nouveaux libellés sont désormais dans le catalogue FR/EN existant et la fermeture réutilise la clé commune. Aucun texte, baseline, allowlist ou seuil n’a été assoupli. Le compte exact du catalogue passe de303 à306, avec parité de clés et interpolations conservée.

Le correctif passe `i18n:check`,50/50 tests ciblés et41/41 en revue indépendante (recouvrement, ne pas additionner), les phases de typage, lint/formatage ciblés et build client/SSR. La phase workspace du typage a été reprise avec le pnpm9 déjà installé après échec du wrapper d’auto-installation ; aucune installation n’a été effectuée. Ce delta ne change pas les interactions ni le rendu des recettes navigateur précédentes.

La tranche E2E2 de cette première tête n’a exécuté aucun test : son PostgreSQL n’a pas pu réserver le port55432 déjà occupé, malgré la reprise intégrée de préparation. Cet échec d’infrastructure reste distinct du défaut i18n. Les contrôles de la prochaine tête devront obtenir leurs propres verdicts ; aucune fusion, promotion ou livraison n’est déduite des validations locales.
