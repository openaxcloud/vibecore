# AUDIT DE COUVERTURE — le plan canonique vs TOUT l'existant

Date : 2026-07-19. Question d'Avi : « es-tu sûr qu'il ne manque rien dans ce
plan qu'on avait dans nos derniers plans et tous nos fichiers de tâches,
Replit parity, missing bolt features… ? »

**Réponse courte : NON, le plan canonique n'est pas complet vis-à-vis de
l'existant.** Il couvre très bien son propre périmètre (architecture de parité
Replit : Gallery/Import/Remix/DB/Storage/Billing-ledger/Agent/Auth/GCP), mais
sur **~320 points encore ouverts** retrouvés dans les anciens plans et fichiers
de tâches, **seuls ~13 (4 %) ont une référence exacte** dans le plan ou ses
registres. Le détail et les chiffres reproductibles sont ci-dessous.

## 0. Méthode (reproductible)

- **Référence de couverture** = branche `docs/plan-parite-replit-canonique`
  (HEAD `9ac8f232`) : `docs/parity/PLAN_PARITE_REPLIT.md` (792 lignes) +
  registres `P0_REGISTRY.yaml` (19 P0), `UNKNOWN_REGISTRY.yaml` (19 UNK),
  `DECISION_REGISTRY.yaml` (11 DEC), `SURFACE_REGISTRY.yaml` (4 surfaces),
  `OBSERVATION_REGISTRY.yaml`, `PARITY_STATUS.md`, `APPROVAL_STATUS.json`.
  NB : `PLAN_PARITE_REPLIT_LIVRAISON.md` à la racine est **identique octet
  pour octet** au plan canonique (diff vide).
- **Sources confrontées** (29 fichiers lus intégralement, repo + working
  tree, doublons `.claude/worktrees/*` exclus) :
  - actifs racine : `REPLIT_PARITY.md`, `PLAN_REMAINING_UNIFIED.md`,
    `BUG_INVENTORY_LIVE.md`, `DESIGN_PROGRAM_MASTER.md`, `DESIGN_AUDIT_LIVE.md`
  - bolt : `docs/AUDIT_BOLT_HIDDEN_FEATURES.md`, `docs/BOLT_BASELINE_MAP.md`,
    `docs/BOLT_FEATURE_PLACEMENT_MATRIX.md`, `docs/MIGRATION_FROM_BOLT.md`,
    `outputs/BOLT_BACKEND_FRONTEND_GAP.md`, `outputs/BOLT_SURFACING_STATUS.md`
  - parité Replit : `docs/REPLIT_PARITY_MATRIX.md`, `docs/REPLIT_PARITY_SPEC.md`,
    `docs/REPLIT_PARITY_DELIVERY.md`, `docs/REPLIT_BILLING_PARITY.md`,
    `outputs/REPLIT_PARITY.md`, `outputs/REPLIT_LEGAL_SECURITY_PARITY_GAP.md`,
    `.vibecore-audit/replit-measurements.md`
  - go-live/état : `docs/REMAINING_BLOCKERS.md`, `docs/COMPLETION_MATRIX.md`,
    `docs/DEFERRED_HARDENING.md`, `docs/GO_LIVE_CHECKLIST.md`,
    `outputs/ETAT_FINAL_100.md`, `outputs/MASTER_100_PERCENT.md`,
    `outputs/VIBECORE_AUDIT_LOG.md`, `outputs/DESIGN_AUDIT_LIVE.md`,
    `outputs/BUG_INVENTORY.md`, `outputs/QA_PANEL_SCENARIOS.md`,
    `outputs/UI_PROOF_SCENARIOS.md`
  - divers : `docs/INTEGRATIONS_MASTER_PLAN.md`, `TRIAGE-BUGS-2026-06-19.md`
- **Règle** : « COUVERT = OUI » uniquement avec une référence exacte (section §
  du plan ou ID P0-/UNK-/DEC-/SRF-/ligne PARITY_STATUS). Doute → NON.
  « ACTIF » = absent du plan mais encore porté par un des 5 fichiers de suivi
  actifs (donc pas perdu, mais pas dans le plan).
- Greps de contrôle (0 hit dans plan+registres) : `File History`, `skill`,
  `pane`, `Tools dock`, `Spotlight`, `starter`, `Reserved`, `scheduled`, `SSD`.

## 1. Chiffres

