# A-18 — reprise des installations interrompues

Reprise depuis `fix/commande-coupee-et-installation-tuee`, intégrée par une fusion réelle sur `4f7c07f7`, sans conflit. Aucun retrait du correctif de contraste présent sur main.

Une fermeture de flux ne valide plus une commande tronquée. À la réouverture, la reprise automatique réarme les fichiers, démarrages et installations autonomes interrompus ; une commande générale reste arrêtée. Les installations contenant un saut de ligne, une substitution shell ou une redirection sont exclues, comme les commandes chaînées.

## Mesures locales du 11 octobre

- 105 assertions passent dans quatre suites de reprise de commandes, de fichiers, d'actions et de lanes.
- Contre-épreuve : les quatre nouveaux cas (saut de ligne, `$()`, backticks, redirection) échouent avec l'ancienne règle, passent avec la règle resserrée.
- Lint ciblé des quatre fichiers : zéro erreur.

Le typecheck complet du monorepo passe. Le build React Router passe avec `NODE_OPTIONS=--max-old-space-size=8192` ; le premier essai avait atteint la limite par défaut de 4 Go de Node. Aucun OOM du cgroup ni arrêt forcé du noyau mesuré. Cette branche n'est ni fusionnée sur main ni servie en production ; aucune reprise réelle dans un compte client n'a été mesurée.
