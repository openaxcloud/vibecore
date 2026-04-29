# Workspace Agent API

`workspace-agent` écoute sur le port `8080` dans chaque Pod workspace. Toutes les routes sauf `GET /health` exigent `Authorization: Bearer <token>` avec un token signé court terme.

## Health

- `GET /health`

Retourne l'état de l'agent et le workspace root configuré.

## Files

- `GET /files/tree`
- `GET /files/read?path=<path>`
- `POST /files/write` avec `{ "path": "...", "content": "..." }`
- `POST /files/create` avec `{ "path": "...", "content": "...", "directory": false }`
- `POST /files/delete` avec `{ "path": "..." }`
- `POST /files/rename` avec `{ "from": "...", "to": "..." }`

Tous les chemins sont résolus sous `/workspace`; les traversals hors workspace sont rejetés.

## Patch

- `POST /patch/apply` avec `{ "files": [{ "path": "...", "content": "..." }] }`

Cette première version applique des changements de fichiers complets. Les patchs diff plus fins peuvent être ajoutés derrière la même route sans changer le contrat client.

## Commands

- `POST /commands/run` avec `{ "command": "node", "args": ["-v"], "timeoutMs": 30000 }`

Les commandes tournent avec `cwd=/workspace`, sans shell implicite, avec timeout, limite de sortie et limite de processus.

## Terminal

- `WS /terminal`

Le WebSocket est présent pour l'intégration RuntimeAdapter/Terminal. La version actuelle établit le canal et renvoie les entrées; l'attachement à un PTY complet doit être ajouté avec une dépendance type `node-pty` dans l'image agent.

## Processes

- `GET /processes`
- `POST /processes/:id/kill`

Expose les processus suivis par l'agent et permet leur arrêt.

## Ports

- `GET /ports`

Retourne les ports détectés à partir des commandes suivies. Le `preview-proxy` consommera cette information pour construire les routes preview.

## Snapshots

- `POST /snapshots/create`
- `POST /snapshots/restore` avec `{ "files": [{ "path": "...", "content": "..." }] }`

La création retourne un inventaire avec hashes. Le stockage durable des snapshots reste la responsabilité du manager/API/S3.

## Metrics

- `GET /metrics`

Retourne les compteurs locaux agent: processus, limites de fichiers et limites de sortie.
