---
id: BUG-AGENT-INITIAL-PANEL-MEMORY-20261027
---

## Bug

À l’ouverture du projet, Agent reste sélectionné tandis que le corps affiche Webview startup ; un clic explicite sur Agent rétablit le panneau. Observation authentifiée transmise par le parent le27octobre2026 à20:03–20:07UTC, desktop1180×757. Cette largeur suit la disposition tablette ; la restauration asynchrone de ui.mobilePanel peut diverger de l’onglet actif. Contrat existant : Agent par défaut, URL explicite prioritaire. Reproduction locale confirmée ; preuves et limites ci-dessous.

## 📤 Dispatché

☑ 27/10/2026 — diagnostic et correctif ciblé autorisés, sans reprendre le lot groupé interrompu.

## 💻 Codé

☐ main — correctif local validé ; publication en PR distincte en préparation.

## ✅ Testé live

☐ production — défaut observé par le parent ; correction validée localement sur données synthétiques, aucun projet client modifié.

## Preuves

[Reproductions, validation et limites](ui-agent-followup-2026-10-27/README.md).
