# A-15 — connexion Vercel retentable

Fusion réelle de `fix/audx-161-guard-before-success` sur `4f7c07f7`, sans conflit ; écart direct lu sur les deux fichiers concernés. Le correctif distingue un essai en cours d'une connexion réussie et réévalue les entrées lorsqu'elles changent.

La reprise a trouvé deux chemins encore bloqués dans la branche : montage sans jeton et échec du chargement des statistiques. Le verrou de concurrence est maintenant libéré par un `finally` couvrant tous les chemins ; le succès des statistiques n'est mémorisé qu'après leur chargement.

Quatre tests verts. Avant le complément, les deux nouveaux cas échouaient et les deux cas existants passaient. Lint ciblé et typecheck web complet : passent. Aucune connexion réelle à un compte Vercel n'a été mesurée ; cette preuve teste le composant avec un service contrôlé.

Le build React Router passe avec une limite de heap Node de 8 Go. La branche n'est pas encore fusionnée ni servie.
