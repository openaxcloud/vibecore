# MULTI_TENANT_GUARDRAILS_CONTRACT — garde-fous anti-abus multi-tenant (P0-A2-14)

contractId: CTR-MULTI-TENANT-GUARDRAILS
contractVersion: 3
schemaVersion: 1
reviewer: UNKNOWN
expectedReviewer: OpenAI-Codex
signatureResult: PENDING_REVIEW
registryStatus: NON_ENREGISTRÉ — `CONTRACT_REGISTRY.yaml` est épinglé à 14 contrats
(§2.3, `validate-registries.mjs` L897). Promouvoir celui-ci en 15e contrat est une
décision de gouvernance (Avi), pas un effet de bord de ce lot.
implementationAnchor: "`services/api/src/tenant-guardrails.ts` (pur) +
`services/api/src/capacity-policy.ts` (extension Cloud Run) + câblage
`services/api/src/app.ts` (tous les points de mutation projet/déploiement/workspace
recensés) ; tests purs, routes réelles et concurrence."

Répond au refus P0-A2-14 : « **contrats et seuils multi-tenant nommés
inexistants** ». Ce document nomme les contrats et les seuils, et pointe le code
et les tests qui les portent.

## Claims publiques ancrées

| Claim    | Contenu utilisé ici                                                                                                                                                  | Statut   |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `GCP-14` | folders séparant code first-party / code tenant non fiable **OBLIGATOIRES** ; **un billing account DIFFÉRENT par tier de réputation** ; pool de projets **précréés** | VERIFIED |
| `GCP-15` | **1000 services / 1000 jobs / 1000 worker pools** par projet et par région — dimensionne le sharding                                                                 | VERIFIED |

Source : `docs/parity/PUBLIC_BASELINE_REPLIT_2026.yaml`.

## Les 4 contrats nommés

### 1. `ReputationTier` — niveau de confiance

```
UNTRUSTED (0) → BASIC (1) → VERIFIED (2) → TRUSTED (3) → FIRST_PARTY (4)
```

