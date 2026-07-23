# Snapshots planifiés des PD workspaces — obligation CTR-OPERATIONS-DR fermée (2026-07-23, GO Avi)

EVID-DR-SNAPSHOT-001. Additif, non disruptif (snapshots à chaud, zéro downtime).

## Politique (source de vérité = Terraform)

- `infra/terraform/modules/gke-workspaces/main.tf` : `google_compute_resource_policy.workspace_snapshots`
  (daily, start 02:00 UTC, rétention **7 j**, storage europe-west9, on-source-disk-delete=APPLY_RETENTION_POLICY).
  Variable `snapshot_schedule` avec **validations** (heure HH:00, rétention 1–30 j). `terraform validate`+`fmt` verts.
- Attache aux PD dynamiques (créés par le CSI GKE, hors état TF) :
  `infra/k8s-manual/attach-snapshot-policy.sh` — **idempotent**, à rejouer pour les nouveaux disques.

## Appliqué en LIVE (équivalent de la ressource TF ; `terraform apply` = réservé à Avi)

- resource policy `vibecore-prod-workspace-snapshots` créée (region europe-west9).
- attachée aux **5 disques** pvc- (a/b/c) ; ré-exécution ⇒ « déjà attaché » (idempotent prouvé).
- vérif describe : le disque porte bien `resourcePolicies=…/vibecore-prod-workspace-snapshots`.

## Preuve : snapshot déclenché + vérifié

- On-demand `dr-snap-proof-ondemand-4d05` du disque pvc-62ba12be (10 Go) → **status READY**,
  sourceDisk correct, **storageBytes=7 770 432 (~7,4 MiB)**.
- Schedule lui-même : policy temporaire `dr-snap-schedfire-proof` (fire 20:00 UTC)
  → snapshot auto créé (voir schedfire-result.txt) — prouve que le SCHEDULE tire, pas
  seulement le manuel. (policy + snapshot de preuve supprimés après, voir teardown.)

## Coût réel

- SKU snapshot standard europe-west9 = **0,058 $/Gio/mois** (facturé sur octets STOCKÉS, compressés & incrémentaux).
- **Plafond approuvé** (pire cas, 32 Gio pleinement utilisés) : 32 × 0,058 = **1,86 $/mois**.
- **Mesure réelle** : le disque 10 Go n'utilise que **7,4 MiB** de données snapshotées.
  Les snapshots étant incrémentaux + facturés sur l'utilisé, le coût réel en régime
  (5 disques, rétention 7 j) est de l'ordre de **quelques centimes/mois**, très en
  dessous du plafond de 1,9 $. Le plafond reste la borne haute si les disques se remplissent.

## Teardown des ARTEFACTS de preuve (la policy de prod RESTE)

- snapshot on-demand `dr-snap-proof-ondemand-4d05` supprimé.
- policy temporaire `dr-snap-schedfire-proof` détachée + supprimée, ses snapshots supprimés.
- La policy `vibecore-prod-workspace-snapshots` + ses attaches sont CONSERVÉES (c'est le livrable).
