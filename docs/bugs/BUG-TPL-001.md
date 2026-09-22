---
id: BUG-TPL-001
section: "2026-08-12 — Lot Avi « les bases » (5 bugs, priorité ABSOLUE)"
---

## Bug

**`POST /orgs/:orgId/projects/from-template` ignore totalement `templateName`.** Quel que soit le modèle choisi, `starterFiles()` (`services/api/src/app.ts:5976`) renvoie **le même squelette Vite générique** — strictement identique à celui d'un projet vierge. `templateName` n'est utilisé que dans deux **chaînes de texte** (le README et une phrase de prompt). Le paquet `@vibecore/template-catalog`, qui contient pourtant de vrais scaffolds (`northstar-operations-demo`, `pulse-api-monitor-demo`, `kindred-booking-demo`, `next`), **n'est importé nulle part dans `services/api/src/`**. De plus **aucune validation** : un `templateName` inexistant est accepté en silence (201) au lieu d'un 400.

## 📤

✅ 12/08

## 💻

☑ 09/09

## ✅

**Revérifié le 09/09 : corrigé.** `templateName` est exigé par le schéma et réellement consulté (`getGalleryDemoApp`) : chaque modèle échafaude SON application, plus la coque Vite générique identique pour tous.

## Preuve

☐ live iPhone

