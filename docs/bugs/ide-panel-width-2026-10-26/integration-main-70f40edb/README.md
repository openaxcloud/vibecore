# Intégration de main #808

Base intégrée : `70f40edb8b316160d18ce32d95bccef5faf13315`. Le seul conflit Git concernait l'index dérivé : régénéré à 524 entrées, sans supprimer les fiches #808. Les 13 autres fichiers produit #808 vérifiés sont identiques à main ; le delta BaseChat est limité aux classes Usage/Memory et à l'enrichissement des tooltips.

## Corrections ajoutées à la tête précédente

- La garde mobile `ide-mobile-panels.spec.ts` attend désormais le nouveau `ComposerToolsPortal`, sa cible mobile prioritaire, son ancre et sa ref de contenu. Le scénario et la garde de clic extérieur restent présents. 70 tests réels verts ; aucun scénario retiré.
- Usage/Memory : grilles selon la largeur du conteneur, champs contenus et limites accessibles par défilement clavier. La classe racine est conditionnelle à ces deux onglets ; Project et Account ne sont pas modifiés.
- Tooltips Radix et aides masquées : l'enrichissement IDE ne réinjecte plus le titre natif redondant lorsque le contrôle possède un nom `aria-label` indépendant. Les titres servant seuls de nom accessible sont conservés. Les titres de fichiers, aides contextuelles, raccourcis et focus restent présents. Aucun fichier FileTree modifié.

## Validations

164 tests pertinents /18 fichiers verts dans la validation finale consolidée, dont les 70 gardes mobiles et les tests du focus #808. Typage web et build client/SSR verts. Lint app zéro erreur /52 avertissements préexistants.

Une première exécution locale a trouvé d'anciens exports éditeur : node_modules était lié à un autre worktree antérieur à #808. Les liens workspace ont été isolés pour résoudre les packages de ce worktree ; aucune source #808 ni dépendance d'une autre session n'a été modifiée. Les contrôles concernés ont été rejoués. Une ligne blanche demandée par le lint a également été ajoutée au bloc tooltip.

La nouvelle recette du build complet utilise des GET synthétiques et bloque les écritures automatiques. Usage/Memory : 14 observations FR/EN aux viewports 2048/1536/1280 et FR au zoom natif 200 %, panneaux réels de 1197/815/588 px, aucun débordement racine observé ; tableau focalisable et brouillon Memory conservé au resize sans envoi. Les panneaux 360/640/1000 et contrôles de non-régression Project/Account sont couverts séparément par les recettes du JSX extrait. Ce n'est pas une validation du backend client réel.

## Correctif de navigation après coordination

La recette du build complet a révélé qu'Escape ne ferme pas le menu Outils : `useKeybindings` consomme `overlay.close` en capture avant le handler de ChatBox. La comparaison avec le build #807 a confirmé le défaut préexistant, y compris avec le premier contrôle explicitement focalisé et une attente de 5 secondes.

Après accord explicite du parent, la correction est intégrée uniquement dans `app/lib/hooks/useKeybindings.ts` et `useKeybindings.dialog.spec.tsx`. L'exception Escape est limitée au menu du composeur ; Ctrl+S, raccourcis extérieurs et priorité du dialogue enfant sont couverts par le test durable rouge puis vert.

Nouvelle recette du build complet : trois formats 2048/1536/1280 verts. Enter focalise le menu, Escape le ferme et restitue le focus au déclencheur ; le premier Escape ferme la palette enfant sans fermer le menu, puis le second ferme le parent. Dix-huit contrôles atteignables, aucune erreur JavaScript. Trois POST automatiques MCP ont été bloqués ; aucun backend client n'a été modifié. Cette réserve intégrée est levée sur les parcours exercés, sans inclure le lot palette réservé lié à #768.

Les rapports `*-proposal-history.md` décrivent la préparation antérieure non appliquée ; les corrections Settings/tooltip ci-dessus sont maintenant appliquées. Le raccordement au contrat #812 reste dans un worktree distinct et n'entre pas dans cette PR.
