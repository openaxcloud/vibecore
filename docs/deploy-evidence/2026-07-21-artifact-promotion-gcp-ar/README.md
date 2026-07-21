# Preuve LIVE — Promotion contre un VRAI Google Artifact Registry (P0-V3-07)

- **evidenceId** : `EV-AR-LIVE-PROMOTION-GCP-2026-07-21`
- **Refus expert levé** : « l'adapter AR réel (OCI referrers) n'est pas branché ». Il l'est désormais, et **prouvé contre le vrai Artifact Registry de Google** (pas seulement un registre OCI-1.1 local).
- **Registre** : `europe-west9-docker.pkg.dev/ecode-proof-b906ss` — **projet GCP de TEST dédié** (autorisé par Avi), **jamais la prod utilisateur**. Facturation liée pour le run, **dépôts supprimés après** (coût mesuré < 0,01 $).
- **Couvre** : `P0-V3-07`, `UNK-AR-LIVE-PROMOTION`
- **Code** : `services/api/src/artifact-registry-live-adapter.ts` (branche AR-aware), piloté par `artifact-promotion.ts`.
- **Repro** :
  ```
  gcloud artifacts repositories create promo-src    --repository-format=docker --location=europe-west9 --project=ecode-proof-b906ss
  gcloud artifacts repositories create promo-tenant --repository-format=docker --location=europe-west9 --project=ecode-proof-b906ss
  AR_PROJECT=ecode-proof-b906ss AR_LOCATION=europe-west9 \
    pnpm --filter @vibecore/api exec tsx scripts/prove-artifact-promotion-gcp-ar.mts
  ```
  Auth : `gcloud auth print-access-token` (jeton court, zéro clé persistante — §13.4).

## Ce qui est prouvé, EN RÉEL, sur Google Artifact Registry

**AR supporte l'API OCI Referrers** (`arReferrersApiSupported: true`, mesuré). La machine à états §13.5 tourne de bout en bout, en HTTPS authentifié, contre de vrais dépôts AR :

```
PROMOTION_PREPARED → IMAGE_COPIED_BY_DIGEST → REFERRERS_DISCOVERED
→ METADATA_COPIED → TARGET_SIGNATURE_VERIFIED → TARGET_POLICY_VERIFIED
→ PROMOTION_COMMITTED
```

### POSITIF
- Image copiée **par digest** de `promo-src/app` → `promo-tenant/app` dans le vrai AR.
- 3 attestations (signature cosign, SBOM CycloneDX, provenance in-toto) copiées **et re-liées**, **re-découvertes dans le tenant** via l'**API Referrers d'AR** (confirmé aussi par un appel brut). Voir `ar-state-snapshot.txt` : l'image `sha256:1f9d3d43…` et ses 3 attestations existaient réellement dans AR.
- **Signature vérifiée** (ECDSA P-256, `node:crypto`) + **policy du signataire** satisfaite **dans le tenant** avant `PROMOTION_COMMITTED`.

### FALLBACK ORAS/referrers
- Découverte via tag-schema `sha256-<hex>` prouvée à la source ET au tenant (index maintenu par l'adapter).

### DEUX NÉGATIFS
1. **Signature invalide** → `PROMOTION_BINAUTHZ_DENIED` (échec `TARGET_SIGNATURE_VERIFIED`) → **rollback** : image tenant **404**, pointeur fallback 404, **0 attestation résiduelle**.
2. **Signataire non autorisé** (signature valide, clé hors policy) → `PROMOTION_BINAUTHZ_DENIED` (échec `TARGET_POLICY_VERIFIED`) → **rollback** identique.

### Rétention couplée — enforced par AR lui-même
Découverte majeure : **AR applique la rétention couplée côté serveur**. Il traite chaque referrer comme un « parent » du subject et **refuse toute suppression morceau-par-morceau** (`GOOGLE_MANIFEST_DANGLING_PARENT_IMAGE` / `GOOGLE_MANIFEST_REFERRING_MANIFEST`) — impossible d'orpheliner une attestation ou de laisser une image pendante. Le primitif atomique correct est la **suppression de package** (cascade image + referrers + index internes AR + tags), que l'adapter utilise sur AR. Résultat : rollback **totalement propre** (0 résidu), meilleur que le fallback zot (orphelins GC-différés).

## Fichiers
| Fichier | Contenu |
|---|---|
| `promotion-run.json` | trace horodatée de chaque étape + assertions + digests |
| `gcp-ar-session.txt` | log complet du run réel (HTTP AR, force-delete debug, timings) |
| `ar-state-snapshot.txt` | instantané `gcloud`/REST de l'image promue + 3 attestations dans le vrai AR |
| `SHA256SUMS.txt` | empreintes SHA-256 du bundle |

## Statut
`PROVEN_REVIEW_PENDING` — prouvé en réel, **en attente de relecture experte** (non clôturé). Le seul reste = câblage dans `server-deploy-revision` pour un déploiement tenant complet (hors périmètre de cette preuve d'adapter).
