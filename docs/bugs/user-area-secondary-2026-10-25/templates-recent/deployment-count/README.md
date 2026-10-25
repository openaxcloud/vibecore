# Pluriel français des grands compteurs de déploiements

Défaut réel sur données synthétiques valides : les cartes affichent `Unavailable` en français pour1000000 et1000000000 déploiements, alors que1/2 et l'anglais fonctionnent. Aucun compte réel contenant ces volumes n'est revendiqué. `Intl.PluralRules('fr')` sélectionne `many` pour ces valeurs ; la clé correspondante manquait. Un document français charge uniquement le catalogue FR (`languesRequises`), donc l'anglais ne masque pas ce manque.

Correction locale limitée à deux entrées `userArea.project.deploymentCount_many` dans le catalogue existant `user-area.ts`, EN et FR pour conserver leur parité exacte. Aucun moteur i18n, autre langue, API ou compteur modifié. L'affichage conserve la quantité complète ; aucun plafonnement artificiel.

## Rouge puis vert

Le test ajouté au fichier existant `user-area.spec.ts` crée une instance réelle i18next, avec uniquement les ressources FR et un fallback EN configuré mais absent. Il vérifie explicitement cette absence et les textes exacts pour0,1,2,1000000,1000001,1000000000.

- Test seul avant correction : **2échecs /6succès**, valeurs million et milliard reçues `Unavailable` (`red.txt`, code1).
- Après les deux entrées : **26/26tests verts**, comprenant8tests catalogue,11tests runtime et7tests ressources/parité (`green.txt`, code0).
- Lint ciblé des deux fichiers : code0, journal vide (`lint.txt`).

Les diagnostics sont volontairement séparés : `dual-language-diagnostic.json` charge EN+FR et révèle un repli anglais incorrect ; `fr-only-diagnostic.json` reproduit précisément `Unavailable`, puis montre la contre-épreuve en mémoire. Leur propriété `patch:true` désigne cette contre-épreuve, pas un build navigateur corrigé.

`browser-before.json` et le script associé conservent l'observation compilée initiale, surlocalhost8199 avec fixture locale. Le script ne permet queGET et restaure la fixture après sa boucle ; son import Playwright archivé est relatif au dépôt. Il nécessite l'environnement synthétique du dossier parent et écrit dans `/tmp/ui-templates-recent`. Ces reçus ne constituent pas la recette du futur build corrigé.

Sources figées après validation, empreintes dans `source-sha256.txt`. La session principale a confirmé le build final avec code0 ; son journal est suivi séparément. Ce dossier ne revendique pas de recette navigateur du compteur corrigé : les reçus navigateur ici sont les mesures avant correction. Aucun statut main, production ou déploiement revendiqué. Aucune donnée réelle ni mutation externe.
