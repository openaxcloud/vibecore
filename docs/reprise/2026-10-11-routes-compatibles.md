# A-27 — les adresses de compatibilité ouvrent le vrai projet

Reprise par une fusion réelle de la branche de #423 sur main 4f7c07f7. Les deux brochures fictives `/editor/:id` et `/projects/:projectId/preview` sont retirées avec leurs textes. Les routes redirigent vers l’IDE canonique, qui applique les contrôles d’accès et d’existence du projet ; la seconde demande son panneau Aperçu. Ce sont des redirections 301, pas des réponses 404 sur ces adresses de compatibilité.

La résolution des conflits conserve les suppressions de quatre autres pages fictives déjà livrées sur main. Les fonctions et les entrées de catalogue anciennes ne sont pas réintroduites. Les métadonnées, la liste d’audit et ses décomptes suivent uniquement le retrait de ces deux brochures.

La branche ancienne jetait aussi la langue et les paramètres inconnus pendant la redirection. Les chargeurs préservent maintenant les paramètres, y compris leurs occurrences multiples ; seul le panneau de la route Aperçu est remplacé intentionnellement. Les deux nouveaux tests de conservation étaient rouges avant ce correctif et verts après.

Mesures : 22 tests verts (routes, métadonnées, pages et garde des gabarits publics), types web sans erreur, lint des fichiers modifiés sans erreur et construction React Router réussie avec un plafond Node de 8 Gio. La liste Playwright découvre 12 scénarios d’audit ; ces scénarios n’ont pas été exécutés localement. Aucun déploiement ni parcours authentifié de production n’est revendiqué ici.
