# UNK-COLLECTOR-CI-RENDER — RÉSOLU : le rendu JS tourne en CI GitHub (preuve)

**Question** (UNKNOWN_REGISTRY) : « Le rendu JS (playwright) tourne-t-il en CI
GitHub sans blocage bot ? » — **Réponse mesurée : OUI** pour toutes les routes
produit JS, avec une exception documentée (status page).

## Le run CI de preuve

- Workflow : `Parity registries`, job **`JS render smoke`**
- Run : <https://github.com/openaxcloud/vibecore/actions/runs/29716446034>
  (job 88270561124, `pass` en 2m18s, PR #14, commit `4446ae97`)
- Runner : `ubuntu-latest` GitHub-hosted, chromium installé via
  `npx playwright install --with-deps chromium`, Node v22.23.1
- Artefact : `render-smoke-snapshot` (rétention 30 j) — ce dossier en conserve
  les pièces clés de façon durable.
- Verdict du gate dans le log CI :
  `--require-render: all 6 gated rendered sources OK (JS rendering PROVEN in this environment)`

Un premier run identique était déjà vert (job 88269954621) mais son gate ne
prouvait rien : les steps GitHub n'ont pas `pipefail` et le `| tee` avalait
l'exit 2. Corrigé (`set -o pipefail`) + preuve négative locale (exit 2 propagé
avec 6/6 sources gated notOk en `--raw-only`). Le run ci-dessus est donc vert
POUR LA BONNE RAISON.

## Ce que le runner a rendu (hashes du manifest CI, vérifiés contre les fichiers)

| source | sha256 (rendu) | renderedText | marqueurs retrouvés |
|---|---|---|---|
| community | `f4abcbccf8fd96e3…` | 3 808 chars | Community Profiles · Claim your profile · Buildathons |
| **community-hub** | `2da79fbd13d75ea4…` | 4 269 chars | **Power Ranking · streak** · Community Profiles · Claim your profile |
| gallery | `84b317c3a3cab9f1…` | 4 169 chars | Submit your App (+ Typeform `yVYAWg79` dans le HTML) |
| home | `f202755baafaa285…` | 6 122 chars | — |
| pricing | `8e5e3fa9d99c4003…` | 2 725 chars | — |
| blog-rendered | `2933ce96b75e328c…` | 15 600 chars | — |

Pièces dans ce dossier :
- `ci-manifest-2026-07-20.json` — manifest complet produit PAR le runner
  (schemaVersion 3, hashes, robots, WARC sha256
  `f953e1fa08d1da14…`, 26 records).
- `community-hub.rendered.txt` + `community-hub.rendered.jpg` — la page
  cliente JS rendue sur le runner (hash `2da79fbd…` / screenshot
  `b45ccdc2aced…` dans le manifest). C'est la surface qui nous avait rendus
  aveugles (Community Profiles / Power Ranking).
- `ledger-extract.jsonl` — triage daté produit par le run : changelog
  2026-07-10 `eventDate=2026-07-10, detectionDate=2026-07-16,
  detectionGapDays=6, triageState=PENDING, triageDueBy=2026-07-23`,
  `contentHash sha256:010fb57a…` (= hash du OBSERVATION_REGISTRY).
- `collect-smoke-log-extract.txt` — lignes par source du log CI.

## Exception documentée (pas un FAIT silencieux)

`status.replit.com` (Atlassian Statuspage) répond **HTTP 403 aux runners
GitHub même en rendu** (mesuré sur les 2 runs), alors qu'un rendu local passe.
Statut enregistré `BLOCKED` + observation `SOURCE_BLOCKED` à chaque run ;
source `renderGateExempt: true` pour que le gate reste significatif. Pour la
couvrir depuis la CI il faudrait un egress non-datacenter : runner
self-hosted ou API de browser-rendering (décision owner, non prise ici).

## Reproduire

- PR : toute PR touchant `docs/parity/**` / `scripts/parity/**` relance le
  job `render-smoke`.
- Événementiel : `gh api repos/openaxcloud/vibecore/dispatches -f event_type=parity-collect`.
- Local : `node scripts/parity/collect-baseline.mjs --require-render`.
