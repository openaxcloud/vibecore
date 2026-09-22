---
id: BUG-RUNTIME-DIVERGENCE
section: "2026-08-12 — Lot Avi « les bases » (5 bugs, priorité ABSOLUE)"
---

## Bug

**Rouvrir un projet reconstruit** au lieu de montrer l'aperçu tel qu'il a été laissé.

## 📤

✅

## 💻

✅ `f037001a`

## ✅

🟠

## Preuve

Option **A**, les 3 signaux mesurés : (1) marqueur de seed = `Map` de portée module, **vide à chaque chargement de page** → marqueur durable, TTL 24 h, rejet des entrées corrompues, repli mémoire ; (2) `refreshRuntimePorts()` en `.catch(() => undefined)` rendait « sonde en échec » et « rien n'écoute » indiscernables → condition nommée `portProbeSucceeded` ; (3) révision lue sur `ideState.version`, **incrémentée par les écritures d'UI** (5→9 en une session) → nouvelle route `GET /files/revision` dérivée des fichiers. 30 fichiers / 354 tests. **Reste à confirmer à l'écran** sur une vraie réouverture à chaud.

