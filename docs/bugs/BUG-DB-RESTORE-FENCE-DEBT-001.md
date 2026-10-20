---
id: BUG-DB-RESTORE-FENCE-DEBT-001
section: "Reprise commerciale du 2026-10-20 — restauration DB"
---

## Bug

**P1 avant activation du coordinateur — une seconde reprise peut oublier une
ancienne tentative dont l'exclusion n'a jamais été confirmée.**

La reprise remplaçait durablement le propriétaire A par B avant d'appeler le
pilote d'exclusion. Après un crash à cette frontière, ou un échec du pilote,
une reprise C ne demandait que l'exclusion de B. A pouvait donc encore produire
un effet pendant la préparation ou la bascule de C.

## 📤 Dispatché

☑ 20/10 — revue indépendante de #745 puis deux contre-épreuves du coordinateur.

## 💻 Codé

☐ Correctif local en cours, non committé, non fusionné et non déployé.
La migration additive 0092 conserve les tentatives restant à exclure.
Chaque reprise ajoute son prédécesseur sans effacer les exclusions précédentes.
Un reçu désigne explicitement la tentative exclue ; seul le propriétaire
courant peut en enregistrer la confirmation. La progression, la bascule, la
complétion et la libération du verrou restent refusées tant qu'une exclusion
reste non confirmée.

## ✅ Testé live

☐ Aucun essai en production. Le coordinateur n'est pas injecté dans le serveur
normal ; aucune exclusion distribuée effective ni incident client n'est établi.

## Preuves et limites

Le code de `89019cdf` échoue sur les deux nouveaux cas à 15:34:25 UTC :
préparation reprise alors que A reste non exclue. Les 25 tests témoins passent.
Ces tests emploient un journal et des pilotes en mémoire explicitement déclarés.
Ils prouvent le défaut du protocole, pas l'arrêt d'un processus cloud.

[Reçu de contre-épreuve](../reprise/mesures/2026-10-20-restore-fence-debt-counterproof.json).
La première invocation a été refusée par le parseur CLI avant exécution ; elle
est conservée et n'est pas comptée comme contre-épreuve.

Le candidat passe 64 tests API ciblés, dont six nouveaux cas de reprise.
Le client Prisma a été régénéré par la commande officielle à 16:01:03 UTC.
Le [lanceur CI exécuté localement](../reprise/mesures/2026-10-20-restore-ci-postgresql-local.json)
passe 31 tests sur PostgreSQL 16 réel, sans test ignoré : 21 de journal et
concurrence, 10 de transfert de projet. Les tests de concurrence utilisent
des connexions distinctes et des barrières de verrouillage PostgreSQL.
Ils couvrent notamment des confirmations simultanées et les deux ordres
échec/reprise. Les 29 tests du lanceur contrôlent aussi le refus de cibles
autres que le service PostgreSQL jetable du job.

Ces tests ne prouvent pas l'exclusion d'un pilote cloud. Les typages API et
scripts ainsi que le build API ont ensuite passé. Le
[banc physique du candidat corrigé](../reprise/mesures/2026-10-20-restore-physical-review-final.json)
est vert à 16:47:01 UTC : restauration physique/WAL, bascule, relecture SQL,
redémarrage et reconnexion, sur 34 sources inchangées. Il refuse toujours
de simuler une exclusion distribuée. Le premier essai, rouge à cause du
drapeau QA omis par le lanceur, reste conservé séparément.

La validation du nouveau SHA en CI, sa fusion et sa livraison restent à faire.

La migration 0092 ne peut pas reconstruire un prédécesseur déjà oublié par une
ancienne version expérimentale. La migration 0091 et le coordinateur ne sont
pas encore livrés sur main à ce relevé ; le serveur normal ne les active pas.
Une installation expérimentale ayant exécuté l'ancien protocole doit mettre
ses opérations actives en quarantaine, ou obtenir une preuve d'exclusion de
tous les anciens pilotes avant toute reprise ; appliquer 0092 seul ne suffit
pas à rendre ces journaux sûrs. Les pilotes doivent accepter la répétition
d'une exclusion déjà effectuée.
