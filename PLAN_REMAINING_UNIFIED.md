# PLAN_REMAINING_UNIFIED — plan de travail (source de vérité)

États par point : 📤 Dispatché · 💻 Codé (commité+poussé sur main) · ✅ Testé live (écran + greps, web/tablette/mobile le cas échéant).
Un point n'est « fait » QUE quand ✅ est coché.

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

## TÂCHE 2 — Galerie de templates

| Point | 📤 | 💻 | ✅ | Notes |
|---|---|---|---|---|
| TPL-02. Recherche, filtres catégorie/stack, vignettes réelles, vues grille/liste, catalogue JS/TS élargi, schéma + endpoints de publication communautaire | ✅ | ☐ | ☐ | Aucun Python/Go/Rust. Chaque template doit créer un projet et rendre une preview. Captures avant/après soumises à Avi avant tout push. |
