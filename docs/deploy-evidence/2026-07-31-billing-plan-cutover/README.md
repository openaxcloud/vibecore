# Replit-parity plan cutover — vocabulaire unifié + preuve live (2026-07-31)

Décision Avi : parité Replit exacte, en **EUR**, mensuel **et** annuel pour tous les
plans. Grille cible :

| Plan | Mensuel | Annuel (effectif /mois) | Annuel (facturé) |
|---|---|---|---|
| **Starter** | Gratuit (crédits agent quotidiens) | — | — |
| **Core** | **25 €/mois** | **20 €/mois** (−20 %) | 240 €/an |
| **Pro** | **100 €/mois** | **95 €/mois** (−5 %) | 1140 €/an |
| **Enterprise** | Sur devis | — | — |

## 1. Incohérence de fond résolue (3 vocabulaires → 1)

Avant : **trois** taxonomies incohérentes — `billingPlans` (pro €29/team €99, câblé
au checkout), `creditPlanCatalog` (core €25/pro €100, dormant), et un `ecodePaymentPlans`
public (**teams €40**). La page vendait Core €25/Pro €100 mais le checkout facturait
pro €29/team €99, et `core` retombait silencieusement sur les limites Free.

Après : **une seule** taxonomie `starter/core/pro/enterprise` de la page → checkout →
Subscription → gateway. `billingPlans` ne survit que comme table interne de tiers de
limites (dont `creditPlanCatalog.limits` dérivent déjà). Fini le `core→pro` silencieux,
fini le fallback Free.

**Correctifs des 11 points de rupture identifiés** (carte exhaustive) :
- `seedBillingPlans` seede la table `Plan` depuis `creditPlanCatalog` (limites + prix EUR mensuel/annuel).
- `billingState` résout les limites via `creditPlanByKey` (plus de fallback Free pour Core/Pro).
- Schémas checkout + admin-override : `z.enum(['starter','core','pro','enterprise'])`.
- Gateway : `creditPlanToGatewayTier` — Starter→free, **Core→pro**, **Pro→business** (modèles les + puissants), Enterprise→enterprise.
- BYOK : `['pro','enterprise']` (Pro = nouveau tier avancé).
- Tier DB : `resolveDatabaseTier` → Pro/Enterprise = `isolated` (normalise team→pro).
- k8s : `normalizeWorkspacePlan` — Core→2 vCPU/4Gi, Pro→4 vCPU/8Gi.
- `upgrade.tsx` : plus de collapse `core→pro` ; `CHECKOUTABLE = {core, pro}`.
- Pricing : CTA `/pricing` → `/subscribe?plan=<key>&interval=<monthly|annual>` (plus `/register`) ; `ecodePaymentPlans` teams €40 → Pro €100/€95 ; `plan-comparison` starter/core/pro/enterprise.
- Migration backfill `0080` : renomme en place les lignes `Plan` legacy (free→starter, pro€29→core, team→pro) en préservant `planId` → les subscriptions existantes suivent automatiquement.

## 2. Preuve exécutable (Stripe test mode, aucun vrai paiement)

Spec : [`services/api/src/tests/billing-plan-cutover.spec.ts`](../../../services/api/src/tests/billing-plan-cutover.spec.ts)
et [`billing-launch-readiness.spec.ts`](../../../services/api/src/tests/billing-launch-readiness.spec.ts) → **11/11**.

Vrai serveur (`buildApiApp`), vraie vérif de signature Stripe, vrai handler de checkout +
résolution de prix, vrai webhook, vrai gate quota. Seul l'API Stripe externe est un
faux injecté via `STRIPE_API_BASE_URL` (le seam de test que l'app supporte déjà) — il
**capture le price id** que le handler envoie à Stripe. Pas de mock de la logique billing.

```
$ cd services/api && npx vitest --run src/tests/billing-plan-cutover.spec.ts \
    src/tests/billing-launch-readiness.spec.ts

 ✓ core monthly:  checkout charges €25   and the upgrade lifts the AI gate
 ✓ core annual:   checkout charges €240  and the upgrade lifts the AI gate
 ✓ pro  monthly:  checkout charges €100  and the upgrade lifts the AI gate
 ✓ pro  annual:   checkout charges €1140 and the upgrade lifts the AI gate
 ✓ the pricing page numbers (25/100, annual 20/95) equal the catalog the checkout bills
 ✓ Starter has no self-serve checkout and Enterprise routes to contact-sales
 ✓ #1 upgrade→Pro lifts gate (10 000 msgs) + invalid signature rejected
 ✓ #2 /admin/quotas override lifts ai.messages + ai.inputTokens ; non-admin 403
      Tests  11 passed (11)
```

Pour chaque (plan × intervalle) la spec prouve, bout en bout :
1. **Montant facturé = affiché** — `creditPlanChargeCents(plan, interval)` (source unique de
   la page pricing) == 2500/24000 (Core m/a), 10000/114000 (Pro m/a) EUR.
2. **Checkout choisit le bon prix** — le faux Stripe reçoit exactement `price_core_m` /
   `price_core_a` / `price_pro_m` / `price_pro_a` selon l'intervalle.
3. **Upgrade lève le gate** — webhook `customer.subscription.created` signé → `Subscription
   ACTIVE` sur le bon plan → `check-quota` **200** aux vraies limites (Core 1000 / Pro 10 000 msgs).

## 3. Checks CI

- Tests : `services/api` **1307 ✓**, `packages/billing` **109 ✓**, `packages/k8s-client` **118 ✓**, web **4014 ✓**.
  - (1 échec web préexistant et **hors périmètre** : `managed-models.spec` lit `VITE_BYOK_DISABLED` depuis le `.env` local — pas en CI, fichier non modifié.)
- Build strict `services/api` (TS 5.8.3, `tsc … --strict src/server.ts`) : **EXIT 0**.
- Typecheck web (`tsconfig.web.json`) : **EXIT 0**.
- `helm template … -f values-prod.yaml` : **EXIT 0** (les env Stripe vides sont omis, jamais de placeholder rendu).

## 4. ACTION AVI — price IDs Stripe à fournir (prod)

Aucun vrai paiement/déploiement fait ici. Pour activer le checkout en prod, depuis **ton
compte Stripe** :

```
# Mode test d'abord, puis live :
STRIPE_SECRET_KEY=sk_test_…  node scripts/seed-stripe-catalog.mjs --json
```

Le script crée les Produits + Prix EUR (mensuel + annuel) pour Core et Pro et imprime les
**6 IDs** à coller dans `infra/helm/platform/values-prod.yaml` (bloc `stripe:`) ou via
`/admin/stripe` (qui l'emporte sur l'env) :

```
coreProductId, corePriceMonthlyId (€25/mo), corePriceAnnualId (€240/an → €20/mo)
proProductId,  proPriceMonthlyId  (€100/mo), proPriceAnnualId  (€1140/an → €95/mo)
```

Déploiement **séquencé, sur ton GO** (`docs/DEPLOY_RUNBOOK.md`) : la migration `0080`
renomme les plans en place et refresh au boot ; les subscriptions existantes suivent. Les
anciens IDs Pro(€29)/Team(€99) sont **révoqués** (ne pas réutiliser).

## Périmètre honnête

Preuve au **contrat serveur** (checkout + webhook + gate), là où vit l'incohérence. Pas
d'UI Checkout hébergée Stripe ni de carte 4242 (nécessite `sk_test` réel + stack complet) —
le seed script + le faux-Stripe injecté couvrent le montant facturé de façon déterministe.
