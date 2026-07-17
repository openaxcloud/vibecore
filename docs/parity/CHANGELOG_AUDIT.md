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

## 2026-07-17 (plan canonique + réconciliation des registres)

- (supersession) `docs/parity/PLAN_PARITE_REPLIT.md` devient LE plan canonique
  unique. Il supersède `PLAN_PARITE_REPLIT_v5.md` (document hors repo, outputs
  de l'orchestrateur, sha256 cd7ec771b2deddf19c2f8115ac2745ace9e79ad1030ab1c2
  5eac8fb4997209a1) ; un bandeau SUPERSEDED a été apposé sur le fichier v5.
  Règle : correction PAR REMPLACEMENT dans le fichier canonique ; git porte
  les versions ; interdiction de créer une variante concurrente (_v6, _FINAL…).
- (correction factuelle) §1 v5 annonçait « quatre familles » de collecte, le
  tableau en portait cinq → « cinq familles » (plan §2.2).
- (correction factuelle, source hashée) Import : le hub officiel liste
  12 entrées DONT « Previous Agent export » et « Empty »
  (SRC-REPLIT-IMPORT-PROVIDERS sha256 56b14555…, claim RPL-24). Notre comptage
  à 11 (Previous Agent export absent) est remplacé. Convention unique :
  12 entrées dont Empty.
- (correction factuelle, source hashée) Cloud Run multi-région : le claim v5
  « pas de failover applicatif automatique » (étiqueté RPL-23 dans le v5) est
  PÉRIMÉ → reclassé **GCP-11** (source cloud, pas produit Replit ; le RPL-23
  du registre repo — 4 modes d'accès — est inchangé). Cloud Run service health
  automatise failover/failback (readiness probes + serverless NEGs).
  **Statut mesuré** : GA le 29/06/2026 d'après les release notes
  (SRC-CLOUDRUN-RELEASE-NOTES sha256 54ecea8f…) ; la page produit fetchée le
  17/07 ne porte PAS de bannière Pre-GA (SRC-CLOUDRUN-SERVICE-HEALTH sha256
  dcfbdee7… ; les 6 badges « Preview » du snapshot concernent d'autres pages
  de la nav : Ephemeral Disk, Sandboxes, custom scaling, Cloud Service Mesh).
  **Divergence consignée** : la lecture owner du 17/07 rapportait une bannière
  « Preview — Pre-GA Offerings Terms » sur cette doc ; les artefacts hashés ne
  la reproduisent pas. Traitement fail-closed : l'exigence demandée est
  conservée TELLE QUELLE — fallback + exit strategy obligatoires,
  indépendamment du statut GA (plan §4.6).
- (fait vérifié, source hashée) Artifact Registry attachments : bannière
  Pre-GA « Preview … available "as is" and might have limited support »
  CONFIRMÉE (SRC-AR-ATTACHMENTS sha256 df666b6c…, claim GCP-12) → fallback
  obligatoire (attestations Binary Authorization / Container Analysis, copie
  des referrers via ORAS) + exit strategy (plan §4.5).
- (registres) P0_REGISTRY : 4 → 19 entrées. Les **15 P0 du dernier audit
  externe** (Audit_complet_PLAN_PARITE_REPLIT_v3_2026, 16/07) tracés
  INDIVIDUELLEMENT (P0-V3-01…15) avec description, source, owner, statut,
  targetDate ISO, commit, reviewer, preuve, dépendances, condition de clôture.
  4 restent OPEN (V3-01 collecteur CI, V3-05 remix licence/PII, V3-06 import
  connecteurs/crédits, V3-07 promotion AR live). La CI compare désormais
  l'ensemble EXACT des IDs attendus (EXPECTED_P0_IDS) — un ID absent casse le
  build. Le rollup respecte le statut déclaré comme plancher : un P0 déclaré
  OPEN ne peut plus être dérivé PROVEN par ses preuves partielles.
- (registres) `targetDate: UNKNOWN` INTERDIT (schémas v2 + validateur) dans
  P0/UNKNOWN/DECISION : date ISO réelle, ou `state: ACCEPTED_RISK` justifié
  (owner + expiration + reviewCondition). UNKNOWN_REGISTRY réécrit : 11 → 19
  inconnues (nouvelles : capacités gate-bêta UNK-CLOUDTENANT-IMPL,
  UNK-CHECKPOINT-IMPL, UNK-BILLING-MINIMAL-IMPL, UNK-NIX-MULTIZONE-IMPL,
  UNK-DB-MIGRATION-PUBLISH-IMPL, UNK-ROLLBACK-FLAG-APPLIED [remplace
  UNK-ROLLBACK-FLAG-PERMANENCE, tranché par D2], UNK-GIT-RECONCILE-DONE,
  UNK-GALLERY-OPTION-B-CONTENT, UNK-CLAIMS-ANCHORING) ; 3 passées
  ACCEPTED_RISK justifié (report-flow, self-publish, review-workflow).
- (statut) Le booléen `approvalReady` est SUPPRIMÉ et interdit par le
  validateur (c'était un faux positif de couverture : il validait un registre
  incomplet). Remplacé par 8 NIVEAUX NOMMÉS calculés (documentReady,
  registryComplete, architectureContracted, implementationReady,
  verticalReady, betaReady, publicLaunchReady, parityBaselineReady) +
  `approved.level` = plus haut niveau CONTIGU. Nouveaux contrôles calculés :
  artefacts de preuve présents ET hashés (evidence[].evidenceSha256), triage
  SLA bloquant (jours ouvrés), preuve API ≠ preuve UI (uiGaps par étage du
  vertical : publish et rollback n'ont pas de preuve UI), gates bêta =
  UNKNOWNs de capacité. **État mesuré au b774bfa3 :
  approved.level = architectureContracted** (implementationReady bloqué par
  les 4 P0 OPEN ; betaReady par les 6 capacités gate ; parityBaselineReady par
  le triage PENDING des claims RPL-20/21/22).
- (décisions, OWNER_DECISION) Enregistrées avec citations :
  D1 réconciliation Git (« Merge toi meme et verifie les commits des autres
  sessions si ils sont bon tu les prend ») ; D2–D6 approuvées par « Oui » à
  « tu adoptes D2 à D6 tels qu'écrits dans ce document ? » (17/07/2026,
  contenu = Reponses_decisions_D1_D6_ECode_20260717.docx de l'expert d'Avi :
  rollback permanent fail-closed · GO multi-zone topologie réelle + coût
  mesuré · billing minimal avant connecteurs par lots · compte E2E dédié
  plutôt que Chrome personnel · validation a posteriori TPL-02 + gate déplacé
  au merge/release/testé-live) ; fichiers de suivi versionnés (« Oui si il
  faut le faire et c sans risque ») ; Gallery option B confirmée (contenu
  exact à inscrire via UNK-GALLERY-OPTION-B-CONTENT — non réinterprété).
- (méthode) Correspondance des IDs v5 → registre repo consignée : v5 RPL-20
  (changelog Opus 4.7) = RPL-2026-001 ; v5 RPL-21 (changelog 10/07) =
  RPL-20/21/22 repo ; v5 RPL-22 (modes d'accès) = RPL-23 repo ; v5 RPL-23
  (Cloud Run) = GCP-11. Étiquettes héritées non encore ancrées
  individuellement : UNK-CLAIMS-ANCHORING (2026-08-15).
