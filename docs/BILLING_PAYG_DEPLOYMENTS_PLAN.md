# PLAN — Pay-as-you-go, facturation des déploiements & add-ons (parité Replit, EUR)

> **Statut : PLAN à valider par Avi AVANT tout code.** Rien touché en prod. Montants en
> EUR, 1:1 avec la grille USD de Replit (cohérent avec le cutover abonnements Core €25 /
> Pro €100). Aucun mock : vrai Stripe (usage-based/metered + idempotency).

## 0. Constat majeur — ~90% est DÉJÀ construit (en mode SHADOW)

Toute la mécanique de crédits, metering, plafonds, alertes et report PAYG→Stripe **existe,
est testée unitairement, et tourne en SHADOW** derrière `BILLING_CREDITS_ENABLED !== 'true'`
(elle calcule et enregistre le coût mais **ne débite rien**). Seuls les abonnements
forfaitaires Stripe + le système de quotas sont réellement actifs aujourd'hui.

| Composant | État | Réf |
|---|---|---|
| Wallet crédits + grants mensuels/quotidiens + rollover | construit, SHADOW | `credits-service.ts:465`, `credits.ts:57` |
| `debitCredits` (packs→solde→overflow PAYG, anti-overdraw) | construit, SHADOW | `credits-service.ts:151` |
| Metering compute/stockage/DB/déploiements (4 types) | construit, SHADOW | `metering-service.ts:41,370` |
| Effort checkpoints (buildTier ×mult, coût IA + marge 0.3) | construit, SHADOW | `credits-service.ts:263`, `credits.ts:158` |
| Plafonds (budget org, service-shutdown, per-user) + alertes 50/80/100% email | construit, SHADOW | `spend-alerts.ts`, `credits.ts:296,381` |
| Report PAYG→Stripe metered (`reportUsage`, idempotency, ceil) | construit, SHADOW | `credits-service.ts:334,395`, `index.ts:719,741` |
| Sweep autoscale runtime (18u/CPU-s + 2u/Go-s, scale-to-zero gratuit) | câblé au tick `deploy.reap`, SHADOW | `deploy-runtime-metering.ts:91` |
| Credit packs one-time (100/300/500/1000) | construit | `index.ts:434` |
| Grand livre double-entrée (compta exacte, réservations) | construit, **NON câblé** | migration `0078` |

**Conséquence : le vrai travail = (a) créer les prix Stripe manquants en EUR, (b) combler
3-4 petits trous, (c) go-live séquencé prouvé.** Pas de reconstruction.

---

## 1. Modèle Replit → notre mapping (montants exacts)

### 1.a Effort-Based / Pay-as-you-go (Agent)
Replit : usage Agent illimité ; crédits mensuels inclus (**Core $25 / Pro $100**, Starter
quotidien gratuit, non reportés) ; puis **PAYG sur les checkpoints**. Un checkpoint =
effort variable (temps + calcul), ancien forfait $0,25 supprimé. Coûts LLM tiers = **tarif
public API du fournisseur**, déduits des crédits.

**Notre implémentation (déjà là)** : `AgentCheckpoint` réconcilié sur l'usage réel =
`ceil(coût_provider × (1 + AI_MARGIN 0,30) + coût_compute)`, `buildTier` lite/economy/power
(×0,4/1/1,8) + boosts high-power/turbo. Débité du wallet via `settleCheckpoint`→`debitCredits` ;
overage → PAYG. Grille tokens par modèle dans `ai-pricing.ts` (ex. opus-4-8 500/2500 ¢/M).
→ **Parité conforme.** En EUR : 1 crédit = **1 centime EUR**.

### 1.b Déploiements (rates déjà transcrits de Replit dans `compute-pricing.ts`)
| Type | Modèle Replit (=notre code) | Réf code |
|---|---|---|
| **Autoscale** | **€1,00/mois** base + **€3,20 / M units** + **€1,20 / M requêtes** ; idle = 0 | `COMPUTE_UNIT_CENTS`, `REQUEST_CENTS`, `DEPLOYMENT_BASE_CENTS_PER_MONTH` |
| **Scheduled** | **€1,00/mois** + **€3,20 / M units** ; scheduler €0 | idem, kind `scheduled` |
| **Static** | hébergement gratuit + **€0,10 / Gio** sortant | `EGRESS_CENTS_PER_GIB` |
| **Reserved VM** | shared 0,5vCPU/2Go **€20** ; dedicated 1/4 **€40**, 2/8 **€80**, 4/16 **€160** /mois | `RESERVED_VM_TIERS` |
| Compute unit | **1 CPU-s = 18 units, 1 Go-s = 2 units** | `CPU_SECOND_COMPUTE_UNITS`, `GB_SECOND_COMPUTE_UNITS` |

