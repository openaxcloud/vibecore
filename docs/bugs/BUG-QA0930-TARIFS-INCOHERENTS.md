---
id: BUG-QA0930-TARIFS-INCOHERENTS
section: "2026-09-30 — Balayage QA avant lancement, parcours qui décident d'un client"
---

## Bug

**BLOQUANT (paiement) — la page tarifs et le parcours de paiement vendent deux grilles différentes.
Décision d'Avi du 08/10/2026 : Core 25 / Pro 100 fait foi. Migration encore requise.**

Mesuré le 2026-09-30 (code de `main` + configuration de PRODUCTION, noms de clés seulement, aucune valeur lue) :

| Offre | Page tarifs (`/pricing`, `pricingPlanConfig`) | Paiement (`/upgrade` + API, `billingPlans`) | Prix Stripe configurés en prod |
|---|---|---|---|
| Core | 25 $/mois (20 $ à l'année) | absente ; `billingCheckoutSchema` la REFUSE (`free/pro/team/enterprise`) | aucun |
| Pro | 100 $/mois (95 $ à l'année) | 29 $/mois | `STRIPE_PRO_PRICE_ID` (montant non lu) |
| Team | absente | 99 $/mois | `STRIPE_TEAM_PRICE_ID` |
| Annuel | proposé, avec remise | aucun `STRIPE_*_PRICE_ANNUAL_ID` : l'API retombe EN SILENCE sur le prix mensuel | aucun |

Conséquences : Core, affiché, n'est achetable nulle part ; un visiteur qui choisit « Pro à 100 $ » verrait
« Pro à 29 $ » au paiement (quel montant Stripe débite, la configuration ne permet pas de le dire sans
lire la valeur) ; la remise annuelle affichée n'est pas appliquée.

`packages/billing/src/index.ts` porte DEUX catalogues : `billingPlans` (free/pro/team/enterprise — celui
du paiement) et `creditPlanCatalog` (free/core/pro/enterprise, avec `STRIPE_CORE_*` — celui de la page).
`app/routes/upgrade.tsx` : `normalizePlanKey` ramène `core` à `pro`, `CHECKOUTABLE_PLAN_KEYS = {pro, team}`.

Lié : BUG-QA0930-OFFRE-PERDUE-TARIFS (les boutons de la page n'atteignent même pas le paiement).

## Repro

- Configuration prod : `kubectl … get configmap vibecore-vibecore-platform-platform-env` → clés
  `STRIPE_ENTERPRISE_PRICE_ID, STRIPE_PRO_PRICE_ID, STRIPE_PRO_PRODUCT_ID, STRIPE_TEAM_PRICE_ID,
  STRIPE_TEAM_PRODUCT_ID` (aucune CORE, aucune ANNUAL) ; Secret : `STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET`.
- Code : `pricingPlanConfig` (core 2500 / pro 10000) contre `billingPlans` (pro 2900 / team 9900).

## 📤

☐

## 💻

☐

## ✅

☐

## Preuve

Décision obtenue : Core 25 / Pro 100. Devise, prix Stripe, catalogue persistant et abonnements existants restent à réconcilier. Point OUVERT. La substitution annuelle→mensuelle est traitée séparément dans BUG-BILLING-ANNUAL-FALLBACK-001.
