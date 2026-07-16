# EDGE_CONTRACT — bordure réseau, ingress & en-têtes (audit v4 I)

schemaVersion: 1
repoCommit: ca299f87

Contrat de la couche edge : ingress, TLS, en-têtes de sécurité, preview proxy.

## Faits (cf. mémoire prod-infra + deploy-blank-page + preview-embed)

- Ingress = **ingress-nginx**, LB `34.1.6.93`, DNS direct Cloud DNS (`e-code.ai`),
  **pas de CDN**. Cluster `vibecore-prod-app` (europe-west9).
- Cookie d'auth sur `app.e-code.ai` uniquement → les panels IDE passent par le
  proxy same-domain `/api/…/ide-panel/:panel`, pas `api.e-code.ai`.
- **Preview** : le proxy ajoute l'IP pod IPv4 comme candidat (gVisor sans IPv6
  loopback) ; en-têtes ajustés pour l'iframe (COEP/CORP + assets root-relative).
- **Static deployments** : `/static-deployments/:id/*` = CSP `sandbox` (origine
  opaque) + CORP `cross-origin` + `ACAO:*` sur CETTE route uniquement (le bundle
  de l'app se charge, isolation préservée).

## Invariants

- **I-EDGE-1 (isolation par route)** : les assouplissements CORP/ACAO sont
  scoperoutés à la route de déploiement statique ; jamais globaux.
- **I-EDGE-2 (fail-closed cross-domain)** : une requête cross-domain non prévue
  (auth cookie absent) échoue proprement, pas de fuite de session.
- **I-EDGE-3 (pas de secret en query)** : jamais de données sensibles en query
  string à la bordure.
- **I-EDGE-4 (WS keep-alive)** : ping serveur /15s pour survivre au timeout LB
  ~30s (terminal/preview WebSocket).

## 🟡

Contrat documentaire ; l'audit exhaustif des en-têtes par route = follow-up.
