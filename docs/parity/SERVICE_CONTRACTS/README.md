# SERVICE_CONTRACTS — contrats de service (OpenAPI/AsyncAPI)

schemaVersion: 1
repoCommit: fee92bd0b09159247383814023ae63db8875dd7d

Index des contrats. Un service sans contrat écrit est listé status: UNKNOWN —
un contrat manquant est un manque avoué, pas un contrat implicite.

| service | contrat | authn/authz | idempotency | errors | rate limits | SLO | events | ownership |
|---|---|---|---|---|---|---|---|---|
| api (agent routing) | agent-routing.openapi.yaml | session Bearer/cookie; admin: platformAdmin+reauth | GET idempotents; POST /admin/agent-routing = INSERT versionné (rejouer crée v+1 — PAS idempotent, à corriger si besoin) | codes structurés (AGENT_*) | mutations admin: 30/min (ADMIN_RATE_LIMIT_MAX) | UNKNOWN (pas de SLO formel) | AuditLog admin.agent-routing.publish | plateforme (owner: UNKNOWN) |
| api (reste: ~500 routes app.ts) | UNKNOWN — non contractualisé | session/Bearer | UNKNOWN | partiel | partiel | UNKNOWN | AuditLog/AdminAuditLog | UNKNOWN |
| ai-gateway | UNKNOWN — non contractualisé | AI_GATEWAY_SHARED_SECRET optionnel | UNKNOWN | AI_MODEL_PLAN_BLOCKED 403 | UNKNOWN | UNKNOWN | usage chunks | UNKNOWN |
| workspace-manager | UNKNOWN — non contractualisé | shared secret | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |
