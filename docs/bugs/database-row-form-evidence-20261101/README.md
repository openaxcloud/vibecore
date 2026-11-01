# Preuves locales insertion Database

Recette réelle : Chromium système, build client/SSR, BFF, Fastify et PostgreSQL16.15 natif isolé. Identités et métadonnées projet synthétiques TestApiStore. Aucune production ni IA.

Les scripts navigateur utilisent la fixture privée locale par chemin ; celle-ci, les cookies et les chaînes de connexion ne sont pas joints. Ne pas lancer contre une production. Les appels externes sont bloqués. Les lectures indépendantes PostgreSQL valident les écritures, pas seulement les messages UI.

`before-postgres.json` : SQL généré par ancien composant, rejet réel22P02, donnée initiale conservée. `prototype-transport-proof.json` : preuve Fastify isolée du contrat objet abandonné (avant correction). `browser-receipt.json` : contrat tableau final, trois formats, erreurs/brouillons/default/null/génération/précision/fuseau, double clic et reload. `navigation-receipt.json` : commit dans A avant navigation vers B, réponse retardée libérée sans insertion ni succès dans B.

Cette recette ne prouve pas la persistance Prisma après redémarrage API, OAuth, provisioning cloud, Safari physique ou tous les panneaux/tailles.
