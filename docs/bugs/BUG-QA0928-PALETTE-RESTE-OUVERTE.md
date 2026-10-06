---
id: BUG-QA0928-PALETTE-RESTE-OUVERTE
section: "2026-09-28 — Balayage QA avant lancement"
---

## Bug

**GÊNANT — la palette « Search tools, files, and commands… » ouverte depuis la barre d'activité ne se ferme ni quand on ouvre un autre panneau, ni sur un clic ailleurs ; elle masque le panneau ouvert.**

Seule la touche Échap la ferme. Les clics passent dessous : l'utilisateur ouvre Secrets,
Déploiements, Base de données… et voit toujours la palette par-dessus.

## Repro (LOCAL, build de prod, 1440 px)

```sh
node docs/bugs/qa-2026-09-28/fixture-local.mjs
node docs/bugs/qa-2026-09-28/repro-palette-reste-ouverte.mjs
# → {"ouverteParSearch":true,"toujoursVisibleApresClicGit":true,"apresClicDansLaZoneCentrale":true,"apresEchap":false}
```

Artefact : `artefacts/palette-par-dessus-git-1440.png` (palette par-dessus le panneau Git).

Non vérifié en production (pas de compte) ni sur téléphone.

## 📤

☑ 30/09 #614

## 💻

☑ 30/09 fusionnée `20d30026c`

## ✅

☐ pas encore servi en prod au 30/09 13:45

## Preuve

Repro locale. Aucun test — point OUVERT.

**30/09 — PROUVÉ, pas encore servi.** Vert en CI (3 requis, 1re tentative, test ✓, rapport présent). Épinglé par `tests/e2e/palette-se-ferme-au-clic-ailleurs.spec.ts`.
