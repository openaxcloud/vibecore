---
id: BUG-PURGE-PHYSIQUE-PRODUCTION-NON-PROUVEE
section: "2026-10-11 — Effacement de compte et preuves physiques"
---

## Bug

La suppression physique d’un compte n’est pas prouvée de bout en bout en
production. Les preuves historiques de test sont conservées.

## État

Reprise locale de la branche : 29 tests SQL API, 19 tests SQL du gestionnaire,
173 tests hors base et contre-épreuve de perte de lease. Voir
[les mesures et réserves](../reprise/2026-10-11-purge-reprise.md).
Aucun accès à un environnement GCS/Kubernetes de test n’est disponible ici.
Le code n’est pas fusionné, aucun drapeau ni effacement client n’est activé.
