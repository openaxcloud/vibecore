# Rejeu chaos pod-kill — 2026-07-22 (EVID-DR-CHAOS-002)

Le log du 21/07 (90/90) cité par le commit initial n'a jamais atteint l'arbre
(`.gitignore *.log`, réserve expert n°5). Exercice REJOUÉ intégralement :

- 06:18:20Z : kill du pod `vibecore-vibecore-platform-api-cdc4ff449-84c6m`
  (1 des pods Running) pendant une sonde externe GET /health à 1 Hz, 90 s.
- Résultat : **90/90 HTTP 200** (`chaos-probe-podkill-replay-20260722.log`),
  pod remplaçant Running en ~2 min (`-meta.txt`).
- Repro (one-liner) :
  `for i in $(seq 1 90); do curl -s -o /dev/null -w '%{http_code}\n' https://api.e-code.ai/health; sleep 1; done` + `kubectl -n vibecore delete pod <un pod api>`.
