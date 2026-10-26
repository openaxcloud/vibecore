# Revue indépendante de l’allocation

Avis favorable à l’allocation proposée, sans certification produit ni autorisation implicite d’éditer les dépendances partagées. Revue en lecture seule de la classification et des sources ; seul ce compte rendu est ajouté. Aucun nouveau test produit, navigateur, build, index, commit ou appel externe.

## Contrôles vérifiés

Comparaison indépendante du JSON à `coverage-overlay-support-quota.json` : **146 lignes, 146 IDs distincts, 14 groupes disjoints contenant exactement ces 146 IDs**, zéro omission et zéro ajout. Tous les fichiers attribués existent ; aucun fichier de route attribué deux fois. Le SHA256 de l’inventaire référencé correspond au fichier lu. JSON examiné : `0cccf07a61a89a341ae6261a56e316f56d54629eaa3dcd27010ea969e718fdb7`.

Les totaux recalculés correspondent : 117 pages/wrappers rendus, 15 redirections loader, 3 redirections de protocole d’authentification, 3 réexports de module, 2 parents Outlet, 4 réponses404 inconditionnelles, 1 réutilisation de composant avec loader propre et 1 définition rendue identique. Ce sont des catégories d’implémentation, pas 146 pages distinctes effectivement validées.

Vérifications sémantiques directes :

- `/settings` et `/settings/:tab` montent le ControlPanel partagé IDE. Leur réservation est correcte ; ils ne deviennent pas des pages du compte dans notre lot.
- `marketplace.tsx` est un parent Outlet ; son index rend une vraie page. `marketplace.templates.tsx` réexporte la page Templates, sans redirection HTTP. Le dashboard index projet est également une vraie page, distincte du parent Outlet.
- Les quatre anciennes routes de profil jettent404 ; leur type historique ne vaut pas comportement actuel. `$slug` et `advanced.$section` ont aussi des surfaces connues : leur recette doit couvrir le rendu valide, pas seulement404. `marketing.$slug` réexporte effectivement le catch-all.
- `ai-docs` et `ai-documentation` rendent la même définition, sans redirection. `/deployments` est une présentation marketing, pas le panneau de déploiement projet.
- Les alias compte/offre ont de vrais loaders de redirection ; les règles de query diffèrent (langue normalisée pour onboarding, plan/intervalle pour subscribe, destinations fixes pour account-data/connected-accounts/user.settings). Une future recette ne doit pas leur imposer arbitrairement une conservation identique de tous les paramètres.

## Dépendances et frontières

La réserve identifiée pendant la revue est intégrée : `organization-domains.tsx` partage la liste et les endpoints avec la route domaines projet ; son groupe séparé impose désormais la coordination Domains. Les six onglets développeur/admin importés par `admin.$section.tsx` depuis `@settings` et ControlPanel restent attribués à la session IDE dans le registre. Les composants marketing, SaaSLayout et helpers partagés restent des références, non des fichiers librement attribués aux lots.

Les 37 routes réservées dans cette allocation restent historiquement `non_exerce` ; elles ne remplacent pas les cinq routes déjà réservées hors de cet ensemble. Les propriétaires proposés ne prouvent pas qu’une session est déjà lancée. Le registre d’imports directs n’est pas une preuve d’absence de dépendances transitives ; une lecture du diff et une vérification des propriétaires restent nécessaires avant chaque correction.

## Priorités utilisateur concrètes

1. Récupérer un accès et sortir d’une erreur : mot de passe oublié/réinitialisé, vérification email,404 avec retour exploitable, sous fixtures isolées.
2. Rejoindre la bonne page compte/offre depuis un ancien lien, puis revenir sans perdre le contexte ; aucun achat ou changement de connexion réel.
3. Trouver une aide ou un élément de catalogue : recherche vide/longue/erreur, détail puis Retour, clavier et petit paysage.
4. Lire les accès organisation et les erreurs de droits avant toute mutation ; administration ensuite, avec ses sous-panneaux explicitement recensés.

Ces priorités désignent des parcours non exercés, pas de nouveaux défauts reproduits. Les callbacks et liens tokenisés doivent rester entièrement synthétiques côté serveur aussi : un GET navigateur peut déclencher un effet serveur. Aucune validation production, Safari/Firefox, lecteur d’écran, clavier virtuel, safe area matérielle ou couverture exhaustive des paramètres dynamiques n’est ajoutée par cette revue.

Complément final : les restrictions de coordination et propriétaires de composants partagés sont aussi explicités par route. Le registre comporte 216 fichiers. L’extrait de commentaire ambigu de `editor.$id` a été retiré par l’auteur avant clôture ; aucun point bloquant restant pour cette allocation.
