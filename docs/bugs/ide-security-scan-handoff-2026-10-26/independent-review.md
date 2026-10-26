# Revue indépendante — cycle du scan Security

Revue par l’agent racine, distinct de l’implémenteur, sur le worktree `vibecore-execution-timeout`. Le test original n’a pas été affaibli ni modifié. La reproduction retient la vraie réponse ide-state, démarre le scan contrôlé, puis libère le remplacement : la progression disparaît sur le build de référence.

Le correctif déplace le cycle complet (état, contrôleur, échéance, progression, résultat) dans une session transitoire au-dessus des coquilles, sous la portée projet/espace/fenêtre. Le composant Security devient un abonné. Il n’y a ni stockage persistant, ni nouveau credential, ni modification backend.

Points vérifiés dans le code : un seul POST concurrent ; échéance de 90 secondes établie au lancement, sans redémarrage au remount ; progression monotone ; refus des réponses tardives après timeout, annulation ou nouvelle génération ; timers nettoyés ; résultat completed uniquement pour HTTP réussi, ok=true et scan.status=completed. Le refresh vise le propriétaire actuel et est réclamé une fois par révision ; les erreurs synchrones et asynchrones du callback sont capturées. Le message de fin ne prétend plus que les résultats ont été rafraîchis si cette lecture échoue.

Le changement de durée est explicite : une navigation vers un autre panneau du même IDE conserve l’attente ; l’annulation explicite et la sortie de portée l’arrêtent localement. Cela ne prétend pas annuler un scanner déjà lancé côté serveur. Les résultats arrivés lorsque le panneau est masqué peuvent être rafraîchis à sa réouverture.

Deux réserves initiales ont été levées avant compilation : rétablissement de Math.max pour empêcher une régression de progression si l’horloge recule, et capture d’un throw synchrone de reload. Les tests ciblés associés passent. Validation rapportée par l’implémenteur : 36 tests, lint ciblé et typecheck web réussis.

Avis favorable sur le delta et ses gardes, sous réserve de la recette navigateur du build final. Le verdict CI précédent de #808 et ses trois tentatives échouées doivent rester visibles ; cette revue ne constitue pas une validation CI, un scan fournisseur réel ou une recette authentifiée en production.

Complément après recette finale : les sept cas navigateur passent au premier essai, sans retry, dont le test original inchangé. Les hashes des sources sont restés identiques pendant le build et la recette. La réserve de recette locale est levée ; les limites CI/production restent inchangées.
