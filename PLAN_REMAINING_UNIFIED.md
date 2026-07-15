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

⚠️ Capacité : quota régional `SSD_TOTAL_GB` 434/500 (disques pd-balanced de boot) — le scale-up zone-a a déjà échoué une fois (15/07). Demande d'augmentation de quota = action Avi (gratuite).
⚠️ `--reuse-values` : les nouvelles clés chart (`serverDeployImageRepo`, `nixStorePvc`…) n'atteignent la release que via UN `--set` manuel (fait après passage CD), ensuite persistées.
