# PARITY_STATUS — état de parité, 3 états SÉPARÉS par point

schemaVersion: 1
repoCommit: 2b421a4598389d4402e3b3f5ad0db4cd13b11057
États: 📤 Dispatché · 💻 Codé (commité+poussé main) · ✅ Testé live (écran +
greps, web/tablette/mobile). Un point n'est « fait » QUE quand ✅ est coché.
Règle de ce fichier : on ne coche ✅ QUE ce qui a un `evidenceId` vérifiable —
jamais par déduction ni « couvert par ailleurs ». Ce qui est codé mais pas
prouvé reste 💻 avec ✅ ⬜. Sources de détail : `REPLIT_PARITY.md`,
`PLAN_REMAINING_UNIFIED.md`, `DESIGN_PROGRAM_MASTER.md`, `BUG_INVENTORY_LIVE.md`.

## Vue par chantier

| Chantier | 📤 | 💻 | ✅ | evidenceId / détail |
|---|:---:|:---:|:---:|---|
| Server deploy Phase A (A1–A10) | ✅ | ✅ | ✅ 15/07 | `docs/deploy-evidence/…` — snapshot→image→run prouvé Node+Python |
| Phase B pipeline reproductible + Nix v2 (B0–B5,B8) | ✅ | ✅ | ✅ 15/07 | `docs/deploy-evidence/2026-07-15-phase-b/` ; B6/B7 (gates, cosign) ⬜ |
| Zone autoscale/tailles machine/AR (Z1–Z5) | ✅ | ✅ `1ea573b4` | ✅ 16/07 | `docs/deploy-evidence/2026-07-16-zone-autoscale/` |
| Agent modes + routage (AGM) | ✅ | ✅ `dc2d6c9d`→`2b421a45` | 🟡 partiel | voir sous-table AGM ci-dessous — 7/11 points prouvés live, 4 codés-mais-non-prouvés |
| P0-02 registres parité (12 fichiers) | ✅ | ✅ `97759a77`+`afd741d5` | ✅ 16/07 | validateur exit 0 sur HEAD `2b421a45` + CI parity-registries **verte sur `2b421a45`** (push→success). Le validateur prouve structure/hash/snapshots-sur-disque, PAS la complétude fonctionnelle des domaines. |
| P0-04 collecteur baseline quotidien | ✅ | ✅ `97759a77` | ✅ 16/07 | run réel 6/6 sources, `docs/parity/baseline/snapshots/2026-07-16/manifest.json` (llms.txt sha256 03cbdb07…) ; CI cron 05:17 UTC armé |
| Remix (impl.) | ✅ | ✅ `bd4c334e` | 🟡 partiel | pipeline sécurisé + preuve secret-introuvable (14 tests) ; RMX-1,2,6,7 ✅ ; RMX-3,4,5 partiels (fork DB physique + copie objets = follow-up). `docs/deploy-evidence/2026-07-16-remix/` |
| Import / CloudTenant / IAM / ReleaseCatalog / Checkpoint (impl.) | ✅ (spec) | ⬜ | ⬜ | `DOMAIN_MODEL.md §2-6` — implémentation NON commencée (prochains chantiers) |

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
