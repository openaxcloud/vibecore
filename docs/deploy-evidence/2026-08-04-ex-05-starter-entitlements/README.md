# EX-05 — entitlements Starter appliqués RÉELLEMENT côté serveur

Date : 2026-08-04 · Branche : `feat/ex-05-starter-entitlements`

**Ne pas merger sans le signal d'Avi.**

## 1. Limites Replit Starter — sources vérifiées, UNKNOWN assumés

Chaque chiffre porte sa source et sa date dans `STARTER_PARITY_SOURCES`
(`packages/billing/src/starter-entitlements.ts`). **Aucun chiffre non publié
n'a été inventé** : il reste `null` et n'est appliqué par personne.

| Limite | Valeur | Source Replit |
|---|---|---|
| Apps publiées | **1** | `docs.replit.com/billing/plans/starter-plan` — « Get 1 free published app » |
| Stockage workspace | **2 GB** | idem — `StarterWorkspaceStorage` |
| Durée de vie d'une app publiée | **30 jours** | idem — « go down after 30 days » |
| Egress sortant (free tier) | **10 GiB/mois** | `replit.com/blog/new-limits-and-plans` |
| Apps concurrentes (tous plans) | **20 (hard)** | `docs.replit.com/legal-and-security-info/usage` |
| Collaborateurs | **UNKNOWN** | non publié pour Starter (Core=5, Pro=15 seulement) |
| Nombre de projets créables | **UNKNOWN** | non publié ; seule la borne 20 apps concurrentes existe |
| Crédits quotidiens (montant) | **UNKNOWN** | « daily credits, up to a monthly cap », sans montant |
| CPU / RAM Starter | **UNKNOWN** | « determined by plan », sans chiffre |

Le registre interne `OFFERING_ENTITLEMENT_REGISTRY.yaml` (RPL-28) **corrobore**
indépendamment : « 1 app publiée expirant 30j, 2GB, crédits quotidiens, Lite
build seul ».

## 2. Audit de l'existant

**Déjà appliqué fail-closed** (429 `QUOTA_EXCEEDED` via `assertQuota`, qui
traite déjà NaN/Infinity comme bloquants) : `projects.count`,
`workspaces.active`, `team.members`, `snapshots.count`, `snapshots.sizeMb`,
`ai.messages`, `ai.inputTokens`, `ai.outputTokens`, `ai.toolCalls`,
`previews.public`, `terminals.concurrent`, `deployments.count`. Plus rollback DB
→ 403 `PLAN_NOT_ELIGIBLE`, déploiement Docker → 403
`ENTERPRISE_DEPLOYMENT_REQUIRED`.

**Déclaré mais JAMAIS appliqué côté serveur** :
`collaborators`, `viewers`, `parallelAgents`, `badgeRemovable`,
`publishRegions`, « Publish 1 project », `dailyCreditCents` (jamais octroyé —
aucun planificateur — ni vérifié — `gateCheckpoint` n'a aucun appelant),
`workspaces.runtimeMinutes`, `api.rateLimitPerMinute`, `storage.gb` comme
plafond de compte.

**Dormant en production** — tout ce qui est derrière `BILLING_CREDITS_ENABLED`,
qui **n'est pas défini** dans le configmap : cap des 20 apps concurrentes, gate
d'arrêt de service (402), limite de dépense par utilisateur, débit du wallet.

### Contradiction de parité relevée

La page pricing annonce « Publish 1 project » pour Starter, alors que
`deployments.count: 0` **interdit tout déploiement** — l'offre annoncée est
inatteignable. Replit ne publiant **aucun** chiffre « déploiements par période »,
ce nombre n'a pas été modifié : ce serait inventer une valeur produit. Signalé
pour arbitrage.

## 3. Ce qui est implémenté

`packages/billing/src/starter-entitlements.ts` :

- **Cap d'apps publiées par plan** (Starter = 1), câblé dans
  `POST /projects/:id/deployments/:id/publish`, **hors** du flag crédits — un
  entitlement décrit l'OFFRE, pas le modèle de facturation ; le laisser derrière
  un flag non défini revient à ne rien appliquer.
- **Cap de stockage workspace par plan** (Starter = 2 GB, chiffre Replit).
- **Fail-closed partout** : plan inconnu → replié sur **Starter** (le plus
  restrictif) ; compteur ou cap illisible → bloque.
- **402 et non 429** : la limite se lève en changeant de plan, pas en attendant.
  Code typé `PLAN_PUBLISHED_APP_LIMIT` / `PLAN_STORAGE_LIMIT`, refus tracé en
  audit (`entitlement.refused`).

## 4. Preuve live

Vraie API (`tsx src/server.ts`) + vrai PostgreSQL 16 avec schéma complet ;
compte créé par le **vrai** `POST /auth/register` (201), plan résolu par le
serveur = `starter`.

| Limite | Chiffre | Endpoint | Refus réel | Preuve |
|---|---|---|---|---|
| projects.count | 3 | `POST /orgs/:id/projects` | **429** `QUOTA_EXCEEDED` | 4e refusé, DB = 3 |
| workspaces.active | 1 | `POST /projects/:id/workspaces` | **429** `QUOTA_EXCEEDED` | 2e refusé, DB = 1 |
| team.members | 1 | `POST /orgs/:id/memberships` | **429** `QUOTA_EXCEEDED` | 2e membre refusé, DB = 1 |
| snapshots.count | 5 | `POST /projects/:id/snapshots` | **429** `QUOTA_EXCEEDED` | 6e refusé, DB = 5 |
| deployments.count | 0 | `POST /projects/:id/deployments` | **429** `QUOTA_EXCEEDED` | DB = 0 |
| **apps publiées** | **1** | `POST …/deployments/:id/publish` | **402** `PLAN_PUBLISHED_APP_LIMIT` | 2e refusé, DB = 1, audit écrit |

Non-régression vérifiée : republier l'app **déjà** publiée → 201 (pas
d'auto-blocage). Compte jetable **supprimé** après coup (Organization = 0,
User = 0).

## 5. Nettoyage d'une duplication trouvée en chemin

Le cap plat de 20 (`assertConcurrentPublishedApps`, flag-gaté) a été **retiré du
chemin publish** : le cap par plan le subsume (1 pour Starter, 20 pour les plans
payants = la borne dure Replit). Garder les deux laissait un chemin dormant en
production et deux sources de vérité pour la même règle.

Trois tests encodaient l'ancien comportement — dont un intitulé « does not
enforce the cap while the credit model is dormant », c'est-à-dire le défaut
lui-même. Ils ont été **réécrits sur le fond**, pas ajustés : ils seedaient 20
apps publiées sur un compte **Starter**, état que l'offre rend impossible.

## 6. Artefacts

| Fichier | SHA-256 |
|---|---|
| `artifacts/live-proof.txt` | `63522ef3f6bb602a22cd18884a36c464495fc96d1db9c71e3cd3d7517b6403ff` |

## 7. Non fait / non revendiqué

- `parallelAgents`, `viewers`, `badgeRemovable`, `publishRegions` restent
  **non appliqués** (déclarés seulement) — hors périmètre de ce lot.
- Le **cap de stockage est implémenté et testé unitairement mais PAS prouvé
  live** : aucun endpoint ne l'appelle encore. « Prouvé en réel ou NON FAIT » ⇒
  **NON FAIT** pour le stockage.
- Le modèle de crédits quotidiens Starter reste non fonctionnel (ni octroi ni
  gate) — signalé, non corrigé ici.
- Aucun chiffre UNKNOWN n'a été appliqué.
