# Google Cloud Cost Model

Primary cost drivers:

- GKE app cluster node pool
- GKE workspace sandbox node pool
- Cloud SQL HA PostgreSQL instance and storage
- Memorystore Redis HA
- Artifact Registry storage and egress
- Cloud Storage snapshots, exports, logs and backups
- Cloud NAT egress
- external load balancers and Cloud Armor
- Cloud Logging ingestion and retention
- AI provider egress and provider-side usage

## Cost Controls

- Workspace auto-sleep and auto-delete policies.
- Per-plan CPU/RAM/storage limits.
- HPA on platform services.
- Cluster autoscaler on workspace nodes.
- Cloud Storage lifecycle rules to Nearline and delete old non-held objects.
- Logging exclusions for high-volume low-value logs.
- Quotas for active workspaces, terminals, previews, snapshots and AI usage.

## Production Baseline

Small production:

- app node pool: 3 x `e2-standard-4`
- workspace node pool: 3 x `e2-standard-8`
- Cloud SQL: `db-custom-2-8192`, regional HA
- Redis: 5 GB STANDARD_HA

Scale workspaces independently from the app cluster. The workspaces node pool should be the dominant elastic cost.
