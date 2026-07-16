# PLAN_REMAINING_UNIFIED — plan de travail (source de vérité)

États par point : 📤 Dispatché · 💻 Codé (commité+poussé sur main) · ✅ Testé live (écran + greps, web/tablette/mobile le cas échéant).
Un point n'est « fait » QUE quand ✅ est coché.

## Server deploy Phase A — « Publish = snapshot du workspace → image → run » (décision Avi 15/07)

Contexte : le chemin boot-script (détection Node → tarball source → install/build au boot) est l'impasse par-langage.
Cible Replit : le déploiement EST le workspace, imagé. Mesures baseline (15/07, prod) : cold boot boot-script depuis 0 réplique = **91 s** (Next.js « nextproofb2 ») ; réponse chaude 0,45 s.

| Point | 📤 | 💻 | ✅ | Notes |
|---|---|---|---|---|
| A1. serverApp pods : ECODE_DEPLOYMENT=1 + probe 5 s (règle Replit) + montage /nix kill-switch | ✅ | ✅ `1738afc0` | ⬜ | vérif live = env du pod app + probe |
| A2. Plumbing nixStorePvcName per-request (API→manager→k8s), allowlist projet | ✅ | ✅ `1738afc0`+`f32aa5f6` | ⬜ | flip global NIX_STORE_PVC_NAME intact (off) |
| A3. Snapshot COMPLET (deps incluses) uploadé depuis le pod (URL signée PUT, plafond 2 Mo contourné) | ✅ | ✅ `43080762` | ⬜ | |
| A4. Builder Cloud Build : Dockerfile généré générique (FROM base workspace + COPY + RUN build + CMD run), push AR, taille d'image rapportée | ✅ | ✅ `ca021f99` | ⬜ | limite Replit 8 Gio à surveiller |
| A5. Chemin image flag-gated `SERVER_DEPLOY_SNAPSHOT_IMAGE=1` dans le flux server-deploy (flag absent = boot-script octet pour octet) | ✅ | ✅ `f32aa5f6` | ⬜ | |
| A6. `.ecode/deploy.json` {run,build} générique (équivalent `.replit [deployment]`) honoré par le handler ET /deployments/detect | ✅ | ✅ `f32aa5f6` | ⬜ | zéro code par-langage |
| A7. Infra : repo AR `vibecore-prod-apps`, IAM (GSA platform cloudbuild.builds.editor + AR reader ; compute SA AR writer), PV nix recréé avec nodeAffinity zone-a, clés chart | ✅ | ✅ `63fdcde1` + fait live | ⬜ | PVC ROX 80Gi bound ; affinité PROUVÉE (scheduler exclut zone b) |
| A8. Preuve live Node : app publiée PAR LE BOUTON UI → 200, chemin image | ✅ | — | ⬜ | mesurer publish + cold boot + taille image |
| A9. Preuve live Python : app publiée PAR LE BOUTON UI → 200, zéro code par-langage (nix /python 3.12.8 du store prouvé sous gVisor le 15/07) | ✅ | — | ⬜ | nécessite allowlist nix du projet |
| A10. Mesures jour-1 : cold boot image-path (cible ressentie < 30 s ; 4 min = cassé) + taille d'image à chaque publish | ✅ | 💻 (loggé métadonnées) | ⬜ | baseline boot-script = 91 s |

Règles dures Replit déjà en place : port externe unique (Service 80→PORT), health `/` budget 5 s (A1), FS non persistant par publish (image immuable), idle 15 min par défaut (`SERVER_DEPLOY_IDLE_MINUTES`), `ECODE_DEPLOYMENT=1` (A1).
Reste hors Phase A : unités de facturation Autoscale (1 CPU-s=18 / 1 GoRAM-s=2), tiers Reserved VM ($20/$40/$80/$160), changement de type en place.

## Server deploy Phase B — pipeline reproductible + Nix v2 (15/07, correction d'architecture `d013e5fd`)

