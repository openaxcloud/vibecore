# Google Cloud Security

## Network

- Cloud SQL has private IP only. No public database endpoint is created.
- Memorystore Redis is attached to the private VPC only.
- App and workspace clusters are private GKE clusters.
- Private Google Access is enabled on both subnets.
- Cloud NAT provides controlled egress for nodes without public node IPs.
- Workspace NetworkPolicies deny all by default, allow DNS, allow controlled package registry egress, and block the metadata server plus internal platform ranges.

## Kubernetes

- Workspaces run with `runtimeClassName: gvisor`.
- The workspace node pool enables GKE sandbox with gVisor.
- Workspace pods are non-root, non-privileged, without hostPath, hostNetwork or hostPID.
- Capabilities are dropped and `allowPrivilegeEscalation` is false.
- Pod Security Admission labels enforce the restricted profile.
- Kyverno policies require gVisor, labels, probes, resource limits, and block privileged settings.

## Identity

- Workload Identity is enabled on both clusters.
- Node service accounts are distinct for app and workspace clusters.
- Platform workloads should bind Kubernetes service accounts to dedicated Google service accounts with least privilege.
- Secrets are referenced from Secret Manager and Kubernetes Secrets. Secret values are never committed.

## TLS

- cert-manager uses DNS01 through Cloud DNS.
- App and preview ingress are TLS-only.
- Preview uses wildcard TLS for `*.previewDomain`.

## Cloud Armor

Attach Cloud Armor policies to external HTTP(S) load balancers for:

- OWASP managed WAF rules
- IP reputation filtering
- geo/rate rules if needed by region
- bot and scanner throttling
- request size limits

Keep app-level auth, RBAC and quotas enabled. Cloud Armor is an outer layer, not the source of authorization.
