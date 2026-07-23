# Purge DB compte — réserves RR-20260723-CODEX-07 (PR #51)

Trois réserves de l'expert, corrigées + testées.

## 1. Stripe : annulation immédiate = DELETE

`StripeBillingClient.cancelSubscription` postait sur `POST /v1/subscriptions/{id}/cancel` — ce n'est pas l'annulation immédiate d'une subscription ACTIVE (404 ou report en fin de période, l'org reste facturable). Corrigé en **`DELETE /v1/subscriptions/{id}`** (nouvelle méthode privée `deleteRequest`).

Preuve — `packages/billing/src/stripe-cancel-subscription.spec.ts` (fake HTTP **strict**, 3 tests) :
- vérifie `method === 'DELETE'` et l'URL exacte `…/v1/subscriptions/{id}` (assert `not.toContain('/cancel')`) — **réussite** (200) ;
- id URL-encodé ;
- **échec** (404) → lève `STRIPE_REQUEST_FAILED` (502), fail-closed pour la purge.

## 2. Ordre : verrous de topologie AVANT sélection des subscriptions

Avant : `soleOrgActiveSubscriptionExternalIds(userId)` était lu HORS transaction, avant les verrous `FOR UPDATE` sur `Organization`/`OrganizationMember` — un changement de membership concurrent pouvait faire basculer un org sole↔shared entre la lecture et la classification verrouillée (annuler la sub d'un org devenu partagé, ou en manquer une).

Corrigé : le bloc pré-transaction est **supprimé** ; la **sélection ET la cessation externe** sont déplacées **DANS** la transaction, **après** les verrous `FOR UPDATE` de topologie et la classification sole/shared. Les verrous sont tenus jusqu'au commit ; la cessation externe s'exécute sous verrou, fail-closed (échec → throw → rollback).

Preuves vrai Postgres — `account-purge-db.spec.ts` :
- **NÉGATIF in-tx / fail-closed** : `cancelExternalBilling` renvoie `failed` → la purge **rollback en entier** : sub toujours `ACTIVE` (non flippée `CANCELED`), compte **non** tombstoné, **aucune** ligne de preuve écrite. (Un cancel pré-tx n'aurait pas pu rollback la DB — prouve que la cessation est dans la tx.) Le callback observe `member count = 1` (topologie sole verrouillée au moment de la sélection).
- **NÉGATIF org partagé** : un org à 2 membres avec une sub ACTIVE → la sub **n'est jamais** sélectionnée pour la cessation externe (`cancelCalls === []`) et reste `ACTIVE`.

## 3. Matrice PII champ par champ (contenus libres nettoyés AVANT détachement)

Avant : `SupportTicket.userId = null` mais `subject`/`metadata`/`TicketMessage.body` + labels de snapshot restaient en clair.

Corrigé : scrub **champ par champ**, appliqué **AVANT** de détacher les références user :

| Model | champ | libre ? | action |
|---|---|---|---|
| SupportTicket | subject | oui (PII) | → `[redacted]` |
| SupportTicket | metadata | oui (PII) | → marqueur redigé |
| SupportTicket | userId | ref | → null (détaché après) |
| TicketMessage | body | oui (PII) | → `[redacted]` (tout le thread + messages authorés) |
| TicketMessage | authorUserId | ref | → null |
| ProjectSnapshot | label | oui (PII) | → null |
| ProjectSnapshot | createdByUserId | ref | → null |

(`ProjectSnapshot.manifest` = structure du projet PARTAGÉ, appartient aux membres restants → conservé ; les snapshots d'org sole disparaissent via le cascade Project.)

Preuve vrai Postgres — `account-purge-db.spec.ts` « field-by-field PII matrix » : seed ticket (subject PII) + 2 messages (USER PII + ADMIN citant l'email) + snapshot (label PII) ; après purge : subject=`[redacted]`, metadata rédigé, **les 2 bodies** scrubés, label=null, refs détachées ; **balayage négatif** : aucune chaîne PII d'origine ne survit ; classe `free_form_pii` consignée dans la preuve (Subject=1, BodyInThread=2, SnapshotLabel=1).

## Chiffres (`test-runs-raw.txt`)

- Stripe fake-HTTP strict : **3/3**.
- account-purge DB (vrai Postgres) : **8/8** (5 existants + 3 nouveaux négatifs) ; routes : **9/9**. Total **20/20**.
- Typecheck API + build strict CI-équivalent (TS 5.8) : exit 0 ; billing typecheck : exit 0.

## Rejouer

```bash
( cd packages/billing && npx vitest --run src/stripe-cancel-subscription.spec.ts )
( cd services/api && DATABASE_URL=... INTERNAL_API_SHARED_SECRET=purge-db-internal-secret \
    npx vitest --run src/tests/account-purge-db.spec.ts src/tests/account-purge-routes.spec.ts )
```

Statut : **PROVEN_REVIEW_PENDING** — pas de merge sans feu vert.
