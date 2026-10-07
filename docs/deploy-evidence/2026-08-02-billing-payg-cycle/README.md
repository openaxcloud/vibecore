# Facturation à l'usage + hébergement (parité Replit, EUR) — preuve du cycle complet (2026-08-02)

GO d'Avi : PAYG effort-based + facturation des déploiements à l'identique de Replit, en EUR
(1:1), en réutilisant l'infra shadow (`metering-service`, `credits-service`, `spend-alerts`,
`rate-card`). Décisions : (a) Reserved VM = abonnement mensuel fixe, (b) PAYG automatique après
crédits, (c) € 1:1, (d) pas de prix par siège, (e) plafond par tranches de 500 €, (f) ledger
double-entrée reporté.

> **Consigne Avi respectée** : chaque comportement vérifié sur `docs.replit.com` et cité ;
> rien inventé. Table « parité confirmée vs à confirmer » : `docs/BILLING_PAYG_DEPLOYMENTS_PLAN.md §8`.

## 1. Parité confirmée (docs Replit vérifiées 2026-08-02) → identique à notre code

- **Déploiements** (`docs.replit.com/billing/deployment-pricing`) : Autoscale **$1/mo + $3,20/M units + $1,20/M req** ; Reserved VM **$20/$40/$80/$160/mo** ; Scheduled **$1/mo + $3,20/M + scheduler $0** ; Static **$0,10/Gio**. 1 CPU-s=18u, 1 Go-s=2u. → `compute-pricing.ts` **au cent près**.
- **Credit packs** (`docs.replit.com/billing/managing-spend`) : **$100→$100, $300→$290, $500→$480, $1000→$950**, expiry **6 mois**. → `creditPackCatalog` exact.
- **Budget org** : « Budgets must be in **increments of $500** » ; cap atteint → « services **blocked** until next billing cycle ». → `ORG_BUDGET_INCREMENT_CENTS` + gate `blocked`.
- **Crédits** : Core **$25**, Pro **$100** (`replit.com/pricing`) ; Pro rollover **1 mois** (`ai-billing`). → `planCreditConfig`.
- **Checkpoint** effort-based, « less than $0.25 » simple (`blog/effort-based-pricing`) ; LLM « billed at the provider's public API rate » (`ai-billing`). → `AgentCheckpoint` réconcilié sur l'usage réel.

## 2. À confirmer / divergences (NON documenté chez Replit — signalé, pas inventé)

1. **Marge IA `AI_MARGIN=0,30`** — Replit dit « public API rate », **markup non documenté**. → parité stricte = `AI_MARGIN=0` ; **décision Avi**.
2. **Seuils d'alerte 50/80/100 %** — Replit = « custom spending amounts » (seuils $ custom), **% fixes non documentés**. Notre code = 50/80/100 %. → à confirmer.
3. **Static — franchise egress gratuite** (blog dit 10 Gio, doc non) — notre code n'en a pas. → à confirmer.
4. **Reserved VM fréquence** (daily/monthly non précisé) — décision Avi = **mensuel fixe**.
5. **Rollover Core** — seul Pro documenté ; notre code core=rollover. → à confirmer.

## 3. Preuve exécutable (Stripe test mode, aucun vrai paiement) — 7/7

Spec : [`services/api/src/tests/billing-payg-cycle.spec.ts`](../../../services/api/src/tests/billing-payg-cycle.spec.ts).
Exerce les **vraies fonctions** (`applyPlanGrant`, `meterDeployment`, `debitCredits`,
`reportUsagePaygUsage`, `evaluateCreditGate`, `nextSpendAlertPct`) + le **vrai webhook**. Seul
faux = l'API Stripe externe (`STRIPE_API_BASE_URL`) qui **capture le usage_record**. Pas de mock métier.

