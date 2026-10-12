# A-20 — un lecteur pouvait créer un instantané

La branche a été instruite : create_snapshot manquait à la liste des outils de mutation. Un compte ayant seulement la lecture pouvait consommer le stockage du projet. La fusion réelle sur main ne porte que ce garde, son test et sa fiche ; l’index dérivé est régénéré.

Dix tests API passent, dont les deux cas de rôle et huit gardes de persistance de fichiers. Le lecteur reçoit 403 RBAC_FORBIDDEN. L’éditeur passe le contrôle d’autorisation ; la sonde sans gestionnaire d’espace rend ensuite 502, elle ne prétend donc pas avoir créé un instantané réel. Types API et construction API verts ; ESLint du test nouveau vert. Le fichier app.ts comporte une dette de lint antérieure (hors commande lint API du projet), elle n’a pas été reformattée.

État : préparé sur une branche, pas fusionné, pas servi. Aucun compte client ni espace de production modifié.

Revalidation sur `4f7c07f7` : fusion réelle sans conflit, deux tests de rôle verts. Retrait du seul ajout `create_snapshot` à la liste de mutation : le refus lecteur devient rouge, le témoin lecture/éditeur reste vert. Types et build API passent. Six assertions de fraîcheur de l’index dérivé passent après régénération ; lint ciblé sans erreur.
