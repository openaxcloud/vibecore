# Échos de navigation après déplacement — preuves locales rouges

## Navigation interrompue

`interrupted-back-red.json` : échec local le 22 octobre 2026 à 07:21:30 UTC, sans retry ni skip. Le déplacement de Webview lance une requête réelle `ide.data?panel=preview&_routes=root`. Elle est interrompue (`net::ERR_ABORTED`) par la sélection de Publish. Un Retour navigateur atteint ensuite l’URL `preview`, mais l’onglet reste non sélectionné ; l’assertion de sélection échoue dans son délai initial de 5 secondes. Le reçu d’une navigation non commise pouvait neutraliser une demande ultérieure.

La préparation retient le transport de la requête puis le libère par `route.continue()` ; aucun corps de réponse réussi n’est simulé. Ce contrôle sert à rendre l’ordre des gestes reproductible, sans délai fixe. Ce rouge a été observé sur le produit de `d558`, dont le reçu ponctuel était borné au scope et à la destination mais ne distinguait pas la navigation effectivement commise.

## Deux déplacements pendant la même navigation

`double-move-red.json` : échec local à 07:34:54 UTC, sans retry ni skip, après préparation par le bouton direct du dock. Trois onglets avant, quatre après. Les tableaux attestent successivement A→B, B→A, puis une copie de Webview créée dans B lors du commit de l’URL. Le premier mouvement a déjà une navigation en cours ; le second, redondant du point de vue URL, effaçait son reçu. Ce rouge concerne la première variante avec identifiant de navigation, avant réutilisation de l’identifiant de la navigation déjà en cours. Il ne doit pas être présenté comme un résultat de la correction finale suivante.

`double-move-red.png` montre le verdict rouge ; `capture.json` lie cette image à son rapport et donne son empreinte. Le répertoire source de la capture est partagé avec la première préparation de ce scénario, mais le premier essai s’était arrêté avant toute capture : l’image est celle de l’essai direct échoué après les mouvements.

## Palette : deux échecs de préparation distincts

`navigation-first-state-id.json` conserve l’exécution de six cas à 07:29:02 UTC : cinq succès directs, un timeout de préparation. L’interruption/Retour passe, tout comme Retour/Avancer et fermeture du panneau destination. Le cas de fermeture de l’onglet n’atteint pas son déplacement : le champ de palette, visible juste avant, disparaît et son remplissage expire.

`palette-preparation-second-red.json` conserve un deuxième timeout de même préparation à 07:32:37 UTC, avant les deux déplacements. Ces deux erreurs ne constituent pas des échecs démontrés des assertions de navigation qu’elles empêchent d’atteindre. Elles ne sont pas effacées par la préparation suivante via le dock : voir [la fiche ouverte](../../../BUG-IDE-GLOBAL-PALETTE-HANDOFF-001.md). La disparition est observée ; une réinitialisation au passage de la coquille provisoire au composant complet reste une hypothèse, pas une cause prouvée ni corrigée.

## Correction locale `69592374` et provenance revue

Le commit local `69592374dc7453b7cb6da2dc1ef1026e9fdf0521`, arbre `8e49f0ef6795df8c44d18bcf017fce83d82d9234`, lie le reçu de déplacement à un identifiant transmis dans le state de cette navigation React Router. L’effet vérifie l’identifiant effectivement commis, le projet, le workspace, la fenêtre, le panneau et la présence du même onglet dans la destination. Le reçu est consommé avant comparaison ; la neutralisation reste limitée au desktop.

Pour deux mouvements pendant la même navigation, le setter renvoie l’identifiant déjà en cours lorsque la demande URL est redondante. Le second déplacement actualise ainsi la destination du reçu avec cet identifiant, sans fabriquer une nouvelle navigation. Une redondance sans navigation de déplacement en cours renvoie `false` et efface immédiatement le reçu. Un Retour vers une autre entrée d’historique ne correspond donc pas à l’identifiant d’une navigation interrompue.

La revue indépendante confirme le mécanisme décrit ; elle ne remplace pas la recette. Le test de fermeture de l’onglet utilise maintenant le menu visible « épingler/désépingler » pour retirer l’épingle avant le bouton de fermeture, sans cliquer sur une cible masquée ni forcer le geste. L’assertion de désépinglage puis celles de suppression et de Retour sont conservées. Cette adaptation du test est postérieure au commit produit compilé et doit être rattachée à la tête finalement publiée.

Vérification indépendante du build local `final-navigation` : **9 308 empreintes de sources correspondent exactement aux 9 308 blobs du commit**. Les **2 307 fichiers** de l’archive correspondent exactement au manifeste compilé, sans manque, ajout ou divergence. Empreintes recalculées :

- Manifeste sources : `950c053f8d46eacf997d2fb7e07d50e2a87bdcba9fd45318f50b801f1adc055c`.
- Manifeste compilé : `c132bf12b7ff6f9489099aa9572e7fcb5d1f6c83d9c6f3846d6529455fa458bc`.
- Archive locale `build.tar.gz` : `76519368d60ffdd1b9a28ec55f75e9e43c7bd1ae054f13a90ff24196402f6785`.

L’archive reste locale ; ces empreintes n’impliquent aucune publication du build. **Les sept tests complémentaires sont en cours au moment de cette revue ; aucun verdict final de cette exécution n’est acquis ici.** Les rouges historiques restent intacts. La CI d’une nouvelle tête et le déploiement restent distincts de cette preuve locale.

## Portée et confidentialité

Ces résultats proviennent du navigateur local et de projets synthétiques. Les variantes de correction intermédiaires ne sont pas présentées comme une tête finale validée ; la provenance du prochain build et sa recette complète doivent être ajoutées par le chantier principal. Aucun résultat CI ou production n’est revendiqué ici.

Les extractions conservent tous les verdicts des quatre rapports cités, leurs durées, assertions et seuls reçus de gestes autorisés. Les rapports bruts, configurations, sessions, cookies, en-têtes/corps réseau et snapshots de page ne sont pas publiés. Les identifiants restant dans les reçus désignent uniquement des projets et onglets synthétiques locaux.
