# Preuves locales, données synthétiques uniquement

Le parseur pg installé est exercé sans changer le pilote. Le reçu HTTP utilise ensuite la vraie API Fastify et PostgreSQL16.15 natif dédié, avec TestApiStore en mémoire pour les identités/projets. Aucun cookie, fichier de fixture privée ou chaîne de connexion n’est joint ; les scripts lisent cette fixture privée locale et refusent les autres destinations.

La première capture390 est une contre-épreuve : malgré la correction API, le transport turbo-stream perdait encore la colonne. Elle ne constitue pas un succès de grille. Les résultats après correction seront joints séparément.

Le runner PostgreSQL de CI est indépendant de ces recettes : ses douze scénarios Prisma/processus ne peuvent être déclarés réussis qu’après leur exécution réelle, zéro ignoré. Aucun appel IA ni donnée production.
