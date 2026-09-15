#!/usr/bin/env bash
# Adapter used ONLY by run-docker.sh: presents running Docker containers to
# scripts/deploy-cache-window.mjs in the shape `kubectl get pods -o json` returns.
#
# The barrier is NOT modified or stubbed for this — it runs unchanged and makes
# real decisions from real container state. A container that is still up (even
# one that is mid-shutdown) appears as a live pod, exactly as a Terminating pod
# does in Kubernetes.
set -euo pipefail
docker ps --filter "label=sec9=api" --format '{{.Names}}\t{{.Image}}' \
  | awk -F'\t' 'BEGIN{printf "{\"items\":["; n=0}
      {if(n++)printf ","; printf "{\"metadata\":{\"name\":\"%s\"},\"spec\":{\"containers\":[{\"image\":\"%s\"}]},\"status\":{\"phase\":\"Running\"}}",$1,$2}
      END{printf "]}"}'
