# RELEASE_PUBLISH_CONTRACT — Publish → Release (audit v4 I)

contractId: CTR-RELEASE-PUBLISH
contractVersion: 3
schemaVersion: 3
repoCommit: 5a084101
reviewer: UNKNOWN
expectedReviewer: OpenAI-Codex
signatureResult: PROVEN_REVIEW_PENDING   # v1 REFUSED (« pas de ReleaseCatalog/Manifest persistant ni UI live ») → v2 PENDING (chantier déclaré ouvert) → v3 : ReleaseCatalog PERSISTANT implémenté + prouvé (tests rejouables verts) ; preuve UI live = après déploiement de la branche (gate D6)
implementationAnchor: "Publish→image signée→AR→serverAppDeployment PROUVÉ live (2026-07-15, cold 22s) ; rollback PAR DIGEST post-suppression PROUVÉ live (I-REL-1, vertical 7/7) ; machine PROMOTION_* dans lifecycle-state-machines.ts ; ReleaseCatalog PERSISTANT = IMPLÉMENTÉ (table ReleaseCatalogEntry mig 0079 + endpoints history/redeploy, branche feat/release-catalog-persistent, 5 tests + build strict verts) — la refus v1 est LEVÉE ; preuve UI live rejouable après déploiement de la branche"

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

## Préconditions
- P-REL-1 : une release référence une image par DIGEST (jamais un tag mutable) ; le digest est persisté (imageRef@sha256).
- P-REL-2 : la promotion suit la machine PROMOTION_PREPARED→…→PROMOTION_COMMITTED — pas de raccourci.

## Invariants
- I-REL-1 : le rollback re-déploie l'image par digest MÊME après suppression de la révision source (PROUVÉ prod).
- I-REL-2 : un déploiement FAILED n'écrase jamais la release courante (états honnêtes, fix false-FAILED b3ba27d8).

## Tests négatifs
- rollback après suppression de révision → sert le digest persisté (prouvé) ; quota à 0 → refus propre (QuotaOverride requis, prouvé) ; publish sans digest → refus.

## Compatibilité
- Deploys statiques historiques inchangés ; snapshot-image derrière SERVER_DEPLOY_SNAPSHOT_IMAGE.

## ReleaseCatalog PERSISTANT (v3 — la refus v1 est LEVÉE)

Le motif du refus v1 (« pas de ReleaseCatalog/Manifest persistant ni UI live ») est
traité. Le `ReleaseCatalog` n'est plus une identité éparpillée dans
`Deployment.metadata.serverDeploy.image` ni une interface `ReleaseManifest`
seulement en mémoire : c'est une **table de premier ordre**, source de vérité des
releases.

- **Table `ReleaseCatalogEntry`** (migration `0079_release_catalog`). Chaque
  publish server réussi ajoute UNE entrée **immuable** épinglant l'image par
  **DIGEST** (`imageRef` + `imageDigest` `sha256:…`), avec une **version monotone
  par projet** (`@@unique([projectId, version])`, attribuée sous
  `withSerializedMutation` — deux publishes concurrents ne peuvent pas collisionner).
  `publishedByDeploymentId` est un pointeur SANS FK **exprès** : l'entrée doit
  **survivre** à la suppression du déploiement/workspace dont elle est tirée
  (c'est le cœur d'I-PUB-3). Les champs audit-v4 (`promotionId`, `bundleRef`,
  `sbomRef`, `provenanceRef`, `configRef`, `accessPolicyVersion`,
  `retentionExpiresAt`, `referenceCount`) existent mais **nullable** — le pipeline
  snapshot-image live ne les émet pas encore : DÉCLARÉ, jamais faussé.
- **Écriture** : hook dans `runDeploymentBuildFlow` après la persistance du digest
  (`app.ts` ~29930). Best-effort — le deploy a déjà réussi, donc une erreur
  d'append est **loggée** (`release_catalog.append_failed`), jamais avalée, et ne
  fait pas échouer la publication ; le déploiement est relié à sa release
  (`metadata.release = {releaseId, version}`).
- **Historique** : `GET /projects/:id/releases` → catalogue, version décroissante.
- **Redeploy depuis l'historique** : `POST /projects/:id/releases/:releaseId/redeploy`
  → ré-exécute l'image de l'entrée **PAR DIGEST** via le chemin rollback-par-digest
  **déjà prouvé** (`resolveRollbackImage(entry, { revisionExists:false })` →
  `startServerDeploymentViaManager({ image: plan.pullRef })`). Indépendant de la
  survie de la révision source (I-PUB-3). Refuse une entrée sans digest (409),
  inconnue/autre-projet (404). N'incrémente PAS la version (re-run de la même release).

### Preuve (rejouable, verte)
`services/api/src/tests/release-catalog.spec.ts` (5 tests) :
- version **monotone** par projet + historique ordonné + isolation par projet ;
- `GET /releases` renvoie l'historique persisté ;
- **redeploy PAR DIGEST avec le déploiement source SUPPRIMÉ** (`publishedByDeploymentId`
  pointant sur un id inexistant) → 201, le manager reçoit `imageRef@sha256:…`,
  `resolvedWithoutLiveRevision=true` (**I-PUB-3 prouvé**) ;
- redeploy inconnu/cross-projet → 404 ; entrée sans digest → 409 (jamais d'URL morte).

Aucune régression : les specs rollback (`deployment-rollback-digest`,
`release-rollback`) restent vertes (21 tests au total). Build runtime strict
(`tsc NodeNext` depuis `src/server.ts`) = **0 erreur**.

### Preuve UI live — après déploiement (gate D6)
La table `ReleaseCatalogEntry` n'existe en prod qu'une fois la migration `0079`
déployée. Le parcours **publish réel → entrée persistée → visible dans l'historique
→ redeploy depuis l'historique** se rejoue en prod une fois la branche déployée
(pas de merge dans `main` sans feu vert — gate D6). Le test ci-dessus prouve le
mécanisme de bout en bout, déterministe et rejouable, dès maintenant.

## Résultat de signature
- v1 : REFUSED (« pas de ReleaseCatalog/Manifest persistant ni UI live »).
- v2 : PENDING_REVIEW — pipeline + rollback prouvés live ; ReleaseCatalog persistant
  + UI live déclarés CHANTIER OUVERT.
- **v3 : PROVEN_REVIEW_PENDING** — le `ReleaseCatalog` **PERSISTANT** est implémenté
  (table + write-hook + history + redeploy-par-digest) et **prouvé par tests
  rejouables verts** (I-PUB-3 inclus : redeploy après suppression du déploiement
  source). La refus v1 est **levée sur le fond**. Reste, honnêtement : la preuve
  **UI live** (parcours réel en prod) attend le **déploiement de la branche** (D6) ;
  les champs audit-v4 (promotion/sbom/provenance) restent nullable jusqu'à ce que le
  pipeline les émette.
