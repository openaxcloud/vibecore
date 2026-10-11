# Revue visible et retour pendant l’attente — B-22, B-24

Reprise sur le lot agent #712 : deux fusions réelles sans conflit, les gardes de reprise et d’écriture restent présentes. Avec application automatique, les propositions qui nécessitent une revue (conflit, tronquée, relue de la base, échouée) restent visibles. Une proposition encore en flux ou en cours d’application n’est pas présentée comme un travail à accepter. L’alerte de revue n’invite plus à demander à l’agent de corriger un problème qui attend une décision humaine.

Le signal « l’agent écrit » disparaît dès que le texte est rendu. Le texte est lu par une source commune avec AssistantMessage : contenu traité prioritaire, sinon parts texte du SDK, y compris lorsque content ne contient que des espaces. Les parts d’outils ne sont pas assimilées à du texte.

L’ancienne branche d’indicateur contenait du SCSS invalide malgré une fusion sans conflit. Sass confirme « Expected ' » à l’ancien bloc. Les fermetures du style tactile et l’ouverture du commentaire sont rétablies ; construction web verte.

63 tests dans huit suites : règles, branchement de la file, alerte, vrai rendu des messages, voisinage de l’assistant et de la feuille des modèles. Contre-épreuves : vider la sélection de revue rend un test rouge et dix-huit verts ; remettre l’ancienne alerte rend un rouge et deux verts ; remettre Messages de main rend quatre rouges et quatre verts ; retirer seulement la lecture des parts dans le signal d’attente rend un rouge et cinq verts (avant ajout des deux cas de priorité/espaces). Sources restaurées, tests finaux verts. Types web et lint ciblé verts, avertissement ancien de fonction vide dans le harnais. Préparé, pas servi.

## B-23 : ancienne feuille à deux crans remplacée

Main possède FeuilleDesModes et son curseur d’effort : le nombre de crans provient du modèle (cinq ou quatre dans les témoins), et les modèles sans réglage rendent un curseur inerte. Les seize tests de feuille et trois contrôles de bornes passent sur leurs fichiers identiques à main. La branche historique à deux crans contient l’ancienne feuille et les anciens noms de mode : elle n’est pas livrée par-dessus ce mécanisme récent. La vérification des pixels en production reste hors de cette mesure locale.