Décisions committées : `docs/DEPLOY_REPRODUCIBLE_PIPELINE.md` (pipeline) + `docs/NIX_V2_DECISION.md` (Nix v2 : nixpkgs 26.05 rev `8eeec934ae0d`, Nix 2.34.8, store partagé RO, compilateur d'env central, `ecode.lock.json`, build via Job in-cluster — le blocage « Cloud Build n'a pas /nix » est dissous par design).

| Point | 📤 | 💻 | ✅ | Notes |
|---|---|---|---|---|
| B0. readinessProbe app+workspace : échantillonnage 1 s (baseline mesurée 6-7 s start→Ready) | ✅ | ✅ `b2558c41` | ✅ **15/07** | MESURÉ live : containerStart→Ready 6-7 s → **0 s** ; réveil scale-0→200 **16 s** (vs 22 s). Preuves `docs/deploy-evidence/2026-07-15-phase-b/` |
| B1. Snapshot-révision (source seule, sha256 pod-side, `revisions/server-deploy/<id>.tgz`) | ✅ | ✅ `98e16a8d` | ✅ **15/07** | objet GCS 489 o + sha256 persistés (deployment `cmrmb34mz…`) |
| B2. Pod de build isolé (gVisor, emptyDir, /nix RO optionnel, label egress server-deploy, AUCUNE PVC workspace) | ✅ | ✅ `98e16a8d` | ✅ **15/07** | pod `app-build-<id>` observé live ; deps de l'app déployée installées SANS que le workspace n'ait jamais lancé npm |
| B3. Câblage flag-gated `SERVER_DEPLOY_REVISION_PROJECTS` (allowlist projet, vide = chemin A octet pour octet) | ✅ | ✅ `98e16a8d` | ✅ **15/07** | `--set` fait (rev 840) ; publish hors allowlist inchangé |
| B4. Preuve live Node : Publish réel via révision → URL 200 + artefact rejouable | ✅ | ✅ | ✅ **15/07** | publish→READY 62 s, URL 200 `builtFrom:revision`, image 163 MB (Cloud Build 26,7 s, COPY seul), fix `fb855095` (skip npm sans package.json) |
| B5. Store Nix v2 (26.05 pinné) + bundles d'activation + preuve Python | ✅ | ✅ | ✅ **15/07** | store 1,9 Go/2 012 chemins signés ; publish Python réel `cmrmc2v0u…` → URL 200 `python:3.12.13` (toolchain 26.05), venv construit dans le pod isolé, pod app monte `nix-store-v2-pvc` ; fix `fb855095` |
| B6. Gates policy/scan secrets · B7. Signature d'images (cosign) | ☐ | ☐ | ☐ | |
| B8. Interface `SandboxRuntime`/RuntimeAdapter (aucun objet métier = Pod ; microVM cible) | ✅ | ✅ `fead062e` | ✅ **15/07** | publish B5 réel passé par `GvisorPodRuntime` (manager `fb85509520`) ; réveil Node re-mesuré **14,5 s** (22 s Phase A) avec le poll 1 s |

## Zone Autoscale + tailles machine + rétention AR (16/07, session zone-autoscale)

