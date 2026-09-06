# MULTI_TENANT_GUARDRAILS_CONTRACT — garde-fous anti-abus multi-tenant (P0-A2-14)

contractId: CTR-MULTI-TENANT-GUARDRAILS
contractVersion: 1
schemaVersion: 1
reviewer: UNKNOWN
expectedReviewer: OpenAI-Codex
signatureResult: PENDING_REVIEW
registryStatus: NON_ENREGISTRÉ — `CONTRACT_REGISTRY.yaml` est épinglé à 14 contrats
(§2.3, `validate-registries.mjs` L897). Promouvoir celui-ci en 15e contrat est une
décision de gouvernance (Avi), pas un effet de bord de ce lot.
implementationAnchor: "`services/api/src/tenant-guardrails.ts` (pur) +
`services/api/src/capacity-policy.ts` (extension Cloud Run) + câblage
`services/api/src/app.ts` (9 points de création de projet, 4 de déploiement) ;
43 tests dont 12 négatifs."

Répond au refus P0-A2-14 : « **contrats et seuils multi-tenant nommés
inexistants** ». Ce document nomme les contrats et les seuils, et pointe le code
et les tests qui les portent.

## Claims publiques ancrées

| Claim | Contenu utilisé ici | Statut |
|---|---|---|
| `GCP-14` | folders séparant code first-party / code tenant non fiable **OBLIGATOIRES** ; **un billing account DIFFÉRENT par tier de réputation** ; pool de projets **précréés** | VERIFIED |
| `GCP-15` | **1000 services / 1000 jobs / 1000 worker pools** par projet et par région — dimensionne le sharding | VERIFIED |

Source : `docs/parity/PUBLIC_BASELINE_REPLIT_2026.yaml`.

## Les 4 contrats nommés

### 1. `ReputationTier` — niveau de confiance

```
UNTRUSTED (0) → BASIC (1) → VERIFIED (2) → TRUSTED (3) → FIRST_PARTY (4)
```

Dérivé (`deriveReputationTier`) d'un état **déjà persisté** — aucune table
nouvelle, donc aucune seconde copie de « ce tenant est-il fiable » qui puisse
diverger : `User.emailVerifiedAt`, `BillingCustomer`, `Subscription.status`,
`Organization.createdAt`, strikes de modération (`strike-system.ts`),
`AbuseEvent` sévères récents.

**Invariant I-REP-1 (la démotion gagne)** — une strike active ou un `AbuseEvent`
`high`/`critical` récent retombe un tenant en `UNTRUSTED` **quel que soit ce
qu'il paie**. Sans cet ordre, le moyen le moins cher de contourner les garde-fous
est une carte bancaire.

**Invariant I-REP-2** — un tier inconnu retombe sur la politique la **plus
stricte** (`UNTRUSTED`), jamais la plus permissive.

### 2. `ReputationTierPolicy` — les seuils nommés

| Tier | folder (GCP-14) | billing account (GCP-14) | maxProjects | workspaces concurrents | projets/h | déploiements/h | binding requis pour |
|---|---|---|---|---|---|---|---|
| `UNTRUSTED` | `untrusted` | `billing-untrusted` | 2 | 1 | 2 | **0** | — |
| `BASIC` | `untrusted` | `billing-untrusted` | 10 | 2 | 10 | 2 | `deployment.create` |
| `VERIFIED` | `untrusted` | `billing-verified` | 100 | 10 | 30 | 20 | — |
| `TRUSTED` | `untrusted` | `billing-trusted` | 1000 | 50 | 100 | 100 | — |
| `FIRST_PARTY` | **`first-party`** | `billing-first-party` | ∞ | ∞ | ∞ | ∞ | — |

**Invariant I-CAP-1** — ces plafonds sont **anti-abus**, pas des droits de plan.
Le quota de plan (`assertQuota`, `packages/billing`) s'applique **en plus** : la
limite effective est le **minimum des deux**. Un plan payant n'achète pas le droit
de dépasser le plafond de rafale de son tier.

**Invariant I-CAP-2 (déploiement)** — `deploymentCreatesPerHour = 0` sur
`UNTRUSTED` : un compte à email non vérifié **ne publie jamais** sur l'internet
public, carte bancaire ou pas. C'est le vecteur d'abus principal du produit
(déploiement de phishing depuis un compte jetable).

**Invariant I-CAP-3** — seul `FIRST_PARTY` est effectivement déplafonné, et c'est
le seul tier dont les charges vont dans le folder `first-party` (GCP-14).

### 3. `BillingAccountBinding` — compte de facturation lié

```
UNBOUND ──(BillingCustomer créé)──▶ BOUND ──(impayé)──▶ DELINQUENT
   │                                  │
   └──────────────(fraude/chargeback)─┴──▶ REVOKED   (terminal)
```

Résolu (`resolveBillingAccountBinding`) depuis le `BillingCustomer` **existant** —
aucune table nouvelle. Seul `BOUND` finance une consommation nouvelle.

**Invariant I-BIND-1 (essayer est gratuit, publier exige un compte)** — le binding
est exigé **par action**, pas globalement. Exiger une carte avant le premier projet
tuerait le try-before-you-buy ; laisser un tenant non lié **publier** est
exactement l'abus visé. Donc `project.create` est libre, `deployment.create`
exige un binding utilisable dès `BASIC`.

**Invariant I-BIND-2** — `REVOKED` est **terminal** : aucun override, même
audité, ne le lève. `DELINQUENT` bloque la consommation nouvelle (402).

### 4. `AbuseEventPolicy` — détection et plafonds de rafale

