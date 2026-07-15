# PLAN_REMAINING_UNIFIED — plan de travail (source de vérité)

États par point : 📤 Dispatché · 💻 Codé (commité+poussé sur main) · ✅ Testé live (écran + greps, web/tablette/mobile le cas échéant).
Un point n'est « fait » QUE quand ✅ est coché.

## Server deploy Phase A — snapshot→image→run (décision Avi 15/07)

🔴 **CORRECTION D'ARCHITECTURE (audit Avi 15/07)** : « snapshot du pod **vivant** → image » est TROP LITTÉRAL et dangereux — capture caches, secrets, état non reproductible ; publication non rejouable, rollback illusoire. **Le pod de dev vivant n'est JAMAIS la source directe de vérité.**
Pipeline correct : `révision projet + ecode.lock.json + lockfiles → gates policy → build reproductible ISOLÉ → image signée | bundle statique → AR → adapter de promotion → Autoscale | Always-on | Scheduled | Static`.
→ Ce qui tourne en prod (A1–A11 ci-dessous) est un **PROTOTYPE DE MÉCANISME PROUVÉ** (workspace → image → run, live 200 Node+Python), **PAS la source-de-vérité de production**. Le vrai pipeline est **couplé à Nix v2** : le builder isolé a besoin du toolchain épinglé (Cloud Build n'a pas `/nix` → build reproductible Python impossible sans lui) ; `ecode.lock.json` est le lock partagé Preview/Build/Publish/Scheduled. Vérifié 15/07 : project-storage (`/data/vibecore/projects/<id>`, git par projet) est **DÉSYNCHRONISÉ du workspace** (scaffold seul) → maillon manquant = sync workspace→révision immuable avant build.
Corrections actées : « Autoscale=Cloud Run / Reserved=GCE » **PAS** un fait (contrats produit connus, backends inconnus → adapter+POC) · Image Streaming = root-fs only, pas le volume /nix, fallback silencieux (vérif par métriques) · modèle **Project → Artifacts** (7 max, 1 mobile, backend/secrets partagés, publication ATOMIQUE).

COLDSTART-01 (fait, `f8f56262`, artefact `docs/server-deploy-evidence/2026-07-15/coldstart-01-decomposition.txt`) : 20 boots décomposés. **Pull image 163 Mo non-caché = 1,155s → PAS le goulot** ; dominant = boot-app→Ready ~6-7s (readinessProbe) ; routage ~2s ; total chaud ~10,5s. **Image Streaming ne gagnerait ~rien** (réfuté). Les **91s** étaient un deploy **boot-script** (npm install au boot), pas le chemin image — comparaison RETIRÉE. Variante nœud-froid (scale-up) non mesurée (bloquée quota SSD).

| Point | 📤 | 💻 | ✅ | Notes |
|---|---|---|---|---|
| A1. serverApp pods : ECODE_DEPLOYMENT=1 + probe 5 s (règle Replit) + montage /nix kill-switch | ✅ | ✅ `1738afc0` | ✅ **15/07** | pod app : env `ECODE_DEPLOYMENT=1`, volume `nix-store` présent (Python) |
| A2. Plumbing nixStorePvcName per-request (API→manager→k8s), allowlist projet | ✅ | ✅ `1738afc0`+`f32aa5f6` | ✅ **15/07** | allowlist `WORKSPACE_NIX_PROJECTS`; workspace+app Python montent /nix ; flip global intact |
| A3. Snapshot COMPLET (deps incluses) uploadé depuis le pod (URL signée PUT) | ✅ | ✅ `43080762`+`abc3f282` | ✅ **15/07** | ⚠️ fix `abc3f282` : Content-Type dupliqué → 403 signature V4 GCS ; corrigé, upload 703 Ko/5,4 Mo OK |
| A4. Builder Cloud Build : Dockerfile généré générique, push AR, taille rapportée | ✅ | ✅ `ca021f99` | ✅ **15/07** | builds 27s/56s, images 163/168 MB, digest+taille lus depuis AR |
| A5. Chemin image flag-gated `SERVER_DEPLOY_SNAPSHOT_IMAGE=1` (flag absent = boot-script octet pour octet) | ✅ | ✅ `f32aa5f6` | ✅ **15/07** | flag live via `helm --set` (rev 834) |
| A6. `.ecode/deploy.json` {run,build} générique (équivalent `.replit [deployment]`) | ✅ | ✅ `f32aa5f6` | ✅ **15/07** | Python publié via run déclaré, **zéro code par-langage** |
| A7. Infra : repo AR `vibecore-prod-apps`, IAM, PV nix zone-a, clés chart | ✅ | ✅ `63fdcde1` + live | ✅ **15/07** | + fix IAM live : GSA platform `serviceAccountUser` (actAs) sur compute SA 267592214411 (sinon Cloud Build 403). PV nix zone-a PROUVÉ. |
| A8. Preuve live Node : Publish → 200 | ✅ | ✅ | 🟠 **15/07 — endpoint, PAS clic UI** | ⚠️ HONNÊTE : appelé via `POST /projects/:id/deployments` provider=server (l'action du bouton), **PAS un clic-souris dans l'IDE** — l'auth navigateur m'est interdite (injection session / saisie mot de passe). Le flux Publish réel s'exécute → app live 200. Express, image **163 MB** en 27-29s, publish→READY 44-45s, **cold boot 22s**, `ECODE_DEPLOYMENT=1`. Artefacts : `docs/server-deploy-evidence/2026-07-15/`. |
| A9. Preuve live Python : Publish → 200, zéro code par-langage | ✅ | ✅ | 🟠 **15/07 — endpoint, PAS clic UI** | même caveat que A8. `.ecode/deploy.json` run=`.venv/bin/python app.py` honoré. venv nix-python 3.12.8 + flask 3.0.3, image **168 MB** en 56s, READY 71s, **cold boot 23s**, pod monte `/nix` RO (zone-a), `ECODE_DEPLOYMENT=1`. |
| A11. Preuve dev-preview Python : deps → serveur → `/ports` → preview REND | ✅ | ✅ | ✅ **15/07** | flask :5000 via `/commands/stream`, `/ports`→`{port:5000,url:https://ws-…-5000.preview.e-code.ai}`, preview **HTTP 200** avec corps. ⚠️ `uv` bloqué (wheel glibc vs base musl → Nix v2) ; venv+pip utilisé. Artefact : `dev-preview-python-ports.txt`. |
| A10. Mesures jour-1 : cold boot image-path + taille d'image | ✅ | ✅ | ✅ **15/07** | **cold boot 22s (Node) / 23s (Python)** < cible 30s (vs 91s boot-script) ; tailles 163/168 MB « 8 Gio ; build 27/56s ; persistés en métadonnées + loggés |

Règles dures Replit déjà en place : port externe unique (Service 80→PORT), health `/` budget 5 s (A1), FS non persistant par publish (image immuable), idle 15 min par défaut (`SERVER_DEPLOY_IDLE_MINUTES`), `ECODE_DEPLOYMENT=1` (A1).
Reste hors Phase A : unités de facturation Autoscale (1 CPU-s=18 / 1 GoRAM-s=2), tiers Reserved VM ($20/$40/$80/$160), changement de type en place.

## Server deploy Phase B — pipeline reproductible + Nix v2 (15/07, correction d'architecture `d013e5fd`)

Décisions committées : `docs/DEPLOY_REPRODUCIBLE_PIPELINE.md` (pipeline) + `docs/NIX_V2_DECISION.md` (Nix v2 : nixpkgs 26.05 rev `8eeec934ae0d`, Nix 2.34.8, store partagé RO, compilateur d'env central, `ecode.lock.json`, build via Job in-cluster — le blocage « Cloud Build n'a pas /nix » est dissous par design).

| Point | 📤 | 💻 | ✅ | Notes |
|---|---|---|---|---|
| B0. readinessProbe app+workspace : échantillonnage 1 s (baseline mesurée 6-7 s start→Ready) | ✅ | ✅ `b2558c41` | ☐ | fenêtres de panne inchangées (30 s / 15 s) ; mesure post-deploy à faire |
| B1. Snapshot-révision (source seule, sha256 pod-side, `revisions/server-deploy/<id>.tgz`) | ✅ | ✅ | ☐ | `snapshotWorkspaceRevision` + specs |
| B2. Pod de build isolé (gVisor, emptyDir, /nix RO optionnel, label egress server-deploy, AUCUNE PVC workspace) | ✅ | ✅ | ☐ | `appBuildPod` (k8s-client) + `runAppBuild` + route manager `/app-builds/run` + specs |
| B3. Câblage flag-gated `SERVER_DEPLOY_REVISION_PROJECTS` (allowlist projet, vide = chemin A octet pour octet) | ✅ | ✅ | ☐ | `buildImageContextFromRevision` ; Cloud Build ne re-build plus (COPY seul) ; clés chart ajoutées (⚠️ `--reuse-values` : 1er `--set` manuel requis) |
| B4. Preuve live Node : Publish réel via révision → URL 200 + artefact rejouable | ✅ | ☐ | ☐ | |
| B5. Store Nix v2 (26.05 pinné) + bundles d'activation + preuve Python | ✅ | ☐ | ☐ | dépend NIX_V2_DECISION §7 |
| B6. Gates policy/scan secrets · B7. Signature d'images (cosign) | ☐ | ☐ | ☐ | |
| B8. Interface `SandboxRuntime`/RuntimeAdapter (aucun objet métier = Pod ; microVM cible) | ✅ | ☐ | ☐ | |

⚠️ Capacité : quota régional `SSD_TOTAL_GB` 434/500 (disques pd-balanced de boot) — le scale-up zone-a a déjà échoué une fois (15/07). Demande d'augmentation de quota = action Avi (gratuite).
⚠️ `--reuse-values` : les nouvelles clés chart (`serverDeployImageRepo`, `nixStorePvc`…) n'atteignent la release que via UN `--set` manuel (fait après passage CD), ensuite persistées.

## UI/UX hors IDE — séquence validée le 2026-07-15

| Point | 📤 | 💻 | ✅ | Notes |
|---|:---:|:---:|:---:|---|
| UX1. Récupération locale des actions async de notifications (préférences, tout marquer lu, marquer lu) | ✅ | ✅ | ✅ | Rollback et retry réels couverts par 3 tests de composant. Playwright avec API réelle : panne PATCH injectée puis retry et persistance après reload à 390/768/1024/1440, clair/sombre, sans overflow. |
| UX2. i18n exhaustif hors IDE, zéro clé ou texte technique exposé | ☐ | ☐ | ☐ | Différé explicitement par Avi. |
| UX3. Cartes projet enrichies et grille responsive compacte | ✅ | ✅ | ✅ | Aperçu réel/fallback honnête, statut, activité, déploiements et CTA Open IDE ≥44 px. Matrice Playwright réelle verte à 390/768/1024/1440, clair/sombre, avec 1 colonne mobile, 2 colonnes tablette/web et zéro overflow. |
| UX4. Sélecteur de fuseau horaire IANA | ☐ | ☐ | ☐ | Différé explicitement par Avi. |
| UX5. Réduction du bleu-nuit, orange réservé aux actions, nettoyage typographique | ☐ | ☐ | ☐ | Aucun changement de palette ou de typographie appliqué. Présenter d'abord des captures comparatives avant/après pour validation d'Avi. |
| UX6. Visite guidée non bloquante | ☐ | ☐ | ☐ | Différé explicitement par Avi. |
