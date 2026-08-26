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