Fenêtre glissante d'**1 heure**, comptée sur les `UsageEvent` déjà écrits
(`sumUsage(orgId, key, since)`) — pas de nouveau compteur.

Un dépassement de rafale émet un `AbuseSignal` dans le pipeline **déjà câblé**
`recordAbuseSignal` → `AbuseEvent` + métrique + escalade :

| Action | Signal émis | severity | action |
|---|---|---|---|
| `project.create` | `project_creation_spike` | `high` | `throttle` |
| `deployment.create` | `deployment_creation_spike` | `high` | `throttle` |
| `workspace.start` | `workspace_creation_spike` (existant) | `high` | `throttle` |

**Invariant I-ABUSE-1 (boucle de rétroaction)** — l'`AbuseEvent` produit ici
réalimente `deriveReputationTier` (§1) : abuser fait **descendre** de tier, ce qui
resserre les plafonds. Les deux contrats se referment l'un sur l'autre.

**Invariant I-ABUSE-2 (override borné)** — un override explicite et audité
(`QuotaOverride`) lève **uniquement** le mur de rafale. Il ne lève jamais le mur
de binding ni un `REVOKED`.

## Capacité Cloud Run (`CapacityPolicy` étendue — `nextAction` du registre)

`TenantCapacityPolicy` (`capacity-policy.ts`), ancré GCP-15 :

- `maxServicesPerProjectRegion = 1000`, `maxJobsPerProjectRegion = 1000`
- `serviceUtilisationCeiling = 0.8` → **800 services utiles par projet-shard**.
  **Invariant I-CRUN-1** : on ne planifie **jamais** à 100 % d'un quota — il est
  « augmentable » mais pas instantanément.
- `requiredProjectShards(n) = ceil(n / 800)` ; `admitServicePlacement` refuse
  **avant** que l'API GCP ne renvoie 429.
- Pool de projets précréés (GCP-14) : `projectPoolTargetSize = 10`,
  `projectPoolLowWaterMark = 3`, `planProjectPool` déclenche le refill.
  **Invariant I-CRUN-2** : un pool vide ne peut pas servir un tenant sans payer la
  latence de création de projet.

## Câblage réel

`ensureTenantAdmission(request, orgId, action)` est appelé **juste avant**
`ensureQuota`, dans le même `withSerializedMutation` (donc même protection TOCTOU) :

- **9** points d'entrée de création de projet (route directe, `from-template`,
  `from-ai`, commit d'import, import GitHub, import ZIP, restore, transfer,
  duplicate) — les câbler tous, sinon le garde-fou se contourne par
  `/from-template`.
- **4** points de création de déploiement (create, redeploy, rollback, outil agent).

### Déploiement progressif — honnêteté sur l'état

`TENANT_GUARDRAILS_ENABLED` **absent par défaut ⇒ le mur n'est PAS appliqué**.
La décision est quand même calculée, auditée (`tenant.guardrail.refused`) et
comptée (`tenant_guardrail_refusals_total{enforced="false"}`), pour **mesurer le
rayon de souffle avant** d'allumer. Mettre à `'true'` pour appliquer.

**Invariant I-WIRE-1 (pas d'auto-DoS)** — une panne **interne** du garde-fou
(DB, bug) est journalisée et **laisse passer** : le quota de plan garde le même
appel. Un refus **réel** est levé hors du `catch`, donc il ne peut jamais être
avalé par ce fallback.

**Asymétrie assumée** : les signaux de **confiance** échouent **fermé** (une
lecture ratée ne promeut jamais un tenant) ; les **compteurs** échouent **ouvert**
(un hoquet DB ne doit pas transformer chaque création en 429).

## Tests — 43, dont 12 négatifs

`services/api/src/tenant-guardrails.spec.ts` (31), `capacity-policy.spec.ts` (12).

Négatifs (dépassement ⇒ blocage) :

- binding absent ⇒ `BILLING_ACCOUNT_REQUIRED` **402** ; puis **passe** une fois lié
- `DELINQUENT` ⇒ **402** ; `REVOKED` ⇒ **403** même avec override
- plafond projets atteint ⇒ `TENANT_CAP_EXCEEDED` **429** (borne inclusive testée :
  le dernier autorisé passe, le suivant non)
- plafond workspaces concurrents ⇒ **429**
- compte non vérifié + carte ⇒ déploiement refusé (`at most 0 per hour`)
- rafale projets/déploiements ⇒ **429** + `AbuseSignal` du bon type
- override lève la rafale mais **pas** le binding
- tier inconnu ⇒ politique la plus stricte
- shard Cloud Run au plafond ⇒ placement refusé
- pool vide ⇒ `canServeFromPool = false`

## 🟡 Non fait — à ne pas sur-revendiquer

- `workspace.start` est **défini** (seuils + tests) mais **non câblé** : la
  sémantique de concurrence demande une passe dédiée.
- **Non activé en production** : `TENANT_GUARDRAILS_ENABLED` reste absent. Aucune
  preuve live de blocage en prod n'est revendiquée ici — seulement des tests.
- Les `billingAccountKey` sont des **clés logiques**. Le mapping vers de vrais
  billing accounts GCP distincts (GCP-14) n'est pas provisionné.
- Pas de folder GCP `first-party` / `untrusted` réellement créé : le contrat
  **nomme** la séparation, l'infra ne la matérialise pas encore.
- `serviceUtilisationCeiling`, tailles de pool et plafonds par tier sont des
  valeurs de **départ** défendables, pas des valeurs mesurées en charge.
