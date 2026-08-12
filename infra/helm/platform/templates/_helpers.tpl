{{- define "vibecore-platform.fullname" -}}
{{- printf "%s-%s" .Release.Name .Chart.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Resolve a container image reference, preferring an immutable digest over a tag.

Why this exists: a tag is a mutable pointer. `helm upgrade --set imageTag=<sha>`
only asserts *which name* the kubelet should resolve, not *which bytes* it gets —
between the vulnerability gate scanning `api:<sha>` and the kubelet pulling it,
anything with registry write access can move that tag onto different content, and
nothing in the rollout would notice. Deploying by digest makes the reference the
content: the thing that was built, scanned and signed is exactly the thing that
runs, and the post-rollout imageID check can actually prove it.

Tags remain supported so the chart still installs from scratch and so staging /
`helm template` defaults keep working; production supplies digests.

Args (dict): registry, image, digest (may be empty), tag (may be empty).

Fails the render — rather than emitting something plausible — when a digest is
malformed or when neither a digest nor a tag is available. A chart that renders
an unpinned or half-resolved image is how a rollout silently lands on `latest`.
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
{{- fail (printf "no imageDigest and no imageTag for %q — refusing to render an unpinned image" .image) -}}
{{- end -}}
{{- printf "%s/%s:%s" .registry .image $tag -}}
{{- end -}}
{{- end -}}

{{/*
Pull policy that matches the reference kind: a digest is immutable so it never
needs re-pulling, `latest` is mutable so it always does.
*/}}
{{- define "vibecore-platform.imagePullPolicy" -}}
{{- if .digest -}}IfNotPresent
{{- else if eq (.tag | default "" | toString) "latest" -}}Always
{{- else -}}IfNotPresent
{{- end -}}
{{- end -}}
