# Correctifs validés en branches — 18 octobre 2026

La restauration a été fusionnée par #737 à 21:36:26 UTC dans `c4211323345cc8e0688a191337a04af9e3b2fab9`, après les contrôles de la tête `80c38626a1873cd4b7538d6a1d01ea649e81388e`. La livraison de ce nouveau commit reste en cours. Le candidat CI reste sans PR et hors de main, sur `c6439da55bebf180fe43dce65dbc5c32e6a9fa0a`. Ces corrections ne changent pas le verdict commercial.

| Candidat | Défaut établi et portée du correctif | Validation après rebase | Limite restante |
| --- | --- | --- | --- |
| [Contrat et encodage de restauration — PR #737](https://github.com/openaxcloud/vibecore/pull/737) | Refuse création/restauration par identifiant sans archive au lieu de renvoyer succès avec zéro fichier ; refuse aussi via API/outils avec ancien agent ; préserve la restauration de vrais fichiers et transmet leur encodage jusqu’à l’agent | Après rebase sur b827 : API 27/27, index 6/6 ; suite agent complète 121/121 avant rebase avec patch identique ; typecheck API complet ; aucun diagnostic lint ajouté ; gitleaks sans détection ; contre-épreuves rouges sur la base | Ne crée pas une sauvegarde durable. Défauts distincts de restauration DB et de convergence vers le Pod encore ouverts. Les octets sont prouvés sur deux disques locaux via trois vrais serveurs HTTP, pas sur un PVC de production. Aucun exercice cloud |
| [Isolation des ports CI](https://github.com/openaxcloud/vibecore/commit/e0ea53fafdb437b4f0b4c9d3db07dd58ba59d953) | Donne à chaque pile Docker son projet UUID et des ports loopback atomiquement attribués ; découvre les ports réels ; garde les contrôles et nettoie seulement ses ressources | 59/59 ciblés puis index 6/6 ; typecheck strict, lint ciblé et validateurs ; deux vrais PostgreSQL simultanés, ancien port occupé volontairement et témoin conservé ; huit fichiers CI/helper/tests identiques après rebase | Pas encore exécuté dans GitHub CI. Redis/Mailpit couverts par tests et configuration mais pas relancés en Docker local. Le propriétaire historique du port occupé reste inconnu |

Branches : `codex/snapshot-restore-contract-20261018` et
`codex/ci-port-isolation-20261018`. Lors du premier push, les références distantes étaient absentes. Le rebase de la seule branche de restauration a été poussé avec une lease explicite sur son ancienne tête `6f766f76e` ; la tête de PR a ensuite été vérifiée.
Aucune branche d'autrui n'est remplacée. Les index dérivés ont été régénérés
avec le générateur officiel après rebase.

Les changements API/agent de restauration sont les seuls fichiers produit de
ce lot. Le candidat CI change le mécanisme de démarrage des dépendances des
contrôles ; aucun seuil, exemption, assertion produit ou protection ne change.
