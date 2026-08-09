#!/usr/bin/env bash
# Cluster add-ons for the audit test environment: the pieces that GCP provides
# as managed services in prod and that we run in-cluster here to keep the bill
# proportionate to a 7-day audit.
#
#   ingress-nginx  — the real reverse proxy prod uses (not a substitute)
#   cert-manager   — real Let's Encrypt certs over HTTP-01
#   Redis          — replaces Memorystore HA 5GB (~$250/mo); also makes the
#                    "Redis failure" injection scenario trivial (kill the pod)
#   NFS provisioner— replaces Filestore 1TiB (~$200/mo) for dynamic RWX
#   email sink    — replaces Resend; the api is fail-closed on EMAIL_HTTP_ENDPOINT
set -euo pipefail

NS="${NS:-vibecore}"
RELEASE="${RELEASE:-vibecore}"
# shellcheck source=scripts/audit-env/lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

# Fail-closed: prouve que le contexte courant EST le cluster d'audit (endpoint
# GKE + providerID des nœuds + labels), au lieu de se contenter d'un nom de
# contexte qui ne contient pas « vibecore-prod ». Un alias de contexte suffisait
# à faire passer l'ancienne garde — et ce script écrit dans le namespace de la
# plateforme.
audit_env_require_audit_cluster

echo "==> ingress-nginx"
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx >/dev/null 2>&1 || true
helm repo add jetstack https://charts.jetstack.io >/dev/null 2>&1 || true
helm repo add nfs-ganesha-server-and-external-provisioner \
  https://kubernetes-sigs.github.io/nfs-ganesha-server-and-external-provisioner >/dev/null 2>&1 || true
helm repo update >/dev/null

helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx --create-namespace \
  --set controller.replicaCount=1 \
  --set controller.resources.requests.cpu=100m \
  --set controller.resources.requests.memory=180Mi \
  --wait --timeout 10m

# La policy allow-ingress-controller du chart exige DEUX labels sur le namespace
# ingress-nginx. Le chart ingress-nginx n'en pose qu'un : sans celui-ci, tout
# trafic entrant est bloque par le deny-all et chaque URL publique rend 504.
kubectl label namespace ingress-nginx app.kubernetes.io/name=ingress-nginx --overwrite >/dev/null

echo "==> cert-manager"
helm upgrade --install cert-manager jetstack/cert-manager \
  --namespace cert-manager --create-namespace \
  --set crds.enabled=true \
  --set resources.requests.cpu=50m \
  --wait --timeout 10m

echo "==> NFS provisioner (StorageClass 'nfs', RWX)"
helm upgrade --install nfs-provisioner \
  nfs-ganesha-server-and-external-provisioner/nfs-server-provisioner \
  --namespace nfs --create-namespace \
  --set persistence.enabled=true \
  --set persistence.size=50Gi \
  --set storageClass.name=nfs \
  --set storageClass.defaultClass=false \
  --set 'storageClass.accessModes[0]=ReadWriteMany' \
  --wait --timeout 10m

echo "==> Redis (in-cluster, remplace Memorystore)"
audit_env_ensure_namespace "$NS" "$RELEASE"
kubectl -n "$NS" apply -f - <<'YAML'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: vibecore-redis
  labels: { app: vibecore-redis, env: audit-test, app.kubernetes.io/part-of: vibecore }
spec:
  replicas: 1
  selector: { matchLabels: { app: vibecore-redis } }
  template:
    metadata:
      labels: { app: vibecore-redis, env: audit-test, app.kubernetes.io/part-of: vibecore }
    spec:
      containers:
        - name: redis
          image: redis:7-alpine
          args: ["--save", "", "--appendonly", "no"]
          ports: [{ containerPort: 6379 }]
          resources:
            requests: { cpu: 50m, memory: 128Mi }
            limits: { cpu: 500m, memory: 512Mi }
          securityContext:
            runAsNonRoot: true
            runAsUser: 999
            allowPrivilegeEscalation: false
            capabilities: { drop: ["ALL"] }
            seccompProfile: { type: RuntimeDefault }
---
apiVersion: v1
kind: Service
metadata:
  name: vibecore-redis
  labels: { app: vibecore-redis, env: audit-test, app.kubernetes.io/part-of: vibecore }
