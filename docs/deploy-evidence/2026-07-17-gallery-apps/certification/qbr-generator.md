# Certification RÉELLE — QBR Generator (`qbr-generator`)

**Date** : 2026-07-24
**App** : QBR Generator — full-stack (Express `/api/qbr/*` + React deck & data appendix, backend partagé `computeQbr()`).
**Démarrage testé** : `PORT=44140 pnpm dev` (mode dev, backend Express + Vite middleware — PAS la preview statique).
**Navigateur** : Playwright/Chromium réel (`$WT/node_modules/.pnpm/playwright@1.59.1`) sur `http://127.0.0.1:44140/`, viewport 1440×900.
**Preuves** : `certification/qbr-generator/*.png`, `results.json`, `server.log`. Driver : `drive.mjs`.

## Backend réel confirmé

- `GET /api/qbr/summary` → 200, KPIs calculés serveur (`recognizedQuarterRevenue:378431`, `activeCustomers:113`, `netRevenueRetention:1.0297…`).
- `GET /api/qbr/cohorts` → 200, 12 cohortes + 40 comptes.
- **Déterminisme** : deux appels `/api/qbr/summary` → hash SHA identique (`597d38fe…`). Reload → mêmes données.
- **Mode backend actif** : pill `LIVE BACKEND` affichée, bandeau read-only ABSENT (0). Les DEUX artefacts déclenchent des appels `/api/qbr` observés au réseau.
- Aucun chiffre en dur : deck & appendix consomment `computeQbr()` via `/api`.

## Tableau contrôle → résultat → preuve

| Contrôle | Résultat | Preuve |
|---|---|---|
| Mode backend (source pill) | OK | pill="live backend", bandeau read-only=0 |
| Artefact initial = deck | OK | `data-artifact="deck"` |
| Deck consomme /api au load | OK | réseau: `/api/qbr/summary` + `/api/qbr/cohorts` (200) |
| Slide Title — figures non-vides | OK | `$378,431 / 103% / 113` (`01-title.png`) |
| 8 dots de navigation présents | OK | 8 dots (Title…Next) |
| Chaque dot navigue + slide rend contenu | OK | 8 slides, compteur 1/8→8/8, contenu ≥195 char chacune (`slide-0…7`) |
| Bouton › (next) | OK | 1/8 → 2/8 |
| Bouton ‹ (prev) + désactivé en 1re | OK | 2/8 → 1/8, prev disabled à slide 1 |
| Next désactivé sur dernière slide | OK | disabled=true à 8/8 |
| Clic sur la slide avance | OK | clic stage → 2/8 |
| Clavier ← / → / Home / End / PageUp / PageDown | OK | 6/6 transitions correctes |
| Bouton plein écran (enter + exit, label toggle) | OK | "Full screen"→fullscreenElement set + "Exit full screen"→exit + retour "Full screen" |
| Surface impression (1 page/slide) | OK | 8 `deck__print-page` |
| KPIs = backend (non hardcodé) | OK | 5 KPIs rendus, cohérents avec `/api` (`slide-2-KPIs.png`) |
| Graphe revenus (SVG) | OK | courbe 12 mois vers 2026-03 (`slide-3-Revenue.png`) |
| Heatmap rétention (SVG) | OK | matrice cohortes×mois + légende (`slide-4-Retention.png`) |
| Bascule deck→appendix | OK | `data-artifact=appendix`, appels /api (`20-appendix.png`) |
| Table cohortes appendix peuplée | OK | 12 lignes, 180 cellules heat |
| Table comptes peuplée | OK | 40 lignes, compteur "40 accounts shown" |
| Filtre par plan (All/Enterprise/Growth/Starter) | OK | Enterprise=25 pur, Growth=15 pur, Starter=0 pur, All=40 |
| Tri (Sort by: monthly/lifetime/name) | OK | 3 ordres distincts en tête de table |
| Tri par nom = ordre alpha réel | OK | séquence triée localeCompare vérifiée |
| Lien "Open the slide deck →" | OK | appendix → `data-artifact=deck` |
| Persistance: artifact=appendix après reload | OK | URL `?artifact=appendix` conservée |
| Cohérence: mêmes données après reload | OK | "40 accounts shown" identique |
| Backend toujours actif après reload | OK | pill="live backend" |
| Réseau: summary + cohorts partent | OK | `["/api/qbr/summary","/api/qbr/cohorts"]` |
| Zéro pageerror (app-origin) | OK | 0 app-origin (voir note HMR) |
| Zéro console.error (app-origin) | OK | 0 app-origin (voir note HMR) |

**28 / 28 OK.**

## Note sur le bruit HMR (dev-only, hors app)

En mode `pnpm dev`, le client Vite tente une connexion HMR sur `ws://127.0.0.1:24678`. Ce port est occupé par un processus node **externe** (PID 35039, pas notre serveur) — `server.log` : « WebSocket server error: Port 24678 is already in use ». Les 2 pageerror / 8 console.error observés proviennent **tous** de `@vite/client` (HMR), **aucun** du code applicatif. Ce client n'existe **pas** dans le build servi par la Gallery : `grep @vite/client dist/` = 0. C'est donc du bruit d'outillage dev, inaccessible dans l'artefact livré. App-origin errors = 0.

## Corrections

Aucune. Rien de CASSÉ — aucune modification du code applicatif nécessaire. Le seul « échec » initial du driver était auto-infligé (mon script laissait le deck en plein écran headless, couvrant le header) ; corrigé en sortant du plein écran, ce qui prouve au passage que le bouton plein écran entre ET sort correctement.

## Régénération catalog / re-validation

Non requises : conditionnelles à un correctif. Aucun fichier applicatif touché — seuls `certification/qbr-generator/` et ce rapport ont été écrits. `apps/qbr-generator.ts` intact.

## VERDICT : **COMPLET**

Aucune slide vide, aucun bouton inerte, données réelles du backend Express partagé, cohérence après reload, zéro erreur applicative.
