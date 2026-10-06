---
id: BUG-QA1006-SUPPRESSION-DE-COMPTE-JAMAIS-EXECUTEE
section: "2026-09-30 — Balayage QA avant lancement, parcours qui décident d'un client"
---

## Bug

**BLOQUANT LANCEMENT (droit à l'effacement) — DÉCISION REQUISE — une demande de suppression de compte n'est
jamais exécutée. Passé le délai de 14 jours, l'utilisateur ne peut plus annuler, l'écran annonce « La suppression
définitive de votre compte est en cours »… et le compte reste entier, utilisable, en base.**

### Ce que l'utilisateur lit (`app/lib/i18n/catalogs/account-data.ts`)

- « Vos données seront définitivement supprimées le {date}. »
- « Votre compte sera définitivement supprimé après un délai de grâce de {count} jours… »
- puis « La suppression définitive de votre compte est en cours. »

### Ce qui se passe (repro sur la vraie API, `main` 682dfb6e8)

`qa-2026-10-06/repro-suppression-de-compte.txt`, produit par `repro-suppression-de-compte.spec.ts.txt` (à copier
sous `services/api/src/tests/` pour le rejouer) :

```
demande : 200 status=grace_period canCancel=true purgeDueAt=J+14
vue à J+15 : status=ready_to_purge canCancel=false
connexion à J+15 : 200
/auth/me à J+15 : 200, adresse présente
utilisateur toujours en base : true
```

### Cause

`services/api/src/app.ts`, routes `/account/deletion` : elles enregistrent l'INTENTION (préférences de
l'utilisateur, plus un index `account.pendingDeletionUserIds`). Le commentaire le dit : « The destructive purge
itself (financial-record retention, cascade) is intentionally a separate slice ». Cette tranche n'a jamais été
écrite. Rien n'écrit `purgedAt`, et l'index n'est lu que par l'admin (liste, annulation, export).

Le report n'était consigné que dans ce commentaire : aucune fiche, aucun test. C'est le cas que vise la règle 22.

### En production (2026-10-06, lecture seule, ni identifiant ni adresse imprimés)

`qa-2026-10-06/compter-suppressions-echues.cjs` dans un pod api :
- 2 demandes en attente, **0 purgée, 2 échues** depuis 52 et 50 jours ;
- les deux adresses sont des adresses DE TEST (calculé dans le pod, booléen seulement) ;
- contrôle positif : 378 utilisateurs lus.

Aucun client réel n'est donc touché AUJOURD'HUI. Le premier qui demandera la suppression le sera.

## Pourquoi je ne corrige pas

La purge détruit des données sans retour, et elle doit trier ce que la loi oblige à GARDER : factures et paiements,
journaux de sécurité pour une durée limitée (déjà annoncés à l'écran). C'est une décision d'Avi, juridique
comprise, pas un correctif de session. Deux voies :
1. écrire la purge (tâche planifiée qui lit l'index, applique la portée annoncée, écrit `purgedAt`) ;
2. en attendant, ne plus promettre une date : rendre l'annulation possible tant que rien n'est purgé, et dire que
   la suppression est traitée par l'équipe — avec une purge manuelle depuis l'admin.

Le test qui épinglera la décision : une demande échue est purgée (ou, en voie 2, reste annulable), lu en base et
par une connexion refusée.

## 📤

☐ décision d'Avi

## 💻

☐

## ✅

☐

## Preuve

Repro API et comptage en production ci-dessus. Point OUVERT, décision requise.
