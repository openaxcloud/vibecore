# Nix v2 — décision d'architecture (unique, définitive)

Statut : **DÉCIDÉ** (2026-07-15). Remplace le spike « candidate E » (link-farm, nixpkgs-24.11).
Portée : runtimes de langage pour **Preview (workspace), Build, Publish et Scheduled** — un seul
mécanisme, un seul lock, zéro divergence « marche en preview, pas en déployé ».

## 0. Pins (aucune étiquette flottante)

| Composant | Pin | Vérifié le |
|---|---|---|
| nixpkgs | branche `nixos-26.05`, révision **`8eeec934ae0dbeca3d7868c059568a65c08b2fc3`** | 2026-07-15 |
| Release channel | `nixos-26.05.4937.8eeec934ae0d` (= la même révision ; publiée par le channel ⇒ couverture binaire `cache.nixos.org` garantie) | 2026-07-15 |
| Binaire Nix | **2.34.8** (tag commit `f3f1c3c5b8ad91850e0f7c590cf177f7ab022024`), tarball `releases.nixos.org/nix/nix-2.34.8/nix-2.34.8-x86_64-linux.tar.xz` (existence vérifiée) | 2026-07-15 |

25.11 est EOL depuis le 2026-06-30 — 26.05 est l'unique base. Toute montée de version future =
nouveau pin explicite + nouvelle génération de store, jamais une mutation du store existant.

## 1. Le magasin plateforme partagé

- **Un** magasin Nix par génération, disque zonal GCE (`nix-store-v2`, pd-standard, zone
  `europe-west9-a`), monté **`/nix` en lecture seule** dans les pods workspace **et** les pods
  d'app publiée via PV/PVC `ROX` (mécanisme kill-switch-gated existant :
  `packages/k8s-client/src/index.ts` — absence de PVC ⇒ spec octet pour octet pré-Nix).
- **Aucun PVC Nix par workspace. Aucun daemon Nix, aucun build Nix dans un workspace.** Le CLI
  Nix ne tourne que dans les Jobs plateforme (peuplement du store, compilateur d'environnement,
  Jobs de build isolés).
- Layout à la racine du disque (montée telle quelle sur `/nix`) :
  - `store/` — chemins Nix (signés, voir §3)
  - `var/nix/db/` — la base sqlite (requise par le CLI Nix des Jobs de build ; les pods
    workspace/app ne la lisent pas)
  - `ecode/` — catalogue signé + bundles d'activation (voir §2)
- Générations immuables : `nix-store-v2` → `nix-store-v3`… Un changement de contenu = nouveau
  disque + bascule de la clé chart `platformEnv.runtime.nixStorePvc`. Rollback = re-pointer
  l'ancienne PVC. Le disque d'une génération n'est **jamais** muté après publication.
- Mesures gen-1 (2026-07-15, disque `nix-store-spike`) : 11,8 Go / 7 695 chemins sur 80 Go
  pd-standard. Les tailles gen-2 seront **mesurées** après peuplement — aucune estimation.
- Rétention : **libre avant utilisateurs** (pas de GC). Après ouverture : rétention par
  références (`ecode.lock.json` actifs = racines GC logiques), jamais de suppression silencieuse.

## 2. Catalogue signé + compilateur d'environnement CENTRAL

⚠️ Décision explicite : **une ferme de liens `ln -s $P/bin/*` ne suffit pas** — elle ne
transporte ni variables d'environnement, ni wrappers, ni outputs `dev`/`lib`. C'était la limite
du spike E-1.

- Le **catalogue** est une liste versionnée d'environnements nommés (ex. `python-3.12`,
  `nodejs-22`, `go-1.24`), chacun défini comme un ensemble d'attributs nixpkgs **à la révision
  pinnée** (§0). Le catalogue vit dans le repo (source de vérité) et son manifeste publié sur le
  disque est signé.
- Le **compilateur d'environnement** est un Job plateforme central (jamais dans le workspace) qui,
  pour chaque entrée du catalogue, produit un **bundle d'activation complet** sous
  `/nix/ecode/envs/<name>-<hash>/` :
  - `profile` → symlink vers un `buildEnv` (bin/, lib/, include/, share/ unifiés — les wrappers
    nixpkgs sont préservés, contrairement à la link-farm)
  - `env.sh` — l'environnement exact : `PATH`, `SSL_CERT_FILE`, `LOCALE_ARCHIVE`,
    variables dev (`PKG_CONFIG_PATH`, `CPATH`, `LIBRARY_PATH`) quand l'env inclut des outputs
    dev — généré, jamais écrit à la main
  - `manifest.json` — attrs, versions résolues, chemins store, hash nixpkgs, sha256 du bundle
  - extensible : runners, packagers, formatters, LSP futurs = entrées de catalogue
    supplémentaires, même mécanisme.
