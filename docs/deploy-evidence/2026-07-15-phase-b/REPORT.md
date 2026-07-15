# Phase B — preuves live du 2026-07-15 (session PM)

Tout ce qui suit a été exécuté sur prod (`vibecore-prod-app`, europe-west9) via le VRAI parcours
utilisateur (UI → control plane → runtime → réseau → URL publique), avec un utilisateur/org/projets
QA mintés puis nettoyés. Chiffres bruts, aucun estimé.

## ④ / B0 — readinessProbe 1 s (`b2558c41`)

- Baseline AVANT (5 pods app prod, 15/07 17:44 IDT) : `containerStart→Ready` = **7,0 / 6,0 / 7,0 / 7,0 / 7,0 s**
  (probe `initialDelay 3 + period 5`).
- APRÈS (pod `app-cmrmb34mz…`, publish B4) : probe live `{period:1, failureThreshold:30, timeout:5}`,
  `containerStart→Ready` = **0,0 s** (granularité seconde des timestamps k8s).
- Réveil complet scale-0→HTTP 200 mesuré de bout en bout : **16,0 s** (baseline Phase A : 22 s).
  Le poll de wake côté manager passe de 3 s à 1 s avec `fead062e` (déployé ensuite).

## B4 — Publish Node via pipeline reproductible (`98e16a8d`)

Projet QA `cmrm9vobb00070nfe075k2bpv` (express), fichiers écrits par l'API runtime **sans jamais
lancer d'install ni de dev server dans le workspace**. `POST /projects/:id/deployments`
provider=server → deployment `cmrmb34mz00060nbdp80trhzm` :

- Révision (source seule) : `revisions/server-deploy/cmrmb34mz….tgz`, **489 octets**,
  `sha256=892b2e42b49e067d1319ff0cd4d46cb9b121c79d0e3ab141f2f3761ebd528cdb` (calculé pod-side),
  persistée dans `metadata.serverDeploy.image.revisionObject/revisionSha256` (`b4-deployment-final.json`).
- Pod de build isolé `app-build-cmrmb34mz…` observé (gVisor, emptyDir, label egress) puis supprimé.
- Image `p-cmrm9vobb…:cmrmb34mz…` **163 104 086 octets**, Cloud Build **26,7 s** (COPY seul).
- Publish→READY : **62 s**. URL publique : `{"ok":true,"phase":"B4","deployment":"1","builtFrom":"revision"}`.
- **Preuve d'isolation** : le workspace n'a jamais exécuté npm ; l'app déployée sert express ⇒ les
  dépendances viennent exclusivement du pod de build.

## ② — Store Nix v2 (26.05) construit, signé, prouvé

- Pins : nixpkgs `nixos-26.05` rev `8eeec934ae0dbeca3d7868c059568a65c08b2fc3`
  (= release channel `nixos-26.05.4937.8eeec934ae0d`, couverture cache garantie), Nix `2.34.8`.
- Disque `nix-store-v2` 80 Go pd-standard zone-a ; store **1,9 Go / 2 012 chemins**, tous signés
  (`nix store sign`, clé `ecode-nix-1:J/eP9X5r7KWkjAVGioyGv79KFmnHTDCo+qGDoy3LoVk=`).
- Catalogue v0 signé (ed25519, sig détachée) : python312 → **Python 3.12.13** (+pip 25.3, uv 0.11.21),
  nodejs22 → **v22.23.1** (npm 10.9.8), go → **go1.26.4**. (`nix-store-v2-populate.log`)
- Bundles d'activation (`profile` buildEnv + `env.sh` + `manifest.json`) prouvés sous gVisor +
  PSS restricted + montage RO : les 3 toolchains s'exécutent en sourçant `env.sh` ; store immuable
  (`touch /nix/store/x` → Permission denied).
- PVC `nix-store-v2-pvc` (ROX) montée par un VRAI workspace via l'allowlist
  (`workspace-ws-c3f7072d3946e66a` → volume `nix-store-v2-pvc` vérifié dans le spec).
