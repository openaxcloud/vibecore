# A-7 — reprendre un tour après fermeture de l’onglet

Intégration par fusion réelle de `fix/tour-interrompu-onglet-ferme` sur main `c7a6fa5025`, sans conflit. Le correctif conserve les gardes de préservation des fichiers livrées sur main.

Validation : 24 tests verts sur cinq fichiers, ESLint des six fichiers changé vert, vérification complète des types (web, scripts, Electron et packages/services) verte, construction React Router complète verte. Les dépendances ont été installées avec le lockfile et pnpm 9.14.4 ; le tas Node était limité à 6144 Mo après mesure de 9 Go disponibles.

État : code préparé et sauvegardé sur une branche de reprise ; pas fusionné sur main, pas servi, aucun test live revendiqué. Le tour refusé doit être livré séparément avant cette partie. Les tests locaux ne prouvent pas une exécution sur Safari iOS.

Reprise à 17:50 UTC : fusion réelle de main `4f7c07f7` sans conflit. Les cinq suites voisines passent (36 tests), ainsi que les types complets, le lint ciblé et la construction React Router. Contre-épreuve : retirer uniquement l'obligation de revue pour le tour repris fait échouer le cas « écriture directe » et écrit `App.tsx` ; avec la protection, le fichier reste intact avant acceptation. La première partie est en contrôle dans #710 ; cette seconde partie reste hors de la file CI jusqu'à sa livraison.
