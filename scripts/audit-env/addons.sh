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

# Epingle la cible AVANT toute chose : neutralise HELM_KUBECONTEXT & co, derive le
# contexte depuis les constantes epinglees, et arme audit_helm/audit_kubectl.
audit_env_pin_cluster_target

# Fail-closed: prouve que le contexte courant EST le cluster d'audit (endpoint
# GKE + providerID des nœuds + labels), au lieu de se contenter d'un nom de
# contexte qui ne contient pas « vibecore-prod ». Un alias de contexte suffisait
# à faire passer l'ancienne garde — et ce script écrit dans le namespace de la
# plateforme.
audit_env_require_audit_cluster

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# Namespace de l'ingress AVANT le chart, avec les DEUX labels que sélectionne
# allow-ingress-controller. Déclaratif et partagé avec la prod
# (.github/workflows/deploy-main.yml applique le même fichier) : c'était un
# `kubectl label` impératif propre à ce script, donc une étape manuelle qu'une
# reprise après sinistre n'aurait jamais exécutée.
echo "==> namespace ingress-nginx (labels de la NetworkPolicy)"
audit_kubectl apply -f "$REPO_ROOT/infra/kubernetes/ingress-nginx/namespace.yaml"

echo "==> ingress-nginx"
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx >/dev/null 2>&1 || true
helm repo add jetstack https://charts.jetstack.io >/dev/null 2>&1 || true
helm repo add nfs-ganesha-server-and-external-provisioner \
  https://kubernetes-sigs.github.io/nfs-ganesha-server-and-external-provisioner >/dev/null 2>&1 || true
helm repo update >/dev/null

# Pas de --create-namespace : le namespace est deja cree ci-dessus, LABELLE.
audit_helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx \
  --set controller.replicaCount=1 \
  --set controller.resources.requests.cpu=100m \
  --set controller.resources.requests.memory=180Mi \
  --wait --timeout 10m

echo "==> cert-manager"
audit_helm upgrade --install cert-manager jetstack/cert-manager \
  --namespace cert-manager --create-namespace \
  --set crds.enabled=true \
  --set resources.requests.cpu=50m \
  --wait --timeout 10m

echo "==> NFS provisioner (StorageClass 'nfs', RWX)"
audit_helm upgrade --install nfs-provisioner \
  nfs-ganesha-server-and-external-provisioner/nfs-server-provisioner \
  --namespace nfs --create-namespace \
  --set persistence.enabled=true \
  --set persistence.size=50Gi \
  --set storageClass.name=nfs \
  --set storageClass.defaultClass=false \
  --set 'storageClass.accessModes[0]=ReadWriteMany' \
  --wait --timeout 10m

echo "==> doubles in-cluster : Redis (remplace Memorystore) + puits e-mail (remplace Resend)"
# Les deux manifestes vivent dans scripts/audit-env/manifests/in-cluster-doubles.yaml
# et NON dans un heredoc ici, parce que deploy-isolated.sh doit installer les MEMES
# doubles dans la namespace de la release isolee. Deux copies auraient derive, et une
# preuve tournant sur un Redis different de celui de l'environnement ne dirait plus
# la meme chose. Le fichier porte les explications (label part-of, fail-closed de
# l'api sur EMAIL_HTTP_ENDPOINT, pourquoi chaque release a les siens).
audit_env_ensure_namespace "$NS" "$RELEASE"
audit_kubectl -n "$NS" apply -f "$REPO_ROOT/scripts/audit-env/manifests/in-cluster-doubles.yaml"

echo "==> attente de l'IP externe du load balancer"
for _ in $(seq 1 60); do
  LB_IP="$(audit_kubectl -n ingress-nginx get svc ingress-nginx-controller \
    -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || true)"
  [[ -n "$LB_IP" ]] && break
  sleep 10
done
[[ -n "${LB_IP:-}" ]] || { echo "!! pas d'IP externe apres 10 min" >&2; exit 1; }
echo "==> LB_IP=$LB_IP  (domaines: app.$LB_IP.sslip.io, etc.)"

echo "==> ClusterIssuers (HTTP-01 reel + self-signed pour le wildcard preview)"
audit_kubectl apply -f - <<YAML
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


# NOTE : la NetworkPolicy allow-dns-clusterip vivait ici. Elle est desormais
# rendue par le chart (networkPolicy.dnsServiceIp, cf. values-audit-test.yaml) :
# un correctif hors-bande ne repare que CE cluster, alors que le probleme frappe
# toute installation a neuf, reprise apres sinistre incluse.

echo "==> add-ons installes. LB_IP=$LB_IP"
