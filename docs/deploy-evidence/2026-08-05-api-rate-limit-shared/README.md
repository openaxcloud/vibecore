# Limiteur de débit API — compteur partagé, atomique, fail-closed

Base : **main @ `f5067a27a6cbff352a0e2cf4555295c110f4dd3e`** · Branche : `fix/api-rate-limit-shared` · **NON MERGÉ**

## Le défaut

Les compteurs de rate limiting vivaient en mémoire de **processus** :

| Limiteur | État avant | Conséquence |
|---|---|---|
| `@fastify/rate-limit` global | cache local par défaut (aucun store partagé) | plafond × nombre de pods |
| Limiteur admin (`/admin/*` mutations) | `Map` de processus | idem |

L'API tourne en **2 replicas, HPA jusqu'à 6** (`values-prod.yaml`). Un plafond
« 10 tentatives de login par minute » en valait donc jusqu'à 60, et l'attaquant
n'avait rien à faire pour en profiter : le load balancer répartissait ses
requêtes tout seul. **Plus la plateforme scalait sous l'attaque, plus la
protection faiblissait** — y compris sur `/auth/login`, `/auth/register` et le
reset de mot de passe.

## Le correctif

1. **Partagé** — compteur dans Redis, vu par tous les pods.
2. **Atomique** — `INCR` + `PEXPIRE` dans UN script Lua. Un lire-puis-écrire
   laisserait une rafale simultanée passer en bloc.
3. **Fail-closed par défaut** — store injoignable ⇒ **503 + retry-after + code
   typé**, jamais l'ouverture de la vanne. `RATE_LIMIT_STORE_FAILURE_POLICY=degrade-local`
   permet à un opérateur de choisir explicitement le comptage par pod (jamais illimité).
4. **Isolation par porteur** — la clé authentifiée est le credential SEUL, sans
   l'IP : un attaquant multi-IP ne se fabrique plus un compartiment par adresse,
   et deux tenants ne partagent jamais un compartiment.

## Preuves adverses

Voir `artifacts/preuves-adverses.txt` (SHA-256 dans `SHA256SUMS.txt`).

| Angle | Résultat |
|---|---|
| Partage 2 pods (plafond 20, 40 req) | **200:20 / 429:20** |
| Contrôle négatif (2 compteurs locaux) | **2×LIMIT** — le test a des dents |
| Rafale **simultanée** 60 req / 2 pods | **200:20 / 429:40** |
| Panne Redis | **503** + `retry-after: 5` + `RATE_LIMIT_STORE_UNAVAILABLE` |
| Reprise après retour Redis | **200** sans intervention |
| `degrade-local` (opt-in), Redis coupé | **5 autorisées / 7 refusées** |
| Isolation tenant (même IP) | A **429**, B **200**, 2 compartiments |

## Un défaut que seule la preuve live a attrapé

Premier câblage : store custom + `backend` passé dans les options du plugin.
**Live : 40/40 autorisées — le limiteur ne comptait rien.** `@fastify/rate-limit`
instancie `new Store(globalParams)` avec ses propres champs uniquement
(`index.js:117`) ; l'option supplémentaire était ignorée. Les tests unitaires,
qui appelaient le backend directement, ne pouvaient pas le voir.

Correctif : fabrique capturant le backend par closure.

## Tests

18/18 unitaires (`shared-rate-limit.spec.ts`) · `tsc` **0 erreur**.

## Portée — ce qui n'est PAS couvert

- Les limiteurs par route qui déclarent `config.rateLimit` héritent du store
  partagé, mais leurs **plafonds** n'ont pas été revus : ce lot corrige le
  *comptage*, pas le dimensionnement des valeurs.
- Aucun déploiement prod n'a été fait ; les preuves sont locales sur vrai Redis
  et vrai PostgreSQL.
