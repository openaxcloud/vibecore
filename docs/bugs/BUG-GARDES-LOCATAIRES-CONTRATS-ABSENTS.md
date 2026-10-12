---
id: BUG-GARDES-LOCATAIRES-CONTRATS-ABSENTS
section: "2026-10-11 — Reprise des protections multi-locataires"
---

## Bug

La branche `feat/p0-a2-14-tenant-guardrails` appelle des contrats absents du module,
des stores et du catalogue public. Mesure : neuf routes de test en échec sur
`assertTenantActionContext is not a function`, confirmés par le typage.

## État

Correction préparée et testée localement, non fusionnée et non servie. Voir
[les mesures et contre-épreuves](../reprise/2026-10-11-gardes-locataires.md).
Le chart désactive toujours la protection ; l’isolation réelle GCP reste ouverte.
