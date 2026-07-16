# EVIDENCE_ARTIFACT_CONTRACT — magasin d'artefacts de preuve (audit v4 I)

schemaVersion: 1
repoCommit: ca299f87

Contrat du magasin d'`EvidenceArtifact` : les artefacts BRUTS qui étayent une
preuve e2e. Un `evidenceId` dans `E2E_PROOFS.yaml` pointe une entrée de ce
magasin.

## Entité `EvidenceArtifact`

| champ | rôle |
|---|---|
| `evidenceId` | chemin repo-relatif du dossier d'artefacts (ex. `docs/deploy-evidence/2026-07-16-agent-modes/`) |
| `kind` | screenshot \| log \| trace \| json \| har \| video |
| `capturedAt` | ISO 8601 |
| `capturedBy` | qui/quoi a produit l'artefact (session, CI) |
| `contentHash` | sha256 de l'artefact (immuabilité) |
| `rawImmutable` | true — l'artefact brut n'est jamais réécrit |

## Invariants

- **I-EVD-1 (brut & committé)** : un `EvidenceArtifact` est un fichier BRUT
  committé dans le repo — jamais un résumé rédigé. Une preuve sans artefact brut
  n'est pas PROVEN.
- **I-EVD-2 (résolvable)** : tout `evidenceId` d'une preuve `PROVEN` DOIT exister
  sur disque — enforced par le validateur (`orphan evidenceId` → cond. 3 de
  l'algorithme d'approbation, et §10 « PROVEN needs evidence »).
- **I-EVD-3 (immuable)** : un artefact brut n'est jamais muté a posteriori ; une
  correction = un NOUVEL artefact daté, pas une réécriture.

## État

Le magasin existe déjà de facto sous `docs/deploy-evidence/*` et
`docs/parity/baseline/*`, référencé par `E2E_PROOFS.yaml`. Ce contrat le
formalise. 🟡 Le champ `contentHash` par artefact n'est pas encore systématique
(les snapshots baseline le portent ; les deploy-evidence non) — follow-up.
