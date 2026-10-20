---
id: BUG-DB-TRANSFER-PROVISIONING-001
section: "Reprise commerciale du 2026-10-20 — restauration DB"
---

## Bug

**P2 — un transfert de projet laisse ses instances de base sous l'ancienne
organisation et bloque la fin du provisioning.**

Dans `89019cdf1cdbbd622179fdc4b2b4a68ab3219fef`,
`PrismaApiStore.transferProject` modifie `Project.organizationId` sans mettre à
jour `DatabaseInstance.organizationId`. La garde de réconciliation rejette
ensuite leur désaccord : une instance `PROVISIONING` transférée de A vers B ne
peut plus devenir active par une nouvelle lecture.

Une création initiale peut aussi reprendre avec A capturée avant une attente,
après le transfert vers B. Sans contrôle transactionnel du propriétaire, elle
enregistre alors une nouvelle instance incohérente.

## 📤 Dispatché

☑ 20/10 — défaut reproduit et correctif vérifié sur deux cas PostgreSQL dédiés.

## 💻 Codé

☐ Candidat local non committé, non fusionné dans `main`, non déployé.
Transfert des propriétaires d'instances dans la même transaction que le projet.
Création initiale sous verrou du projet, avec refus explicite 409 si le
propriétaire capturé est devenu obsolète ou si le projet est fermé.
Les gardes de restauration et de retour tardif sont conservées.

## ✅ Testé live

☐ Aucune preuve de production. Deux cas Prisma/PostgreSQL locaux ont une contre-épreuve rouge→verte.
La suite complète ultérieure passe les dix cas sur le même candidat.

## Preuves et limites

Dix cas sont présents dans
`services/api/src/tests/database-provisioning-transfer.prisma.spec.ts`.
La contre-épreuve du 20 octobre, terminée à **16:13:36 UTC**, cible deux cas :
réconciliation fraîche après transfert en développement et en production,
avec refus de l'ancienne réponse A. L'ancien store890 produit **deux échecs
explicites de propriétaire** ; le candidat passe **les mêmes deux cas**. Huit
cas sont filtrés dans ce seul passage ciblé. La source a été restaurée byte pour byte en `finally`,
son empreinte vérifiée, puis la base dédiée supprimée et son absence confirmée.

Le premier passage avait déjà deux assertions rouges, mais le lanceur avait
refusé de les qualifier : le reporter JSON abrège le diff de `toMatchObject`.
Une assertion explicite supplémentaire sur `organizationId` rend la
contre-épreuve discriminante, sans retirer ni relâcher les assertions
existantes. Ce premier résultat est conservé ; aucun vert n'en a été déduit.

Le runner complet ultérieur passe **31/31 cas**, dont **10/10 transferts**,
sans filtre ni saut, sur les sources inchangées ; le conteneur propre est
ensuite supprimé par son propriétaire.
[Preuve du runner complet](../reprise/mesures/2026-10-20-restore-ci-postgresql-local.json).

[Résultats, empreintes et portée locale](../reprise/mesures/2026-10-20-database-transfer-provisioning.json).

Le port partagé55439 est interdit à cette suite. Les fixtures et leurs
métadonnées sont synthétiques ; aucune connexion applicative, archive ou
restauration physique n'est prouvée par ces tests.

Sur le POST direct, un appel au provisionneur peut avoir été accepté avant le
refus de création de la ligne : le correctif ne prétend pas annuler cette
mutation externe et ne supprime aucun cluster.

[Contrats et portée du candidat](../reprise/2026-10-20-database-transfer-provisioning.md).
