# RELEASE_PUBLISH_CONTRACT — Publish → Release (audit v4 I)

schemaVersion: 1
repoCommit: ca299f87

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

## Preuves

- E2E-PHASEB-NODE (PROVEN, vertical: publish) — Publish Node → URL 200,
  artefact rejouable, 62s.
- 🟡 Promotion réelle contre AR live (referrers) = follow-up (UNK-AR-LIVE-PROMOTION).
