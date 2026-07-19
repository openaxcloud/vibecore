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

## 2026-07-16 (resync suivi)

- Resynchronisation `PARITY_STATUS.md` ↔ `PLAN_REMAINING_UNIFIED.md` (les deux
  divergeaient : AGM-12 ✅ dans le plan, ⬜ dans le status ; P0-02/P0-04
  « cette PR » dans le status). Vue agrégée réécrite avec 3 états par point +
  evidenceId précis.
- Règle appliquée : ✅ coché UNIQUEMENT sur artefact vérifiable, jamais par
  déduction. Bilan AGM honnête : 7 points prouvés live (1,2,3,6,7,8,12),
  3 partiels (4,5,9,10), 1 non testé (11 nudge).
- P0-02 P002-1 passé ✅ : validateur exit 0 sur HEAD `2b421a45` + CI
  parity-registries verte sur ce même HEAD (push→success). Le validateur
  prouve structure/hash/snapshots, PAS la complétude fonctionnelle des domaines.
- Prochain chantier ouvert : implémentation Remix (DOMAIN_MODEL §1),
  invariant sécurité « une valeur de secret n'entre jamais dans l'artefact de
  clone ; CREDENTIALS_DETACHED précède CLONING ».

## 2026-07-19 (assainissement secret-scan des snapshots du 16/07 — porté sur main)

- (triage sécurité) Les 3 détections du scan bloquant sur l'arbre (règle
  generic-api-key, mêmes 3 depuis le 16/07) ont été examinées une à une :
  (1)(2) `pricing.html` / `pricing.rendered.html` = jeton CLIENT public
  Datadog (préfixe `pub…`) embarqué par replit.com dans sa propre page — public
  par conception ; (3) `gallery-detail-journey-mapper.rendered.html` = valeur
  `"_key"` interne du CMS de la page (identifiant aléatoire, pas un
  credential). **Verdict : 3 faux positifs, aucun secret réel, aucun secret
  E-Code — pas d'incident, pas de rotation.** Snapshots des 17/18/19-07
  vérifiés : aucun motif présent.
- (assainissement) Valeurs caviardées dans les 3 snapshots ; sha256 recalculés
  dans `SOURCE_REGISTRY.yaml` (SRC-PRICING, SRC-GALLERY-DETAIL-JOURNEY-MAPPER,
  annotés « snapshot assaini ») et `baseline/snapshots/2026-07-16/manifest.json`.
- (prévention) `collect-baseline.mjs` caviarde AUTOMATIQUEMENT ces motifs
  publics (AIza…, dd-api-key=pub…) avant écriture et hash. Aucun motif de
  vrai secret n'est caviardé : un vrai secret doit faire échouer le scan.
- (note) Même contenu que le commit 9eab2990 de la PR #3 (hashes identiques) —
  porté sur main séparément pour débloquer le scan de toutes les PR ; le merge
  ultérieur de la PR #3 sera sans divergence sur ces fichiers.
