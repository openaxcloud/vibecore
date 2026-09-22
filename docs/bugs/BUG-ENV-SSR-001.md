---
id: BUG-ENV-SSR-001
---

## Bug

**Toute lecture `process.env` nue est MUETTE dans le pod web : le greffon `vite-plugin-node-polyfills` (`vite.config.ts`, `globals.process = true`) injecte un `process` de NAVIGATEUR dans le bundle SSR, dont `env` vaut `{}`.** Une variable posée par Kubernetes est donc invisible au code qui la lit ainsi. Quatre lecteurs touchés, tous corrigés : `REDIS_URL` (plafond partagé du lecteur de sites — le correctif « plafond partagé » était INERTE), `ECODE_WEB_FETCH_TOOL_ENABLED` (drapeau qu'on ne pouvait pas lever), `STREAM_MAX_RETRIES`, `MODEL_ROUTING_DISABLED` et `MODEL_ROUTING_TABLE`. Le plus gênant est le coupe-circuit du routage de modèle : c'est celui qu'on pose EN INCIDENT, et le poser n'aurait rien coupé. Le piège était DÉJÀ documenté dans le dépôt (`app/lib/modules/llm/runtime-env.ts`, `agent-orchestration.ts:342`) et trois correctifs antérieurs l'avaient rencontré ; je suis tombé dedans quand même.

## 📤 Dispatché

☑ 08/09

## 💻 Codé

☑ 09/09

## ✅ Testé live

✅ **09/09 — SERVI EN PRODUCTION**

## Preuve

**Mesuré, pas déduit** : sonde posée dans `readRedisUrl` sur le build de production servi par `react-router-serve` → `{"event":"probe.redisUrl","processHasKey":false,"processLen":0}` alors que `/proc/<pid>/environ` du processus portait bien `REDIS_URL` (longueur 23). **Preuve live avant/après** sur pile complète (Postgres 16 + pgvector, Redis, API, build de production), même serveur, même appel, seule la lecture d'environnement changeant : `rateLimitDegraded` **true → false** et la clé `vibecore:webref:rl:<projet>` passe de **0 à 1 entrée**. **Risque des trois dernières corrections : NUL**, mesuré — aucune des trois variables n'est posée dans l'infrastructure (recherche sur tout le dépôt, **témoin positif** sur `REDIS_URL` qui ressort bien de `values-prod.yaml`) ; le comportement servi est identique, seuls les boutons deviennent actionnables. **Épinglé par** `app/lib/.server/runtime-env-lecture.spec.ts` (4 tests qui lisent la SOURCE de TOUT `app/lib/.server`, sous-dossiers compris). La 1ʳᵉ version de cette garde ne scannait que `web/` et laissait vivre les trois autres — une garde qui ne regarde qu'où l'on a déjà corrigé ne garde rien. **Contre-épreuve dans les deux sens**, chaque moitié nommant son coupable : lecture nue de `STREAM_MAX_RETRIES` → rouge ; de `MODEL_ROUTING_DISABLED` → rouge ; sac `process.env` repris dans `model-routing` → rouge ; alias `? process.env :` → rouge ; état corrigé → 4 verts. **Déploiements** : `afa3d9c` servi par le run 1560 (`bf3951b`), les trois derniers par le run **1566** (`5390b54`) — `helm upgrade` 05:58:22→06:04:45, rollout vérifié, imageIDs conformes au manifeste, rollback SAUTÉ. **RESTE À PRENDRE par quelqu'un qui a l'accès cluster** : `"rateLimitDegraded":false` dans les journaux du pod web en production — ce bac à sable ne peut pas (proxy 403 CONNECT sur app.e-code.ai, ni kubectl ni gcloud).