- Consommation : un pod (workspace, build Job, app publiée, scheduled) **source `env.sh`** —
  c'est tout. Aucune logique par-langage côté plateforme (même principe que
  `.ecode/deploy.json` : zéro code par-langage).

## 3. Signature

- **Chemins store** : signés à la population (`nix store sign`, clé ed25519 plateforme
  `ecode-nix-1`) ; les Jobs de build vérifient (`trusted-public-keys`).
- **Manifeste du catalogue** (`/nix/ecode/catalog.json`) : signé (ed25519, même clé
  d'infrastructure, signature détachée `catalog.json.sig`).
- La clé privée vit dans Secret Manager / `vibecore-platform-secrets` ; jamais sur le disque store.

## 4. `ecode.lock.json` — un seul lock pour les quatre surfaces

Fichier à la racine du projet, écrit par la plateforme (jamais à la main) quand un environnement
est attaché au projet :

```json
{
  "schemaVersion": 1,
  "nix": { "version": "2.34.8" },
  "nixpkgs": { "channel": "nixos-26.05", "rev": "8eeec934ae0dbeca3d7868c059568a65c08b2fc3" },
  "env": { "id": "python-3.12", "bundle": "/nix/ecode/envs/python-3.12-<hash>", "sha256": "<sha256 du manifest>" }
}
```

- **Preview** : le boot du workspace source le bundle pointé par le lock.
- **Build** : le Job de build isolé (voir §5) source le **même** bundle.
- **Publish** : l'image produite référence le même lock ; le pod d'app monte le même `/nix`.
- **Scheduled** : idem.

Un seul chemin de résolution ⇒ « marche en preview, pas en déployé » est tué à la racine.
Les lockfiles de langage (`package-lock.json`, `uv.lock`, `poetry.lock`…) restent la source de
vérité des dépendances applicatives — `ecode.lock.json` ne pinne que la **toolchain**.

## 5. Accès du build au store — le blocage Cloud Build dissous

Constat (session 2026-07-15) : Cloud Build n'a pas `/nix` et ne peut pas monter un PD ⇒ build
Python reproductible impossible **dans Cloud Build**. Décision : **on ne donne pas `/nix` à
Cloud Build ; on déplace l'étape qui en a besoin.**

- L'**installation des dépendances + build applicatif** (la seule étape qui exige la toolchain)
  s'exécute dans un **Job Kubernetes jetable et isolé** (gVisor, namespace `workspaces`,
  `/nix` monté RO, workdir éphémère, **aucun accès au pod workspace** — le désastre
  « npm install a détruit le workspace » est structurellement impossible).
- Cloud Build garde son rôle actuel, déjà prouvé (Phase A, `app-image-build.ts`) : Dockerfile
  générique `COPY` + push Artifact Registry. **Aucun toolchain requis à l'image-build.**
- Le pod d'app publiée monte `/nix` RO à l'exécution (mécanisme A1/A2 prouvé live le 15/07).

Chaîne complète (voir `docs/DEPLOY_REPRODUCIBLE_PIPELINE.md` pour le pipeline ①) :

```
révision projet + ecode.lock.json + lockfiles langage
  → gates sécurité/policy
  → Job de build isolé (gVisor, /nix RO, jetable)   ← seul endroit où la toolchain tourne
  → artefact applicatif (deps incluses) → GCS (PUT signé, mécanisme A3)
  → Cloud Build COPY générique (mécanisme A4, inchangé) → image signée → AR vibecore-prod-apps
  → serverAppDeployment (+ /nix RO)                  (mécanisme A5-A9)
```

## 6. Ce qui est explicitement rejeté

- ❌ Link-farm de symlinks bin/ (spike E-1) — perd wrappers/env/outputs.
- ❌ Nix daemon ou builds Nix dans le workspace (surface d'attaque, divergence).
- ❌ PVC Nix par workspace (coût, quota SSD, invalidation impossible).
- ❌ Étiquettes flottantes (`nixos-unstable`, `:latest`, channels non pinnés).
- ❌ Donner `/nix` à Cloud Build (impossible proprement ; l'étape a été déplacée à la place).
- ❌ Toute mutation d'un store publié (les générations sont immuables).

## 7. Ordre d'exécution

1. Peuplement `nix-store-v2` (Job builder pinné §0, catalogue v0 : python-3.12, nodejs-22,
   go-1.24) + bundles §2 + signatures §3 → **mesurer** taille/durée.
2. Bascule `nixStorePvc` → `nix-store-v2-pvc` sur projets allowlistés (`nixProjects`), preuve
   live workspace + app publiée, puis élargissement.
3. `ecode.lock.json` écrit à l'attachement d'environnement ; lu par les quatre surfaces.
4. Pipeline ① (build depuis révision) branché sur le même store — voir
   `docs/DEPLOY_REPRODUCIBLE_PIPELINE.md`.
