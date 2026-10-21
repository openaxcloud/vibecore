# Compatibilité avec main 2ef2ef96

La tête initiale #763 `24eea25f3e5b73cad7499ec6d43b8ff21e8e57c3` est combinée avec
main `2ef2ef964e59d165b4a641e6737495010ed73778`. L'arbre préparé et compilé est
`a10821715e54cfe764cd8d02cc2334f2c0742c3d`. Seul conflit : l'index documentaire,
régénéré depuis l'union des 466 fiches. Aucun changement produit supplémentaire.
Ce dossier de preuves est ajouté ensuite ; il n'appartient pas à l'arbre compilé.

## Résultats locaux

Node 24.19.0 et pnpm 9.14.4, installation avec verrou figé. Build et typage complet
réussis. 29 tests unitaires ciblés passent, dont les workers Tinypool réels et le
contrat Node. La recette navigateur utilise Chromium système, le serveur compilé
sur loopback 5211, l'API sur 3017 et le PostgreSQL jetable existant sur 55443.
Les configurations versionnées sont celles du dossier parent.

| Recette finale avec fixtures | Succès | Échecs | Retries | Skips |
| --- | ---: | ---: | ---: | ---: |
| Confirmation EN/FR, trois formats | 6 | 0 | 0 | 0 |
| Menu, actions et thème, trois formats | 12 | 0 | 0 | 0 |
| Fichier IDE complet | 45 | 0 | 0 | 0 |

Les 63 cas sont distincts. Les confirmations vérifient 120 réouvertures/Escape,
sans demande de restauration. Le fichier IDE complet prend 3,7 minutes et inclut
le rail des tables sur PostgreSQL réel. Les cinq cas IDE ciblés et le test isolé du
rail sont des répétitions incluses dans les 45, pas des succès supplémentaires.
Les limites des cas préexistants (voix simulée, flux IA synthétique, réponses de
chargement retenues) décrites dans le README parent demeurent applicables.

## Essais initiaux conservés

Le premier essai sans fixtures a produit 11 succès et 7 échecs à l'assertion de
réussite de `/auth/register`, avant la navigation UI. Les logs API montrent dix
201 consécutifs puis sept 429. `registration-statuses.json` conserve les request
IDs, statuts et durées, sans corps, cookie ou en-tête. Le seuil d'inscription
local n'a pas été changé. La recette finale réutilise le mécanisme existant
`UX_QA_SESSION_FILE` : un jeu de sessions synthétiques par format/langue pour les
confirmations, une session dédiée pour les menus. Ce sont de vrais appels API,
pas des réponses simulées. Ces essais ne remplacent pas une recette d'inscription.

La sélection IDE initiale compte cinq succès et un skip explicite parce que
`DATABASE_URL` était absent. Le cas omis a ensuite passé avec le PostgreSQL dédié,
puis avec tout le fichier IDE. Aucun skip n'est caché dans le bilan final.

L'installation initiale terminait avec code0 malgré deux échecs natifs optionnels :
`node-pty` et `re2` ne pouvaient créer le cache dans l'ancien répertoire utilisateur.
Les caches ont été déplacés dans `/tmp`, les scripts d'installation normaux rejoués.
Un vrai shell PTY a émis la sortie attendue avec code0 ; le binaire re2 charge et
exécute une expression régulière. Cela ne certifie pas le terminal UI.
Le premier typage a également échoué lors d'un sous-processus utilisant pnpm système ;
le PATH explicite vers pnpm9 permet au typage complet de réussir. Aucun contrôle
ou délai n'a été affaibli. Les logs initiaux restent dans les artefacts locaux.

## Provenance et retraits

`sources.json` contient uniquement les 9201 chemins suivis et empreintes ;
`compiled.json` décrit les 2306 fichiers compilés. `receipt.json` distingue les
empreintes de ces manifestes et de l'archive, conservée localement. Le contenu
compilé est identique au contenu compilé précédent : les changements de dépendances
et de contrat Node n'ont pas modifié ces fichiers web.

Les résumés JSON retirent les chemins absolus, paramètres d'environnement, pièces
jointes brutes, corps des requêtes et sessions. Ils conservent noms des cas, statuts,
durées et tentatives ; les résultats rouges restent séparés. Les captures FR
montrent le menu mobile et le bouton de restauration avec focus visible.

Preuve locale uniquement : aucune certification fournisseur, publication Internet,
terminal UI, projet utilisateur ou production. La nouvelle tête publiée doit
encore passer ses propres checks GitHub avant fusion normale.