- Repro manuelle dans un pod de build identique : `. env.sh && python3 -m venv .venv &&
  .venv/bin/pip install flask` → **exit 0 partout**.

## B5 — Python : 1er essai FAILED (cause isolée), 2e essai PROUVÉ

Premier publish Python (`cmrmb9igi…`) : build pod exit **254**. Reproduit pas à pas :
`npm install` sans `package.json` → `ENOENT` exit 254 (le préfixe d'install Node était composé
sans condition). Corrigé par `fb855095`. (`b5-first-attempt-failed-npm-enoent.json`)

Après déploiement de `fb855095` — publish `cmrmc2v0u00040ngapqutfreo` :
- URL publique : `{"builtFrom":"revision+nix-v2","deployment":"1","ok":true,"phase":"B5","python":"3.12.13"}`
  → **le Python 3.12.13 du store gen-2 (26.05)**, venv construit par le pod de build isolé
  (`. /nix/ecode/envs/python312/env.sh && python3 -m venv .venv && pip install -r requirements.txt`
  déclaré dans `.ecode/deploy.json` — zéro code par-langage côté plateforme).
- Révision **603 octets** `sha256=c45a6198…` persistée ; image 167 938 625 octets, Cloud Build 26,7 s
  (COPY seul) ; publish→READY ~70 s ; le pod app monte `nix-store-v2-pvc` (vérifié dans le spec).
- Ce publish est passé par l'adaptateur **SandboxRuntime** (`fead062e`, manager `fb85509520`)
  → B8 prouvé live sur le vrai parcours.

## Réveils re-chronométrés après `fb855095` (poll de wake 3 s → 1 s)

- **Node** (`app-cmrmb34mz…`) : scale-0→HTTP 200 = **14,5 s** (16,0 s avant le poll 1 s ; 22 s Phase A → **-34 %**).
  Décomposition : scheduled→containerStart 2,0 s ; containerStart→Ready **1,0 s** ; le reste (~11 s)
  est en amont du scheduling (détection proxy + création pod + init gVisor) = prochaine cible.
- **Python + /nix** (`app-cmrmc2v0u…`) : **24,3 s** (équivalent Phase A Python : 23 s — le boot flask +
  lectures froides du store pd-standard dominent, pas la probe).

## Retest BUG-API-003 après déploiement (`95fbb30c`)

Projet neuf `cmrmc5s8s000d0ncxamw85gtn`, premier `POST /api/runtime/workspaces` sur pod froid :
**HTTP 200 en 17,1 s, `status:"starting"`** — plus aucun 500. Contrat cold-start conforme.

## Ressources QA conservées (preuves vivantes, comme les URLs Phase A archivées)

Org QA `cmrm9vmwz000t0nfom27wpckb` (user `qa-phaseb-…@qa.e-code.internal`) : projets
`qa-phaseb-node` (`d-cmrmb34mz….preview.e-code.ai`), `qa-phaseb-python`
(`d-cmrmc2v0u….preview.e-code.ai`), `qa-coldstart-retest`. Les workspaces retombent via le GC idle ;
les 2 URLs restent des preuves live. Overrides quota QA : `deployments.count=100`,
`workspaces.active=3` (raison tracée en DB). Suppression = 1 cascade-delete du user QA, sur décision.

## Bug prod trouvé en passant — BUG-API-003 (`95fbb30c`)

`POST /api/runtime/workspaces` → 500 `API_ERROR` pendant un cold start :
`workspace_cold_start_pending_total` / `workspace_cold_start_write_recovered_total` incrémentés
sans être déclarés au registre (`a41239eb`/`bdce73d0`) → throw `Unknown metric`. Le pod workspace
est créé quand même ; l'UI voit 500 au lieu de `starting`. Compteurs déclarés ; retest live après
déploiement.
