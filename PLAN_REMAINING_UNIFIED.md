# PLAN_REMAINING_UNIFIED — plan de travail (source de vérité)

États par point : 📤 Dispatché · 💻 Codé (commité+poussé sur main) · ✅ Testé live (écran + greps, web/tablette/mobile le cas échéant).
Un point n'est « fait » QUE quand ✅ est coché.

## AGENT — 3 modes + routage admin avec marge (décision Avi 16/07)

Décision produit validée par audit Replit : Replit n'a AUCUN sélecteur de modèle nulle part ; nous en affichons 147 (« AI Model Selection — 147 available », incl. `Gemini Robotics-ER 1.6` = modèle robotique). Cible : 3 modes (Lite / **Economy = défaut** / Power) dans l'IDE uniquement, aucun nom de modèle dans l'UI, réglages par UTILISATEUR ; table de routage admin versionnée avec coût de revient + marge. Preuve = parcours réel UI → control plane → modèle → réponse ; artefacts dans `docs/deploy-evidence/`.

| Point | 📤 | 💻 | ✅ | Notes |
|---|:---:|:---:|:---:|---|
| AGM-1. Supprimer le menu « 147 modèles » de la landing (aucun nom de modèle sur marketing) | ✅ | ⬜ | ⬜ | Preuve : mesure DOM e-code.ai, zéro nom de modèle |
| AGM-2. Supprimer tout sélecteur modèle/provider de la création de projet | ✅ | ⬜ | ⬜ | Aucune question modèle avant la création |
| AGM-3. Supprimer le sélecteur modèle/provider de l'IDE (chat Bolt) | ✅ | ⬜ | ⬜ | Aucun nom de modèle dans l'IDE |
| AGM-4. Segmented control 3 modes dans l'IDE + ⌘⇧I (Lite / Economy défaut / Power) + garde-fou Lite | ✅ | ⬜ | ⬜ | Libellés : Lite « Rapide et économique… », Economy « Le bon équilibre. », Power « Pour les tâches complexes. » |
| AGM-5. Advanced settings : High effort (Economy+Power, jamais Lite, escalade seulement sur tâches dures + « +0 credit » sinon) ; Turbo (Power only, OFF, activable admin org) | ✅ | ⬜ | ⬜ | Réglages par UTILISATEUR, pas par projet |
| AGM-6. Routage serveur mode→modèle (config versionnée, PAS un déploiement) + refus mode non autorisé par plan | ✅ | ⬜ | ⬜ | Défauts : Economy=Claude Opus 4.8 ×1, High effort=Fable ×2 (tâches dures only), Turbo=OpenAI 5.6 ×2 |
| AGM-7. Log par appel admin-only { userId, projectId, mode, highEffort, escaladeDeclenchee, providerReel, modeleReel, tokensIn/Out, coutRevient, creditsFactures, marge } | ✅ | ⬜ | ⬜ | Invisible client |
| AGM-8. Écran Admin → Agent → Routage des modèles (revient /1M in/out, multiplicateur, prix crédits, marge % et €, volume 30j, dispo plan, actif) + alerte marge négative bloquante | ✅ | ⬜ | ⬜ | Réutilise Rate Card versionné `packages/billing` (`1ea573b4`) |
| AGM-9. Simulateur avant application + historique complet (qui/quoi/quand, marge avant/après) + versionnage effectiveFrom/effectiveTo/sourceDate | ✅ | ⬜ | ⬜ | |
| AGM-10. Ligne classifieur harness (rapide/cheap, non facturé, revient visible) | ✅ | ⬜ | ⬜ | Coût d'exploitation |
| AGM-11. Nudge Economy→Power si boucle, max 1×/projet | ✅ | ⬜ | ⬜ | |
| AGM-12. Preuves live (a)–(f) : DOM sans nom de modèle, 3 modes IDE, mode change le modèle appelé (log), coût diffère, refus par plan, alerte marge | ✅ | ⬜ | ⬜ | Artefacts bruts `docs/deploy-evidence/` |

## TÂCHE 3 — File History + standard ouvert Agent Skills (décision Avi 15/07)

Sources vérifiées le 2026-07-15 : documentation Replit `features/version-control/file-history` et spécification ouverte `agentskills.io/specification`. File History reste indépendant de l'interface Git ; les skills interopérables vivent dans `.agents/skills/<name>/SKILL.md` et suivent un chargement progressif. Tout catalogue externe est soumis à audit avant activation.

| Point | 📤 | 💻 | ✅ | Notes |
|---|:---:|:---:|:---:|---|
| TASK3-FH-1. Historique persistant par fichier, automatique et indépendant de Git | ✅ | ⬜ | ⬜ | Isolation projet/tenant, pagination et rétention documentée |
| TASK3-FH-2. Bouton History + panneau autonome + navigation slider/flèches/clavier | ✅ | ⬜ | ⬜ | Fichier texte ouvert uniquement ; loading/error/empty explicites |
| TASK3-FH-3. Compare Latest inline + restore append-only non destructif | ✅ | ⬜ | ⬜ | Restore crée une nouvelle version et ne supprime aucun historique |
| TASK3-FH-4. Playback réel des modifications | ✅ | ⬜ | ⬜ | Play/pause, vitesse, progression et respect reduced-motion |
| TASK3-SK-1. Compatibilité Agent Skills `.agents/skills/<name>/SKILL.md` | ✅ | ⬜ | ⬜ | Frontmatter conforme au standard ouvert, ressources relatives conservées |
| TASK3-SK-2. Progressive disclosure catalogue → activation → ressources | ✅ | ⬜ | ⬜ | Seuls name+description au démarrage ; corps chargé à la demande |
| TASK3-SK-3. Pipeline d'audit anti-prompt-injection pour catalogue externe | ✅ | ⬜ | ⬜ | Quarantaine, provenance, hash, findings, approbation/révocation et audit log |
| TASK3-QA-1. Tests API/UI/sécurité + validation live web/tablette/mobile | ✅ | ⬜ | ⬜ | Aucune coche ✅ avant preuve écran + greps |

