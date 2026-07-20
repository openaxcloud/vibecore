# Preuve LIVE — Promotion Artifact Registry par digest + chaîne d'attestations

- **evidenceId** : `EV-AR-LIVE-PROMOTION-2026-07-20`
- **Plan** : `PLAN_PARITE_REPLIT.md` §13.5 (machine à états Artifact Registry) + §12.2 (pipeline)
- **Couvre** : `UNK-AR-LIVE-PROMOTION`, `P0-V4-4`, `P0-V3-07`
- **Code** : `services/api/src/artifact-registry-live-adapter.ts` (adapter live), piloté par
  `services/api/src/artifact-promotion.ts` (contrat de sécurité déjà présent)
- **Repro** : `pnpm --filter @vibecore/api exec tsx scripts/prove-artifact-promotion-live.mts`
  (nécessite Docker + l'image `ghcr.io/project-zot/zot-linux-amd64`)

## Ce qui est prouvé, EN RÉEL

La promotion tourne de bout en bout, en HTTP, contre un **vrai registre OCI-1.1
(zot)** lancé dans Docker — **exactement le protocole OCI Distribution + API
referrers que sert Google Artifact Registry**. Seule l'**auth** diffère entre un
registre anonyme et AR (jeton Bearer gcloud) ; toute la mécanique OCI (copie par
digest, blob-mount cross-repo, découverte referrers + fallback tag-schema,
rétention couplée) est identique et prouvée ici.

Registre = **jetable, local, PAS la prod utilisateur.**

### Machine à états §13.5 (exécutée réellement)

```
PROMOTION_PREPARED → IMAGE_COPIED_BY_DIGEST → REFERRERS_DISCOVERED
→ METADATA_COPIED → TARGET_SIGNATURE_VERIFIED → TARGET_POLICY_VERIFIED
→ PROMOTION_COMMITTED
```

### POSITIF

- Image copiée **par digest** de `source/app` → `tenant-abc/app`.
- Les 3 attestations (signature cosign, SBOM CycloneDX, provenance in-toto)
  copiées **et re-liées**, puis **re-découvertes dans le contexte cible** via
  l'API Referrers réelle du registre (vérifié à la fois par l'adapter ET par un
  appel brut à `/v2/tenant-abc/app/referrers/<digest>`).
- **Signature vérifiée dans la cible** (ECDSA P-256, `node:crypto`, réelle) et
  **policy du signataire satisfaite** (`TARGET_SIGNATURE_VERIFIED`,
  `TARGET_POLICY_VERIFIED`) avant `PROMOTION_COMMITTED`.

### FALLBACK ORAS/referrers (exigence §13.5, attachments = Preview)

- Découverte des attestations via le **tag-schema `sha256-<hex>`** prouvée à la
  **source** (index client) ET au **tenant** (index **maintenu par l'adapter**
  pendant la promotion → discoverable même là où l'API referrers est Preview/off).

### DEUX NÉGATIFS (refus prouvés)

1. **Signature invalide** → `PROMOTION_BINAUTHZ_DENIED` (échec de
   `TARGET_SIGNATURE_VERIFIED`), **rollback** : image cible 404, pointeur
   fallback 404.
2. **Signataire non autorisé** (signature valide mais clé hors policy) →
   `PROMOTION_BINAUTHZ_DENIED` (échec de `TARGET_POLICY_VERIFIED`), **rollback**.

### Rétention couplée (§13.5 « supprimer l'image cible peut supprimer ses attachments »)

Le rollback supprime, dans l'ordre imposé par l'intégrité référentielle du
registre : index fallback → attestations → image. Garantie tenue : **aucune
image vérifiable/pullable ne subsiste** (manifeste 404, pointeur fallback 404).
Note honnête : zot **refuse (405/DENIED) la suppression directe d'un manifeste
ayant un `subject`** et couple son élimination au GC de l'image ; les
attestations résiduelles deviennent alors des **orphelins** pointant vers un
subject 404 (inertes, jamais admissibles par Binary Authorization). Artifact
Registry autorise la suppression directe → la boucle best-effort les élimine
immédiatement.

## Fichiers

| Fichier | Contenu |
|---|---|
| `promotion-run.json` | trace horodatée de chaque étape + assertions + digests |
| `zot-http-access.jsonl` | **journal d'accès HTTP réel** du registre (274 lignes : GET referrers, copies, DELETE…) |
| `SHA256SUMS.txt` | empreintes SHA-256 du bundle |

## Ce qui reste — BLOCKED (besoin d'Avi / accès GCP)

Faire tourner **le même adapter contre le Google Artifact Registry réel** et le
câbler dans `server-deploy-revision` pour un déploiement tenant de bout en bout
exige des droits qu'on n'a pas en test :

- un dépôt AR cible par tenant + `PromotionIdentity` (impersonation courte
  durée, jeton `oauth2accesstoken`) ;
- confirmation du *launch stage* des attachments AR (Preview vs GA) lu depuis
  `SOURCE_REGISTRY.yaml`, et activation Binary Authorization / Container Analysis
  côté cible.

Tant que ces accès ne sont pas fournis, la partie **AR-GCP-en-prod** est marquée
`BLOCKED` (et non « fait ») : `staticBearerAuth(await gcloudAccessToken())` est le
seul point de branchement manquant, mais il n'est pas prouvable sans les droits.
