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

## Décision du 2026-10-11 et premier temps : le texte dit ce qui se passe réellement

Vérifié d'abord, sur `main` `112ff6a90f`, que **rien n'efface un compte** :
- aucune ligne n'écrit `purgedAt` (la même recherche le trouve en lecture : 7 fois) ;
- la liste des demandes n'est lue que par la page d'administration (liste, annulation) ;
- les tâches planifiées ne suppriment pas de compte : `retention-enforce` supprime des journaux d'activité et d'audit ;
  `inactivity-gc` pourrait supprimer des comptes gratuits inactifs (`store.deleteUser`) mais tourne À BLANC en
  production (`INACTIVITY_GC_ENABLED` absent du ConfigMap, et le CronJob ne passe aucune donnée).

Branche `fix/suppression-de-compte-texte-vrai`, catalogue `account-data.ts` (EN et FR), sans nouvelle promesse :
- « Vos données seront définitivement supprimées le {date} » → « Vous pouvez l'annuler jusqu'au {date} » ;
- « La suppression définitive de votre compte est en cours » → « Votre demande de suppression est en attente » ;
- partout : « La suppression définitive n'est pas encore automatique : la demande est visible par l'équipe E-Code ».

Épinglé par `app/lib/i18n/catalogs/account-data-promesse-vraie.spec.ts` : 11 promesses fausses par langue avant,
0 après, et la phrase vraie exigée dans le dialogue et dans l'état « délai écoulé ». Un test de la page qui exigeait
l'ancien texte est ajusté en gardant son intention (pas d'état « actif » ni de second bouton une fois le délai
écoulé). 16 fichiers et 158 tests autour du compte et des données, verts ; validateurs i18n propres.

Constat voisin, NON traité (signalé) : `inactivity-gc` envoie quand même l'e-mail d'AVERTISSEMENT de suppression aux
comptes gratuits inactifs (l'étape « warning » ne regarde pas `enabled`), alors que la suppression est coupée. C'est
une seconde promesse fausse, par e-mail.

## Second temps : ce que coûterait la vraie suppression (fiche, rien n'est fait)

Faits mesurés le 2026-10-11 :
- 127 modèles en base ; 34 relations pointent vers un utilisateur : 22 suppriment en cascade, 10 détachent
  (`SetNull`), **2 n'ont aucune règle et BLOQUENT la suppression** (`ProjectConnectionLink.linkedByUser`,
  `OrganizationOAuthAppOverride.configuredByUser`).
- Une primitive existe : `store.deleteUser` (écrite pour la tâche d'inactivité), qui supprime la ligne utilisateur et
  compte sur les cascades.
- Les projets appartiennent à l'ORGANISATION, pas à l'utilisateur. Supprimer l'utilisateur ne supprime ni son
  organisation solo, ni ses projets, ni les disques de ses espaces de travail, ni ses compartiments de stockage, ni ses
  applications publiées, ni le client Stripe. Ce sont pourtant des éléments que l'écran annonce comme supprimés
  (« Projets et espaces de travail »).
- Je ne trouve pas de route de purge d'organisation dans l'API actuelle.

Le travail, du plus petit au plus large :
1. **Une tâche planifiée** qui lit `account.pendingDeletionUserIds`, garde celles dont le délai est écoulé et écrit
   `purgedAt` : petit, il existe déjà un modèle de tâche (`enqueue-cli` + worker).
2. **Débloquer les 2 relations** sans règle : migration, `SetNull`.
3. **Supprimer l'organisation solo** et ce qu'elle porte : projets, espaces (arrêt puis suppression du disque),
   stockage objet, applications publiées, client Stripe (suppression ou anonymisation), avec l'exception légale
   factures/paiements que l'écran annonce. C'est le gros morceau, et le plus risqué : c'est destructif et
   irréversible.
4. **Organisation partagée** (l'utilisateur n'est pas seul) : retirer l'appartenance sans toucher aux projets des
   autres, et transférer la propriété s'il était seul propriétaire. Il faut une règle produit.
5. **Garde-fous** : tests de bout en bout sur une base réelle, contre-épreuve (un compte NON demandé n'est jamais
   touché), journal d'audit, et un premier passage à blanc en production qui liste sans supprimer.

Questions pour Avi avant de commencer : la règle du point 4, la durée de conservation des factures et journaux, et si
un passage à blanc d'une semaine est acceptable avant d'activer.

## 📤

☐ décision d'Avi

## 💻

☑ premier temps (texte vrai) codé, non fusionné — branche `fix/suppression-de-compte-texte-vrai`

## ✅

☐

## Preuve

Repro API et comptage en production ci-dessus. Point OUVERT, décision requise.
