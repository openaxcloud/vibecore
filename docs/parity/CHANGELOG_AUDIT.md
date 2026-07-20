# CHANGELOG_AUDIT — journal append-only des événements d'audit parité

schemaVersion: 1
repoCommit: fee92bd0b09159247383814023ae63db8875dd7d
Règle: append-only; chaque entrée = date UTC, acteur, événement, artefacts.

## 2026-07-16

- (audit externe) 19 P0 levés; P0-02 (12 registres manquants) et P0-04
  (collecteur baseline quotidien) traités dans ce commit.
- (fait vérifié, fetch réel) le changelog Replit n'est PAS hebdo-vendredi:
  llms.txt (sha256 03cbdb0706d90455…) liste 2025-11-16 (dimanche) et
  2025-11-26 (mercredi). Toute automatisation « vendredi » interdite.
- (source hashée) changelog 2026-04-17: « Power mode now runs on Anthropic's
  Claude Opus 4.7 » + segmented control Lite/Economy/Power, Turbo dans
  Advanced settings (sha256 c1f1dd962c8be057…).
- (collecte) premier snapshot baseline quotidien: 6/6 sources OK
  (docs/parity/baseline/snapshots/2026-07-16/manifest.json).
- (chantier AGM) sélecteur 147 modèles supprimé, 3 modes + routage carte
  versionnée + écran admin marge codés et poussés (dc2d6c9d→fee92bd0);
  preuves live a–f PENDING (déploiement fee92bd0 in_progress).
