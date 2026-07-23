#!/usr/bin/env bash
# CTR-OPERATIONS-DR — attache la resource policy de snapshots planifiés aux PD
# des workspaces. Les disques sont créés dynamiquement par le CSI GKE (pas des
# ressources Terraform), donc l'attache vit ici. IDEMPOTENT : réattacher est un
# no-op. À rejouer périodiquement (cron/onglet ops) pour couvrir les NOUVEAUX
# disques. Additif et non disruptif (snapshots à chaud, zéro downtime).
set -euo pipefail
PROJECT="${PROJECT:-vibecore-495216}"
REGION="${REGION:-europe-west9}"
POLICY="${POLICY:-vibecore-prod-workspace-snapshots}"

gcloud compute disks list --project="$PROJECT" \
  --filter="name~pvc- AND zone~$REGION" \
  --format="csv[no-heading](name,zone.basename())" 2>/dev/null | while IFS=, read -r name zone; do
  [ -z "$name" ] && continue
  if gcloud compute disks describe "$name" --zone="$zone" --project="$PROJECT" \
       --format="value(resourcePolicies)" 2>/dev/null | grep -q "$POLICY"; then
    echo "OK (déjà attaché) $name [$zone]"
    continue
  fi
  if gcloud compute disks add-resource-policies "$name" --zone="$zone" \
       --project="$PROJECT" --resource-policies="$POLICY" >/dev/null 2>&1; then
    echo "ATTACHÉ $name [$zone]"
  else
    echo "ÉCHEC $name [$zone]"
  fi
done
