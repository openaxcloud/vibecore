# Contrat — seuils multi-tenant Cloud Run (P0-A2-14)

schemaVersion: 1
Ancrage : `anchor.json` (source GCP autoritative `docs.cloud.google.com/run/quotas`,
HTML committé sha256 `1809ead6…`). Vérifiable : `node anchor-cloudrun-limits.mjs --offline`.

## Seuils NOMMÉS (bornes GCP par instance de service Cloud Run)
Chaque seuil est ancré verbatim à la doc GCP (colonne « citation ») ; les valeurs
par-tenant du contrat ne peuvent JAMAIS dépasser la borne GCP correspondante.

| seuil nommé | borne GCP (autoritative) | citation verbatim |
|---|---|---|
| `maxConcurrentRequestsPerInstance` | 1000 | `concurrent requests per instance` (…1000) |
| `maxVcpuPerInstance` | 8 vCPU | `Maximum number of vCPU` (8) |
| `maxMemoryGiBPerInstance` | 32 GiB | `Maximum memory size, in GiB` (32) |
| `maxRequestTimeout` | 60 min | `Maximum time before timeout per request` |

## Isolation multi-tenant (contrat)
- **1 service Cloud Run par tenant** (pas de multiplexage de tenants dans une même
  révision) — l'identité de service (SA) porte le tenant, cf. preuve WIF chemin 3
  (`docs/deploy-evidence/2026-07-21-wif-three-paths/`, `read_status` par SA).
- **Plafonds par-tenant** déclarés ≤ bornes GCP ci-dessus ; toute valeur de plan
  qui excède une borne GCP est **invalide par construction** (le script d'ancrage
  échoue si une borne citée disparaît de la source).
- **Pas de folder-per-tenant** (cf. `P0-V3-03`/`P0-V4-3`, `docs/deploy-evidence/2026-07-22-gcp-folder-limits-anchor/`) : le sharding tenant est explicite, pas hiérarchique.

## Statut
`P0-A2-14` → **PROVEN_REVIEW_PENDING** (seuils multi-tenant nommés ET ancrés à la source
GCP autoritative ; rejouable). Ne pas clôturer sans re-signature.
