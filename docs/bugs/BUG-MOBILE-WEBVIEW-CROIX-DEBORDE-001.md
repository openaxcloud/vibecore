---
id: BUG-MOBILE-WEBVIEW-CROIX-DEBORDE-001
---

## Bug

**Croix Webview au-delà du viewport mobile.** Observation transmise par le parent le 13 octobre 2026 sur la CI de la tête `9c07d3a13394050e7fedd3f7bfb759f663a1f7fe` du 12 octobre. À 23:02:58 UTC, `ide-mobile-chrome.spec.ts:1663` mesure le bord droit de la croix Webview à 406,0286 px pour une largeur de 390 px ; retry vert.

Source : [job 115041292778](https://github.com/openaxcloud/vibecore/actions/runs/38318643274/job/115041292778). Logs non retéléchargés ici. Cause non établie ; aucune attribution au correctif de restauration mobile. À traiter après le diagnostic de restauration, conformément à la priorité du parent.

## 📤 Dispatché

☑ — signal consigné, investigation différée.

## 💻 Codé

☐ — aucune correction dans ce lot.

## ✅ Testé live

☐ — signal CI transmis ; aucune reproduction locale ni validation production.