```
 ✓ per-deployment-type rates: Autoscale €3,20/M units + €1,20/M req + €1 base ;
   Static €0,10/Gio ; Reserved €20/€40/€80/€160/mo  (= Replit, 1:1 EUR)
 ✓ meters each deployment kind (autoscale €5,40 / reserved €40 / static €0,50 / scheduled €7,40)
 ✓ grant Core €25 → consume → exhaust → PAYG €135 overage → Stripe usage_record
   (quantity=13500, idempotency 'usage:dep-reserved-1') ; replay = idempotent (1 seul record)
 ✓ credit debit (checkpoint) overflows to PAYG once balance is gone
 ✓ budget cap: PAYG allowed under cap, BLOCKED once it would exceed (budget_cap_reached) ;
   no cap → blocked (insufficient_credits)
 ✓ spend alerts fire once at 50% / 80% / 100% of the cap, de-duped per period ; email subject
 ✓ grant TRIGGER: a signature-verified invoice.paid webhook → sub ACTIVE + wallet crédité €25
      Tests  7 passed (7)
```

**Le cycle complet demandé est prouvé** : grant → conso (4 types de déploiement) → épuisement →
PAYG automatique → usage record Stripe (idempotent) → plafond → blocage → alertes 50/80/100 %.

## 4. Code livré

- **Trigger de grant câblé** (`app.ts`, webhook `invoice.paid`) : `applyPlanGrant` n'était **jamais appelé** → maintenant top-up des crédits une fois par période (initial + renouvellements), dédupé sur `event.id`, best-effort, derrière `BILLING_CREDITS_ENABLED`. Prouvé live via le webhook.
- **Seed Stripe étendu** (`scripts/seed-stripe-catalog.mjs`) : crée en **EUR** les 2 prix **metered** PAYG (€0,01/crédit), les 4 **credit packs**, et les 4 **Reserved VM** récurrents mensuels.

## 5. Checks CI

- `services/api` : **1314 tests verts** (dont les 3 specs billing = 24 preuves) ; build strict `src/server.ts` **EXIT 0**.
- (Échec web préexistant hors périmètre : `managed-models.spec` lit `VITE_BYOK_DISABLED` du `.env` local.)

## 6. ACTION AVI — prix Stripe à créer (EUR, test puis live)

```
STRIPE_SECRET_KEY=sk_test_…  node scripts/seed-stripe-catalog.mjs --json
```
Imprime les env à coller (`values-prod.yaml` / `/admin/stripe`) :
- **PAYG metered** : `STRIPE_PAYG_AI_PRICE_ID`, `STRIPE_PAYG_USAGE_PRICE_ID` (€0,01/crédit, usage_type=metered).
- **Credit packs** : `STRIPE_CREDIT_PACK_{100,300,500,1000}_PRICE_ID` (€100/€290/€480/€950).
- **Reserved VM** : `STRIPE_RESERVED_VM_{SHARED_HALF,DEDICATED_1,2,4}_PRICE_ID` (€20/€40/€80/€160/mo).

## 7. RESTE (orchestration go-live, non fait — pas de sur-revendication)

- **Reserved VM = abonnement Stripe récurrent** (décision Avi a) : la **fonction de facturation** est prouvée (`meterDeployment('reserved-vm')` = €40…), mais le **rattachement d'un item d'abonnement Stripe par déploiement réservé** n'est pas câblé au flux de déploiement. Prix prêts (seed). À câbler.
- **Devise EUR** : montants 1:1 EUR (prix Stripe en EUR) ; le **libellé** `currency:'usd'` du wallet/rate-card et le `$` de l'email d'alerte restent à passer en `eur`/`€` (relabel, non fait).
- **Cron grant quotidien Starter** : le grant mensuel Core/Pro est câblé (invoice.paid) ; le grant **quotidien Starter** (pas d'invoice) nécessite un cron — non câblé.
- **Défaut budget cap** pour activer le PAYG automatique (décision Avi b) : à définir à la création du wallet (sinon PAYG = opt-in).
- **Go-live** : `BILLING_CREDITS_ENABLED` reste OFF (shadow) ; activation séquencée sur GO d'Avi, jamais en prod sans accord.
