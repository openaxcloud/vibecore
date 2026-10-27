---
id: BUG-AGENT-ADVANCED-ESCAPE-20261027
---

## Bug

Escape ne ferme pas les paramètres avancés de l’agent depuis le sous-menu modèle. Observation authentifiée transmise par le parent le27octobre2026 à20:03–20:07UTC, navigateur cloud desktop1180×757 sur #819 livré ; le dialogue de contexte se ferme correctement. Hypothèse code : le raccourci global en capture consomme Escape avant le propriétaire du panneau et de son portail. Reproduction locale confirmée ; preuves et limites ci-dessous.

## 📤 Dispatché

☑ 27/10/2026 — diagnostic et correctif ciblé autorisés, sans reprendre le lot groupé interrompu.

## 💻 Codé

☐ main — correctif local validé ; publication en PR distincte en préparation.

## ✅ Testé live

☐ production — défaut observé par le parent ; correction validée localement sur données synthétiques, aucun projet client modifié.

## Preuves

[Reproductions, validation et limites](ui-agent-followup-2026-10-27/README.md).
