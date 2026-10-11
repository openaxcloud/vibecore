# A-20 — un lecteur pouvait créer un instantané

La branche a été instruite : create_snapshot manquait à la liste des outils de mutation. Un compte ayant seulement la lecture pouvait consommer le stockage du projet. La fusion réelle sur main ne porte que ce garde, son test et sa fiche ; l’index dérivé est régénéré.

Dix tests API passent, dont les deux cas de rôle et huit gardes de persistance de fichiers. Le lecteur reçoit 403 RBAC_FORBIDDEN. L’éditeur passe le contrôle d’autorisation ; la sonde sans gestionnaire d’espace rend ensuite 502, elle ne prétend donc pas avoir créé un instantané réel. Types API et construction API verts ; ESLint du test nouveau vert. Le fichier app.ts comporte une dette de lint antérieure (hors commande lint API du projet), elle n’a pas été reformattée.

État : préparé sur une branche, pas fusionné, pas servi. Aucun compte client ni espace de production modifié.
