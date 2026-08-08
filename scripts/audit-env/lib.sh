#!/usr/bin/env bash
# Helpers shared by the audit-env scripts. Sourced, never executed.

# Create the platform namespace so that the LATER `helm install` ADOPTS it
# instead of refusing to run.
#
# The namespace has to exist before helm is invoked: helm stores the release
# Secret in it, and the chart's pre-install hooks (the Prisma migration Job) are
# created in it too. But the chart ALSO templates the Namespace object — so if
# the namespace is created here as a plain `kubectl apply`, helm sees an existing
# object it does not own and aborts the whole install with
#   Unable to continue with install: Namespace "vibecore" in namespace ""
#   exists and cannot be imported into the current release: invalid ownership
#   metadata; label validation error: missing key
#   "app.kubernetes.io/managed-by": must be set to "Helm"; annotation validation
#   error: missing key "meta.helm.sh/release-name" ...
# (constaté en réel sur le cluster de test d'audit, 2026-08-07).
#
# Stamping helm's three ownership markers up front is helm's documented adoption
# path: the install then takes the namespace over and reconciles it to the
# chart's version, Pod Security labels included. `--create-namespace` is NOT a
# substitute — it creates the namespace WITHOUT these markers, so it hits the
# very same error.
audit_env_ensure_namespace() {
  local ns="${1:?namespace}"
  local release="${2:?helm release name}"
  kubectl apply -f - <<YAML
apiVersion: v1
kind: Namespace
metadata:
  name: ${ns}
  labels:
    app.kubernetes.io/managed-by: Helm
  annotations:
    meta.helm.sh/release-name: ${release}
    meta.helm.sh/release-namespace: ${ns}
YAML
}