Autoscale/scheduled/static ont déjà leur chemin de metering + le sweep runtime (floor 1
unit, fenêtre plafonnée 30 min, watermark, delta requêtes). **Reserved VM a le tarif mais
PAS de facturation mensuelle récurrente câblée** → seul vrai trou déploiement (cf §5).

### 1.c Add-ons
- **Crédits additionnels** : packs one-time déjà catalogués — **€100→100cr, €300→290cr,
  €500→480cr, €1000→950cr** (remise volume, validité 6 mois, pas de rollover post-expiry).
- **Stockage / DB au-delà** : déjà **metered PAYG** (`storage.objectGiBMonths` €0,03/Gio-mois,
  egress €0,10/Gio ; DB `database.storageGiBMonths` + `activeHours`).
- **Collaborateurs / viewers** : Replit ne facture PAS au siège — ce sont des **limites
  incluses** (Core 5 / Pro 15 + 50 viewers) déjà gatées. → parité = garder des limites, pas
  d'add-on par siège (à confirmer, §7-4).

---

## 2. Prix Stripe à CRÉER en EUR (liste exacte pour Avi)

À générer depuis TON compte Stripe (test puis live). Deux prix **metered** (usage-based,
`usage_type=metered`, `aggregate_usage=sum`) + les prix packs one-time. Tout est en EUR,
unité = 1 crédit = **€0,01**.

| Env var | Type Stripe | Montant EUR | Sert à |
|---|---|---|---|
| `STRIPE_PAYG_AI_PRICE_ID` | metered recurring | €0,01 / unité (1 crédit) | overage checkpoints Agent (`reportCheckpointPaygUsage`) |
| `STRIPE_PAYG_USAGE_PRICE_ID` | metered recurring | €0,01 / unité (1 crédit) | overage compute/stockage/DB/déploiements (`reportUsagePaygUsage`) |
| `STRIPE_CREDIT_PACK_100_PRICE_ID` | one-time | €100 (→100cr) | pack crédits |
| `STRIPE_CREDIT_PACK_300_PRICE_ID` | one-time | €300 (→290cr) | pack crédits |
| `STRIPE_CREDIT_PACK_500_PRICE_ID` | one-time | €500 (→480cr) | pack crédits |
| `STRIPE_CREDIT_PACK_1000_PRICE_ID` | one-time | €1000 (→950cr) | pack crédits |
| `STRIPE_RESERVED_VM_{SHARED_HALF,DEDICATED_1,2,4}_PRICE_ID` | recurring flat (si option A §7-1) | €20 / €40 / €80 / €160 /mois | Reserved VM |

Le report metered est déjà codé (idempotency `checkpoint:{id}` / `usage:{ref}`, quantité
ceil-arrondie) — il suffit de renseigner les deux `STRIPE_PAYG_*_PRICE_ID`. Le script
`scripts/seed-stripe-catalog.mjs` sera étendu pour créer ces prix (comme pour Core/Pro).

---

## 3. Facturation par type de déploiement — ce qui s'active vs le trou

| Type | Chemin (déjà codé) | Action |
|---|---|---|
| Autoscale | sweep `deploy-runtime-metering.ts` sur tick reap (5 min) + `meterDeployment('autoscale')` | ✅ activer (flag) |
| Scheduled | `meterDeployment('scheduled')` | ✅ activer (flag) |
| Static | `meterDeployment('static')` egress | ✅ activer (flag) |
| Reserved VM | tarif `RESERVED_VM_TIERS` OK, **pas de sweep mensuel** | 🔨 construire un sweep mensuel récurrent OU un item d'abonnement Stripe récurrent (décision §7-1) |

---

## 4. Plafonds & alertes (déjà codés — à surfacer)

- **Budget org (Usage Limit PAYG)** : `CreditWallet.budgetCapCents`, multiples de **€500**.
  Au-delà → gate `blocked`.
- **Service-shutdown** : `serviceShutdownCents` → suspend TOUS les services facturables
  (gate au start workspace + deploy).
- **Per-user (Enterprise)** : `UserSpendLimit` (prioritaire sur le budget org).
- **Alertes** : paliers **50 % / 80 % / 100 %** de la limite, une fois par palier par période,
  **email** ("E-Code"), anti-doublon via marqueurs wallet. `evaluateCreditGate` →
  `credits | payg | blocked`.
