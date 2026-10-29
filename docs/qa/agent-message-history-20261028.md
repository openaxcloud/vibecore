# Recette de l'assemblage agent/messages et historique

Ce document prépare la recette ; aucune étape ci-dessous n'est une preuve live.
L'assemblage conserve les changements modèle/budget et brouillon de #828/#829.

## Déjà vérifié sur données isolées

- Une ancienne lane interrompue reste arrêtée pendant la réponse suivante.
- Seule la réponse visible courante affiche la progression/les écritures en attente.
- Stop du flux retire cette progression même si le drapeau global reste actif.
- Une erreur terminale de lane sans prose ni orchestration demeure visible.
- Les badges masqués en IDE ne créent pas une coquille vide avec commandes.
- Les retours tardifs de mémoire/repli du projet A ne changent pas les messages,
  l'identité ou les métadonnées du projet B ; les rejets obsolètes ne créent pas de toast.
- L'erreur du projet actif reste signalée ; les reçus d'écriture et QA ne sont pas
  inférés depuis une déclaration du modèle.

Les composants et le hook sont réels ; annotations, délais et services de stockage
sont synthétiques. Les résultats détaillés restent dans les tests et reçus des lots.

## Recette à réaliser sur la version réellement servie

Utiliser uniquement le projet de recette autorisé. Consigner le SHA livré et
l'heure ; ne pas relancer de génération ou dépenser le budget fournisseur sans
coordination préalable.

1. Recharger un historique interrompu existant : ses anciennes lanes ne doivent
   pas spinner, même lorsqu'un nouveau tour autorisé est en cours.
2. Observer progression et erreurs du tour courant : distinguer attente, sortie
   partielle, résultat terminal et écritures réellement confirmées. Une réponse
   vide sans annotation n'est ni une réussite ni une preuve de livraison.
3. Après erreur/interruption, vérifier que le message explicatif reste lisible et
   que l'historique n'affiche pas une finalisation indéfinie. Ne pas exécuter un
   retry payant uniquement pour cette vérification.
4. Naviguer A → B puis recharger B : le fil et son identité restent ceux de B.
   Les cas de lectures réellement retardées sont couverts par les tests isolés ;
   une navigation rapide seule ne prouve pas avoir exercé cette course.
5. Au clavier et sur mobile, accéder au menu du message et aux détails d'erreur ;
   vérifier l'absence de coquille vide, le retour du focus et la lisibilité sans
   défilement horizontal. Les tests DOM ne remplacent pas cette recette visuelle.
6. Rejouer les contrôles existants du choix explicite de modèle/budget et du
   brouillon épinglé. Aucun seuil ni assertion stricte ne doit être retiré.

## Limites

L'assemblage ne répare pas une indisponibilité/crédit fournisseur et ne constitue
pas une recette du coût, de la génération complète ou d'un formulaire produit.
Il ne force pas l'annulation d'une lecture déjà lancée et ne promet pas de résoudre
plusieurs instances indépendantes du chat montées simultanément.

## Validation de l'assemblage local

191 tests groupés passent, dont les régressions de messages/historique, le choix
explicite de modèle/budget et le brouillon pendant les sauvegardes. Typage complet,
build client/serveur et lint passent (52 avertissements préexistants). Revue
indépendante favorable : fichiers produit identiques aux têtes sources, protections
main préservées, union d'inventaire exacte à 548 entrées. Ces résultats ne remplacent
pas les workflows GitHub du SHA assemblé ni la recette production.
