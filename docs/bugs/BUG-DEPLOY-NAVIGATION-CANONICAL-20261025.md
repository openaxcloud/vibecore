---
id: BUG-DEPLOY-NAVIGATION-CANONICAL-20261025
---

# Publish et Domaines : achever le parcours unique de déploiement

## Bug

**La grille masque le doublon Domains, mais URL mobile, anciens layouts et page projet historique ouvrent encore une interface concurrente.** L'audit complémentaire du 25 octobre distingue cette consolidation partielle préexistante des corrections de fiabilité de #784.

## 📤 Dispatché

25 octobre 2026 : delta séparé de #784, branche `fix/deploy-single-navigation-20261025`, base `66455751c`. Aucun changement de la tête #784 en CI pour préparer ce lot.

## 💻 Codé

Premier lot local commité `15dd78791`, non intégré à main : la page historique Domains redirige après autorisation, ses opérations métier restent identiques et ses erreurs POST sont rendues explicitement (HTTP400). Les entrées IDE historiques affichent le même hôte Déploiement, sans migration destructrice des layouts ni suppression backend. Notice organisation et diagnostic TLS conservés. Réglages avancés disponibles dans le formulaire ; URLs des déploiements non READY exclues des liens présentés comme publiés.

L'audit complémentaire révèle une autre divergence : le bouton Publish principal et la navigation dashboard ouvrent encore la page Déploiements autonome. Celle-ci possède détection serveur/statique, choix de machine et délai de build de 610 secondes, absents du panneau IDE. Une simple redirection perdrait ces capacités. Leur partage et la consolidation de ces portes sont implémentés dans un complément distinct du lot Domains déjà testé, commité `2ae6d39d3`, revu indépendamment et validé en recette navigateur locale. Le formulaire partagé conserve la détection, les modes explicites, la taille de machine et les fournisseurs avancés ; le transport IDE conserve le délai de 610 secondes pour publication et republication. Historique détaillé, logs horodatés et confirmations sont portés. La détection respecte le workspace choisi et refuse une sélection étrangère au projet avant toute lecture. Les quatre réserves de revue sont levées : workspace du bouton Publish, clé de reprise, QR/lien Usage et libellés traduits. Les brouillons restent en mémoire par projet/workspace, sans stockage persistant des variables. Les preuves navigateur définitives sont jointes ci-dessous ; la CI et la livraison GitHub restent distinctes de cette validation locale.

## ✅ Testé live

Lot Domains : **6/6 recettes Chromium compilées passées**, 115829 ms, sans retry/omission. Les trois portes historiques, le maintien du sous-onglet au redimensionnement, l'assistant et les détails repliables, puis un POST historique invalide sans création de domaine sont vérifiés. Contre-épreuve mobile rouge sur le build précédent conservée. **190 tests contrôlés**, typage web, build, lint, scanner i18n et revue indépendante verts. [Reçu, captures et limites](deploy-canonical-navigation-2026-10-25/README.md).

Ces résultats ne certifient pas encore l'unification des deux parcours Publish. Aucune publication cliente, mutation DNS, validation production ou parité Replit revendiquée. Pile locale de cette recette arrêtée et conteneurs éphémères supprimés.

## Limites à vérifier

- Les trois entrées historiques rejoignent Déploiement → Domaines, puis permettent Logs/Manage sans réinitialisation lors d'un redimensionnement.
- La notice de portée organisation et les erreurs TLS restent présentes.
- Un ancien formulaire ouvert avant mise à jour conserve son diagnostic d'erreur POST.
- Les champs avancés repliés restent inclus dans FormData ; leur masquage visuel ne supprime aucune configuration.
- Le brouillon complet de l'assistant et les fournisseurs externes ne sont pas couverts par la seule conservation du brouillon Domains.
