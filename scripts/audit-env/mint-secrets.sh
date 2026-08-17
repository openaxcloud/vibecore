#!/usr/bin/env bash
# Generates the platform secret for the audit test environment.
#
# GUARDRAIL: every value here is generated fresh on this machine. Nothing is
# read from the production project, from Secret Manager, or from any prod
# cluster. The third-party keys (Stripe, OAuth, LLM providers) are deliberately
# absent — see docs/audit/TEST_ENV_RUNBOOK.md for the scenarios that stay
# BLOCKED as a result.
set -euo pipefail

NS="${NS:-vibecore}"
RELEASE="${RELEASE:-vibecore}"
SECRET_NAME="${SECRET_NAME:-vibecore-platform-secrets}"
# Overridable: the Terraform state of an env provisioned earlier may live outside
# the checkout this script is being run from (a git worktree, say).
TF_DIR="${TF_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../infra/terraform/envs/audit-test" && pwd)}"
OUT_DIR="${OUT_DIR:-$TF_DIR/credentials}"
# shellcheck source=scripts/audit-env/lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

# Epingle la cible AVANT toute chose : neutralise HELM_KUBECONTEXT & co, derive le
# contexte depuis les constantes epinglees, et arme audit_helm/audit_kubectl.
audit_env_pin_cluster_target

# Fail-closed AVANT de générer quoi que ce soit : ce script REMPLACE le Secret
# de la plateforme (`kubectl apply`). L'ancienne garde ne refusait qu'un nom de
# contexte contenant « vibecore-prod » ; un simple `kubectl config
# rename-context` la contournait et le Secret de PRODUCTION était écrasé par
# des valeurs de test — soit une panne totale (JWT/cookies/chiffrement rotés).
# On exige désormais la preuve que le contexte dial bien le cluster d'audit.
audit_env_require_audit_cluster

rnd() { openssl rand -hex 32; }

DATABASE_URL="$(audit_terraform -chdir="$TF_DIR" output -raw database_url)"
REDIS_URL="redis://vibecore-redis.${NS}.svc.cluster.local:6379"

# API_CORS_ORIGINS n'est PLUS mint ici : le chart le rend desormais dans son
# ConfigMap, derive de global.appDomain / global.marketingDomain. Il etait absent
# du chart, pose hors-bande en prod, et l'api est fail-closed dessus — une
# installation a neuf partait donc en CrashLoopBackOff. Un secret genere ici
# n'aurait repare que cet environnement ; la clef doit venir du chart pour que
# n'importe quelle installation (reprise apres sinistre incluse) tienne debout.

mkdir -p "$OUT_DIR"
chmod 700 "$OUT_DIR"
ENV_FILE="$OUT_DIR/audit-test.env"

# Delimiteur NON quote, deliberement : ce heredoc doit interpoler $DATABASE_URL et
# les $(rnd). Consequence a ne pas oublier — TOUT ce qu'il contient est evalue, y
# compris dans les lignes de COMMENTAIRE. Une paire de backticks autour de
# `vc_preview` executait donc `vc_preview` (bash: command not found), et le nom
# disparaissait du fichier genere. D'ou les guillemets simples ci-dessous : SC2006
# reste ainsi vert, et la prochaine occurrence sera refusee par la CI.
cat > "$ENV_FILE" <<EOF
# Audit test environment — GENERATED TEST CREDENTIALS, not production.
# Regenerate at will: these protect nothing real and expire with the project.
DATABASE_URL=$DATABASE_URL
REDIS_URL=$REDIS_URL
JWT_SECRET=$(rnd)
COOKIE_SECRET=$(rnd)
CONFIG_ENCRYPTION_KEY=$(rnd)
WORKSPACE_AGENT_TOKEN_SECRET=$(rnd)
BACKUP_ENCRYPTION_KEY=$(rnd)
SIEM_SIGNING_SECRET=$(rnd)
PREVIEW_PROXY_SHARED_SECRET=$(rnd)
# HMAC du cookie 'vc_preview'. Requis des que l'isolation preview est enforcee
# (values-audit-test.yaml : platformEnv.preview.*) — le preview-proxy REFUSE de
# demarrer sans lui, et l'app ne peut pas signer le cookie sans lui non plus.
PREVIEW_TENANT_SECRET=$(rnd)
WORKSPACE_MANAGER_SHARED_SECRET=$(rnd)
EMAIL_HTTP_TOKEN=$(rnd)
# Porteur exige par /capture du screenshotter. Le service REFUSE de demarrer sans
# lui : cette route rend une URL arbitraire en portant le jeton tenant recu, donc un
# renderer non authentifie serait un SSRF avec autorisation en prime.
SCREENSHOTTER_SHARED_SECRET=$(rnd)
EOF
chmod 600 "$ENV_FILE"

audit_env_ensure_namespace "$NS" "$RELEASE"
# Les DEUX cotes du tube passent par l'enveloppe. Le `| kubectl apply` etait le
# plus dangereux appel nu de tout le repo : c'est celui qui ECRIT le Secret de la
# plateforme, et il etait sur une ligne de continuation — donc invisible a un
# survol du debut de ligne. C'est pour ce genre d'oubli que
# scripts/audit-env/check-pinned-context.mjs existe.
audit_kubectl -n "$NS" create secret generic "$SECRET_NAME" \
  --from-env-file="$ENV_FILE" \
  --dry-run=client -o yaml | audit_kubectl apply -f -

echo "==> secret $NS/$SECRET_NAME applique ($(grep -c '=' "$ENV_FILE") cles)"
echo "==> valeurs en clair: $ENV_FILE (chmod 600, gitignore)"
