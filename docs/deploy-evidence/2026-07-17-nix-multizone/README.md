# D3 — Store Nix multi-zone (approuvé par Avi le 2026-07-17)

SPOF mesuré : le PV du store v2 est **zonal** (disque `nix-store-v2`,
europe-west9-**a** uniquement) alors que les pools sandbox couvrent **a+b** —
et zone-a a été en stockout la semaine du 14/07. Tout pod montant `/nix` était
cloué en zone-a. Architecture retenue par Avi : **snapshot signé par
génération → clone zonal identique par zone active**, montage topology-aware,
**aucune mutation en place**, dérive de génération = pod bloqué.

## Infra créée en prod (2026-07-17, opérations purement additives — vérifiée encore là le 20/07)

| Objet | Détail |
|---|---|
| Snapshot `nix-store-v2-gen2-20260717` | source `nix-store-v2` (zone-a), storage-location europe-west9, `storageBytes=532467904` (~0.50 GiB facturables), labels `generation=v2, purpose=nix-store, content-hash-prefix=3029b581…`, description = contentHash complet |
| Disque `nix-store-v2-b` | europe-west9-**b**, pd-standard 80 GiB, restauré du snapshot, labels `generation=v2, cloned-from=nix-store-v2-gen2-20260717` |
| PV `nix-store-v2-b-pv` + PVC `workspaces/nix-store-v2-b-pvc` | ReadOnlyMany, Retain, nodeAffinity `topology.kubernetes.io/zone=europe-west9-b` — **Bound** |

## Identité de génération PROUVÉE entre les deux zones (pods d'inspection RO, 2026-07-17)

| Mesure | zone-a (`nix-store-v2-pvc`) | zone-b (`nix-store-v2-b-pvc`) |
|---|---|---|
| sha256(`/nix/ecode/catalog.json`) | `3029b5810ba485844f1029132f3f00652075e1e2c0cbb454992d3a94aa8fd5d5` | **identique** |
| Chemins `/nix/store` | 2012 | **2012** |
| Signature (`catalog.json.sig`, ed25519 64 o) | présente | **identique** (même sha256 : `04def890b0fda8a08cf2d6d36caa109159e54c61b4835f4cf1566f4dd6ac6548`) |
| Sonde d'exécution | — | `…-ecode-env-python-3.12/bin/python3 --version` → **Python 3.12.13** depuis le clone, pod schedulé en europe-west9-b |

Le disque porte NATIVEMENT son manifeste de génération signé
(`/nix/ecode/catalog.json` + `.sig` + pubkey, posés à la construction gen-2) —
c'est lui qui sert de contentHash ; aucune mutation du disque source.

## Code (topology-aware + garde de dérive)

- `packages/k8s-client` : `parseNixStorePvcZones` (`zone=pvc,…`, ordre = préférence), `chooseNixStoreZone` (capacité schedulable réelle par zone : Ready + non cordonné ; stockout zone-a ⇒ zone-b gagne ; aucune donnée ⇒ 1ʳᵉ zone = comportement legacy), `nixStoreGuardInitContainer` (initContainer qui hash le catalog monté et **bloque le pod** si ≠ attendu). Pods workspace + app serveur + build : pin `topology.kubernetes.io/zone` sur la zone du clone monté.
- `services/workspace-manager` : `resolveNixStorePlacement()` appliqué aux 3 chemins (workspaces, server-deployments, app-builds). Un PVC one-off hors carte n'est JAMAIS réécrit.
- Helm : `nixStorePvcZones` + `nixGenerationHash` → `NIX_STORE_PVC_ZONES` + `NIX_STORE_GENERATION_HASH` (configmap). `values-prod.yaml` resynchronisé (`nixStorePvc` disait `nix-store-spike-pvc` alors que le live tourne sur v2).
- Tests : 12 (k8s-client) + 6 (manager) — stockout, tie-break, one-off, RBAC-fallback, garde malformée, kill-switch intact.

## Coût réel

Voir `COST_REPORT.md` : +3.74 USD/mois mesurés ; total 2 zones 7.45 USD/mois ;
regional PD 2.5–2.8× plus cher, 2 zones max.

## Test de perte de zone (D3.3) — à compléter AVANT tout Python-par-défaut

Cordon des nodes sandbox zone-a → projet Python neuf doit provisionner en
zone-b (clone monté + garde OK) → uv/python → Preview → Publish → uncordon
zone-a sans split-brain de génération. **L'auto-mount Python par défaut (et
tout passage de l'allowlist à `'*'`) reste INTERDIT tant que ce test n'est
pas vert.**