## Project Editor — layout Replit Window → Panes → Tabs (décision Avi 15/07)

Source : documentation Replit `editor-and-tools.md`. Le modèle doit préserver l'IDE Bolt existant et exclut strictement le déploiement, Kubernetes, `workspace-manager` et le runtime Nix.

| Point | 📤 | 💻 | ✅ | Notes |
|---|:---:|:---:|:---:|---|
| IDE-LAYOUT-1. Inventaire Bolt + captures avant web/tablette/mobile | ✅ | ⬜ | ⬜ | Grep avant création ; captures avant obligatoires |
| IDE-LAYOUT-2. Modèle typé et persistant Window → Panes → Tabs | ✅ | ⬜ | ⬜ | Un tab = exactement un outil |
| IDE-LAYOUT-3. Split H/V redimensionnable + tab déplacé entre panes + pane flottant | ✅ | ⬜ | ⬜ | Preuves d'interaction réelles exigées |
| IDE-LAYOUT-4. Tools dock gauche + popup All tools recherchable | ✅ | ⬜ | ⬜ | Ouverture d'un outil réel dans un tab |
| IDE-LAYOUT-5. Menu Options du tab actif : actions window/pane/tab | ✅ | ⬜ | ⬜ | Actions réelles + clavier |
| IDE-LAYOUT-6. Resources panel RAM/CPU/Storage | ✅ | ⬜ | ⬜ | Données réelles + skeleton + erreur récupérable |
| IDE-LAYOUT-7. Spotlight page au clic sur le nom du projet | ✅ | ⬜ | ⬜ | Ouverture/fermeture réelle |
| IDE-LAYOUT-8. Terminologie Project Editor / Workspace organisationnel | ✅ | ⬜ | ⬜ | Vérification UI + greps ciblés |
| IDE-LAYOUT-9. Responsive et accessibilité web/tablette/mobile | ✅ | ⬜ | ⬜ | À valider à l'écran + greps + captures après |
| IDE-LAYOUT-10. Présentation des captures avant/après à Avi avant tout push | ✅ | ⬜ | ⬜ | Aucun commit/push sans décision explicite d'Avi |

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
| A8. Preuve live Node : app publiée PAR L'ENDPOINT RÉEL du bouton → 200 | ✅ | ✅ | ✅ **15/07** | Express, `POST /projects/:id/deployments` provider=server. Snapshot 703 Ko → GCS, image **163 MB** en **27s**, **publish→READY 44s**, **cold boot 22s** (scale-0→200), chaud 0,43s, corps `ECODE_DEPLOYMENT=1`. img `p-<proj>:<dep>` |
| A9. Preuve live Python : app publiée PAR L'ENDPOINT RÉEL du bouton → 200, zéro code par-langage | ✅ | ✅ | ✅ **15/07** | `.ecode/deploy.json` run=`.venv/bin/python app.py` honoré. venv nix-python 3.12.8 + flask 3.0.3. Snapshot 5,4 Mo → GCS, image **168 MB** en **56s**, READY 71s, **cold boot 23s**, corps `ECODE_DEPLOYMENT=1`. Pod app monte `/nix` RO (zone-a). |
| A10. Mesures jour-1 : cold boot image-path + taille d'image | ✅ | ✅ | ✅ **15/07** | **cold boot 22s (Node) / 23s (Python)** < cible 30s (vs 91s boot-script) ; tailles 163/168 MB « 8 Gio Replit ; build 27/56s ; taille+build+durée persistés en métadonnées + loggés |

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

## TÂCHE 2 — Gallery d'applications publiées et remixables

| Point | 📤 | 💻 | ✅ | Notes |
|---|---|---|---|---|
| TPL-02.1 Gallery communautaire d'applications publiées/remixables | ✅ | ☐ | ☐ | Cartes riches, recherche, catégorie, type, technologies, tri, featured, modération, signalement, aperçu fonctionnel, permissions et provenance. |
| TPL-02.2 Remix/Fork isolé et analysé par l'Agent | ✅ | ☐ | ☐ | Nouveau projet/propriétaire/repo/workspace/locks ; aucun secret ; données isolées ; lien source. |
| TPL-02.3 Hub Import — 12 sources documentées | ✅ | ☐ | ☐ | GitHub/express, Bitbucket, Vercel, Figma, Claude, Bolt, Lovable, Base44, ZIP, Spreadsheet, Previous Agent export, Empty. Screenshot exclu. |
| TPL-02.4 Projet vide sans Agent/framework/scaffolding | ✅ | ☐ | ☐ | Voie power-user conservée. |
| TPL-02.5 Six starters historiques → démos publiées/remixables et/ou fixtures E2E | ✅ | ☐ | ☐ | Aucune carte Python/Go/Rust. |
| TPL-02.PROOF Prompt, import et remix créent chacun un projet publiable | ✅ | ☐ | ☐ | Pour chacun : vrai projectId → IDE → runtime → Preview → publish. Captures avant/après soumises à Avi avant tout push. |
