# PLAN_REMAINING_UNIFIED — plan de travail (source de vérité)

États par point : 📤 Dispatché · 💻 Codé (commité+poussé sur main) · ✅ Testé live (écran + greps, web/tablette/mobile le cas échéant).
Un point n'est « fait » QUE quand ✅ est coché.

## Server deploy Phase A — « Publish = snapshot du workspace → image → run » (décision Avi 15/07)

Contexte : le chemin boot-script (détection Node → tarball source → install/build au boot) est l'impasse par-langage.
Cible Replit : le déploiement EST le workspace, imagé. Mesures baseline (15/07, prod) : cold boot boot-script depuis 0 réplique = **91 s** (Next.js « nextproofb2 ») ; réponse chaude 0,45 s.

| Point | 📤 | 💻 | ✅ | Notes |
|---|---|---|---|---|
| A1. serverApp pods : ECODE_DEPLOYMENT=1 + probe 5 s (règle Replit) + montage /nix kill-switch | ✅ | ✅ `1738afc0` | ✅ **15/07** | pod app : env `ECODE_DEPLOYMENT=1`, volume `nix-store` présent (Python) |
| A2. Plumbing nixStorePvcName per-request (API→manager→k8s), allowlist projet | ✅ | ✅ `1738afc0`+`f32aa5f6` | ✅ **15/07** | allowlist `WORKSPACE_NIX_PROJECTS`; workspace+app Python montent /nix ; flip global intact |
| A3. Snapshot COMPLET (deps incluses) uploadé depuis le pod (URL signée PUT) | ✅ | ✅ `43080762`+`abc3f282` | ✅ **15/07** | ⚠️ fix `abc3f282` : Content-Type dupliqué → 403 signature V4 GCS ; corrigé, upload 703 Ko/5,4 Mo OK |
| A4. Builder Cloud Build : Dockerfile généré générique, push AR, taille rapportée | ✅ | ✅ `ca021f99` | ✅ **15/07** | builds 27s/56s, images 163/168 MB, digest+taille lus depuis AR |
| A5. Chemin image flag-gated `SERVER_DEPLOY_SNAPSHOT_IMAGE=1` (flag absent = boot-script octet pour octet) | ✅ | ✅ `f32aa5f6` | ✅ **15/07** | flag live via `helm --set` (rev 834) |
| A6. `.ecode/deploy.json` {run,build} générique (équivalent `.replit [deployment]`) | ✅ | ✅ `f32aa5f6` | ✅ **15/07** | Python publié via run déclaré, **zéro code par-langage** |
| A7. Infra : repo AR `vibecore-prod-apps`, IAM, PV nix zone-a, clés chart | ✅ | ✅ `63fdcde1` + live | ✅ **15/07** | + fix IAM live : GSA platform `serviceAccountUser` (actAs) sur compute SA 267592214411 (sinon Cloud Build 403). PV nix zone-a PROUVÉ. |
| A8. Preuve live Node : app publiée PAR L'ENDPOINT RÉEL du bouton → 200 | ✅ | ✅ | ✅ **15/07** | Express, `POST /projects/:id/deployments` provider=server. Snapshot 703 Ko → GCS, image **163 MB** en **27s**, **publish→READY 44s**, **cold boot 22s** (scale-0→200), chaud 0,43s, corps `ECODE_DEPLOYMENT=1`. |
| A9. Preuve live Python : app publiée PAR L'ENDPOINT RÉEL du bouton → 200, zéro code par-langage | ✅ | ✅ | ✅ **15/07** | `.ecode/deploy.json` run=`.venv/bin/python app.py` honoré. venv nix-python 3.12.8 + flask 3.0.3. Snapshot 5,4 Mo → GCS, image **168 MB** en **56s**, READY 71s, **cold boot 23s**, corps `ECODE_DEPLOYMENT=1`. Pod app monte `/nix` RO (zone-a). |
| A10. Mesures jour-1 : cold boot image-path + taille d'image | ✅ | ✅ | ✅ **15/07** | **cold boot 22s (Node) / 23s (Python)** < cible 30s (vs 91s boot-script) ; tailles 163/168 MB « 8 Gio ; build 27/56s ; persistés en métadonnées + loggés |

Règles dures Replit déjà en place : port externe unique (Service 80→PORT), health `/` budget 5 s (A1), FS non persistant par publish (image immuable), idle 15 min par défaut (`SERVER_DEPLOY_IDLE_MINUTES`), `ECODE_DEPLOYMENT=1` (A1).
Reste hors Phase A : unités de facturation Autoscale (1 CPU-s=18 / 1 GoRAM-s=2), tiers Reserved VM ($20/$40/$80/$160), changement de type en place.

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
