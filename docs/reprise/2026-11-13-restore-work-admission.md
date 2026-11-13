# Admission coopérative durable des travaux avant restauration

Base : main ba2c435 (PR918). Garde RESTORE_APPLICATION_CUTOVER_UNAVAILABLE
inchangée. Aucun consommateur production n'est inscrit automatiquement.

## Contrat implémenté

PrismaRestoreWorkAdmission admet un ticket dans la base de contrôle sous les
mêmes verrous Project puis DatabaseInstance que l'admission d'une restauration.
Le tenant, le projet, l'environnement, la version et la cible doivent encore
correspondre. Une restauration active ferme l'admission. Une contention refuse
le travail ; elle n'est jamais assimilée à une admission.

Le consommateur doit attendre le retour confirmé de admit() AVANT tout effet.
Un commit à résultat incertain ne donne aucun ticket utilisable et peut conserver
une dette supplémentaire. Chaque ticket appartient à une incarnation du
consommateur et n'expire jamais. Une panne, SIGKILL, disparition de connexion,
délai ou fin de bail ne le supprime pas.

acknowledgeSettledWork est une commande d'intégration de confiance : uniquement
après preuve que tous les effets sont terminés et qu'aucun travail futur ne peut
utiliser ce ticket. Ce n'est ni une preuve automatique, ni un finally de requête
SQL. Un résultat réseau ambigu, une transaction ouverte ou un retry possible
doivent conserver la dette. Aucun endpoint externe n'est exposé.

Le cutover du journal vérifie cette dette sous les mêmes verrous avant toute
modification de version ou secret. Les mutations projet et secrets de connexion
refusent également une dette pendante. La clé étrangère RESTRICT interdit
d'effacer la dette par suppression en cascade.

## Limites conservées

Ce registre couvre uniquement les consommateurs participants. Zéro ticket ne
prouve pas un drainage global : connexions non inscrites, transactions préparées,
effets externes et anciens workers restent à exclure réellement. L'observateur
PostgreSQL reste non global. La garde503 ne change pas.

Les tickets réglés sont conservés comme tombstones ; leur suppression et le
cycle de vie d'une instance inscrite ne sont pas encore intégrés. RESTRICT peut
donc également refuser la suppression d'une instance ayant des tickets réglés.
Pas d'inscription production avant la recette de ce cycle de vie et l'audit de
tous les consommateurs. Aucun nettoyage implicite ou périodique n'est ajouté.

## Validation exigée

Les tests déterministes vérifient le commit incertain, l'attente du commit, la
copie des arguments, la contention et les versions invalides. La recette
PostgreSQL obligatoire teste la concurrence restauration/travail, les identités,
les mutations, le refus atomique du cutover, les tombstones et la dette après
SIGKILL d'un vrai processus ayant confirmé son ticket. Les données et secrets
de ces tests sont synthétiques dans la base locale jetable.

CI réelle du SHA final indispensable avant fusion. Ni ces tests ni ce lot ne
prouvent encore la restauration applicative complète ou la readiness plateforme.
