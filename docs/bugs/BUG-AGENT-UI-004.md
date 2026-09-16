---
id: BUG-AGENT-UI-004
---

## Bug

**P2 — en mobile, la pastille « descendre au dernier message » flotte au milieu du fil au lieu de se poser juste au-dessus de la zone de saisie.** Capture iPhone d'Avi, 04/09. Mesuré en réel (Chromium 390×844, commit `bf4f6a6`) : `bottom` calculé **145 px**, pastille à **63 px** au-dessus du composeur. Cause : la règle générale la décale de `--vc-agent-composer-measured-height` (composeur + barre du bas), comme si le composeur recouvrait le fil de toute sa hauteur ; or en mobile il ne le recouvre que de ce que son `sticky` le remonte, `--mobile-nav-height` + 10 px = **82 px** mesurés — et cette valeur ne dépend pas de la hauteur du composeur. Le bureau (1440) n'était pas touché : 6 px au-dessus du composeur, `bottom: 12px`.

## 📤 Dispatché

☑ 04/09

## 💻 Codé

☑ 04/09 (`main`)

## ✅ Testé live

☐ à confirmer sur l'iPhone d'Avi

## Preuve

preuve live locale 04/09 : écart 63 → **12 px** à 390 et à 768 ; + épinglé par `app/styles/agent-action-list-density.spec.ts` (le décalage reprend le terme exact de remontée du composeur) et `tests/e2e/agent-action-list-density.spec.ts` (écart mesuré entre 0 et 24 px après remontée réelle du fil). Rattaché à AGM-02 dans `DESIGN_PROGRAM_MASTER.md`.

