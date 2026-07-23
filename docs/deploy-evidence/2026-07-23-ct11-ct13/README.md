# CT-11 / CT-13 — isolation & provisioning tenant GCP (preuves live, 2026-07-23)

Chantier joué dans des **projets de TEST dédiés** sous le folder test
`folders/780512954993` (org `974552983243`), **quota-project épinglé sur le
projet test** (jamais `vibecore-495216`/prod), rôles minimaux, zéro clé
conservée, budget **<< 0,01 $**, **teardown complet joué** (trap dès création).
Artefacts hashés dans `SHA256SUMS.txt`. Aucun `.log`.

## Garde-fous respectés

- Projets créés uniquement sous `folders/780512954993` (vérifié `parent.id`).
- `gcloud config billing/quota_project` = projet test pendant tout le chantier,
  reset à la fin. Prod `vibecore-495216` jamais touchée.
- Access-policies org : **list refusée côté droit** → rien lu ni modifié.
- Matériel de clé SA : écrit en /tmp, `shred`, jamais committé.

## Résultats par point (autorisé + négatif)

| Point | Positif (contrôle actif) | Négatif | Statut |
|---|---|---|---|
| **CT-11 Org Policy** `iam.disableServiceAccountKeyCreation` | enforce=true (hérité, mesuré) → création clé SA **REFUSÉE** (`FAILED_PRECONDITION`) | flip enforce=false → **BLOCKED** : compte sans `roles/orgpolicy.policyAdmin` (mesuré `orgpolicy.policies.create` DENIED) | ✅ positif / ⛔ négatif BLOCKED (grant Avi) |
| **CT-11 KMS** | chiffre→déchiffre avec la BONNE clé : roundtrip OK (sha256 clair consigné) | déchiffre avec MAUVAISE clé → **INVALID_ARGUMENT: Decryption failed** | ✅ complet |
| **CT-11 Log sinks** | sink filtre audit → bucket créé ; **routage PROUVÉ** (entrée audit `CreateSink` LUE depuis `ct11-bucket`, latence 1er routage ~18 min) | filtre invalide → **INVALID_ARGUMENT: Unparseable filter** | ✅ complet |
| **CT-11 VPC-SC** | — | — | ⛔ **BLOCKED** : `accesscontextmanager.policies.list/create` DENIED (org) → `roles/accesscontextmanager.policyAdmin` = grant Avi. Procédure DRY-RUN prête dans `ct11-vpcsc.txt` |
| **CT-13 provisioning** | projet tenant `ecode-ct13-tenant-9e2f` créé sous folder test → lifecycle **ACTIVE** (op `create_project` done) | kill-switch `CLOUD_TENANT_FACTORY_ENABLED=false` → **503 `CLOUD_TENANT_FACTORY_DISABLED`** (test réel du code committé, branche factory 147a622d, passe) | ✅ complet |

## Teardown

Tous projets **DELETE_REQUESTED** (`ecode-ct11-proof-7d17d8`,
`ecode-ct13-tenant-9e2f`) ou absents ; versions de clés KMS **détruites** ;
sinks/bucket supprimés (et de toute façon inclus dans la suppression projet).
Voir `ct-teardown.txt` + `teardown.sh`. **Bonus** : projet oublié
`ecode-proof-b906ss` (billing actif) supprimé → arrêt d'un coût dormant.

## Ce qui reste BLOCKED (dépendance nommée = décision/grant Avi)

1. **CT-11 négatif Org Policy** (flip enforce off) — `roles/orgpolicy.policyAdmin`.
2. **CT-11 VPC-SC** (access-policy folder-scoped + perimeter DRY-RUN) —
   `roles/accesscontextmanager.policyAdmin` à l'org.

Les positifs de CT-11 (Org Policy enforcement, KMS, Log sinks) et CT-13
(provisioning + kill-switch) sont **prouvés en réel**. Repro et négatifs
consignés par fichier.
