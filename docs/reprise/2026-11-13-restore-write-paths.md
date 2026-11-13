# Branchement dormant sur les chemins d'écriture SQL

Base main1eafb79 (PR919). La restauration production reste refusée par503.

## Intégration réelle, inactive par défaut

Une option d'intégration injectée dans buildApiApp branche l'admission durable
sur les routes réelles POST /projects/:id/databases/query et /databases/rows.
Aucun paramètre d'environnement, serveur production ou configuration de
déploiement ne l'active. Sans cette option, le comportement existant est conservé.

Avec l'option, la sélection doit désigner le secret PostgreSQL DATABASE_URL ou
PROD_DATABASE_URL de l'instance autorisée. Les autres moteurs, clés ou variables
non secrètes sont refusés, pas silencieusement laissés hors registre.

Avant l'ouverture du client PostgreSQL, le pont attend le ticket confirmé.
L'admission compare également la valeur du secret sélectionné avec sa valeur
actuelle déchiffrée sous les mêmes verrous Project puis DatabaseInstance.
Une rotation de chiffrement sans changement de valeur reste compatible ; une
ancienne URL est refusée. Ni le ticket, ni les erreurs ne contiennent cette URL.

Les tickets ne sont réglés automatiquement ni après une réponse SQL positive,
ni après une erreur, un rollback tenté ou la fermeture de la connexion.
Un SQL arbitraire peut laisser une transaction préparée ou des effets externes.
Le rapprochement de ces preuves et la reprise restent des prérequis d'activation.

## Couverture et limites

Ce lot couvre l'ouverture des deux chemins UI explicites SQL et insertion de
ligne. Il ne couvre pas encore les accès directs des runtimes publiés/workspaces,
les migrations au déploiement, les tâches planifiées et leurs effets externes,
les outils agent ou clients tiers, ni toutes les inspections de schéma.
Il ne fournit donc ni admission globale exhaustive, ni clôture d'une restauration.
Le lifecycle des tickets réglés est toujours à intégrer avant enrollement prod.

## Preuves exigées

Recette PostgreSQL obligatoire : vrais appels HTTP authentifiés et écritures
synthétiques via les deux routes ; ticket conservé et seconde écriture refusée
après admission d'une restauration ; dette conservée après erreur PostgreSQL ;
ancienne URL refusée lorsqu'un changement est intercalé avant verrouillage.
Le test SIGKILL précédent exige maintenant explicitement signalCode=SIGKILL.

Tests déterministes du pont : absence d'option sans effet, dev/prod, connexions
hors périmètre refusées, transfert d'instance, copie des paramètres et refus
d'admission. CI exacte doit encore valider HTTP+PostgreSQL et le build complet.