| Point | 📤 | 💻 | ✅ | Notes |
|---|---|---|---|---|
| Z1. **BUG-CRON-001** : enqueue CronJobs mort (bullmq ≥5.76 rejette `:` dans jobId) → tous les crons plateforme Failed depuis ~9/07 | ✅ | ✅ `9b3315b1` | ✅ **16/07** | Preuve live : jobs Complete 1/1 post-CD + tick 05:15 → 11 apps idle endormies 0/0 (dont Phase B, 1/1 depuis 12 h). Voir BUG_INVENTORY_LIVE |
| Z2. Tailles machine 0.25→8 vCPU (RAM=4×vCPU) sur Rate Card versionné (DB `RateCard` seed v1, migration 0070, fallback code) ; `Deployment.machineSize` persisté + hérité (redeploy/publish-prod) ; requests==limits sur le pod ; garde plan (8 vCPU interdit en free) + plafond capacité `SERVER_DEPLOY_MAX_VCPU` (défaut 2 = nœuds 3920m) ; sélecteur au panneau Deploy depuis `GET /projects/:id/deployments/rate-card` (prix $/h actif, zéro chaîne en dur) | ✅ | ✅ `1ea573b4` | ✅ **16/07** | Publish réel `cmrn4qhjy…` dedicated-1 → kubectl `requests==limits {cpu:1, memory:4Gi}`, URL 200 ; gardes 400 PLAN/CAPACITY/UNKNOWN prouvées ; panneau vu à l'écran (6 tailles, prix carte, désactivées avec raison). `docs/deploy-evidence/2026-07-16-zone-autoscale/` |
| Z3. Billing runtime autoscale : sweep sur tick deploy.reap (5 min) — temps ACTIF (replicas>0) × taille (18 u/CPU-s + 2 u/Go-s), **jamais 0** (plancher 1 unité), sommeil gratuit, watermark par déploiement, fenêtre plafonnée 30 min | ✅ | ✅ `1ea573b4` | ✅ **16/07** | Événement live 06:35 : 6 830 unités = 26 u/s × 262,7 s (contrôle exact) = 2,19 ¢, metadata machineSize/activeSeconds/replicas/requests/rateCardVersion, watermarks avancés (shadow mode) |
| Z4. Metering requêtes : proxy compte→delta au touch 30 s ; manager cumule annotation `vibecore.ai/request-count` + `/status` l'expose ; sweep facture le delta $1.20/M (watermark `meteredRequests`, reset ⇒ jamais négatif) | ✅ | ✅ `894c5f6f` | ✅ **16/07** | Événement 06:35 : requests:1 facturée, watermark meteredRequests=1 sur la ligne (vérifié en DB) |
| Z5. Autoscale bout en bout : replicas=0 sans trafic (15 min) → 1 requête → réveil + 200, requête non perdue | ✅ | ✅ (préexistant + Z1) | ✅ **16/07** | 2 cycles bruts : `app-cmrmb34mz` 0→200 en 16,05 s ; `cmrn4qhjy` (dedicated-1) endormi tick 07:00 → 200 en 16,3 s → replicas 1/1. Port unique 80→3000 + probe 5 s relevés |
| Z6. Rétention AR : chiffré (containers 1380 img/483,4 Go ; apps 6 img/168 Mo sans policy) ; policies posées : containers keep-20 + KEEP `running-*`/`helm-active-*` + DELETE >7 j ; apps keep-10 + KEEP `active-*` + DELETE >60 j ; 23 tags de protection posés ; workflow `ar-protect-images.yml` (*/6 h) | ✅ | ✅ `019e0a53` | ✅ **16/07** | Trou réel bouché : `screenshotter:377792b0e1` TOURNAIT hors keep-20 (supprimable à J+23 sous l'ancienne policy). Policies vérifiées par describe ; run workflow 29473177657 **success** (après grant repoAdmin repo-scoped au SA CI) |

⚠️ Capacité : demande de quota `SSD_TOTAL_GB` REPORTÉE par Google (« resubmit après 48 h ou avec plus d'historique billing » — pas un refus définitif). État 15/07 soir : 432/500, dont **400 = boot disks pd-balanced des 4 nœuds gvisor** (aucun pd-ssd n'existe ; pd-balanced compte DANS ce quota). Seule sortie structurelle : recréer le pool gvisor avec boot disks **pd-standard 200 Go** (throughput ≈ équivalent, coût identique, `DISKS_TOTAL_GB` 4,2/20 To) → SSD ~32/500 et autoscale débloqué. GO d'Avi requis (drain = redémarrage des pods workspaces). Ménage fait : spike-workspace-pvc (2 Go SSD) + 19 PVC d'orgs de test E2E supprimées.
⚠️ `--reuse-values` : les nouvelles clés chart (`serverDeployImageRepo`, `nixStorePvc`…) n'atteignent la release que via UN `--set` manuel (fait après passage CD), ensuite persistées.