- **Trou** : UI pour régler le cap + activer PAYG + voir usage/alertes (page billing) — à ajouter.

→ Mappe exactement le "alerts and budgets" de Replit (Account → Billing).

---

## 5. Périmètre de CODE réel (petit) vs réutilisation

**Réutilisé tel quel (0 code)** : `debitCredits`, `meterDeployment` (4 types), sweep
autoscale, plafonds/alertes, `reportUsage` metered, packs, grants, effort checkpoints.

**À construire (ciblé)** :
1. **Reserved VM récurrent** (§7-1) : sweep mensuel OU item d'abonnement Stripe.
2. **Devise EUR** : `RateCard.currency`/`CreditWallet.currency` `'usd'`→`'eur'` + prix Stripe EUR
   (valeurs 1:1). Migration légère + seed.
3. **Cron de grants** : vérifier/activer l'attribution quotidienne (Starter) et mensuelle
   (Core/Pro) via `applyPlanGrant` (worker/cron).
4. **UI billing** : cap PAYG, opt-in, compteur d'usage temps réel, historique alertes.
5. **(Optionnel, recommandé DIFFÉRÉ)** : adopter le grand livre double-entrée (0078) pour une
   compta exacte par déploiement — non requis pour la parité (le wallet mono-solde suffit).

**Stripe** : créer les prix §2 (test puis live).

---

## 6. Go-live séquencé (aucune prod sans GO d'Avi)

- **Étape 0 (actuel)** : SHADOW partout — enregistre le coût, ne débite rien.
- **Étape 1 (preuve, test mode)** : créer les prix Stripe test ; activer sur **1 org de test** ;
  prouver bout-en-bout, exécutable, sans vrai paiement :
  grant → conso checkpoints/déploiements → épuisement → overage PAYG → **usage record Stripe
  (idempotent)** → facture période ; cap atteint → `blocked` ; emails d'alerte 50/80/100 %.
- **Étape 2 (prod, sur GO)** : activer globalement via runbook. Rollback = re-shadow (flag).

Chaque étape : CI verte, preuve dans `docs/deploy-evidence/`, pas de sur-revendication.

---

## 7. DÉCISIONS demandées à Avi (avant code)

1. **Reserved VM** : (A) item d'abonnement Stripe récurrent €20/40/80/160/mois par déploiement
   réservé *(recommandé — colle au mensuel fixe de Replit, facturation Stripe native)* vs
   (B) sweep metered mensuel maison. → **A ou B ?**
2. **PAYG par défaut** : (A) automatique après épuisement des crédits, avec budget cap par
   défaut réglable *(= comportement Replit, recommandé)* vs (B) opt-in explicite (carte +
   cap requis avant tout overage). → **A ou B ?**
3. **Devise** : confirmer **EUR 1:1** (pas de conversion FX) pour tous les prix d'usage.
4. **Add-ons sièges** : parité Replit = limites incluses + PAYG compute/stockage/DB, **pas**
   de prix par siège collaborateur/viewer. Confirmer (ou veux-tu des add-ons par siège ?).
5. **Budget cap** : garder l'incrément **€500** (comme le code actuel) ou autre granularité ?
6. **Grand livre double-entrée** : adopter maintenant (compta exacte) ou différer (le wallet
   mono-solde `debitCredits` est prêt) ? → recommandé **différer**.

---

### Sources Replit (montants cités)
- Effort-based / PAYG : `replit.com/blog/effort-based-pricing`, `docs.replit.com/billing/ai-billing`
- Déploiements : `docs.replit.com/billing/deployment-pricing`
- Crédits par plan : `replit.com/pricing`

---

## 8. RECHERCHE VÉRIFIÉE (2026-08-02) — parité confirmée vs à confirmer

Vérifié sur les docs Replit officielles. Montants cités verbatim des sources.

### ✅ PARITÉ CONFIRMÉE (docs Replit → identique à notre code)

