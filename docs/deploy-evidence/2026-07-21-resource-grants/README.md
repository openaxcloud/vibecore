# AccessGrants ARTIFACT / DEPLOYMENT / DATASET — enforcement prouvé (2026-07-21)

Complète le lot [`2026-07-21-identity-collaboration/`](../2026-07-21-identity-collaboration/)
(P0-EX-07) : la ligne « Pas fait » « enforcement grants sur
ARTIFACT/DEPLOYMENT/DATASET (modèle prêt) » est maintenant CODÉE et PROUVÉE.
État : **PROVEN_REVIEW_PENDING** — rien de CLOSED.

## Ce qui est ajouté

- **Résolveur partagé `resourceAccessRole`** (`services/api/src/resource-access.ts`) :
  le SEUL endroit qui décide quel rôle un AccessGrant confère sur une ressource
  typée — direct + via groupes, résolu à CHAQUE requête (jamais de cache),
  expiré/révoqué ⇒ rien, grant d'une autre org ⇒ rien. La partie « grants » de
  `projectCollaborationRole` (app.ts) est déléguée ici — pas de duplication.
- **`requireProjectResource`** (`app.ts`) : quand `requireProject` refuse pour
  « pas membre » (ORG_NOT_FOUND) ou « rôle sans la permission »
  (RBAC_FORBIDDEN), un grant ACTIF visant EXACTEMENT la ressource ouvre
  l'accès — à CETTE ressource seule, jamais au projet parent ni aux sœurs.
  Élévation bornée aux permissions du rôle accordé ; rôle read-only
  (viewer/guest) + écriture ⇒ **403 `PROJECT_ROLE_READ_ONLY`** ; sans grant ⇒
  l'erreur d'origine (404 anti-énumération pour un outsider). Un grant de
  ressource n'outrepasse JAMAIS un plafond read-only posé au niveau projet.
- **Routes câblées** :
  - DEPLOYMENT : `GET/POST /projects/:id/deployments/:deploymentId`
    (+ `/logs`, `/logs/stream`, `/cancel`, `/publish`, `/redeploy`, `/rollback`) ;
  - ARTIFACT (= ProjectSnapshot) :
    `/projects/:id/snapshots/:snapshotId/restore-preview` et `/restore` ;
  - DATASET (= instance de base managée) : `GET /projects/:id/database`,
    `/database/recovery-points`, `POST /database/restores`, `/database/snapshots`,
    `/database/restore` (flag `DB_ROLLBACK_ENABLED`).
- **Gestion** : `POST /projects/:id/access-grants` accepte
  `resourceType` (`PROJECT` défaut | `ARTIFACT` | `DEPLOYMENT` | `DATASET`) +
  `resourceId`, avec **liaison ressource↔projet vérifiée serveur-side**
  (ressource d'un autre projet ⇒ 404 `RESOURCE_NOT_FOUND`). `GET` liste par
  ressource (`?resourceType=&resourceId=`), `DELETE` révoque avec la même
  vérification de liaison + org.

## Preuves

### 12/12 specs vitest (négatifs d'abord), zéro régression
`resource-access-grants.spec.ts` (12 nouveaux) ; suite api complète verte :
**151 fichiers / 1211 tests passés, 0 échec** (dont les 15 identité/collab
préexistants inchangés). Typecheck strict CI-équivalent (`tsc --strict
src/server.ts`) : exit 0.

### Rejoué contre le VRAI store Prisma + vrai Postgres (`proof-run.jsonl`)
Harness committé `src/tests/resource-grants-live-proof.ts` (`LIVE_PROOF=1`,
DB `resource_grants_proof`, Postgres 16 (pgvector) jetable en Docker,
migrations 0001→0080 réellement appliquées). Huit checks, chacun = appels HTTP
réels sur `buildApiApp` + lignes DB réelles :

| # | Check (contrat) | Observé |
|---|---|---|
| R1 | Grant DEPLOYMENT = SA ressource seule | accordée **200** ; sœur **404** ; projet parent **404** ; liste **404** |
| R2 | Grant expiré | **404** (ne confère rien) |
| R3 | Permission retirée | **200 avant → révocation → même appel 404** ; ligne DB `revokedAt`+`revokedByUserId` posés |
| R4 | Cross-tenant (grant forgé autre org) | **404** |
| R5 | Guest via grant | lecture **200** ; écriture **403 `PROJECT_ROLE_READ_ONLY`** |
| R6 | Élévation bornée (membre org viewer + grant editor) | écrit SA ressource **200** ; sœur **403** |
| R7 | Liaison ressource↔projet à la création | **404 `RESOURCE_NOT_FOUND`** |
| R8 | DATASET | sans grant **404** ; panneau **200** ; écriture **403** |

## Décisions de sémantique (consignées)

- ARTIFACT = `ProjectSnapshot`, DEPLOYMENT = `Deployment`, DATASET = instance
  de base managée (`DatabaseInstance`, routes `/database*`) — les surfaces
  par-ressource réelles du produit aujourd'hui.
- Les routes AGRÉGÉES restent projet-scopées : la liste des deployments/
  snapshots et le pane SQL multi-connexions (`/projects/:id/databases*`, qui
  agrège des connexions arbitraires, pas UNE ressource) ne s'ouvrent pas par
  grant de ressource — c'est le négatif « pas les sœurs », pas un manque.
- Un plafond read-only par-projet (collaborateur/grant PROJECT viewer/guest)
  n'est jamais outrepassé par un grant de ressource (le fallback ne s'applique
  pas à `PROJECT_ROLE_READ_ONLY`).

## Reproduire

```bash
docker run -d --name pg-resource-proof -p 5433:5432 \
  -e POSTGRES_PASSWORD=test pgvector/pgvector:pg16
docker exec pg-resource-proof psql -U postgres -c "CREATE DATABASE resource_grants_proof;"
cd packages/database && DATABASE_URL=postgresql://postgres:test@localhost:5433/resource_grants_proof \
  npx prisma migrate deploy
cd services/api && LIVE_PROOF=1 \
  DATABASE_URL=postgresql://postgres:test@localhost:5433/resource_grants_proof \
  PROOF_EVIDENCE_FILE=../../docs/deploy-evidence/2026-07-21-resource-grants/proof-run.jsonl \
  npx tsx src/tests/resource-grants-live-proof.ts
```
