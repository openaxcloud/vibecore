# Recettes ciblées des panneaux de service — 29 octobre 2026

Base locale47b1e2e922 (arbre identique au lot f978), branche de correction `fix/ide-service-panel-drafts-20261029`. Chromium local390/820/1280, composants réellement compilés, API/runtime et données synthétiques isolés. Aucun backend réel, OAuth, publication, DNS, permission, appel IA, secret réel ou opération client exercé. Preview couvre seulement le démarrage et les logs, jamais une iframe applicative fonctionnelle.

## Lecture des preuves

Les six sous-dossiers conservent les README de diagnostic et tous leurs reçus, y compris premiers échecs de harnais, délais initiaux et contre-preuves DOM. Les reçus JSON sont reformatés sans retrait de champs. `sources.json` donne provenance et empreinte SHA256 des originaux. Les README sont des instantanés successifs : « non appliqué » dans une proposition décrit sa date ; les correctifs de ce lot sont désormais locaux mais les validations compilées disponibles sont précisées dans la mise à jour ci-dessous, sans clôture des défauts résiduels. Aucune contre-preuve DOM ne vaut validation d’un build corrigé.

| Groupe | Recettes et défauts établis | État du lot |
| --- | --- | --- |
| Env / Secrets | Vide,503→Retry, longues clés, menus ; filtre perdu après détachement réel à390/820/1280. Escape Secrets laisse BODY focalisé ; tooltip double desktop. | Filtres seuls transférés en mémoire par projet/fenêtre/panneau ; valeurs, clés et secrets révélés restent locaux. Escape ne doit restaurer l’ancre que si le focus n’a pas déjà quitté menu/ancre. Validation compilée attendue. |
| Studio / Security | Vide/reprise et clavier ; texte long Studio déborde3formats, Security820. Profil Security=sca perdu au remontage1280→390, trois témoins rouges. | Repli local et grille Studio ; seul profil Security en brouillon éphémère, onglet local. Aucun scan, Save ou appel IA. Validation compilée attendue. |
| Preview / Debugger | Preview startup/logs3formats seulement. Debugger vide/reprise6recettes ; corps déborde3formats, texte masqué. | Layout Debugger local, aucune modification moteur ou contrôle de session. Validation compilée attendue. |
| Git / Deployments / Domains / Integrations | GET, vide/reprise, catalogue/texte long uniquement. Git1280 : panneau588px mais scrollWidth1987, reproduit deux fois. | Git réservé au propriétaire ; contre-preuve DOM seulement, aucun correctif source. Aucun parcours métier connecté ou mutation. |
| Collaborators | Trois pertes de brouillon1280→390 après commit responsive, aucun POST. Deux essais prouvent directement l’ancien nœud détaché. | Formulaire complet non secret (identifiant/rôle, chemin/ligne/corps) en mémoire seulement ; succès/error/version envoyée encore en validation. Pas d’invitation, commentaire ou permission réelle. |
| Tooltip | Vrai role=tooltip et pseudo::after simultanés, panneau588→scroll2298. | Propriété du renderer global et secours CSS exclusifs, StrictMode/dernier propriétaire ; validation compilée attendue. |

## Limites conservées

Plusieurs premiers essais1280 et quelques essais Debugger/Studio expirent à5s avant le premier GET. Les captures montrent le loader ; les recettes isolées suivantes passent avec le même seuil, sans établir la cause ni une correction de produit. Env Diff scopes→Exit diff, Security aria-current plutôt que aria-pressed, Preview toolbar absent au démarrage, Git/Domains libellés Refresh exacts : erreurs de harnais conservées et distinguées des défauts produit. Les premières mesures Debugger limitées au panneau extérieur ne prouvaient pas l’absence de débordement du corps.

Les contre-preuves conservent les textes intégraux et ne modifient pas les assertions du dépôt. Les logs de tests locaux restent dans les dossiers de travail ; les nombres évoluent pendant l’assemblage et ne sont pas présentés ici comme verdict final. Le root doit ajouter build, typage, lint, revue et recettes compilées exactes avant publication.

31/31 signifie seulement qu’au moins une recette visuelle locale ciblée existe désormais pour chaque panneau canonique. Aucun panneau n’est certifié complet. Pas de recette Safari/appareil physique, zoom200% de ce complément, clavier virtuel, safe areas matérielles, lecteur d’écran ou contraste exhaustif. Retour interprojetB→A#834 et fragilité README restent ouverts. Aucun correctif de ce lot fusionné ou déployé ; les validations/protections et la coordination main restent obligatoires.

