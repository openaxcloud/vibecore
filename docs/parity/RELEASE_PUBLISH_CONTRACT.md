# RELEASE_PUBLISH_CONTRACT — Publish → Release (audit v4 I)

schemaVersion: 1
repoCommit: ca299f87
reviewer: UNKNOWN
reviewVerdict: REFUSED — 0/14 contrats signés (lot 57febeab, OpenAI-Codex, 2026-07-20)
refusalReason: pas de ReleaseCatalog/Manifest persistant ni UI live (verbatim relecteur, transmis 20/07)
reviewCloseCriterion: corriger — pas de ReleaseCatalog/Manifest persistant ni UI live — puis re-soumettre à signature

Contrat de la publication d'un projet. Complète DOMAIN_MODEL §5 (ReleaseCatalog,
Promotion→Release) et la machine à états `PROMOTION_PREPARED→…→PROMOTION_COMMITTED`
(`services/api/src/lifecycle-state-machines.ts`).

## Mécanisme réel (prouvé live, cf. mémoire server-deploy snapshot-image)

- **Publish server** : snapshot complet du workspace → PUT signé (GCS) → Cloud
  Build (Dockerfile générique) → image dans AR `vibecore-prod-apps` →
  `serverAppDeployment` lance l'image. `.ecode/deploy.json` `run` gagne (zéro code
  par langage). Cold boot mesuré 22/23s (< 30s), image 163/168 MB.
- **Publish static** (`NOT_STATIC_SITE` sinon) : artefact statique servi sur
  `/static-deployments/:id/*` (CSP sandbox + CORP cross-origin + ACAO:* sur cette
  route uniquement — isolation préservée).
- Build en sandbox JETABLE `.vibecore-deploy-<id>` (n'altère jamais le workspace).

## Invariants

- **I-PUB-1** : Publish n'altère jamais le workspace source (build isolé, torn
  down après). Certifié live (react-dom reste 18.3.1, sandbox détruite, /health 200).
- **I-PUB-2** : une release n'est tirée que d'une promotion `PROMOTION_COMMITTED`
  (I-PROMO-STATE-1) ; une publication incomplète est nettoyée, jamais servie.
- **I-PUB-3** : le `ReleaseCatalog` est suffisant pour re-déployer même si la
  révision runtime a disparu (I-REL-1) ; le rollback re-déploie une IMAGE et ne
  suppose jamais la DB inversée (I-REL-2).
- **I-PUB-4** : l'accès de l'app publiée est porté par `accessPolicyVersion`
  (AUTH_ACCESS_CONTRACT) — fail-closed sur mode inconnu.

## Rollback — écart MESURÉ (audit v4, vertical rollback)

**Constat mesuré 16/07 (code lu, pas de mémoire)** : pour un déploiement
`provider='server'`, le handler `POST /projects/:id/deployments/:id/rollback`
**recopie l'URL/metadata** du déploiement précédent dans une nouvelle ligne
`READY` et **ne re-déploie AUCUNE image** (`willTriggerProviderRollback=false`
pour server). Il n'existe **ni table `ReleaseCatalog` ni digest d'image persisté**
sur `Deployment`. Donc si la révision/l'image sous-jacente a disparu, l'URL
« rollbackée » est **morte** : I-REL-1 est **non tenu** pour les server deploys.
Un rollback réel n'a jamais été possible, encore moins prouvé.

**Correctif — mécanisme + câblage (prouvés)** :
- `services/api/src/release-rollback.ts` (pur) : `resolveRollbackImage()` dérive
  le plan **entièrement du digest retenu** (résout v1 même si la révision courante
  est supprimée, I-REL-1) et **REFUSE** un rollback sans digest
  (`ROLLBACK_NO_RETAINED_DIGEST`) ; `resolveRollbackSecrets()` applique la policy
  déclarée (CURRENT flux la valeur rotée ; PINNED sans snapshot →
  `ROLLBACK_SECRET_POLICY_UNSATISFIABLE`, jamais faussé). 10 tests.
- **Câblage `app.ts`** : le build persiste `imageRef@sha256` dans
  `metadata.serverDeploy.image` ; le handler rollback (flag
  `SERVER_DEPLOY_ROLLBACK_FROM_DIGEST=1`) re-déploie ce digest via
  `startServerDeploymentViaManager`. **Prouvé au niveau handler** :
  `deployment-rollback-digest.spec.ts` (endpoint réel + manager mocké) — 4 tests :
  re-déploie par digest, refuse sans digest (409), refuse PINNED sans snapshot
  (409), providers externes intacts.

**PROUVÉ LIVE (E2E-VERTICAL-ROLLBACK, 2026-07-17, api `ec0ad6bd3e`)** : déployé
v1 (digest 657271c5, sert « v1 ») → v2 (digest 2eb96530, sert « v2 ») →
**supprimé la révision de v1** (`kubectl delete deploy app-<v1>`, URL v1 = HTTP
410) → rollback → NOUVeau déploiement `app-<rb>` **pull-by-digest**
`p-…@sha256:657271c5` ready 1/1, `rolledBackFromDigest=657271c5`,
`secretPolicy=CURRENT`, **sert « ROLLBACK-PROOF v1 »** — ressuscité du digest après
suppression de la révision. Les 2 négatifs live : sans digest → 409
`ROLLBACK_NO_RETAINED_DIGEST` ; PINNED sans snapshot → 409
`ROLLBACK_SECRET_POLICY_UNSATISFIABLE`. Artefacts :
`docs/deploy-evidence/2026-07-17-rollback/`.

**Bug prod attrapé par la preuve live** (que le test handler n'a pas vu, `TestApiStore`
ne modélise pas le garde monotone) : la ligne de rollback était créée `READY`
(terminal) ⇒ `updateDeployment` du re-déploiement silencieusement ignoré ⇒ vieux
chemin URL-copie. Fix `ec0ad6bd` : ligne créée NON-terminale (`QUEUED`) sur le
chemin digest-rollback. Le stage `rollback` du vertical d'approbation est **GREEN**.

🟡 Permanence du flag : `SERVER_DEPLOY_ROLLBACK_FROM_DIGEST=1` est activé sur l'api
(kubectl-set) ; pour du permanent → `values-prod.yaml` (décision : ON change le
rollback des déploiements SANS digest en 409 — cf. `UNK-ROLLBACK-FLAG-PERMANENCE`).

## Preuves

- E2E-PHASEB-NODE (PROVEN, vertical: publish) — Publish Node → URL 200,
  artefact rejouable, 62s.
- 🟡 Promotion réelle contre AR live (referrers) = follow-up (UNK-AR-LIVE-PROMOTION).
- ✅ E2E-VERTICAL-ROLLBACK (PROVEN, vertical: rollback) — v1 ressuscité du digest
  après suppression de la révision + 2 négatifs 409. `docs/deploy-evidence/2026-07-17-rollback/`.
