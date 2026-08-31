{{- define "vibecore-platform.fullname" -}}
{{- printf "%s-%s" .Release.Name .Chart.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- /*
Return the exact browser-origin allowlist consumed by Fastify. An explicit
platformEnv value wins. Otherwise derive HTTPS origins from the chart's public
ingress hosts so this stays safe under `helm upgrade --reuse-values`, where a
new values key is absent from an older stored release.
*/ -}}
{{- define "vibecore-platform.apiCorsOrigins" -}}
{{- if (.Values.platformEnv.apiCorsOrigins | default "") -}}
{{- .Values.platformEnv.apiCorsOrigins -}}
{{- else -}}
{{- $origins := list (printf "https://%s" .Values.global.appDomain) -}}
{{- with .Values.global.marketingDomain -}}
{{- $origins = append $origins (printf "https://%s" .) -}}
{{- if $.Values.global.marketingWwwRedirect -}}
{{- $origins = append $origins (printf "https://www.%s" .) -}}
{{- end -}}
{{- end -}}
{{- join "," $origins -}}
{{- end -}}
{{- end -}}

{{/*
Resolve a container image reference, preferring an immutable digest over a tag.
Production supplies digests from its signed release manifest; tag fallback keeps
staging and first-time local renders usable. Malformed or empty references fail
the render before Kubernetes can receive a mutable or half-resolved image.

Args (dict): registry, image, digest (may be empty), tag (may be empty).
*/}}
{{- define "vibecore-platform.imageRef" -}}
{{- $digest := .digest | default "" | toString -}}
{{- $tag := .tag | default "" | toString -}}
{{- if $digest -}}
{{- if not (regexMatch "^sha256:[0-9a-f]{64}$" $digest) -}}
{{- fail (printf "image digest for %q must be sha256:<64 hex chars>, got %q" .image $digest) -}}
{{- end -}}
{{- printf "%s/%s@%s" .registry .image $digest -}}
{{- else -}}
{{- if not $tag -}}
{{- fail (printf "no imageDigest and no imageTag for %q — refusing to render an image" .image) -}}
{{- end -}}
{{- printf "%s/%s:%s" .registry .image $tag -}}
{{- end -}}
{{- end -}}

{{- define "vibecore-platform.imagePullPolicy" -}}
{{- if .digest -}}IfNotPresent
{{- else if eq (.tag | default "" | toString) "latest" -}}Always
{{- else -}}IfNotPresent
{{- end -}}
{{- end -}}
