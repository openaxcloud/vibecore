# Certification réelle — Incident Postmortem Explainer (`incident-postmortem-explainer`)

**Date :** 2026-07-24
**App :** client-only Vite + React 19, animation timeline pilotée par `requestAnimationFrame` (aucune dépendance Remotion). Toute la scène est fonction pure du temps (ms) sur une durée de 30 s.
**Serveur de dev réel :** `vite --host 0.0.0.0 --port 44150 --strictPort` → http://127.0.0.1:44150/ (Node v24.10.0, shim `PATH=$WT/.rebuild/bin`, `NODE_OPTIONS=--no-use-system-ca`).
**Pilotage réel :** Chromium (Playwright) — 2 contextes : normal, puis `reducedMotion: 'reduce'`. 38 assertions exécutées, 0 échec, 0 `pageerror`, 0 `console.error`. Preuves : 9 captures + `results.json` dans `certification/incident-postmortem-explainer/`.

> Note démarrage : la commande documentée `pnpm dev -- --port 44150` insère un `--` littéral que Vite interprète comme fin-d'options → le port est ignoré (Vite retombe sur 5173→5175). Contourné en appelant le binaire vite directement avec `--port 44150 --strictPort`. Aucune modification de code n'a été nécessaire.

## Tableau contrôle → résultat → preuve

### Mode NORMAL (animation, autoplay)

| Contrôle / propriété | Résultat | Preuve |
|---|---|---|
| Scène non vide dès le chargement | OK | 72 nœuds SVG ; `01-normal-load.png` |
| Autoplay actif (bouton = « ❚❚ Pause », `aria-pressed=true`) | OK | `01-normal-load.png` |
| Animation avance réellement dans le temps | OK | playhead 500 ms → 1700 ms en ~1,2 s |
| Scène évolue (statuts services quittent « Healthy ») | OK | `["Healthy","Degraded","Degraded"]` @ 0:04.2 ; `02-normal-midplay.png` |
| **Play/Pause** — pause fige le playhead | OK | 4300 ms == 4300 ms après 0,9 s ; `03-normal-paused.png` |
| **Play/Pause** — play relance | OK | 4350 ms → 5250 ms |
| **Replay** (↺) — remet à 0 puis joue | OK | start=0 → 700 ms |
| **Scrubber** (input range) — met en pause | OK | bouton repasse « ▶ Play » |
| **Scrubber** — saute au temps ciblé (9,0 s) | OK | value=9000, horloge 0:09.0 |
| **Scrubber** — synchronise phase = Impact | OK | badge « Impact », narration « Impact » |
| Scène @ 9 s : nœud(s) Critical + p95 > SLO | OK | 3× Critical, p95=1957 ms ; `04-normal-seek-9s-impact.png` |
| **Scrubber** — saut fin (29,5 s) | OK | value=29500, horloge 0:29.5 |
| @ fin : 3 learnings actifs, 8 entrées de log actives, nœuds revenus Healthy | OK | `05-normal-seek-end-learnings.png` |
| **Chapitre → Detection** (0:00) | OK | horloge 0:00.0, phase+active+narration = Detection |
| **Chapitre → Impact** (0:06) | OK | horloge 0:06.0 |
| **Chapitre → Mitigation** (0:13) | OK | horloge 0:13.0 ; `06-normal-chapter-mitigation.png` |
| **Chapitre → Resolution** (0:21) | OK | horloge 0:21.0 |
| **Chapitre → Learnings** (0:27) | OK | horloge 0:27.0 |
| Narration `aria-live="polite"` présente | OK | 1 région |
| Zéro `pageerror` / `console.error` | OK | aucun |

### Mode REDUCED-MOTION (stepper, `reducedMotion: 'reduce'`)

| Contrôle / propriété | Résultat | Preuve |
|---|---|---|
| Contenu visible dès le chargement (scène non vide) | OK | 72 nœuds SVG ; `07-reduced-load.png` |
| Boutons stepper présents (Restart / ‹ Previous phase / Next phase ›) | OK | `["Restart","‹ Previous phase","Next phase ›"]` |
| Pas d'autoplay (playhead statique) | OK | 0 == 0 après 1 s |
| **Previous phase** désactivé à Detection | OK | `disabled=true` ; `07-reduced-load.png` |
| Phase de départ = Detection | OK | badge « Detection » |
| **Next phase** → Impact | OK | phase Impact, 0:06.0 |
| **Next phase** → Mitigation | OK | phase Mitigation, 0:13.0 |
| **Next phase** → Resolution | OK | phase Resolution, 0:21.0 |
| **Next phase** → Learnings | OK | phase Learnings, 0:27.0 ; `08-reduced-last-phase.png` |
| **Next phase** désactivé à Learnings | OK | `disabled=true` |
| **Previous phase** → Resolution | OK | phase Resolution |
| **Restart** → temps 0 / Detection | OK | value=0, phase Detection |
| **Scrubber** fonctionne en reduced-motion (16 s → Mitigation) | OK | value=16000 ; `09-reduced-scrub-16s.png` |
| Cohérence après reload (Detection, statique, non vide) | OK | phase Detection, 72 nœuds |
| Zéro `pageerror` / `console.error` | OK | aucun |

## Confirmations exigées

- **Scène non vide dès le chargement** : OUI (72 éléments SVG dans les deux modes, confirmé visuellement).
- **Aucun contrôle inerte** : OUI — Play/Pause, Replay, Scrubber, 5 chapitres (normal) ; Restart, Previous/Next phase, Scrubber, 5 chapitres (reduced) exercés, tous produisent un effet observable.
- **Animation réellement pilotée (pas figée)** : OUI — playhead avance sur horloge murale ; statuts services, courbe p95, diamants d'action, métriques, log, learnings, badge de phase et narration évoluent tous en fonction du temps.
- **Mode reduced-motion fonctionnel** : OUI — pas de lecture continue, navigation par pas via Next/Prev, contenu visible immédiatement, cohérent après reload.

## Corrections / régénération

Aucune correction nécessaire : tous les contrôles marchent à 100 % à l'état livré. Le dev-dir n'a pas été modifié ; le catalogue `packages/template-catalog/src/apps/incident-postmortem-explainer.ts` n'a donc pas été régénéré et aucune re-validation officielle n'était requise (procédure « SI CASSÉ » non déclenchée). Rien n'a été commité ni poussé.

## VERDICT : **COMPLET**

38/38 contrôles OK, 0 erreur console/page, dans les deux modes (animation + stepper reduced-motion), preuves à l'appui.
