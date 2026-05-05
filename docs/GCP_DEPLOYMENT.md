# Google Cloud Production Deployment

This deployment targets Google Cloud with private GKE clusters, private Cloud SQL, private Memorystore, private Storage buckets, Cloud DNS, cert-manager DNS01 and workload identity.

## Prerequisites

- Google Cloud project with billing enabled.
- `gcloud`, `terraform >= 1.7`, `helm >= 3.13`, `kubectl`.
- A DNS zone delegated to Cloud DNS for the app domain and preview domain.
- No production secret values stored in git. Put secret values in Secret Manager and mirror only runtime references into Kubernetes.

## Bootstrap

```bash
export PROJECT_ID=vibecore-prod
export REGION=us-central1
export STATE_BUCKET=vibecore-prod-tf-state
infra/gcp/bootstrap.sh
```

Edit `infra/terraform/envs/prod/backend.tf` and replace the backend bucket placeholder with `STATE_BUCKET`.

## Terraform

```bash
cd infra/terraform/envs/prod
cp terraform.tfvars.example terraform.tfvars
$EDITOR terraform.tfvars
terraform init
terraform validate
terraform plan -out tfplan
terraform apply tfplan
```

Use `infra/terraform/envs/staging` for staging. Production and staging state, domains and variables are intentionally separated.

Provisioned resources:

- custom VPC, app subnet, workspaces subnet
- Cloud NAT and Private Google Access
- private GKE app cluster
- private GKE workspaces cluster with gVisor sandbox node pool
- GKE Dataplane V2 and Workload Identity
- Artifact Registry
- Cloud SQL PostgreSQL HA with private IP and PITR backups
- Memorystore Redis HA with private access
- private Cloud Storage buckets with lifecycle policies
- Secret Manager secret placeholders
- Cloud DNS managed zones
- Monitoring uptime check placeholder

## Kubernetes Access

```bash
gcloud container clusters get-credentials vibecore-prod-app --region us-central1 --project vibecore-prod
kubectl apply -f infra/kubernetes/podsecurity/namespaces.yaml
kubectl apply -f infra/kubernetes/networkpolicies/platform-deny-default.yaml

gcloud container clusters get-credentials vibecore-prod-workspaces --region us-central1 --project vibecore-prod
kubectl apply -f infra/kubernetes/podsecurity/namespaces.yaml
kubectl apply -f infra/kubernetes/networkpolicies/workspaces-deny-default.yaml
kubectl apply -f infra/kubernetes/admission-policies/workspace-restricted-policies.yaml
```

## Helm

Install the platform into the app cluster:

```bash
helm dependency update infra/helm/platform
helm template vibecore infra/helm/platform --namespace vibecore --values infra/helm/platform/values.yaml
helm upgrade --install vibecore infra/helm/platform --namespace vibecore --create-namespace --values infra/helm/platform/values.yaml
```

Install the isolated workspaces runtime into the workspaces cluster:

```bash
helm template workspaces infra/helm/workspaces-runtime --namespace workspaces
helm upgrade --install workspaces infra/helm/workspaces-runtime --namespace workspaces --create-namespace
```

## Images

Push images to Artifact Registry:

```bash
gcloud auth configure-docker us-central1-docker.pkg.dev
docker tag vibecore-api us-central1-docker.pkg.dev/PROJECT/vibecore-prod-containers/api:RELEASE
docker push us-central1-docker.pkg.dev/PROJECT/vibecore-prod-containers/api:RELEASE
```

Repeat for `web`, `admin`, `worker`, `ai-gateway`, `workspace-manager`, `workspace-agent` and `preview-proxy`.

## TLS And DNS

- `infra/helm/platform` creates a cert-manager `ClusterIssuer` using Cloud DNS DNS01.
- App ingress terminates TLS for `global.appDomain`.
- Preview ingress terminates wildcard TLS for `*.global.previewDomain`.
- Point DNS records to the ingress load balancer IP after the first install.

## Validation

```bash
terraform -chdir=infra/terraform/envs/prod validate
helm template vibecore infra/helm/platform --namespace vibecore >/tmp/platform.yaml
helm template workspaces infra/helm/workspaces-runtime --namespace workspaces >/tmp/workspaces.yaml
pnpm infra:validate
```
