# Isolement QA « core bugs » sur le cluster de test audit

Monté le 2026-08-12 pour instrumenter et déployer **sans jamais toucher** la
release Helm partagée `vibecore` (que plusieurs sessions se disputaient, et que
des `kubectl set image` manuels avaient laissée en conflit de field-manager).

## Principe

Aucune ressource de la release partagée n'est modifiée. Tout vit dans deux
namespaces qui m'appartiennent, avec mes propres secrets, config, Redis,
domaines et RBAC. Les images sont taguées `qa8db427` et **ne prennent jamais le
tag partagé `:latest`** (configs `single-*-qa.yaml`, dérivées sans les lignes
`:latest`).

## Coordonnées

| Élément | Valeur |
|---|---|
| Cluster | `vibecore-audit-cluster` (contexte audit épinglé, garde anti-prod sur chaque commande) |
| Namespace plateforme | `qa-corebugs-8db427` |
| Namespace des workspaces | `qa-ws-8db427` |
| Tag d'images | `qa8db427` (web, api, worker, workspace-manager) |
| App | `http://qa-app-8db427.34.163.208.161.sslip.io` |
| API | `http://qa-api-8db427.34.163.208.161.sslip.io` |
| Preview / déploiements | `*.qa-prev-8db427.34.163.208.161.sslip.io` |
| Services | `qa-web`, `qa-api`, `qa-worker`, `qa-wsm`, `qa-redis` |

## Ce qu'il a fallu isoler, et pourquoi

1. **Redis.** Le `REDIS_URL` hérité pointait sur `vibecore-redis.vibecore.svc`.
   Le namespace partagé porte un `deny-all-default` en ingress et un
   `allow-intra-namespace-platform` qui ne matche que ses propres pods : depuis
   un autre namespace, c'est `ETIMEDOUT`. → Redis dédié dans mon namespace.
2. **URL internes.** `API_BASE_URL` / `SAAS_API_URL` pointaient sur l'API
   partagée ; le worker échouait en `fetch failed`. → repointées sur `qa-api`.
3. **Workspace manager.** Même blocage réseau. → `qa-wsm` dédié, avec son propre
   ServiceAccount, un `Role`/`RoleBinding` dans `qa-ws-8db427`, et un
   `ClusterRoleBinding` **additif** (`qa-wsm-capacity-reader-8db427`) qui
   réutilise en lecture seule la `ClusterRole` de capacité existante.
4. **Domaine de preview.** `PREVIEW_DOMAIN` héritée envoyait les déploiements
   sur l'ingress partagé, donc sur l'API partagée. → `qa-prev-8db427.*` avec un
   ingress wildcard vers `qa-api`, indispensable pour tester BUG-DEPLOY-LIVE
   contre MON binaire.

## Piège de build rencontré

Le contexte d'upload Cloud Build faisait **289 Mo**, dont **213 Mo de `docs/`**,
ce qui faisait mourir les uploads. Un `.gcloudignore` le ramène à **80 Mo**.
⚠️ Ancrer les motifs à la racine (`/docs`, pas `docs`) : un `docs` nu exclut
aussi `app/components/docs/`, qui est du **code**, et casse le build sur
`Rollup failed to resolve import "~/components/docs/AgentWalkthrough"`.

## Démontage

```bash
CTX=gke_vibecore-audit-test-20260807_europe-west9-a_vibecore-audit-cluster
kubectl --context "$CTX" delete ns qa-corebugs-8db427 qa-ws-8db427
kubectl --context "$CTX" delete clusterrolebinding qa-wsm-capacity-reader-8db427
```
