# Alignement pricing Starter — arbitrage expert (corrige EX-05)

Date : 2026-08-04 · Branche : `feat/ex-05-starter-entitlements`

**NON MERGÉ.** Livrables ci-dessous pour revue.

## Ce que corrige ce lot par rapport à EX-05

EX-05 modélisait un **cap d'apps publiées** et laissait `deployments = 0`. Le
modèle était faux sur deux points :

1. Il ne distinguait pas **republier le même projet** d'un **2e projet
   distinct**. Le test « 2e appel Publish → 402 » ne prouve rien s'il porte sur
   le même projet.
2. Il ignorait la **durée de vie de 30 jours** : une publication Starter
   s'éteint et doit cesser de consommer la place.

Le modèle est désormais `maxActivePublishedProjects = 1`, avec TTL.

## 1. Limites Starter — sources et UNKNOWN

Tout vit dans la **rate card versionnée** (`packages/billing/src/starter-rate-card.ts`,
v1, effet 2026-08-04). Source primaire : capture live datée et hashée du repo
(`docs/parity/livescan-2026-07-20/doc-starter-plan.md`,
sha256 `019962efcfbe8b66…`, claim RPL-28), recoupée le 2026-08-04 sur
`docs.replit.com`.

| Donnée | Valeur | Statut |
|---|---|---|
| Projets publiés actifs | **1** | OBSERVED |
| Durée de vie d'une publication | **30 j** | OBSERVED |
| Stockage workspace (technique) | **2 Go** | OBSERVED |
| Apps simultanées, tous plans (technique) | **20** | OBSERVED |
| Egress free tier (technique) | **10 GiB/mois** | OBSERVED |
| Crédits Agent : montant quotidien | — | **PENDING_LIVE_CAPTURE** |
| Crédits Agent : plafond mensuel | — | **PENDING_LIVE_CAPTURE** |
| Crédits cloud mensuels : montant | — | **PENDING_LIVE_CAPTURE** |
| CPU / RAM Starter | — | **PENDING_LIVE_CAPTURE** |

⚠️ Nulle part il n'est écrit que « Replit n'a pas d'autre plafond ». Starter a
d'autres limites ; celles dont le montant n'est pas publié restent `null` et ne
sont **appliquées par personne**. Un test échoue si quelqu'un les « complète ».

## 2. Les 10 points

| # | Exigence | État |
|---|---|---|
| 1 | Carte publique : 5 avantages, notre rédaction | ✅ les deux pages |
| 2 | Reproduire le comportement, pas la marque | ✅ rédaction E-Code |
| 3 | `maxActivePublishedProjects = 1`, `deployments=0` supprimé | ✅ |
| 4 | Republier le 1er projet sans limite artificielle | ✅ prouvé live |
| 5 | TTL 30 j puis republication possible | ✅ prouvé live |
| 6 | Prouver (a)(b)(c)(d) séparément | ✅ live + tests |
| 7 | Deux compteurs distincts (Agent quotidien / cloud mensuel) | ✅ modélisés |
| 8 | Pas de pay-as-you-go Stripe ; garde d'upgrade configurable | ✅ `UpgradeGuardMode` |
| 9 | Montants non publiés dans une rate card versionnée | ✅ v1 datée |
| 10 | Limites techniques séparées des avantages | ✅ `technicalLimits` |

## 3. Preuve live — (a)(b)(c)(d) séparément

Vraie API + vrai PostgreSQL 16, compte créé par le **vrai** `/auth/register`,
plan résolu serveur = `starter` :

| Scénario | Résultat |
|---|---|
| (a) publier A | **201** |
| (b) republier A ×3 | **201 / 201 / 201** |
| (c) publier B pendant que A est actif | **402** `PLAN_ACTIVE_PUBLISHED_PROJECT_LIMIT`, `cap:1`, `upgradeRequired:true` |
| (d) A vieilli de 31 j → republier A | **201** |
| (d) A expiré → publier B | **201** |

DB finale : ProjA 5 publications, ProjB 1 · audit `entitlement.refused` écrit.

## 4. Suppression des valeurs sans source

`artifacts/scan-zero-valeurs.txt` : **aucune occurrence vivante** de
3 projets · 5 projets / « 5 active » · 10 Go · 50 Go · 100 requêtes IA ·
`storage.gb: 1`. Les seules mentions restantes sont le **test-garde** (qui les
interdit) et des commentaires expliquant la suppression.

## 5. Tests

| Suite | Résultat |
|---|---|
| Contrat Starter (unitaire) | **21/21** |
| Route publish (a/b/c/d + flag dormant) | **10/10** |
| UI — deux pages de prix | **16/16** |
| `packages/billing` | **130/130** |
| `services/api` | **1375/1375** (0 échec) |
| `tsc --noEmit` | **0 erreur** |

## 6. NON FAIT, dit tel quel

- **Capture pixel des deux pages : NON FAITE.** Le contenu DOM est vérifié dans
  un vrai navigateur (`artifacts/preuve-ui-navigateur.txt`), mais le rendu
  visuel du dev-server ad-hoc est cassé (UnoCSS non généré hors du script
  complet). Présenter un rendu cassé comme une capture serait trompeur.
- **Test d'un vrai compte Starter Replit : NON FAIT.** Je n'ai pas
  d'identifiants Replit. L'incohérence « slides/vidéos/animations » est
  documentée depuis la capture hashée du repo (voir §7), pas depuis un compte
  authentifié.
- Les montants de crédits restent `PENDING_LIVE_CAPTURE` : aucun n'est appliqué.

## 7. Incohérence officielle — ce que dit la doc

La carte publique Starter annonce slides/vidéos/animations, mais la doc réserve
certains artefacts à Core. La capture hashée tranche :

| Action | Starter |
|---|---|
| **Créer** un design Canvas (slides, vidéos, animations) | ✅ possible |
| **Publier** ce design | ✅ possible |
| **Convertir** le design en artefact avec backend | ❌ **Core requis** |
| Construire des **types d'artefacts** hors web et mobile | ❌ **Core requis** |

Autrement dit : créable et publiable **en tant que design**, mais seulement
**convertible avec Core**. La carte n'est donc pas fausse — elle est ambiguë.
Notre rédaction (« Build slide decks, videos and animations ») décrit la
capacité de création, sans promettre la conversion.

Le **pay-as-you-go** est présenté par la même doc comme un **déblocage Core** —
d'où le point 8 : le dépassement Starter n'y est pas branché.