## Mise à jour : recettes du build assemblé local

- Env/Secrets : neuf passages compilés réussis sans reprise,390/820/1280 pour chacun des filtres Env et Secrets puis focus Escape Secrets. Les anciens champs se détachent réellement au changement de coque ; les filtres survivent à l’aller-retour. Les valeurs/clés Env ne sont volontairement pas conservées. Le scénario focus utilise une clé courte et ne valide pas les longs tooltips. Le focus déjà sorti du menu est couvert par les tests de composants (20/20), pas par ces neuf parcours natifs.
- Studio/Security : trois recettes de repli Studio et trois Security réussies, textes intégraux, sans injection DOM. Profil Security conservé après détachement à390→1280 et1280→390. La tentative820→390 échoue sur la précondition stricte de détachement car ces deux formats partagent la coque mobile ; elle reste dans le reçu. La recette distincte820→1280 établit le vrai remontage et passe. Neuf cas visés réussis, plus cet échec de préparation conservé ; aucune assertion assouplie.
- Collaborators : trois recettes compilées1280→390→1280 passent avec identifiant, rôle UI sélectionné, corps de commentaire, chemin et ligne intacts. Aucune soumission ni attribution de permission. Le formulaire conserve atomiquement toute version récente lors d’une réponse ancienne/ABA selon tests de composants ; ces réponses de soumission ne sont pas exercées par le navigateur. Les champs sont typés en liste autorisée et gardés uniquement en mémoire du projet/panneau, sans droit serveur.
- Tooltip : les trois premières recettes compilées échouent, puis un diagnostic1280 instrumenté échoue également ; reçus conservés. Un correctif Escape supplémentaire est en cours de validation. Aucun verdict compilé final vert revendiqué.
- Debugger : les trois recettes compiled-debugger passent la géométrie mesurée du corps, mais un débordement résiduel de5px du bouton Remove a ensuite été identifié. Correction en cours ; les trois verts ne valent pas validation finale intégrale du panneau.

Les recettes nouvelles restent Chromium local avec API/runtime synthétiques, sans backend réel ni production. Le total31/31 reste une cartographie de recettes ciblées partielles. #841 sur47b1 dispose de ses validations propres ; les nouveaux changements ne les héritent pas et attendent leur verdict assemblé exact.

## Verdict local final du lot

Les réserves Tooltip et Remove décrites ci-dessus correspondent aux builds précédents et restent documentées. Le build client/SSR final est réussi. Tooltip `compiled-final` passe3/3 à390/820/1280 : texte intégral, une seule bulle, pseudo:none, fermeture Escape/scroll sans résurgence et focus conservé. Debugger `remove-compiled` passe3/3 aux mêmes formats : géométrie stricte de Remove dans son formulaire, clic d’essai sans activation, focus, textes et absence de débordement du corps. Secrets `final-secrets-focus` passe3/3 sur le build final. Aucun contrôle affaibli ni reprise automatique dans ces recettes finales.

Validation d’assemblage rapportée par le parent :136/136 tests dans huit suites finales,16tests inventaire déjà réussis ; Tooltip26/26 avec clavier et revue indépendante14/14 ; revue Debugger favorable. Typage complet réussi avant les derniers deltas Tooltip/shrink-0, puis typage web final réussi ; lint sans erreur,52avertissements préexistants. Ces nombres ont des recouvrements et ne doivent pas être additionnés. Les reçus antérieurs rouges et erreurs de préparation restent conservés.

Verdict : correctifs ciblés validés localement, pas encore fusionnés/poussés sur main ni livrés par ce travail documentaire. Chromium synthétique uniquement, aucune authentification production ou exécution backend/runtime réelle.31/31 reste ciblé et partiel ; Git branche longue est réservé et ouvert, retour interprojet834 et fragilité README restent ouverts. Aucun secret ou donnée cliente lu/modifié.

Sauvegarde des sources validées : commit local `424fc10eb`, parent `47b1`. Aucun push de ce nouveau lot. Les serveurs de recette du parent ont été arrêtés après vérification de leur identité PID ; sortie des enfants et fermeture des ports confirmées. Cela ne constitue pas un déploiement.
