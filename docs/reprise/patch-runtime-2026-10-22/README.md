# Corrections de propositions IA : preuves et limites

Historique de #765 (ne vaut pas validation de la reprise) : voir [RECOVERY.md](RECOVERY.md) pour la branche successeur et ses preuves.

Base inspectée : `18cf74fd7abcd59620f0994b44ac1411e97fcf93`, encore tête distante lors de la vérification du 22 octobre. Lot indépendant de la récupération i18n #764 et du layout #763. Aucun changement dans services/api.

## Défauts reproduits

- Une configuration JSONC valide passe la validation de proposition, mais le pipeline de réconciliation JSON strict pouvait garder un ancien stub au lieu des propriétés après commentaires. La correction analyse entièrement les configurations JSONC connues ; package.json reste strict.
- Une proposition échouée ne bloquait pas tous les chemins de démarrage différé. Les tests couvrent fermeture, acceptation, rejet explicite, imports manquants et isolation des artefacts.
- Une écriture résolue ne prouve pas que le contenu attendu est présent. La confirmation compare la relecture exacte du payload sauvegardé et ne rejoue pas une écriture non confirmée.

## Nature des preuves

Les fixtures Vitest du store et de l'interface sont des tests de logique ; elles ne prouvent pas une génération fournisseur ni une livraison Kubernetes. Le test `agent-file-write.integration.spec.ts` démarre l'application workspace-agent localement via son application HTTP injectée, écrit dans un répertoire temporaire réel, relit via la route de lecture et vérifie les octets sur disque. Il vérifie aussi qu'une confirmation négative ne réécrit pas un contenu concurrent. Il ne teste pas la passerelle API de production.

Les contre-épreuves historiques et journaux sont conservés hors du checkout dans `/workspace/vibecore-747-handoff/patch-runtime-20261022/` : `baseline-red.log`, `close-recovery-red.log`, `jsonc-pipeline-red.log`, puis `assembled-tests.log` (140 tests, 12 fichiers). Ce dernier résultat précède les gardes de concurrence issues de la revue finale ; il ne vaut pas validation de ces ajouts. La suite élargie `expanded-final-green.log` passe avec 271 tests dans 34 fichiers. Elle couvre les changements de scope pendant relecture, la sauvegarde concurrente, l'absence de double écriture et les événements/historiques seulement après confirmation. `early-success-red.log` conserve les deux contre-épreuves des événements prématurés. La première suite élargie avait quatre échecs : trois fixtures ne renvoyaient pas le payload effectivement écrit et un test attendait l'ancien démarrage malgré échec. Les assertions de conflit sont conservées ; le test de démarrage prouve désormais le blocage puis la reprise après rejet explicite.

Le lint complet de l'application avant les dernières gardes avait 0 erreur et 52 avertissements existants ; le lint final ciblé couvre tous les fichiers modifiés. Le premier typecheck de l'extraction a échoué parce que l'import avait été placé avant l'en-tête TypeScript historique ; cet en-tête a été rétabli exactement comme sur main, sans nouvelle exemption. Les journaux rouges sont conservés.

Aucune réparation du projet utilisateur, aucune génération payante et aucune modification de production n'a été effectuée par ce lot. La durée de vie des serveurs dev (timeout 30 minutes observé) et la synchronisation générale des stockages sont des dépendances distinctes. Voir [SAFE-SYNC.md](SAFE-SYNC.md) pour les limites et la procédure additive.
