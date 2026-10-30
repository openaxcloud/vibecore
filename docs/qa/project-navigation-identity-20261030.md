# Identité des projets, Git et Publish — 30 octobre 2026

Base : `bd5e0f5ea87767849d266b031b13fe4ae2e0967a` (#856).
Lot distinct des correctifs #849 livrés via #850. Aucune fusion ou livraison
effectuée par cette recette ; coordination réservée au parent.

## Défaut établi et correction

`GitSettingsPanel` pouvait terminer une sauvegarde ou un retrait d'origine après
le changement d'espace et rappeler l'ancien `loadPanel`. Trois tests rouges
avec les vrais composants `GitTab` et `GitSettingsPanel` montrent les commits
de l'ancien contexte dans le DOM. Un quatrième témoin montre un brouillon URL
de A conservé dans B lorsque l'URL configurée est identique.

La génération de mutation est invalidée au changement projet/workspace et au
démontage. Une fin obsolète n'émet plus de callback/toast ni de mise à jour UI.
Un verrou synchrone commun sérialise sauvegarde et retrait, y compris avant le
prochain rendu. Les brouillons URL/branche repartent des valeurs du nouveau
contexte ; un rafraîchissement du même contexte conserve la branche éditée.
Une fermeture ne peut pas annuler une opération déjà envoyée au serveur.

Le témoin A→B par changement de props ne prouve pas ce trajet dans toutes les
coques : BaseChat remonte déjà le panneau par clé projet. Le changement de
workspace conserve GitTab et constitue le témoin directement applicable. Le
Workbench rend également GitTab sans clé projet. Aucune écriture entre projets
dans la production n'a été démontrée.

## Couverture composants

- Git : 13 nouveaux cas, dont 4 intégrant GitTab et Settings. Réponses retardées,
  A→B→A, fermeture/réouverture, retrait/sauvegarde simultanés, double soumission,
  erreur puis nouvelle tentative, cible du POST suivant et brouillons.
- Publish : routeur React réel, détection B retenue puis retour A ; draft, provider
  et workspace A restent cohérents. B retrouve son propre draft. La confirmation
  de rollback abandonnée ne réapparaît pas au retour. Aucune correction produit.
- Miniatures : réponses tardives A/B, chargement d'images détachées et nouvelle
  tentative n'altèrent pas A au retour. Association endpoint/URL vérifiée dans le
  hook. L'association en amont entre store d'aperçus et projet n'est pas prouvée
  par ces tests. Aucune correction produit.

Ces tests exécutent les composants en jsdom avec API synthétiques. Ils ne prouvent
pas OAuth, import fournisseur, push/pull, DNS ou publication réels. Les tests de
menus voisins couvrent annulation, Escape et Enter+blur sans doublon.

La revue indépendante est favorable sur le blob produit
`9fb4a8c118315333377dfbd484f478a84f9798ef`. Aucun délai ni assertion existante
n'a été diminué ou supprimé. Les suites de revue recoupent les suites principales
et ne doivent pas être additionnées comme nouveaux tests uniques.

## Limites conservées

La cause historique de l'éditeur absent après B→A (#834) reste indéterminée.
Aucune ancienne trace refusée n'a été lue. L'observation instrumentée peut
modifier l'ordonnancement et un passage vert ne démontre pas une correction.
Pas de production authentifiée, de Safari matériel ni d'opération cliente.

Un contrôle exploratoire séparé de l'auteur Git montre un champ conservé si
`GitSettingsPanel` seul est réutilisé entre A et B sans préférence B. Aucune
écriture automatique ; seul un clic Enregistrer l'écrit sous la clé B. Le montage
normal via GitTab remet toutefois l'enveloppe à zéro et démonte Settings, et un
remontage de B affiche bien des champs vides. Ce cas artificiel n'établit donc
pas un défaut du parcours utilisateur et n'est pas corrigé dans ce lot.

## Reproduction navigateur sur main

Build client/SSR frais du main ; packages workspace résolus vers ce même main
(notamment editor et billing), API/PostgreSQL locaux et données synthétiques.

- Recette durable archive à 768 px : passe directement en 13,9 s, sans reprise.
- Navigation A→B, archive B réellement retenue, retour A : trois passages directs
  à 390/768/1440 px (9,6/9,2/5,7 s), sans reprise.
- Paramètres Git à 320 et 1440 px : deux échecs attendus sur main. Sauvegarde
  retenue, fermer/réouvrir, puis ancienne réponse 200 : les lectures Git passent
  de 6 à 7. Le brouillon reste intact ; l'assertion toast suivante n'est pas
  atteinte, donc elle ne prouve rien sur main. Aucun POST n'atteint un fournisseur.

Ces deux rouges établissent un rechargement périmé après fermeture, pas une
écriture sur le mauvais projet. La même recette est conservée pour le candidat.

## Validation du candidat

- 354 tests / 57 fichiers passent directement, aucun test ignoré, avec packages
  workspace du main courant. Ce total inclut les 152 tests Git et les six tests
  d'index, pas des résultats à additionner. Un premier passage avec anciens liens
  de packages a été suivi de ce passage après correction des liens locaux.
- Typecheck web et ESLint des sept fichiers TypeScript modifiés : exit 0.
  `git diff --check` : exit 0. Client et SSR construits avec succès.
- Paramètres Git navigateur 320/1440 : passages directs en 3,4/4,3 s. La lecture
  reste à 6 après la fin de l'ancien POST, toast périmé absent, nouveau brouillon
  conservé. Double soumission : un seul POST contrôlé.
- Les POST Git sont interceptés. Le garde réseau a bloqué zéro autre mutation
  à 320 px et un PUT de persistance ide-state à 1440 px ; cela ne constitue pas
  une validation de la sauvegarde complète de l'état IDE. Aucune tentative runtime,
  DNS ou OAuth observée par cette recette.
- Une assertion supplémentaire borne ensuite les catégories bloquées à ide-state,
  sans modifier les assertions de rechargement ni les délais. Le passage final
  renforcé réussit à 320/1440 en 3,3/3,7 s (zéro autre mutation bloquée dans ce
  passage). Ces deux exécutions des mêmes cas ne sont pas quatre cas uniques.
- Le test durable archive 768 reste inchangé et passe sur le candidat en 14 s,
  sans reprise ni test ignoré. Cela ne résout pas la cause historique #834.

Incidents locaux conservés séparément : premier build sans heap du script
officiel arrêté (134), puis build avec 8 Go réussi ; schéma synthétique initial
incomplet remplacé par une base dédiée migrée ; démarrage web trop tôt repris
après construction SSR. Au passage candidat, l'ancien serveur occupait encore
le port (EADDRINUSE) : deux tests ont échoué sur Loading IDE avant Settings.
Le serveur correspondant a été identifié et arrêté, puis le candidat démarré.
Les deux passages verts ci-dessus suivent cette correction d'environnement,
sans changement des assertions ni relance automatique du test.

Le build candidat utilise uniquement le nouveau blob Settings sur le main.
Hash SHA256 du SSR candidat :
`9cde10848c7d63441507a7c038d9d8585a7b0d6158ec7cfa3885aa2a8aaa0e25`.
Les reçus et captures synthétiques sont conservés localement dans
`/workspace/navigation-browser-20261030`, les logs bruts API ne sont pas publiés.
Le navigateur est Chromium système 154.0.8037.57, différent du navigateur CI et
de Safari matériel. Le reçu compact [JSON](project-navigation-identity-20261030.json)
sépare chaque exécution, y compris les rouges et incidents d'environnement.
Les processus locaux sont arrêtés et les quatre ports de recette sont fermés.
