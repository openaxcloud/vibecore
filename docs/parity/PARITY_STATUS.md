# PARITY_STATUS — état de parité, 3 états SÉPARÉS par point

schemaVersion: 1
repoCommit: fee92bd0b09159247383814023ae63db8875dd7d
États: 📤 Dispatché · 💻 Codé (commité+poussé main) · ✅ Testé live (écran +
greps, web/tablette/mobile). Un point n'est « fait » QUE quand ✅ est coché.
Sources de détail: `REPLIT_PARITY.md` (parité fonctionnelle+pixel),
`PLAN_REMAINING_UNIFIED.md` (plan), `DESIGN_PROGRAM_MASTER.md` (design),
`BUG_INVENTORY_LIVE.md` (bugs). Ce fichier est la VUE AGRÉGÉE des chantiers
parité en cours — il ne remplace pas les 4 fichiers de suivi.

| Chantier | 📤 | 💻 | ✅ | Détail |
|---|:---:|:---:|:---:|---|
| Agent modes + routage (AGM-1→11) | ✅ | ✅ (dc2d6c9d→fee92bd0) | ⬜ | preuves a–f PENDING (déploiement en cours) — E2E_PROOFS.yaml |
| AGM-12 preuves live a–f | ✅ | ⬜ | ⬜ | E2E-AGM-A/B/C/E/F |
| Server deploy Phase A (A1–A10) | ✅ | ✅ | ✅ 15/07 | snapshot→image→run prouvé Node+Python |
| Phase B pipeline reproductible + Nix v2 (B0–B5,B8) | ✅ | ✅ | ✅ 15/07 | B6/B7 (gates, cosign) ⬜ |
| Zone autoscale/tailles machine/AR (Z1–Z5) | ✅ | ✅ 1ea573b4 | ✅ 16/07 | metering runtime prouvé live |
| P0-02 registres parité (12 fichiers) | ✅ | ⬜ (cette PR) | ⬜ | validateur = preuve d'existence, pas de complétude |
| P0-04 collecteur baseline quotidien | ✅ | ⬜ (cette PR) | ⬜ | 1er snapshot réel 2026-07-16 commité |
| Remix/Import/CloudTenant/IAM/Rollback/Checkpoint | ✅ (spec) | ⬜ | ⬜ | DOMAIN_MODEL.md — implémentation NON commencée |