| Élément | Replit (source) | Notre code |
|---|---|---|
| Autoscale base | **$1/mois** (`docs.replit.com/billing/deployment-pricing`) | `DEPLOYMENT_BASE_CENTS_PER_MONTH=100` ✅ |
| Autoscale compute | **$3,20 / M units** | `COMPUTE_UNIT_CENTS=320/1e6` ✅ |
| Autoscale requêtes | **$1,20 / M requêtes** | `REQUEST_CENTS=120/1e6` ✅ |
| Compute unit | **1 CPU-s = 18 units, 1 Go-s = 2 units** | `CPU_SECOND=18`, `GB_SECOND=2` ✅ |
| Reserved VM | **shared 0,5/2 $20 ; dedicated 1/4 $40 ; 2/8 $80 ; 4/16 $160** /mois | `RESERVED_VM_TIERS` 2000/4000/8000/16000 ✅ |
| Scheduled | **$1/mois + $3,20/M units + scheduler $0** | idem autoscale, kind `scheduled` ✅ |
| Static transfert | **$0,10 / Gio** | `EGRESS_CENTS_PER_GIB=10` ✅ |
| Credit packs | **$100→$100, $300→$290, $500→$480, $1000→$950**, expiry **6 mois** (`managing-spend`) | `creditPackCatalog` + `CREDIT_PACK_VALIDITY_DAYS=182` ✅ |
| Budget org | **« Budgets must be in increments of $500 »** (`managing-spend`) | `ORG_BUDGET_INCREMENT_CENTS=50_000` ✅ |
| Cap atteint | **« services blocked until next billing cycle or you increase the limit »** | `serviceShutdown` / gate `blocked` ✅ |
| Crédits mensuels | **Core $25, Pro $100** (`replit.com/pricing`), Teams $40/u (`ai-billing`) | `planCreditConfig` core 2500 / pro 10000 ✅ |
| Collaborateurs/viewers/agents | **Core 5 / Pro 15 + 50 viewers ; 2 / 10 agents** (`pricing`) | `creditPlanCatalog` ✅ |
| Rollover Pro | **« rollover for one month »** (`ai-billing`) | `creditRolloverMonths` pro=1 ✅ |
| Checkpoint | **= sortie finale d'UNE requête Agent, effort-based, « less than $0.25 » simple** (`blog/effort-based-pricing`) | `AgentCheckpoint` réconcilié sur usage réel ✅ (conceptuel) |
| LLM tiers | **« billed at the provider's public API rate, deducted from credits »** (`ai-billing`) | `computeAiCostCents` (tarif provider) ✅ |
| Auto-reload packs | **« automatically purchase a new credit pack when your balance runs low »** (`managing-spend`) | `CreditWallet.autoTopupCents` ✅ |

### ⚠️ À CONFIRMER / DIVERGENCES (non documenté chez Replit — ne PAS inventer)

1. **Marge IA (`AI_MARGIN=0,30`)** — Replit dit « billed at the provider's **public API rate** » et **la marge/markup n'est PAS documentée** (`ai-billing`, `effort-based-pricing`). Notre code ajoute **+30 %** sur les tokens. → **Pour une parité stricte « public API rate », mettre `AI_MARGIN=0`.** Laissé configurable (env) ; **décision Avi requise** (marge cachée dans l'effort côté Replit = plausible mais non prouvé).
2. **Seuils d'alerte 50/80/100 %** — Replit : « email notifications when you reach **custom spending amounts** » (`ai-billing`) = seuils **en $ définis par l'utilisateur**, **pas** de pourcentages fixes documentés. Notre code = 50/80/100 % fixes. → **À confirmer** : garder nos % (défaut raisonnable) ou passer à des seuils $ custom.
3. **Static — franchise egress gratuite** — le blog d'annonce dit « free up to **10 GiB** outbound » mais la **doc pricing ne la cite pas**. Notre code = **pas de franchise** (facture dès le 1er Gio). → **À confirmer** ; j'ajoute une franchise configurable (défaut 10 Gio, source = blog) si tu valides.
4. **Reserved VM — fréquence** — la doc **ne précise pas** daily vs monthly. Décision Avi (a) = **abonnement fixe mensuel** → j'implémente un item récurrent mensuel. (OK, choix assumé.)
5. **Rollover Core** — seul le rollover **Pro** (1 mois) est documenté ; **Core non documenté**. Notre code = core rollover=true. → **À confirmer** (garder ou passer Core sans rollover).
6. **PAYG automatique après épuisement** — l'`ai-billing` dit « transition to pay-as-you-go for checkpoints after monthly credits exhausted » (support parité auto) mais le **détail carte/opt-in n'est pas explicite**. Décision Avi (b) = **automatique** → implémenté ainsi.
7. **Allocation compute Core (« ~6 M units »)** — citée dans un blog, **pas** dans la doc pricing → non implémentée comme quota dur (à confirmer si besoin).
