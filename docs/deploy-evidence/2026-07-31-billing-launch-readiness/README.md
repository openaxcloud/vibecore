# Billing launch-readiness — livrables #1 & #2 prouvés (2026-07-31)

Objectif : un vrai utilisateur qui paie doit pouvoir utiliser la plateforme sans faux
blocage. Aujourd'hui un compte gratuit épuisé voit « API usage limits » — ce n'est **pas
un bug** mais un quota. Cette preuve démontre, de bout en bout et de façon **exécutable**,
que les deux voies de déblocage marchent réellement :

1. **#1 — Upgrade payant lève le gate** : org Free épuisée → `429 QUOTA_EXCEEDED` → webhook
   Stripe **mode test, signature vérifiée** (upgrade Pro) → subscription `ACTIVE` → génération
   débloquée (`200`, plafond Pro).
2. **#2 — Override `/admin/quotas` lève le gate** : org Free épuisée → `429` → un platform-admin
   (MFA + re-auth step-up) pose un override → génération débloquée (`200`).

> ⚠️ **Périmètre honnête (pas de sur-revendication).** La preuve exerce le **vrai serveur**
> (`buildApiApp`), la **vraie vérification de signature Stripe** (`verifyStripeSignature`,
> HMAC-SHA256, exactement comme Stripe signe) et le **vrai chokepoint de quota**
> (`ensureQuota` → `assertQuota`, la même fonction que le gate live
> `POST /projects/:id/ai/check-quota`). L'upgrade est livré comme un **événement webhook
> Stripe mode-test signé** — la forme que Stripe délivre après un Checkout en test. Il n'y a
> **ni UI Checkout hébergée par Stripe, ni débit de carte** dans cette preuve (consigne :
> aucun vrai paiement). La couche de persistance est le `TestApiStore` en mémoire, standard
> dans toute la suite ; **la logique billing/quota n'est pas mockée**.

## Fichier de preuve

- Spec exécutable : [`services/api/src/tests/billing-launch-readiness.spec.ts`](../../../services/api/src/tests/billing-launch-readiness.spec.ts)

## Commande + sortie (rejouable)

```
$ cd services/api && npx vitest --run --config vitest.config.ts \
    src/tests/billing-launch-readiness.spec.ts --reporter=verbose

 ✓ #1 — exhausted Free org is gated (429), a signature-verified Stripe test webhook
       upgrades it to Pro, generation is unblocked (200)           145ms
 ✓ #1 — a webhook with an INVALID Stripe signature is rejected and does NOT lift
       the gate (proves real verification)                          51ms
 ✓ #2 — admin raises the ai.messages ceiling for an exhausted Free org and
       generation is unblocked                                      67ms
 ✓ #2 — admin raises the ai.inputTokens ceiling for a token-exhausted Free org
       and generation is unblocked                                  71ms
 ✓ #2 — rejects a quota override from a non-admin caller (the gate cannot be
       lifted without platform admin)                               36ms

 Test Files  1 passed (1)
      Tests  5 passed (5)
```

## Ce que chaque test prouve

| Test | Avant | Action | Après |
|---|---|---|---|
| #1 upgrade | `check-quota` → **429 `QUOTA_EXCEEDED`** (Free : 50 msg/période, tous consommés) | webhook `customer.subscription.created` signé (`whsec_…` test) → `Subscription{status:ACTIVE, planKey:'pro'}` | `check-quota` → **200**, `ai.messages.limit = 1000` (Pro), `remaining > 0`, `byok.plan = 'pro'` |
| #1 signature | org Free épuisée | webhook signé avec le **mauvais** secret (événement forgé) | webhook **rejeté** (≠ 200), **aucune** subscription écrite, `check-quota` **toujours 429** |
| #2 messages | `check-quota` → **429** | `POST /admin/quota-overrides {key:'ai.messages', limit:1_000_000}` → **201** | `check-quota` → **200**, `ai.messages.limit = 1_000_000` |
| #2 tokens | `check-quota {estimatedInputTokens:200_000}` → **429** (Free : 100k) | `POST /admin/quota-overrides {key:'ai.inputTokens', limit:10_000_000}` → **201** | `check-quota` → **200**, `ai.inputTokens.limit = 10_000_000` |
| #2 non-admin | — | `POST /admin/quota-overrides` par l'owner (non platform-admin) | **403** — le gate ne peut pas être levé sans platform-admin |

## Références code (vérité terrain, non mockée)

- Gate quota (chokepoint) : `services/api/src/app.ts` `ensureQuota` → `assertQuota` ; honore
  l'override via `store.getQuotaOverride` (`activeOverride.limit ?? limits[key]`).
- Entitlement plan : `billingState()` — plan résolu **status-gated** (`ACTIVE|TRIALING|PAST_DUE`),
  fenêtre d'usage via `resolveUsagePeriodStart` (`currentPeriodStart` sinon début de mois UTC).
- Webhook Stripe : `POST /billing/stripe/webhook` → `verifyStripeSignature` (HMAC-SHA256,
  tolérance 300 s, rotation multi-`v1=`) → `processStripeWebhookEvent` → `upsertSubscription`.
  Dédup + garde d'ordre (out-of-order / stale-reactivation), **pas de downgrade silencieux**.
- Override admin : `POST /admin/quota-overrides` (`requirePlatformAdmin` + `requireRecentAdminReauth`
  + MFA) → `store.createQuotaOverride`. UI : panneau `Quotas` de `admin.$section.tsx` (`GET /admin/quotas`).
- Catalogue plans (limites) : `packages/billing/src/index.ts` `billingPlans` (free 50 msg /
  100k tok ; pro 1000 / 5M ; team 10 000 / 50M).

## Checks

- **Spec** : `5 passed (5)` (ci-dessus).
- **Build strict `services/api`** (TS 5.8.3 épinglé, `tsc … --strict src/server.ts`) : **EXIT 0**.
- **Typecheck strict du fichier de preuve** (graph propre) : **EXIT 0**.
- **Typecheck repo-wide** : échoue **uniquement** sur des fichiers **non suivis d'une autre
  session** (`services/api/src/artifact-registry-live-adapter.{ts,spec.ts}`, `??`) — **aucune**
  erreur ne référence ce fichier de preuve ; sur un checkout propre / en CI ces fichiers WIP
  n'existent pas.
- **Lint** : `pnpm lint` = `eslint app` uniquement ; `services/api` n'est pas ESLint-gated
  (mêmes imports relatifs `../app.js` que les specs existantes du dossier).

## Hors périmètre de cette preuve (à trancher par Avi)

- **Cohérence pricing (livrable #3)** : la page publique `/pricing` affiche **Core €25 / Pro €100**
  (catalogue crédits « Replit-parity », non câblé au checkout), alors que le checkout facture
  **Pro €29 / Team €99** (`billingPlans`). Décision de prix remontée à Avi (unifier sur Core/Pro
  vs aligner la page sur Pro/Team). Le cutover n'est **pas** exécuté ici — prêt à l'être dès arbitrage.
- **Preuve UI live end-to-end** (Checkout Stripe hébergé mode test + carte 4242 + webhook réseau
  réel) : nécessite un stack complet (web+api+PG+clé `sk_test`) ; non disponible dans cet
  environnement (ni Docker ni PG). La preuve ci-dessus couvre le **contrat serveur**, là où vit
  précisément le « faux gate ».