Dérivé (`deriveReputationTier`) d'un état **déjà persisté** — aucune table
nouvelle, donc aucune seconde copie de « ce tenant est-il fiable » qui puisse
diverger : `User.emailVerifiedAt` de **tous** les membres `owner` (jamais seulement
celui qu'un client choisit pour porter la requête), `BillingCustomer`, `Subscription.status`,
`Organization.createdAt`, strikes de modération (`strike-system.ts`),
`AbuseEvent` sévères récents.

Les strikes sont agrégées sur **tous les membres courants** de l'organisation,
pas seulement l'utilisateur qui porte la requête : un owner frappé ne peut pas
inviter un compte propre puis retrouver le tier du tenant par ce compte.
Les abus `high`/`critical` des sept derniers jours sont comptés par un agrégat
PostgreSQL autoritatif, sans `take` de liste : 101 événements anodins plus récents
ne peuvent pas pousser l'incident hors d'une page et restaurer le tier. Seul un
incident explicitement `dismissed` par un opérateur est exclu.

**Invariant I-REP-1 (la démotion gagne)** — une strike active ou un `AbuseEvent`
`high`/`critical` récent retombe un tenant en `UNTRUSTED` **quel que soit ce
qu'il paie**, y compris s'il figure dans l'allowlist first-party. Sans cet ordre,
le moyen le moins cher de contourner les garde-fous est une carte bancaire ou la
compromission d'une organisation interne.

**Invariant I-REP-2** — un tier inconnu retombe sur la politique la **plus
stricte** (`UNTRUSTED`), jamais la plus permissive.

### 2. `ReputationTierPolicy` — les seuils nommés

| Tier          | folder logique    | billing logique       | projets | workspaces | projets/h | déploiements/h | providers / coût max                                 |
| ------------- | ----------------- | --------------------- | ------- | ---------- | --------- | -------------- | ---------------------------------------------------- |
| `UNTRUSTED`   | `untrusted`       | `billing-untrusted`   | 2       | 1          | 2         | **0**          | aucun deploy ; workspace 1,5 vCPU/1 Gio/2 Gio        |
| `BASIC`       | `untrusted`       | `billing-untrusted`   | 10      | 2          | 10        | 2              | static après binding ; workspace 2 vCPU/4 Gio/25 Gio |
| `VERIFIED`    | `untrusted`       | `billing-verified`    | 100     | 10         | 30        | 20             | allowlist sans Docker ; deploy 2 vCPU/512 Mio/1200 s |
| `TRUSTED`     | `untrusted`       | `billing-trusted`     | 1000    | 50         | 100       | 100            | allowlist complète ; deploy 4 vCPU/2 Gio/1800 s      |
| `FIRST_PARTY` | **`first-party`** | `billing-first-party` | ∞       | ∞          | ∞         | ∞              | mêmes limites physiques que TRUSTED                  |

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

**Invariant I-CAP-4 (allowlist et coût)** — chaque création de déploiement porte
le provider, le vCPU effectif, la taille d'artefact et le timeout ; chaque start
workspace porte CPU/RAM/disque après le clamp Kubernetes. Contexte absent,
incohérent, provider hors allowlist ou dépassement ⇒ refus stable, jamais une
valeur « illimitée » implicite. Les plafonds de plan s'appliquent toujours en plus.

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

Fenêtre glissante d'**1 heure**. Chaque action admise réserve avant mutation un
`UsageEvent tenant.guardrail.<action>` immuable sous le verrou d'organisation.
Le compteur survit donc aux déploiements échoués/annulés, suppressions, restores
et transferts : une opération destructive ne remet jamais la rafale à zéro. Une
panne de lecture ou d'écriture du compteur refuse l'admission ; aucun zéro de
secours n'est injecté. Un start/restart explicite d'un workspace déjà actif
consomme toujours ce mur horaire, mais utilise `capacityIncrement=0` pour ne pas
compter deux fois son unique slot concurrent. Un start/restart STOPPED/FAILED
utilise `capacityIncrement=1`.

Un dépassement de rafale émet un `AbuseSignal` dans le pipeline **déjà câblé**
`recordAbuseSignal` → `AbuseEvent` + métrique + escalade :

| Action              | Signal émis                           | severity | action     |
| ------------------- | ------------------------------------- | -------- | ---------- |
| `project.create`    | `project_creation_spike`              | `high`   | `throttle` |
| `deployment.create` | `deployment_creation_spike`           | `high`   | `throttle` |
| `workspace.start`   | `workspace_creation_spike` (existant) | `high`   | `throttle` |

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

`ensureTenantAdmission(request, orgId, action, context)` est appelé **juste avant**
`ensureQuota`, dans le même `withSerializedMutation` (donc même protection TOCTOU) :

- création directe/template/AI, commit d'import, imports GitHub/GitLab/Bitbucket/ZIP,
  restore, transfert, remix et duplicate ;
- create, publish, redeploy, rollback explicite, rollback N-1 static/server et outil Agent ;
- création, start et restart de workspace, avec la même clé de sérialisation org.

Les compteurs de rafale sont relus depuis leur ledger `UsageEvent` durable, pas
depuis une télémétrie best-effort ni depuis les seules ressources encore visibles.
`ensureQuota` relit aussi son compteur autoritatif : aucun cache de pré-check ne
survit jusqu'au commit après un clone/import lent. Le claim horaire est écrit
**avant** la création/transition active dans la section sérialisée ; une panne
d'écriture renvoie `503` et ne crée aucune capacité non comptée. Les checkouts
techniques qui ne tournent pas (production/scheduler) naissent `STOPPED` et ne
consomment pas artificiellement un slot actif.

### Déploiement progressif — honnêteté sur l'état

`TENANT_GUARDRAILS_ENABLED` absent ⇒ **appliqué**. Le chart de production le fixe
explicitement à `"true"`. Seule la valeur d'urgence `"false"` passe en observation ;
la décision reste auditée (`tenant.guardrail.refused`) et métrée avec
`enforced="false"`.

**Invariant I-WIRE-1 (fail-closed)** — une panne d'une lecture de confiance,
d'abus, de binding ou de compteur renvoie `503 TENANT_GUARDRAIL_UNAVAILABLE`,
audite l'indisponibilité en best-effort et ne crée aucune ressource. La métrique
et l'audit d'un refus sont isolés : leur panne ne transforme jamais un refus en
autorisation.

**Invariant I-WIRE-2 (audit avant mutation)** — une admission autorisée persiste
`tenant.guardrail.admitted` avec tier, binding, billing key et folder logique
avant la mutation. Si ce journal ne peut pas être écrit, l'admission rend `503`
et la ressource n'existe pas. Un refus reste toujours bloquant même si sa propre
télémétrie best-effort est en panne.

## Tests

`services/api/src/tenant-guardrails.spec.ts`, `capacity-policy.spec.ts`,
`tests/tenant-guardrails-routes.spec.ts` et
`tests/tenant-guardrails-db.spec.ts` (PostgreSQL réel).

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
- env absent ⇒ enforcement actif ; `false` explicite ⇒ observation auditée
- compteur DB en panne ⇒ 503, zéro création
- audit d'admission en panne ⇒ 503, zéro création
- écriture du compteur workspace en panne ⇒ 503 avant la ligne/transition active
- start/restart déjà actif au plafond concurrent ⇒ pas de double-slot, mais
  rafale horaire toujours bloquante
- deux créations concurrentes pour un dernier slot ⇒ exactement un gagnant
- 101 abus anodins plus récents ne masquent pas un incident sévère ; l'agrégat
  PostgreSQL exclut un incident `dismissed` et un incident hors fenêtre
- org choisie côté client sans membership ⇒ 404 anti-énumération, zéro
  fuite/croisement tenant
- un co-owner non vérifié déclasse le tenant même si le premier owner est vérifié
- provider hors allowlist, coût workspace/deploy au-dessus du tier ⇒ refus

## 🟡 Non fait — à ne pas sur-revendiquer

- **Pas encore déployé par ce lot isolé** : aucune preuve live de blocage en prod
  n'est revendiquée avant merge/déploiement ; le chart candidat est configuré
  enforce.
- Les `billingAccountKey` sont des **clés logiques**. Le mapping vers de vrais
  billing accounts GCP distincts (GCP-14) n'est pas provisionné.
- La branche de décision pure `REVOKED` est fail-closed, mais aucun marqueur
  durable de révocation autonome du binding billing n'existe encore. La
  suspension d'organisation reste le mécanisme terminal opérationnel ; ce lot
  ne revendique pas une révocation billing persistée.
- Pas de folder GCP `first-party` / `untrusted` réellement créé : le contrat
  **nomme** la séparation, l'infra ne la matérialise pas encore.
- Le sharding et le refill de pool sont des décisions pures testées, pas encore
  un worker GCP : aucun pool de projets ni placement Cloud Run n'est provisionné
  ou muté par ce lot isolé.
- `serviceUtilisationCeiling`, tailles de pool et plafonds par tier sont des
  valeurs de **départ** défendables, pas des valeurs mesurées en charge.