spec:
  selector: { app: vibecore-redis }
  ports: [{ port: 6379, targetPort: 6379 }]
YAML

echo "==> attente de l'IP externe du load balancer"
for _ in $(seq 1 60); do
  LB_IP="$(kubectl -n ingress-nginx get svc ingress-nginx-controller \
    -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || true)"
  [[ -n "$LB_IP" ]] && break
  sleep 10
done
[[ -n "${LB_IP:-}" ]] || { echo "!! pas d'IP externe apres 10 min" >&2; exit 1; }
echo "==> LB_IP=$LB_IP  (domaines: app.$LB_IP.sslip.io, etc.)"

echo "==> ClusterIssuers (HTTP-01 reel + self-signed pour le wildcard preview)"
kubectl apply -f - <<YAML
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-http01
spec:
  acme:
    # No contact email on purpose: Let's Encrypt rejects .invalid (not a public
    # suffix), and neither a production address nor a personal one belongs in a
    # throwaway environment. The contact field is optional.
    server: https://acme-v02.api.letsencrypt.org/directory
    privateKeySecretRef: { name: letsencrypt-http01-account-key }
    solvers:
      - http01:
          ingress:
            class: nginx
---
# The preview wildcard (*.preview.<ip>.sslip.io) cannot be issued over HTTP-01
# — wildcards require DNS-01, and the test project has no Cloud DNS zone. The
# proxy behaviour under test is unaffected; only the cert is untrusted, so
# Playwright must run with ignoreHTTPSErrors for preview hosts.
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: selfsigned-preview
spec:
  selfSigned: {}
YAML

echo "==> puits e-mail (remplace Resend)"
# L'api est fail-closed : avec environment=production elle REFUSE DE DEMARRER
# sans EMAIL_HTTP_ENDPOINT (« EMAIL_HTTP_ENDPOINT is required in production »).
# Plutot que d'affaiblir l'environnement — ce qui cesserait d'exercer les chemins
# de code de production que l'audit veut precisement verifier — l'e-mail sortant
# est dirige vers ce puits in-cluster : il repond 200 et journalise la requete
# complete. Chaque e-mail devient observable via
#   kubectl -n vibecore logs deploy/email-sink
# et aucun ne part vers l'exterieur. values-audit-test.yaml pointe
# platformEnv.email.httpEndpoint sur son Service.
#
# Le label app.kubernetes.io/part-of=vibecore n'est pas cosmetique : la policy
# allow-intra-namespace-platform du chart ne reouvre le trafic pod-a-pod QUE
# entre pods qui le portent. Sans lui, deny-all-default bloque api -> puits.
kubectl -n "$NS" apply -f - <<'YAML'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: email-sink
  labels: { app: email-sink, env: audit-test, app.kubernetes.io/part-of: vibecore }
spec:
  replicas: 1
  selector: { matchLabels: { app: email-sink } }
  template:
    metadata:
      labels: { app: email-sink, env: audit-test, app.kubernetes.io/part-of: vibecore }
    spec:
      containers:
        - name: echo
          image: mendhak/http-https-echo:31
          env:
            - { name: HTTP_PORT, value: "8080" }
            - { name: DISABLE_REQUEST_LOGS, value: "false" }
          ports: [{ containerPort: 8080 }]
          resources:
            requests: { cpu: 25m, memory: 64Mi }
            limits: { cpu: 200m, memory: 256Mi }
          securityContext:
            runAsNonRoot: true
            runAsUser: 65534
            allowPrivilegeEscalation: false
            capabilities: { drop: ["ALL"] }
            seccompProfile: { type: RuntimeDefault }
---
apiVersion: v1
kind: Service
metadata:
  name: email-sink
  labels: { app: email-sink, env: audit-test, app.kubernetes.io/part-of: vibecore }
spec:
  selector: { app: email-sink }
  ports: [{ port: 8080, targetPort: 8080 }]
YAML

# NOTE : la NetworkPolicy allow-dns-clusterip vivait ici. Elle est desormais
# rendue par le chart (networkPolicy.serviceCidr, cf. values-audit-test.yaml) :
# un correctif hors-bande ne repare que CE cluster, alors que le probleme frappe
# toute installation a neuf, reprise apres sinistre incluse.

echo "==> add-ons installes. LB_IP=$LB_IP"