| Famille de sources | points ouverts confrontés | couverts (réf. exacte) | manquants |
|---|---:|---:|---:|
| Fichiers de suivi actifs racine | ~46 | 10 | ~36 (dont 31 « ACTIFS » : suivis hors plan) |
| Docs bolt (« missing bolt features ») | 24 | 0 | 24 |
| Anciens docs parité Replit | ~61 (dédupliqués) | 3 | ~58 |
| Go-live / production-readiness / outputs | ~190 | 0 franc (~8 partiels) | ~182 |
| **Total** | **~320** | **~13 (4 %)** | **~300** |

Les ~300 manquants ne sont pas 300 sujets distincts : ils se regroupent en
**5 familles** (§3). Beaucoup datent de mai–juin et certains sont périmés ou
livrés depuis — chaque table le note — mais **aucun** n'a d'ID dans le plan ou
un registre, donc rien ne PROUVE leur clôture : c'est exactement le genre de
trou que le plan lui-même interdit (« un fait non mesuré n'est pas un fait »).

## 2. Ce qui est bien couvert (les 13 OUI)

| Source | Point | Où dans la référence |
|---|---|---|
| REPLIT_PARITY.md TPL-02.2 (reste : Remix→IDE à l'écran) | preuve UI remix | plan §10 rang 5 + `DEC-OWNER-D5-E2E-ACCOUNT` + `uiGaps` §7/§12.4 |
| REPLIT_PARITY.md TPL-02.3 (hub Import 12 sources) | import | plan §3.3 `[RPL-24]` + `P0-V3-06` + D4 lots |
| REPLIT_PARITY.md TPL-02.4 (projet vide) | Empty | plan §3.3 (« 12 entrées dont Empty ») — couverture mince (entrée d'inventaire, pas de point UX dédié) |
| PLAN_REMAINING AGM-4/5/9/10/11 (sous-aspects ⬜) | agent modes | `PARITY_STATUS.md` sous-table AGM, ligne à ligne |
| PLAN_REMAINING B6 (gates policy/scan) + B7 (cosign) | pipeline | `PARITY_STATUS.md` ligne Phase B (« B6/B7 ⬜ ») + plan §4.5 (signatures) |
| REPLIT_PARITY_SPEC:556 (Starter private/password deploys) | accès apps | plan §4.6 `[RPL-23]` + `UNK-AUTH-ACCESS-LIVE` + `AUTH_ACCESS_CONTRACT.md` |
| REPLIT_PARITY_SPEC:659 (modes gated par plan) | agent | plan §3.8 (403 typés, E2E-AGM-*) + `SRF-IDE-COMPOSER` `mode-locked-by-plan` |
| REPLIT_PARITY_SPEC:599 (metering compute-units + $1.20/M req) | autoscale | `PARITY_STATUS.md` ligne Zone Z1–Z5 ✅ 16/07 (Z3/Z4) |

Couvertures **partielles** (structure présente, point précis non tracé) :
vertical créer→publier→rollback (§7 `verticalReady`), rollback interne
(`E2E-VERTICAL-ROLLBACK`, `P0-V3-08`, D2), billing minimum sûr
(`UNK-BILLING-MINIMAL-IMPL` — ce n'est PAS le go-live Stripe), import sécurisé
(`P0-V3-06`), perte de zone Nix (`UNK-NIX-MULTIZONE-IMPL`), DR en tant que
contrat (`OPERATIONS_DR.md`), mécanisme de preuve UI (D5).

## 3. MANQUANTS — ce qui n'est ni dans le plan ni dans un registre

### Famille A — Features produit Replit suivies ailleurs mais ABSENTES du plan de parité (le plus incohérent avec l'objet du plan)

| Source exacte | Point | Statut | Encore suivi ? |
|---|---|---|---|
| PLAN_REMAINING TASK3-FH-1..4 ; DESIGN_PROGRAM RPL-FH-001.1–.6 ; outputs/REPLIT_PARITY:11-16 | **File History** (bouton History, slider, Compare Latest, restore append-only, playback) — feature Replit documentée (`features/version-control/file-history`) | 📤 dispatché, 💻⬜ | ACTIF (2 fichiers) — mais 0 mention dans le plan |
| PLAN_REMAINING TASK3-SK-1..3+QA-1 ; DESIGN_PROGRAM RPL-SK-001.1–.4 | **Agent Skills** (`.agents/skills/<name>/SKILL.md`, progressive disclosure, audit anti-prompt-injection) | 📤, 💻⬜ | ACTIF — 0 mention dans le plan |
| PLAN_REMAINING IDE-LAYOUT-1..10 ; DESIGN_PROGRAM RPL-IDE-001.1–.10 | **Project Editor Window→Panes→Tabs** + Tools dock + Resources panel + Spotlight + terminologie (doc Replit `editor-and-tools.md`) | 📤, 💻⬜ | ACTIF — 0 mention dans le plan |
| PLAN_REMAINING:76 (note) ; REPLIT_PARITY_SPEC:618-624 | **Tiers Reserved VM** ($20/$40/$80/$160) + **changement de type de déploiement en place** ; plus largement le plan ne modélise AUCUN type de déploiement Replit (static/autoscale/scheduled/reserved-vm) — « scheduled » : 0 hit dans le plan alors que SCHEDULED-01 vient d'être prouvé live | note, jamais tracé | NON (une phrase « Reste hors Phase A ») |
| REPLIT_PARITY.md / PLAN_REMAINING / DESIGN_PROGRAM TPL-02.5 | 6 starters historiques → démos publiées/fixtures | 📤, 💻⬜ | ACTIF — absent du plan |
| REPLIT_PARITY.md TPL-02.PROOF | preuve « prompt ET import ET remix → IDE → runtime → Preview → publish » : D5 ne couvre que remix + Python neuf ; la branche **import→publish** n'est nulle part | 📤, 💻⬜ | ACTIF — partiel |
| REPLIT_PARITY_SPEC:555,562,563,569,575,638,658,662 ; MATRIX:112,123 | **Enforcement des entitlements par plan** : Starter 1 app publiée / 2 GB / liens 30 j (job d'expiry), badge « Made with » (retrait payant), publish regions, Pro 50 viewers, parallel agents 1/2/10, allowances egress (Core 100 GiB), per-user caps Enterprise, Enterprise single-tenant/static-IP/VPC-peering/data-warehouse/Security Center CVE | ⬜/🔶 | NON — peut-être dans les « 18 P1 non tracés » que le plan avoue (§9, §12.8), mais invérifiable : les P1 ne sont listés nulle part |
| .vibecore-audit/replit-measurements.md ; outputs/ETAT_FINAL:23-26 | **Parité pixel** : mesures live tokens/panneaux Deploy+Git jamais appliquées ; REPLIT #1-4 chrome IDE (« re-verify vs Replit ») ; décision light-theme flaggée pour Avi | ouvert | NON — le plan dit « pixel parity » UNE fois (§10 rang 7) sans ID ni périmètre ; `REPLIT_PARITY.md` actif ne couvre plus que la Gallery |

### Famille B — Go-live du billing legacy (SHADOW) et son lien avec le nouveau ledger

Le système crédits EXISTANT (CreditWallet/checkpoints/packs/PAYG — codé, testé,
certifié SHADOW en prod, cf. REPLIT_PARITY_MATRIX §1-19 : 31 lignes 🟡) n'a
**aucun ID** dans le plan/registres, et la question « ancien wallet vs nouveau
ledger §3.7 : migration ? remplacement ? » n'est arbitrée nulle part.

| Source | Point | Statut |
|---|---|---|
| MATRIX:61-124 | flip `BILLING_CREDITS_ENABLED` + sortie du SHADOW | 🟡 dormant |
| MATRIX:243 ; DELIVERY:381-384 ; BILLING_PARITY:203-216 | Stripe LIVE : créer produits/prix + rotation clé (action Avi, 2 clics) | ⏳ Avi |
| BILLING_PARITY:212-216 | backfill `migrateLegacyPlanKey` (pro→core, team→pro, free→starter) | ⏳ |
| MATRIX:239 ; BILLING_PARITY:221-228 | metering DB-compute heures actives | 🟡 |
| DELIVERY:61 | toggle annuel dans `/upgrade` (backend prêt, UI absente) | ⏳ |
| MATRIX:151-152 | inactivity-GC : `INACTIVITY_GC_ENABLED` encore DRY-RUN | 🟡 |

### Famille C — Dette bolt : ~24 items ouverts, couverture ZÉRO

Source faisant foi : `outputs/BOLT_BACKEND_FRONTEND_GAP.md` (le plus récent,
preuves file:line). Aucun de ces points n'apparaît dans le plan, un registre,
ni un fichier de suivi actif.

| Source | Point | Sévérité source |
|---|---|---|
| GAP:102 | IDE Integrations : `sync` = no-op, catalogue hardcodé | 🔴 P1 |
| GAP:103 | Debugger sans DAP (breakpoints décoratifs) | 🔴 P1 |
| GAP:104 | **Workflows utilisateur : cron/schedule jamais déclenché** (feature morte confirmée par ETAT_FINAL:49 ; ≠ BUG-CRON-001 plateforme, ≠ SCHEDULED-01 deployments) | 🔴 P1 |
| GAP:105 | billing.tsx n'appelle jamais `GET /billing/invoices` (endpoint existant) | 🟡 P1 |
| GAP:106 | Notifications : pas de cloche/badge dans le shell | 🟡 P1 |
| GAP:107, 110, 111, 112, 113 | ProfileTab / CloudProvidersTab BYOK / 5 formulaires PAT / NotificationsTab / verrous fichiers = **localStorage qui se fait passer pour du serveur** | 🔴 P1-P2 |
| GAP:114 | DevTools console/network limités | 🟡 P2 |
| GAP:117, 118 | 12 métriques Prometheus jamais peuplées ; métriques collectées non affichées | 🔴 P3 |
| GAP:119, 120 | endpoints admin sans UI (refund-notes, logs/redact, quota-overrides) ; pod-log streaming sans surface | 🔴 P3 |
| GAP:123, 124, 125, 126 | routes orphelines ; marketing statique avec API inutilisée ; nav marketing morte (SaaSLayout) ; UX Enterprise (RBAC create-only, SSO write-only) | P4 |
| GAP:129 | owner-gated : PITR WAL-replay jamais prouvé (`DB_ROLLBACK_ENABLED` OFF) ; Stripe live ; Connectors OAuth live ; deploy providers externes réels | gated |
| MIGRATION_FROM_BOLT:86-94 | Phase 5 cleanup (prompts runtime-aware, stacktraces, E2E 2 modes, fallback WebContainer licencié) | conditionnel |

### Famille D — Production-readiness / go-live historique (~190 points, 0 OUI franc)

`docs/GO_LIVE_CHECKLIST.md` (104 gates `[ ]`), `docs/REMAINING_BLOCKERS.md`
(34), `docs/COMPLETION_MATRIX.md` (30 partial), `docs/DEFERRED_HARDENING.md`
(3). Familles entièrement absentes de toute référence ET des fichiers actifs :

- **Isolation prouvée live** : admission gVisor, denied-traffic drill, NetworkPolicies, Kyverno Audit→Enforce (DEFERRED_HARDENING:75-85 — orphelin).
- **Drills Stripe** (checkout/portal/webhooks idempotents/upgrade-downgrade) et config prod OIDC/SAML/SIEM/OTEL.
- **Load tests k6** (5 scénarios, jamais exécutés) + cibles beta/1k/10k users.
- **Restore drills** Cloud SQL PITR + storage avec RTO/RPO mesurés (le plan pose le principe « un backup non restauré n'est pas un backup » dans OPERATIONS_DR mais AUCUN item ne trace le drill).
- **Pentest externe, canary secrets cross-surfaces, CSRF browser-wide, audit navigateur des actions admin dangereuses.**
- **Mobile/desktop release** : signing iOS/Android, TestFlight/Play, APNs/FCM, app-link host, auto-updater — SURFACE_REGISTRY ne contient que 4 surfaces web.
- **Juridique** : relecture juriste ToS/Privacy/DPA/SLA, boîtes appeals@/DMCA (LEGAL_GAP:36-38), SOC2 owners.
- **Migration React Router 7** pour purger `turbo-stream` (advisory sécurité, plan 5 étapes, 6-8 semaines — DEFERRED_HARDENING:9-48, orphelin total).
- **Node-pool OAuth scopes réduits** (blue-green supervisé — orphelin).
- Collaboration multi-writer (pas de CRDT/OT) ; 23 drives QA navigateur + ~12 scénarios UI (D5 fournit le mécanisme, aucun scénario n'y est inscrit).

### Famille E — Orphelins ponctuels (nulle part, à décider un par un)

| Source | Point | Note |
|---|---|---|
| MASTER_100:185-188 | **`GET /orgs/:orgId/invitations` renvoie `tokenHash`** — fix écrit, jamais commité | **RE-VÉRIFIÉ AUJOURD'HUI (19/07) : toujours présent** — `services/api/src/app.ts:17532` renvoie les invites sans strip, `prisma-store.ts:7113` inclut `tokenHash` (les 4 autres endpoints invitation strippent, la liste NON). P2 sécurité vivant. |
| MASTER_100:186-187 ; SURF:258 | dette lint app.ts / billing.tsx (~10-15 erreurs bloquant pre-commit) | orphelin |
| DESIGN_PROGRAM:7 | **`DESIGN_BATCH_SOLUTIONS_SPEC.md` référencée mais ABSENTE du working tree** — n'existe que dans le stash `5ddc11d9` (`git stash list` → « zone-sync-66c0c245-dirty-tree-preserved ») | risque de perte réel (arbre volatil auto-reset) |
| ETAT_FINAL:109 | flake CI `onTaskUpdate` workspace-manager (~16 min) | orphelin |
| outputs/DESIGN_AUDIT_LIVE:37,42,127,161,214,301,347-351 | reliquat design A–I : A1 tokens dark-brand jamais portés, E18/E27 SLA placeholders, G13 type-to-confirm, F15/F16 SSO-enforce/SCIM colonnes différées, H23 certif live, I3/I6/I18/I20/I21/I25 | ne vivent QUE dans outputs/ (le DESIGN_PROGRAM_MASTER actuel ne porte plus A–I) |
| outputs/BUG_INVENTORY:35-36 | CH2 clé React fallback, I2 code mort | P2 différés documentés |
| docs/INTEGRATIONS_MASTER_PLAN:411 | proxy `POST /agent-services/:service/*` (Phase 2) | déféré |
| PLAN_REMAINING:104 | **quota SSD** : recréer le pool gvisor en pd-standard 200 Go (GO Avi requis, autoscale bloqué sinon) | uniquement une note ⚠️, aucun ID |
| ETAT_FINAL:97-105 ; LEGAL_GAP:37-38 ; measurements:43-47 | **7 actions strictement Avi** éparpillées : produits+clé Stripe, login admin pour certif, juriste, boîtes mail appeals/DMCA, SLA support, GO light-theme, GO pool SSD | aucune liste consolidée nulle part |

## 4. Verdict (mots simples)

**Non, il manque des choses.** Le plan canonique est excellent sur SON sujet
(l'architecture de parité Replit) et il est honnête sur ses limites (il avoue
lui-même que 18 P1 d'audit ne sont pas tracés). Mais par rapport à tout ce
qu'on suivait avant, voilà ce qui n'est ni dans le plan ni dans ses registres :

1. **Des morceaux de Replit qu'on avait décidé de copier** : File History,
   Agent Skills, l'éditeur en panneaux (Window→Panes→Tabs), les types de
   déploiement Reserved VM/Scheduled, les limites par plan (1 app Starter,
   50 viewers Pro, badge payant, etc.), les starters→démos, et la parité
   pixel mesurée. Ils vivent encore dans les fichiers de suivi actifs (donc
   pas perdus), mais un « plan de parité Replit » qui ne les mentionne pas
   est incomplet par rapport à son propre titre.
2. **L'allumage du billing existant** : tout le système de crédits déjà codé
   attend en mode « ombre » (Stripe à activer, bascule à faire) et le plan
   décrit un NOUVEAU système sans dire ce qu'on fait de l'ancien.
3. **La dette bolt** : ~24 points encore ouverts (Workflows morts, Debugger
   factice, panneaux qui stockent en local en se faisant passer pour du
   serveur…) — zéro trace nulle part.
4. **Tout le programme « mise en production sérieuse »** : tests de charge,
   exercices de restauration, pentest, isolation prouvée, sortie mobile/
   desktop, juridique — ~190 points historiques sans aucun ID aujourd'hui.
5. **Une poignée d'orphelins précis**, dont **une fuite sécurité P2 encore
   vivante aujourd'hui** (la liste des invitations d'organisation expose le
   hash du jeton), une spec design qui n'existe plus que dans un stash, et
   7 actions qui n'attendent qu'Avi.

**Quoi faire** : pour chaque famille, soit l'ajouter au plan (le registre P1
promis pour le 15/08 est le véhicule naturel — familles A et B en priorité),
soit écrire noir sur blanc « hors périmètre du plan, suivi dans <fichier> ».
Aujourd'hui c'est implicite, donc invérifiable — exactement ce que le plan
interdit partout ailleurs. Trois urgences indépendantes du plan : le fix
`tokenHash` (5 lignes), sortir `DESIGN_BATCH_SOLUTIONS_SPEC.md` du stash, et
la liste consolidée des 7 actions Avi.
