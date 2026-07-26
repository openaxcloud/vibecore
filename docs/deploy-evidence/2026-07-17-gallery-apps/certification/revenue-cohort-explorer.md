# Certification réelle — Revenue Cohort Explorer (`revenue-cohort-explorer`)

**Date** : 2026-07-26 · **Verdict : COMPLET** · **98 contrôles exercés, 98 OK, 0 CASSÉ, 0 correction nécessaire**

- App : client-only Vite 8.1.4 + React 19.2.7 + TS, dataset déterministe embarqué (seed `20260401`, 153 comptes, 12 cohortes Jan→Déc 2025, observées jusqu'à Mar 2026).
- Serveur exercé : `vite --host 127.0.0.1 --port 44130 --strictPort` depuis `.rebuild/dev-revenue-cohort-explorer/`.
- Pilotage : vrai Chromium (Playwright 1.59.1, `$WT/node_modules`), viewport 1440×1000 sauf mention, capture de `pageerror` **et** `console.error` sur toute la durée du run.
- Preuves : `certification/revenue-cohort-explorer/*.png` (42 captures).

## Méthode — pourquoi les chiffres sont vraiment vérifiés

Le harnais ne se contente pas de lire l'UI : il recalcule **indépendamment**, à partir du dataset brut
(`src/data/revenue-data.ts` importé hors navigateur), la heatmap (rétention revenue = Σrev[m]/Σrev[0] ;
rétention logo = actifs/taille), les 4 KPIs, et chaque ligne du tableau de drill-down, puis compare au DOM
caractère par caractère (formats `$1,234`, `102.6%`, `8 mo` inclus). Les tris sont validés sur **l'ordre réel
des valeurs** (re-tri des lignes lues dans le DOM avec le comparateur attendu + tie-break par nom), pas
seulement sur l'attribut `aria-sort`.

## Inventaire des contrôles (relevé exhaustif du DOM, 3 vues)

| Vue | Éléments interactifs |
|---|---|
| Heatmap | 6 × `button.segment` (Revenue / Logo / All / Starter / Growth / Enterprise) + **114 × `rect.heatmap-cell[role=button]`** |
| Drill-down N1 | les 6 segments + `button.back-button` + 5 × `button.sort-button` + 12 × `tr[role=button]` |
| Détail N2 | idem + `button.close-button` |
| Liens | **aucun `<a>`** dans l'app |

Aucun contrôle inerte : les 114 cellules et toutes les lignes d'une cohorte ont été activées une par une (voir sweeps ci-dessous).

## Tableau contrôle → résultat → preuve

| # | Contrôle | Résultat | Preuve |
|---|---|---|---|
| 1 | Boot / nœud racine `data-gallery-app-id` rendu | OK | `01-initial-revenue-all.png` |
| 2 | KPI banner (Revenue / All) = dataset — NRR 85.9%, total $1.08M, best 105.2% Aug 2025, worst 92.5% Feb 2025 | OK | `01` |
| 3 | Les 4 KPIs non vides (jamais `n/a`, label + note présents) | OK | `01` |
| 4 | Heatmap : 12 lignes cohortes, horizon triangulaire 15→4 | OK | `01` |
| 5 | Valeurs des cellules = rétention revenue recalculée du dataset | OK | `01` |
| 6 | Aucune ligne vide (12 libellés `Jan '25`…`Dec '25`) | OK | `01` |
| 7 | Chip de portée : `All plans · 153 accounts` | OK | `01` |
| 8 | Rampe de légende (24 stops) rendue | OK | `01` |
| 9 | Toggle rétention → **Logo** : `aria-pressed` bascule | OK | `02-mode-logo-all.png` |
| 10 | Logo : valeurs heatmap = actifs/taille du dataset | OK | `02` |
| 11 | Logo : les chiffres **changent réellement** (row0 `100,102,102,96,95,98` → `100,100,92,75,75,67`) | OK | `02` |
| 12 | Logo : KPIs recalculés et conformes (best 92.3% Aug 2025, worst 61.5% Feb 2025) | OK | `02` |
| 13 | Logo : valeurs KPI différentes du mode revenue | OK | `02` |
| 14 | Retour **Revenue** : heatmap identique à l'état initial | OK | `02` |
| 15-18 | Filtre **Starter** : `aria-pressed`, chip `Starter only · 77 accounts`, heatmap recalculée, KPIs (NRR 24.3%, $103.5K, « 43 of 77 accounts still active ») | OK | `03-plan-starter.png` |
| 19-22 | Filtre **Growth** : chip `51 accounts`, heatmap recalculée, KPIs (NRR 70.8%, $336.8K, 45/51) | OK | `04-plan-growth.png` |
| 23-26 | Filtre **Enterprise** : chip `25 accounts`, heatmap recalculée, KPIs (NRR 121.0%, $641.2K, 25/25) | OK | `05-plan-enterprise.png` |
| 27-30 | Filtre **All** : chip `153 accounts`, heatmap + KPIs restaurés (113/153) | OK | `06-plan-all.png` |
| 31 | Tooltip au **survol** : `Apr 2025 · M+4 / 102.6% revenue retained / $6,323 of $6,163` — conforme au dataset | OK | `07-tooltip-hover.png` |
| 32 | Tooltip retiré au `mouseleave` | OK | `07` |
| 33 | **Tab** depuis les contrôles atteint la 1ʳᵉ cellule (roving tabindex) | OK | `08-tooltip-keyboard-focus.png` |
| 34 | Tooltip apparaît **au focus clavier** (pas seulement au survol) | OK | `08` |
| 35 | Cellule focalisée : `aria-label` descriptif complet | OK | `08` |
| 36 | Flèches ←↑→↓ déplacent le focus entre cellules (saut de ligne correct) | OK | `09-keyboard-arrow-nav.png` |
| 37 | **Enter** sur cellule focalisée ouvre le drill-down de CETTE cellule (`Jan 2025 cohort · M+1`) | OK | `10-keyboard-enter-drilldown.png` |
| 38 | **Espace** sur cellule focalisée ouvre le drill-down (`Jun 2025 cohort · M+3`) | OK | `11-keyboard-space-drilldown.png` |
| 39 | Retour heatmap depuis un drill-down ouvert au clavier | OK | `11` |
| 40-43 | Clic cellule **2025-01/M+0** : titre, mois calendaire + « 12 of 12 accounts », 12 lignes = exactement la cohorte, MRR/plan/statut/lifetime de chaque ligne conformes **à ce mois-là** | OK | `12-drilldown-2025-01-m0.png` |
| 44-47 | Clic cellule **2025-03/M+5** (`Aug 2025 — 8 of 11`) — idem, 11 lignes vérifiées | OK | `13-drilldown-2025-03-m5.png` |
| 48-51 | Clic cellule **2025-08/M+3** (`Nov 2025 — 13 of 13`) — idem, 13 lignes vérifiées | OK | `14-drilldown-2025-08-m3.png` |
| 52-55 | Clic cellule **2025-12/M+3** (`Mar 2026 — 10 of 12`) — idem, 12 lignes vérifiées | OK | `15-drilldown-2025-12-m3.png` |
| 56 | Tri par défaut = MRR descendant (`aria-sort` + ordre réel des valeurs) | OK | `16-sort-default-mrr-desc.png` |
| 57-58 | Tri **Customer** asc puis desc — `aria-sort`, indicateur ▲/▼, ordre réel, autres colonnes à `none` | OK | `17`, `18` |
| 59-60 | Tri **Plan** asc/desc (Enterprise→Starter puis inverse) | OK | `19`, `20` |
| 61-62 | Tri **Status** asc/desc (Churned d'abord / Active d'abord) | OK | `21`, `22` |
| 63-64 | Tri **MRR at month** desc/asc (`$3,593…` / `$0,$0,$175…`) | OK | `23`, `24` |
| 65-66 | Tri **Lifetime** desc/asc (`4 mo…` / `1 mo,2 mo,4 mo…`) | OK | `25`, `26` |
| 67-73 | Détail N2 compte **churné** (Bluepeak Logistics Group) : ouverture, plan Starter, lifetime 8 mois, revenu $1,300, `Churned at M+8 · Sep 2025` + **marqueur de churn** (1 ligne pointillée orange), sparkline SVG (16 points / 15 mois, paths non triviaux), échelle `M+0: $171 / Peak: $171 / M+14: $0`, 0 chevauchement, fermeture par ✕ | OK | `27-customer-detail-churned.png` |
| 74-80 | Détail N2 compte **actif** (Harlow Dental Inc) : plan Enterprise, 15 mois, $48,588, `Still active` + **0 marqueur de churn**, sparkline 15 points, échelle `$2,954 / $3,568 / $3,443`, 0 chevauchement, fermeture par ✕ | OK | `28-customer-detail-active.png` |
| 81-82 | Ligne de tableau ouvrable au clavier (**Enter** et **Espace**) | OK | `29-customer-detail-keyboard-enter.png` |
| 83 | Bouton « ← All cohorts » ramène à la heatmap | OK | `30-back-to-heatmap.png` |
| 84 | Changer de plan pendant un drill-down réinitialise la vue (pas de cohorte périmée) | OK | `31-plan-change-resets-view.png` |
| 85 | **Reload** : heatmap et KPIs strictement identiques (dataset déterministe) | OK | `32-after-reload.png` |
| 86 | **Reload** puis même cellule → tableau de drill-down byte-identique ; la vue repart bien sur la heatmap | OK | `33-reload-drilldown-consistency.png` |
| 87 | Aucun chevauchement de texte (boîtes réelles) : header 11 nœuds, KPIs 12, panel-head 3, légende 2 | OK | `34-layout-integrity.png` |
| 88 | Aucun débordement horizontal de page à 1440px (`scrollWidth == clientWidth`) | OK | `34` |
| 89 | Aucune vue vide : header/KPI/heatmap/footer présents, texte et hauteur > 0 | OK | `34` |
| 90 | **Zéro `pageerror` / `console.error` applicatif** sur tout le run (et zéro bruit `@vite/client`/HMR à distinguer) | OK | — |
| 91 | **Sweep exhaustif : les 114 cellules cliquées une par une** — titre cohorte+mois, mois calendaire, compte d'actifs, nombre de lignes, et **somme des MRR du tableau == somme du dataset** pour ce mois : 0 écart | OK | log sweep |
| 92 | **Sweep exhaustif des lignes** : les 15 comptes de Jul 2025 / M+4 ouverts un par un (bon nom, sparkline présente, 4 blocs meta) : 0 écart | OK | log sweep |
| 93-94 | Responsive **desktop 1440** : heatmap et détail sans débordement de page | OK | `35-responsive-desktop-*.png`, `36-…` |
| 95-96 | Responsive **tablette 768** : contrôles/KPIs reflowent (KPI 230px), 0 débordement heatmap et détail | OK | `35-responsive-tablet-*.png`, `36-…` |
| 97-98 | Responsive **mobile 390** : empilement complet (KPI 474px), 0 débordement de page ; heatmap et tableau ont leurs propres conteneurs `overflow-x:auto` **réellement scrollables** (heatmap 692→324px, scrollLeft 368 ; table 560→322px, scrollLeft 238, dernière colonne « Lifetime » rendue entièrement visible) | OK | `36-responsive-mobile-detail.png`, `37-mobile-heatmap-scrolled-right.png`, `38-mobile-table-scrolled-right.png` |

## Confirmations explicites demandées

- **Aucune vue vide** — heatmap, drill-down (12 vues cohorte × tous les mois) et détail client rendent tous du contenu réel ; contrôle #89 mesure texte + hauteur de chaque région.
- **Aucun contrôle inerte** — inventaire DOM complet des 3 vues ; 114/114 cellules et 15/15 lignes activées individuellement, en plus des 6 segments, 5 en-têtes de tri (×2 sens), back et close.
- **Aucun texte qui se chevauche** — détection géométrique par boîtes englobantes sur header, KPIs, panel-head, légende et panneau de détail (0 intersection), plus revue visuelle des captures.
- **Données réelles du dataset** — chaque chiffre affiché (KPIs, 114 cellules, lignes de tableau, méta et échelle du sparkline) est comparé à un recalcul indépendant depuis `revenue-data.ts`.
- **Cohérence après reload** — heatmap, KPIs et tableau de drill-down identiques après rechargement ; la vue repart sur la heatmap (aucun état persisté, comportement attendu pour cette app sans stockage).
- **Zéro pageerror applicatif** — 0 `pageerror` et 0 `console.error` sur l'ensemble du run ; aucun bruit `@vite/client`/HMR n'a été émis non plus (donc rien à écarter).

## Corrections

**Aucune.** Le code n'a pas été modifié → pas de régénération de
`packages/template-catalog/src/apps/revenue-cohort-explorer.ts` requise.

Contrôles d'intégrité effectués malgré tout :

- L'arbre certifié (`.rebuild/dev-revenue-cohort-explorer`, 16 fichiers) est **byte-identique** au module publié `packages/template-catalog/src/apps/revenue-cohort-explorer.ts` (16 fichiers, comparaison contenu par contenu) → ce qui a été certifié est bien ce qui est livré.
- `src/data/revenue-data.ts` est **verbatim identique** à `.rebuild/shared/revenue-data.ts` (sha256 `c7da35b01d9e…`), donc toujours partagé tel quel avec le QBR Generator.

## Validation officielle (rejouée, sans `--skip-install`)

```
GALLERY_EVIDENCE_DIR=…/runtime tsx scripts/validate-gallery-demo-apps.ts --app=revenue-cohort-explorer --port=43130
[gallery] 1/1 passed
```

Rapport : `docs/deploy-evidence/2026-07-17-gallery-apps/runtime/gallery-demo-app-validation-revenue-cohort-explorer.json`
— `install: passed`, `typecheck: passed`, `build: passed`, `httpStatus: 200`, `pageErrors: []`,
`contentHash fb4a7624d0e41dfa…`, 16 fichiers, Chromium 147.0.7727.15.

## VERDICT : **COMPLET**

98/98 contrôles OK, 0 cassé, 0 pageerror applicatif, 0 correction. Serveur de dev arrêté en fin de run.
