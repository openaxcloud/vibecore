# Aide plus haute que le viewport — complément local en validation

Ce complément poursuit le même incident BUG-IDE-NATIVE-ZOOM-CONTROLS-20261029 ; aucun nouvel identifiant redondant. Branche locale de zoom, aucune publication déduite des preuves ci-dessous. Chromium natif200%, API/runtime et clé Secrets synthétiques ; pas de secret réel, authentification production, permission, mutation ou appel IA. Aucun profil/cache navigateur, image lourde ou log brut copié. Scripts de recette dépendants de l’environnement local, pas destinés à la production.

## Limite historique réellement reproduite

`before/receipt.json` passe la géométrie antérieure mais ne prouve pas le texte entièrement visible. À410×200CSS, le tooltip a clientHeight174, scrollHeight257, overflowYhidden. Les dernières lignes sont absentes de la capture inspectée. PageDown ferme l’infobulle en laissant le focus sur l’ancre ; le texte manquant n’est pas accessible au clavier. `overflow-diagnosis/receipt.json` conserve cette preuve sans override CSS.

## Correctif local en cours de validation compilée

Le clipping est détecté par scrollHeight>clientHeight réel. Une action explicite de lecture complète et F1 depuis l’ancre correspondante ouvrent une surface non modale nommée FR/EN, avec texte complet dans une région défilable focalisable. Les tooltips courts conservent leur comportement. Tab n’est pas piégé, Escape restaure l’ancre, Ctrl+S reste global ; redimensionnement conserve la lecture, ancre invalide ou changement de chemin la ferme. Aucun focus pris automatiquement au survol.

Le bouton transitoire « lecture complète » n’est PAS déclaré accessible par Tab depuis l’ancre : le README source signale que keydown/focusout ferme l’offre. L’entrée clavier explicitement testée est F1 depuis la bonne ancre. La navigation native dans la surface, PageDown/End et le clic après déplacement réel de souris attendent les recettes compilées. Ne pas transformer des tests jsdom en preuve de défilement navigateur.

État intermédiaire rapporté par le parent : build, typage complet, lint0erreur/52avertissements préexistants,112tests ciblés verts ; dernières corrections de preuve Tooltip30/30. Ces totaux se recouvrent et les recettes compilées sont encore en cours : aucun verdict final de résolution ou livraison. Les anciennes limites historiques ne seront remplacées par une conclusion de correction qu’après cette validation.

## Menu mobile390 : diagnostic distinct sans correction justifiée

`tab-switcher` conserve6/6 recettes synthétiques complètes :3baseline et3CPU×4 à l’ouverture, chacune avec deux cycles Enter/Escape et fermeture par bouton. Aucun défaut de menu absent reproduit ; les remounts de déclencheur observés n’établissent pas la causeCI. Un instantané transitoire sans nœud surCPUessai2 ne correspond pas à une absence continue5s ; les assertions suivantes passent. Une erreur du script de résumé Python est documentée, pas confondue avec un échec navigateur.

CI843 job123218470008 avait échoué avant Escape/focus puis réussi au retry ; cause toujours inconnue. Le backend réel isolé deCI n’est pas validé par ces fixtures. Aucune trace834 ou artefact historiquement refusé obtenu, aucun autre chemin d’accès tenté, aucune assertion ni délai changé. Les incidents840/834 restent distincts et ouverts.

La matrice reste31/31 recettes ciblées partielles, pas une validation complète. Pas de Safari/WebKit local, appareil physique, backend/runtime réel ou production certifiés. Tous les verdicts de code/CI/main/livraison restent séparés.

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
