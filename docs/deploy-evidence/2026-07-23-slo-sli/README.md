# SLO web + SLI par requête — obligations fermées (2026-07-23)

Réponse à la réserve V3 §B n°1 (« SLO web / SLI par requête encore ouverts »).
Prouvé en réel, IaC + live, sans casser la prod (tout est additif).

## EVID-DR-SLO-WEB-001 — SLO web `e-code.ai`

- Terraform : `google_monitoring_uptime_check_config.web_health` +
  `google_monitoring_alert_policy.web_uptime_failed` (module monitoring),
  host via `var.web_host` avec **validation anti-placeholder**.
- Live : check créé (`vibecore-prod-web-health-e-code-ai`), mesuré
  **702/702 points True sur 20 min** (`web-uptime-live.txt`).

## EVID-DR-SLI-001 — SLI par requête (Managed Prometheus)

- Source : l'API expose déjà `api_request_duration_seconds` (histogramme par
  requête, labels method/route/status) sur `:3001/metrics`. Pas de code à
  changer.
- IaC : `templates/podmonitoring-api.yaml` (PodMonitoring GMP + NetworkPolicy),
  gate `observability.apiRequestMetrics.enabled`.
- Piège Dataplane V2 (Cilium) résolu : le collecteur GMP est hostNetwork →
  identité `host`, qu'un `ipBlock` CIDR ne matche PAS. Autorisation par
  `namespaceSelector: gmp-system` requise. **Prouvé** : `ipBlock` seul ⇒
  `up=0` ; `+ namespaceSelector` ⇒ `up=1` (`sli-per-request-live.txt`).
- SLI vivant : ratio succès 1.0, p95 ~0,022 s, routes ventilées.
- Alerte : policy PromQL sur l'error budget 5xx (> 0,5 % / 5 min) → email réel.

## Repro

```bash
# up du scrape
TOKEN=$(gcloud auth print-access-token)
curl -s -G ".../location/global/prometheus/api/v1/query" -H "Authorization: Bearer $TOKEN" \
  --data-urlencode 'query=up{job="vibecore-vibecore-platform-api-requests"}'
# SLI succès par requête
curl ... --data-urlencode 'query=sum(rate(api_request_duration_seconds_count{status!~"5.."}[5m]))/sum(rate(api_request_duration_seconds_count[5m]))'
# web check
curl ... timeSeries?filter=...uptime_check/check_passed AND resource.labels.host="e-code.ai"
```
