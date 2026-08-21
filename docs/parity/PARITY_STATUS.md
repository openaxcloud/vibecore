# PARITY_STATUS — vue GÉNÉRÉE (ne pas éditer : modifier les registres ou PARITY_STATUS_NOTES.md puis régénérer)

schemaVersion: 2
repoCommit: 9847b2cd
généréPar: scripts/parity/generate-parity-status.mjs (drift-check CI)

**Statut global** : `overallStatus: NOT_APPROVED` · `highestPassedLevel: contractsPresent`
**Attestation CI** : run 32432497586 (2026-08-21T00:24:34Z, commit 9847b2cd) — verte.

| Niveau | État |
|---|---|
| documentReconciled | ✅ PASS |
| sourceBaselineReady | ✅ PASS |
| registryUniverseReady | ✅ PASS |
| contractsPresent | ✅ PASS |
| contractsValidated | ❌ FAIL (DOMAIN_MODEL.md: no real reviewer … +18) |
| implementationReady | ❌ FAIL (P0-V3-01 is OPEN … +24) |
| verticalBackendReady | ✅ PASS |
| verticalUserJourneyReady | ❌ FAIL (stage "publish" has no UI proof (une preuve API n'est pas une preuve UI) … +1) |
| betaReady | ❌ FAIL (beta gate capability still unknown: UNK-GIT-RECONCILE-DONE … +5) |
| publicLaunchReady | ❌ FAIL (betaReady not passed … +34) |
| parityBaselineReady | ❌ FAIL (surface SRF-IDE-FILE-HISTORY not done … +10) |

**Compteurs (source unique)** : P0 65 (25 OPEN · 5 PROVEN · 35 CLOSED) · P1 40 · surfaces déclarées 10 (univers 159/159 importé, 1 évaluées, 56 services) · e2e 12/12 · constats 336 → 122 work items · claims non ancrées 0 · uiGaps [publish, rollback]

---

# PARITY_STATUS_NOTES — détail par chantier, MAINTENU À LA MAIN (déclaré)

schemaVersion: 1
repoCommit: fed58e96

> Ce fichier est la SEULE partie humaine de la vue PARITY_STATUS : le détail
> par chantier (états 📤/💻/✅, evidenceIds, sous-tables). Il est embarqué
> VERBATIM par `scripts/parity/generate-parity-status.mjs` dans
> `PARITY_STATUS.md` (qui, lui, est GÉNÉRÉ et drift-checké). Règle inchangée :
> on ne coche ✅ QUE sur artefact vérifiable.

## Vue par chantier

| Chantier | 📤 | 💻 | ✅ | evidenceId / détail |
|---|:---:|:---:|:---:|---|
| Plan canonique + réconciliation registres (19 P0, targetDate ISO, niveaux nommés, sources GCP-11/12/RPL-24 hashées) | ✅ | ✅ cette PR | ⬜ | `docs/parity/PLAN_PARITE_REPLIT.md`, `APPROVAL_STATUS.json` (approved.level=architectureContracted) — ✅ après merge + CI parity-registries verte sur main |
| Server deploy Phase A (A1–A10) | ✅ | ✅ | ✅ 15/07 | `docs/deploy-evidence/…` — snapshot→image→run prouvé Node+Python |
| Phase B pipeline reproductible + Nix v2 (B0–B5,B8) | ✅ | ✅ | ✅ 15/07 | `docs/deploy-evidence/2026-07-15-phase-b/` ; B6/B7 (gates, cosign) ⬜ |
| Zone autoscale/tailles machine/AR (Z1–Z5) | ✅ | ✅ `1ea573b4` | ✅ 16/07 | `docs/deploy-evidence/2026-07-16-zone-autoscale/` |
| Agent modes + routage (AGM) | ✅ | ✅ `dc2d6c9d`→`2b421a45` | 🟡 partiel | voir sous-table AGM ci-dessous — 7/11 points prouvés live, 4 codés-mais-non-prouvés |
| P0-02 registres parité (12 fichiers) | ✅ | ✅ `97759a77`+`afd741d5` | ✅ 16/07 | validateur exit 0 sur HEAD `2b421a45` + CI parity-registries **verte sur `2b421a45`** (push→success). Le validateur prouve structure/hash/snapshots-sur-disque, PAS la complétude fonctionnelle des domaines. |
| P0-04 collecteur baseline quotidien | ✅ | ✅ `97759a77` | ✅ 16/07 | run réel 6/6 sources, `docs/parity/baseline/snapshots/2026-07-16/manifest.json` (llms.txt sha256 03cbdb07…) ; CI cron 05:17 UTC armé |
| Remix (impl.) | ✅ | ✅ `bd4c334e` | 🟡 partiel | pipeline sécurisé + preuve secret-introuvable ; RMX-1,2,6,7 ✅ ; RMX-3 CODÉ non mergé (licence+consentement versionnés, SOURCE_SANITIZED masque PII, 35 tests, branche feat/remix-license-pii) — preuve live après merge ; RMX-4,5 follow-up (fork DB physique + copie objets). `docs/deploy-evidence/2026-07-16-remix/` |
| Import (impl.) | ✅ | ✅ `7d45c2cb` | 🟡 partiel | pipeline sécurisé : aucune suppression silencieuse + staging jetable (22 tests) ; IMP-1,2,3,5 ✅ ; IMP-4 (timeout sweeper), IMP-6 (providers non exécutés), IMP-7 (débit crédits) partiels. `docs/deploy-evidence/2026-07-16-import/` |
| CloudTenant / IAM / ReleaseCatalog / Checkpoint (impl.) | ✅ (spec) | ⬜ | ⬜ | `DOMAIN_MODEL.md §3-6` — implémentation NON commencée (prochains chantiers) |

## Sous-table AGM (par point, avec l'artefact qui le couvre)

Aucun ✅ n'est coché « parce que AGM-12 couvre tout » : chaque ligne pointe
l'artefact précis, ou reste ⬜ si l'aspect n'a pas été capturé live.

| Point | 📤 | 💻 | ✅ | evidenceId précis |
|---|:---:|:---:|:---:|---|
| AGM-1 supprimer 147 modèles de la landing | ✅ | ✅ `84c860b5` | ✅ | `a-dom-scan.txt` (landing desktop/mobile/tablette : hits=[], aiModelSelection=false) |
| AGM-2 supprimer sélecteur création de projet | ✅ | ✅ `84c860b5` | ✅ | `a-dom-scan.txt` (projects-new desktop providerDropdown=false ; mobile re-scan hits=[] après fix `c94f2fdf`) |
| AGM-3 supprimer sélecteur IDE | ✅ | ✅ `84c860b5` | ✅ | `b-ide-modes-desktop.png` + scan (oldModelCombobox=false, hits=[]) |
| AGM-4 segmented 3 modes + ⌘⇧I + garde-fou Lite | ✅ | ✅ `84c860b5` | 🟡 | segmented + Economy défaut PROUVÉS (`b-ide-modes-desktop.png`, aria-checked economy=true) ; **⌘⇧I et texte garde-fou Lite NON capturés live** → ⬜ pour ces deux aspects |
| AGM-5 Advanced High effort/Turbo + escalade + « +0 credit » | ✅ | ✅ `84c860b5` | 🟡 | refus 403 PROUVÉS (`e-refus-plan.txt`) ; **popover Advanced, escalade sur tâche dure, annotation « +0 credit » NON capturés** (High effort indispo en plan free) → ⬜ |
| AGM-6 routage serveur mode→modèle + refus plan | ✅ | ✅ `d0b302fa`+`7abcb045` | ✅ | `c-routing-logs.txt` (economy→claude-opus-4-8, lite→claude-haiku-4-5, log `agent-mode.routed`) + `e-refus-plan.txt` |
| AGM-7 log par appel admin-only | ✅ | ✅ `d0b302fa`+`7abcb045` | ✅ | `d-agent-call-log.json` (mode, provider/model réels, tokens, coutRevient, credits, marge, routingCardVersion) |
| AGM-8 écran admin marges + alerte négative bloquante | ✅ | ✅ `d0b302fa`+`fee92bd0` | ✅ | `f-admin-spa-table.png` + `f-admin-spa-negative-alert.png` + `f-409-negative-margin.json` (HTTP 409) |
| AGM-9 simulateur + historique + versionnage | ✅ | ✅ `d0b302fa`+`fee92bd0` | 🟡 | simulateur PROUVÉ (`f-simulate.json`) + historique v1 active affiché (`f-admin-spa-table.png`) ; **publication d'une v2 live (versionnage effectiveFrom/effectiveTo/marge avant-après) NON exécutée** → ⬜ |
| AGM-10 ligne classifieur non facturée | ✅ | ✅ `dc2d6c9d`+`7abcb045` | 🟡 | ligne « not billed (our operating cost) » PROUVÉE présente (`f-admin-spa-table.png`, billedToUser=false) ; **appel classifieur réel loggé NON déclenché** (nécessite High effort, indispo en free) → ⬜ |
| AGM-11 nudge Economy→Power max 1×/projet | ✅ | ✅ `84c860b5` | ⬜ | **NON testé live** (aucune boucle de 4 envois Economy déclenchée pour observer le toast) |
| AGM-12 preuves live (a)–(f) | ✅ | ✅ `15262b64`+`2b421a45` | ✅ | `docs/deploy-evidence/2026-07-16-agent-modes/` (7 preuves E2E PROVEN dans `E2E_PROOFS.yaml`) |

**Bilan AGM honnête** : 7 points prouvés live (1,2,3,6,7,8,12) ; 3 partiels
(4,5,9,10 — l'aspect central est prouvé, un sous-aspect ne l'est pas) ; 1 non
testé (11 nudge). Le chantier n'est PAS « fait » à 100 % — il est déployé et le
cœur (suppression des noms de modèle + routage réel + marge admin) est prouvé.
| Backlog complet DANS le plan (§14 : 336 points exacts, 332 NON FAIT) + registres (P1-COV ×8, BD ×29, PR ×50) + certification calculable check-plan-completeness (compte+SHA-256, preuve négative exit 1) | ✅ | ✅ cette PR | ⬜ | `docs/parity/COVERAGE_GAP_AUDIT_2026-07-17.md` + `BOLT_DEBT_REGISTRY.yaml` + `PRODUCTION_READINESS_REGISTRY.yaml` — ✅ après merge + CI parity-registries verte sur main ; contenu 100 % NON_FAIT/OPEN (traçage, pas réalisation) |
