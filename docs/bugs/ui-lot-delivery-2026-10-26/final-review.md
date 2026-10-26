# Revue indépendante finale — lot UI avant PR brouillon

**Avis favorable à l’ouverture de la PR en brouillon, aucun blocage identifié dans le delta relu.** Revue sur HEAD `05c4e412e`, contre `origin/main` `3eb70894e`. Aucun test redondant, modification produit, index, commit ou publication effectué par le relecteur.

## Intégration de main et périmètre

Le merge apporte exactement un fichier depuis son premier parent : `services/api/src/tests/lecture-declenche-provisionnement.spec.ts`. Son blob est identique à celui d’origin/main. Aucun fichier `app/` n’est modifié par le merge ; aucun delta `services/` ou `packages/` ne subsiste contre origin/main. Le correctif entrant #798 n’est donc ni réimplémenté ni dupliqué dans ce lot UI.

Le delta application comporte sept fichiers : quatre produit (SaaSLayout, Quota, route Support, catalogue Support) et trois fichiers de tests. SaaSLayout ne change que le padding horizontal du contenu AppShell : aucun routage, panneau IDE, Git/Publish/Deploy/Domaines ou hub Intégrations modifié. Le minimum via max(gouttière existante, safe inset) évite de sommer inutilement les marges ; l’override projects/new et les tables/sidebar ont des reçus ciblés conservés.

Quota conserve les deux destinations et remplace seulement le minimum dépendant de rem par44px. Support impose localement44px avec important pour battre la règle globale36px ; le Button partagé et la règle globale restent inchangés.

## Contrat Support

L’action conserve validation du texte, endpoint et corps API, attente de réponse, reauth, codes d’erreur et Retry-After. Après succès seulement, les requêtes de document Accept text/html gardent le redirect PRG ; les requêtes de données observées Accept */* reçoivent `{sent:true}`. Aucun contenu utilisateur renvoyé dans l’accusé, aucune persistance locale, aucun changement API backend.

Le brouillon contrôlé est porté par la route et associé au ticket. La garde reste active pendant POST ; les navigations même pathname peuvent passer pour la soumission/revalidation sans perdre le champ. La conversation existante reste montée pendant revalidation de la même page, avec aria-busy/statut. Un accusé n’est consommé qu’une fois ; il ne vide le champ que si ticket et texte correspondent au snapshot soumis. Une édition pendant attente reste présente. L’abandon explicite efface aussi le snapshot, empêchant sa réapparition au retour A→B→A. Le catalogue fournit les trois textes FR/EN du dialogue sans supprimer de fonction.

Les tests réels DataRouter couvrent erreurs400/503, revalidation différée, succès rapide coalescé, édition pendant attente, second envoi/ancien accusé, POST annulé par GET, garde/cancel/Escape et abandon puis Retour. Les assertions de classe complètent les mesures navigateur ; elles ne remplacent pas la vérification de cascade CSS.

## Preuves et limites

Les reçus distinguent baseline, contrepreuve DOM et build compilé : safe content32géométries +4groupes de parcours +gardes partagées/sidebar ; Quota44observations après correction ; Support4groupes de navigation,4annulations langue,8actions synthétiques et1PRG HTML. Les neuf POST Support ont ciblé la fixture locale ; quatre PATCH préférences ont été bloqués au navigateur. Aucune affirmation « aucune mutation tentée » pour cette recette.

Le reçu de zoom compilé11799 contient48cas. Les captures Playwright initiales vides restent signalées comme inexploitables ; les captures CDP distinctes ont réellement été inspectées : Support320CSS/bouton44px et Quota250CSS/deux actions entières. Pour la matrice avec demande390, le reçu indique outerWidth500 mais innerWidth195 via redimensionnement CDP ; le diagnostic de lancement séparé indique outerWidth500 et innerWidth250. Aucune de ces observations ne prouve une fenêtre physique390 ni un appareil iOS.

Les contrôles build/typage/lint/format et28tests Support déjà rapportés ne sont pas présentés comme réexécutés après merge par cette revue. Les validations finales et CI restent à suivre par le parent. Le merge n’a changé aucun produit UI ; cette vérification source permet de conserver l’attribution des reçus aux sources UI, pas d’inventer une recette globale post-merge.

La matrice reste51routes partiellement exercées,146non exercées,5réservées historiques,155horsUI (357IDs). L’allocation14groupes/146IDs n’est pas146recettes et ses37réservations ne s’ajoutent pas aux357. WebKit indisponible n’est pas un succès Safari ; Firefox, clavier virtuel, matériel/safe areas réelles, lecteur d’écran et production ne sont pas certifiés.

Limites fonctionnelles conservées : pas de brouillon durable après fermeture complète ; les prompts natifs dépendent du navigateur ; un succès serveur dont l’accusé serait perdu peut laisser le texte présent (pas d’idempotence backend ajoutée). La correction safe content est horizontale, pas une certification de tous les cas de focus vertical après resize. Aucun élément ne justifie une affirmation d’achèvement global de la plateforme.
