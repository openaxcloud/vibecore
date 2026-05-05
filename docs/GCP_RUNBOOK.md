# Google Cloud Runbook

## Cluster Health

```bash
gcloud container clusters list --project PROJECT
kubectl get nodes -o wide
kubectl get pods -A
kubectl get events -A --sort-by=.lastTimestamp | tail -100
```

## API Incident

1. Check uptime and Prometheus alerts.
2. Inspect API logs by request ID and correlation ID.
3. Check Cloud SQL CPU, connections and latency.
4. Check Redis latency and queue depth.
5. Roll back the platform Helm release if a deploy caused the issue:

```bash
helm history vibecore -n vibecore
helm rollback vibecore REVISION -n vibecore
```

## Workspace Incident

```bash
kubectl get pods -n workspaces -o wide
kubectl describe pod -n workspaces POD
kubectl logs -n vibecore deploy/vibecore-platform-workspace-manager
```

If gVisor nodes are saturated, scale the sandbox node pool:

```bash
gcloud container clusters resize vibecore-prod-workspaces \
  --node-pool sandbox-gvisor \
  --num-nodes 6 \
  --region us-central1 \
  --project PROJECT
```

## Database Failover

Cloud SQL HA performs regional failover automatically. During an incident:

```bash
gcloud sql instances describe vibecore-prod-postgres --project PROJECT
gcloud sql operations list --instance vibecore-prod-postgres --project PROJECT
```

Do not disable deletion protection or PITR during incidents.

## Redis Incident

```bash
gcloud redis instances describe vibecore-prod-redis --region us-central1 --project PROJECT
```

Drain queues only after confirming idempotency keys and replay behavior.

## DNS/TLS Incident

```bash
kubectl get certificates,orders,challenges -A
kubectl describe certificate -n vibecore vibecore-platform-tls
kubectl logs -n cert-manager deploy/cert-manager
```
