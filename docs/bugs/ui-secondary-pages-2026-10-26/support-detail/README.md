# Détail de ticket Support — 26 octobre 2026

Le brouillon était perdu après un aller-retour vers la liste des tickets. Le correctif conserve le texte pendant les revalidations, avertit avant de quitter une réponse non envoyée et distingue une réussite explicite d’une requête annulée.

**État : corrigé et validé localement.** Commit Support `d6d426f30`, associé au commit Quota `e35d1cf7d` dans le build consolidé testé. Ces commits ont été créés par le parent ; aucune publication ou recette de production n’est revendiquée ici.

## Périmètre et preuves

| Phase | Couverture exécutée | Résultat |
|---|---|---|
| Avant11499 | 44 géométries : FR/EN, clair/sombre, 320/360/390/768/820/1024/1280/1440×900, 844×390, 1920×1080, 2560×1440 | Longs sujets et messages contenus ; brouillon perdu après Retour, 4/4 |
| Avant, sans tutoriel | 12 captures320/844/1440 + 4 parcours FR/EN et thèmes | Même perte de brouillon, 4/4 ; aucun débordement détecté |
| Avant, GET503 | 2 cas FR/EN320 | État localisé puis récupération avec Recharger |
| Après11599 | 4 groupes FR/EN et thèmes : saisie, resize, confirmation320/paysage, Escape, Annuler, Abandon, Retour | Réussis |
| Après11599, langue | 4 changements de langue avec rechargement document | Avertissement natif ; annulation préserve texte et URL |
| Après11599, envoi synthétique | 8 cas :400/503, succès lent avec édition, succès rapide ; FR/EN clair | Texte préservé en erreur et après édition ; brouillon inchangé effacé seulement après accusé de réussite |
| Après11599, formulaire HTML | 1 requête locale Accept:text/html | Redirection PRG302 conservée |

La réponse de succès des requêtes JS est maintenant `{sent:true}`. Le contrat backend et ses erreurs restent inchangés. Chaque accusé est consommé une seule fois ; aucune persistance de brouillon ni accès supplémentaire n’a été ajouté. L’abandon explicite efface également le texte pour empêcher sa réapparition après navigation entre tickets.

Les tests DataRouter couvrent le changement de query sans rechargement. Le sélecteur de langue réel recharge le document : ces deux parcours sont distingués dans les preuves.

## Validation

- 28 tests réussis :15 dans la suite existante adaptée,13 avec un vrai DataRouter.
- Lint ciblé des4 fichiers :0 erreur. Revue indépendante favorable : `validation/final-review.md`.
- Build consolidé, typage strict, lint global, Prettier et Gitleaks réussis selon les résultats du parent ; sorties conservées dans `validation/ui-safe-next*`. Le lint global comporte52 avertissements préexistants et0 erreur.
- Captures et reçus : `before11499/`, `after11599/`. Les diagnostics initiaux du harness sont explicités dans `validation/README.md`.

## Sécurité de la recette et limites

Tout s’est déroulé dans Chromium local avec des comptes, tickets et messages synthétiques. Les9 POST finaux ont atteint uniquement une fixture localhost en mémoire, sur l’endpoint de test autorisé. Les4 PATCH de préférences déclenchés par le sélecteur de langue ont été bloqués avant le backend. La phase initiale avec tutoriel avait aussi4 requêtes nonGET bloquées (méthode non consignée dans ce reçu) : aucune de ces phases ne doit être présentée comme « aucune mutation tentée ».

Le mode POST de la fixture a été désactivé après les tests. Tous les navigateurs puis les serveurs11599/5999 ont été fermés après coordination et vérification PID/startTicks ; `after11599/cleanup.json` confirme les ports fermés. Les autres processus, dont l’API5499, ont été préservés.

**Non exercés :** zoom natif200 % sur Support, lecteur d’écran, clavier virtuel ou safe areas sur appareil réel, mesure de contraste WCAG, envoi réel ou backend de production. Le complément zoom est arrivé après l’arrêt des serveurs ; aucun CSS zoom n’a été substitué. Les44 géométries antérieures ne sont pas présentées comme44 parcours complets ni comme une matrice exhaustive rejouée après correction.
