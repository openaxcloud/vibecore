# PROJECT_FACTORY_CONTRACT — création & provisioning de projet (audit v4 I)

schemaVersion: 1
repoCommit: ca299f87
reviewer: UNKNOWN
reviewVerdict: REFUSED — 0/14 contrats signés (lot 57febeab, OpenAI-Codex, 2026-07-20)
refusalReason: couvre pod/PVC pas la factory tenant GCP (verbatim relecteur, transmis 20/07)
reviewCloseCriterion: corriger — couvre pod/PVC pas la factory tenant GCP — puis re-soumettre à signature

Contrat de la fabrique de projets : de `POST /projects` au workspace exécutable.

## Mécanisme réel (prouvé live, cf. mémoire workspace-no-reprovision)

- Création → `POST /workspaces` provisionne un pod + PVC (100 Gi) sur le pool
  `sandbox-gvisor` (gVisor). Provision ~6s sur capacité chaude ; cold-start pod
  ~17s chaud (1–2 min = scale-up + pull image + boot dev-server).
- Le client s'auto-répare : l'adapter `#request` reprovisionne UNE fois (dédupé)
  sur échec de sous-route agent + retry ; `restartWorkspace` provisionne s'il n'y
  a pas de pod. Ne jamais marteler `/files` sans avoir appelé `POST /workspaces`.
- Grâce unschedulable portée à 150s (autoscale gVisor), readiness 240s.

## Invariants

- **I-FACT-1 (idempotence)** : une création dédupée ne crée jamais deux pods/PVC
  pour le même projet ; DB `running` sans pod ⇒ reprovision, pas doublon.
- **I-FACT-2 (PVC réattaché sans réinstall)** : réouverture = réattache le PVC
  existant, jamais de `node_modules` réinstallé (certifié : `.git`/`node_modules`
  exclus de `listTree`/`SNAPSHOT_IGNORED_DIRS`, pas d'effacement).
- **I-FACT-3 (cold-start borné)** : provisioning au-delà de la grâce → 425 (retry),
  jamais un 502 silencieux (`agentMutateEnsuring`).

## 🟡 / preuves

- E2E de bout en bout (create) = 🟡 non taggé dans le vertical d'approbation
  (stage `create` red). Le mécanisme est certifié live en mémoire mais pas encore
  cité comme preuve e2e formelle ici — follow-up (tag un proof `vertical: create`).
