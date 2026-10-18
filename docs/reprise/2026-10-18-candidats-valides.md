# Correctifs validés en branches — 18 octobre 2026

Ces deux candidats sont sauvegardés à distance sur la base exacte de main
`c6439da55bebf180fe43dce65dbc5c32e6a9fa0a`. Aucun n'a de PR, n'est fusionné ou
déployé. Ils ne changent pas le verdict de commercialisation.

| Candidat | Défaut établi et portée du correctif | Validation après rebase | Limite restante |
| --- | --- | --- | --- |
| [Restauration runtime honnête](https://github.com/openaxcloud/vibecore/commit/6f766f76e199aaabeb370e97d8d0f190a0900d4d) | Refuse création/restauration par identifiant sans archive au lieu de renvoyer succès avec zéro fichier ; refuse aussi via API/outils avec ancien agent ; préserve la restauration de vrais fichiers | API 27/27, agent complet 121/121, index 6/6 ; typecheck API complet ; aucun diagnostic lint ajouté ; gitleaks sans détection ; contre-épreuves rouges sur la base | Ne crée pas une sauvegarde durable. Défauts distincts de restauration DB et de convergence/encodage vers le Pod encore ouverts. Aucun exercice cloud |
| [Isolation des ports CI](https://github.com/openaxcloud/vibecore/commit/e0ea53fafdb437b4f0b4c9d3db07dd58ba59d953) | Donne à chaque pile Docker son projet UUID et des ports loopback atomiquement attribués ; découvre les ports réels ; garde les contrôles et nettoie seulement ses ressources | 59/59 ciblés puis index 6/6 ; typecheck strict, lint ciblé et validateurs ; deux vrais PostgreSQL simultanés, ancien port occupé volontairement et témoin conservé ; huit fichiers CI/helper/tests identiques après rebase | Pas encore exécuté dans GitHub CI. Redis/Mailpit couverts par tests et configuration mais pas relancés en Docker local. Le propriétaire historique du port occupé reste inconnu |

Branches : `codex/snapshot-restore-contract-20261018` et
`codex/ci-port-isolation-20261018`. Avant leur push, les deux références distantes
étaient absentes ; chaque push a été suivi d'une vérification de la tête exacte.
Aucune branche d'autrui n'est remplacée. Les index dérivés ont été régénérés
avec le générateur officiel après rebase.

Les changements API/agent de restauration sont les seuls fichiers produit de
ce lot. Le candidat CI change le mécanisme de démarrage des dépendances des
contrôles ; aucun seuil, exemption, assertion produit ou protection ne change.
