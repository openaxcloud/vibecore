# Publish, projets et Git — assemblage du 29 octobre 2026

Base main e03b3f856 (#847), conservée intégralement. L'assemblage reprend #831
(5b65ebda0), #834 (31cfa3262 puis correctif documentaire64ea632) et les deux
commits Git locaux a53d9d5a/1c8ddb777. Seul conflit : inventaire généré, régénéré
sans supprimer les fiches entrantes. Aucun backend, OAuth, DNS, workflow ou
configuration de protection modifié. Aucun lot palette refusé ajouté.

## Parcours et corrections

- Publish attend la revalidation de détection en mode automatique ; choix explicite
  conservé. Une copie d'URL refusée expose un champ sélectionnable et un réessai.
- Projets : garde synchrone des mutations ; renommage en erreur conserve le brouillon ;
  confirmation de suppression suit le contrat existant, contrôles44px.
- Git : erreurs de configuration origin visibles, soumission unique, callbacks
  périmés invalidés au changement de projet. Dialogue clavier et focus restitué.
- FR/EN distinguent maintenant « utiliser comme origine Git » d'importer les
  fichiers. Le lien existant /import-github est présenté comme un nouveau projet.
- La revue a reproduit Escape capturé globalement depuis les boutons du dialogue :
  data-state=open utilise le contrat existant, sans modifier les raccourcis partagés.
- Domaines utilise déjà deployments/domains, y compris anciens panneaux persistés ;
  aucune suppression de backend ou configuration.

## Validation locale, portée exacte

214 tests ciblés /36 fichiers passent sur le produit assemblé. Après renforcement
du témoin Enregistrer (URL valide et focus vérifié), quatre tests Escape et six
contrôles d'index passent. Ce dernier passage est distinct, pas dix tests uniques
supplémentaires. Typage web, scripts Node et helpers IDE passent séparément ;
lint ciblé18fichiers et diff-check passent. L'invocation globale initiale de
scripts/typecheck.mjs a passé web puis échoué sur les dépendances API absentes du
nouveau worktree ; après raccordement local des dépendances existantes, le typage
scripts passe. Ne pas revendiquer la commande globale complète ou tous les packages.

Deux builds client/SSR réussissent, produit identique :

1. remote-kubernetes : hashes app/packages stables3090fichiers. Git320/1440 passe
   (clavier, Escape/Close, erreur503→réessai200, double soumission, origine/import
   et Retour), réponses Git contrôlées, aucun fournisseur. Archive B→A instrumentée
   passe13,1s. Les deux cas copie EN/FR échouent à la garde finale de mutations :
   POST runtime/boot tenté et bloqué par la recette. Leurs assertions de copie
   passent ; ces cas ne sont PAS déclarés verts. Aucun runtime externe démarré.
2. Mode CI par défaut, sans override runtime : archive instrumentée13,3s et copie
   EN2,4s/FR2,3s passent directement, zéro reprise/ignoré, garde inchangée.
   Cette différence de configuration est conservée, sans prétendre valider la
   recette stricte en mode Kubernetes.

Le premier harness Git supposait un POST JSON alors que le produit envoie un
formulaire : deux échecs de recette, corrigés dans le script extérieur avant les
2/2 verts. Aucun test produit ou contrat API modifié pour cela. Chromium système
154.0.8037.57 utilisé localement, différent du navigateur embarqué en CI.

## Diagnostic non résolu

Le rouge CI #834 reste non résolu : trois tentatives sans éditeur après archive200.
L'instrumentation ajoute des identités de nœuds éphémères, catégories routeur/projet,
compteurs et focus au moment de l'assertion, sans contenu/URL/identifiant client.
Assertion et délai inchangés. Un vert local, notamment instrumenté, ne démontre
pas la correction de la course ; l'instrumentation peut modifier l'ordonnancement.
Voir project-archive-editor-diagnostic-20261029.md. Aucune trace CI refusée consultée.
Le résultat historique Publish17/18 reste conservé dans les preuves de #831.

Revue indépendante favorable des sources et seconde revue du correctif Escape
et du diagnostic. Recettes sur API/PostgreSQL/Redis locaux et données synthétiques ;
pas d'OAuth/import/push/pull fournisseur réel, DNS, publication cliente ou recette
production. Cette PR brouillon prépare une livraison coordonnée après CI exacte ;
aucune fusion concurrente avec #847, aucune clôture des PR sources avant livraison.
