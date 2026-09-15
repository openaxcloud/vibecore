#!/usr/bin/env bash
# Produces the access sheet handed to the auditor.
#
# Written to infra/terraform/envs/audit-test/credentials/ which is gitignored:
# it contains live test credentials. They protect nothing real and die with the
# project, but they still have no business in a PUBLIC repo (openaxcloud/vibecore
# is public).
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TF_DIR="$REPO/infra/terraform/envs/audit-test"
OUT="$TF_DIR/credentials/TEST_ENV_ACCESS.md"
PROJECT_ID="vibecore-audit-test-20260807"

tf() { terraform -chdir="$TF_DIR" output -raw "$1" 2>/dev/null || echo "(indisponible)"; }

LB_IP="$(kubectl -n ingress-nginx get svc ingress-nginx-controller \
  -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || echo '(non deploye)')"

mkdir -p "$(dirname "$OUT")"
cat > "$OUT" <<EOF
# Environnement de test audit — coordonnées d'accès

> Identifiants de TEST, générés pour cet environnement éphémère.
> Aucun secret de production. Tout disparaît au teardown (TTL 7 jours).
> Ne pas commiter ce fichier — le repo openaxcloud/vibecore est public.

## Projet GCP

| Champ | Valeur |
|---|---|
| Projet | \`$PROJECT_ID\` |
| Région / zone | \`europe-west9\` / \`europe-west9-a\` |
| Console | https://console.cloud.google.com/home/dashboard?project=$PROJECT_ID |

Accès : demander à Avi d'ajouter l'adresse de l'expert en \`roles/viewer\`
(+ \`roles/container.developer\` pour kubectl) sur **ce projet uniquement** :

\`\`\`bash
gcloud projects add-iam-policy-binding $PROJECT_ID \\
  --member="user:EXPERT@EXEMPLE.COM" --role="roles/viewer"
gcloud projects add-iam-policy-binding $PROJECT_ID \\
  --member="user:EXPERT@EXEMPLE.COM" --role="roles/container.developer"
\`\`\`

## Kubernetes

\`\`\`bash
gcloud container clusters get-credentials $(tf cluster_name) \\
  --zone $(tf cluster_zone) --project $PROJECT_ID
\`\`\`

| Champ | Valeur |
|---|---|
| Cluster | \`$(tf cluster_name)\` (zonal, Calico NetworkPolicy, Workload Identity) |
| Pool app | 2× e2-standard-4 |
| Pool sandbox | 1× e2-standard-4, **gVisor** (label \`sandbox.gke.io/runtime=gvisor\`) |
| Namespace plateforme | \`vibecore\` |
| Release Helm | \`vibecore-audit\` (⚠️ la prod s'appelle \`vibecore\` — ne pas confondre) |

## Base de données

| Champ | Valeur |
|---|---|
| Instance | \`$(tf postgres_instance)\` (POSTGRES_16, db-g1-small, ZONAL) |
| IP privée | \`$(tf postgres_private_ip)\` |
| Connection name | \`$(tf postgres_connection_name)\` |
| Base / utilisateur | \`vibecore\` / \`vibecore\` |
| PITR | **activé**, rétention journaux 3 j, 7 sauvegardes |

L'instance n'a **pas d'IP publique** (comme en prod). Y accéder depuis le cluster :

\`\`\`bash
kubectl -n vibecore run psql-audit --rm -it --restart=Never \\
  --image=postgres:16-alpine -- \\
  psql "\$(terraform -chdir=infra/terraform/envs/audit-test output -raw database_url)"
\`\`\`

Le \`DATABASE_URL\` complet (avec mot de passe) est dans \`audit-test.env\`
et dans \`terraform output -raw database_url\`.

## Object storage (GCS)

| Bucket | Usage |
|---|---|
$(for b in snapshots exports deployments backups logs; do echo "| \`$PROJECT_ID-$b\` | $b |"; done)

Versioning activé sur tous (nécessaire aux preuves de restauration).
\`force_destroy=true\` pour que le teardown ne soit pas bloqué par des objets résiduels.

## Endpoints publics

| Rôle | URL |
|---|---|
| IP du load balancer | \`$LB_IP\` |
| Application | https://app.$LB_IP.sslip.io |
| Marketing | https://www.$LB_IP.sslip.io |
| API | https://api.$LB_IP.sslip.io |
| Workspace manager | https://wsm.$LB_IP.sslip.io |
| Preview (gabarit) | https://{workspaceId}-{port}.preview.$LB_IP.sslip.io/ |

DNS via \`sslip.io\` (\`<quoi-que-ce-soit>.<IP>.sslip.io\` → \`<IP>\`) : vrai DNS
public, aucun domaine à acheter. TLS Let's Encrypt **HTTP-01** de confiance sur
les domaines principaux ; le wildcard \`*.preview.*\` est **auto-signé**
(HTTP-01 ne peut pas émettre de wildcard) → lancer Playwright avec
\`ignoreHTTPSErrors: true\` pour les hôtes preview.

## Images

Registry : \`$(tf artifact_registry)\`
Commit construit : voir \`global.imageTag\` de la release Helm.

## Coût et TTL

Budget 200 EUR sur ce seul projet, alertes 50/90/100 %. Un budget **alerte**,
il ne coupe pas : le garde-fou réel est le teardown.

\`\`\`bash
./scripts/audit-env/down.sh    # destroy + suppression du projet + VERIFICATION
\`\`\`

## Ce qui reste BLOCKED

Stripe, OAuth Google/GitHub, clés LLM et Resend ne sont **pas** configurés
(choix « secrets internes uniquement »). Les scénarios facturation, connexion
OAuth et agent IA restent non prouvables tant qu'Avi n'a pas fourni des
identifiants de test dédiés. Voir §5 de \`docs/audit/TEST_ENV_RUNBOOK.md\`.
EOF

chmod 600 "$OUT"
echo "==> fiche generee: $OUT"
