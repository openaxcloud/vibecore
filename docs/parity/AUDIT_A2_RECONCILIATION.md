# RÉCONCILIATION ligne à ligne — audit de réanalyse vs plan corrigé

Date : 2026-07-20. Question d'Avi : « es-tu sûr d'avoir repris TOUS les points
du document que je t'ai envoyé ? » — pas seulement les P0/P1 numérotés,
**chaque ligne actionnable**.

- **Document audité** : `Audit_reanalyse_PLAN_PARITE_REPLIT_LIVRAISON_2_2026.docx`
  (sha256 `6eb92d9bbe7af0bcac33cc321e3516cb9ffd8afec926f4e218363272174bc4af`,
  texte extrait intégralement, 689 lignes).
- **Plan vérifié** : tête de PR #15 (`fed58e96`, branche `docs/plan-parite-audit2`),
  plan v2026-07-20.1 + ses registres. Vérifié : la copie racine
  `PLAN_PARITE_REPLIT_LIVRAISON.md` est **identique octet pour octet** au plan
  de cette tête.
- **Règle** : « REPRIS = OUI » exige une référence exacte (section § du plan,
  ID de registre, ou ligne de script). Doute → NON. « Repris » signifie
  *intégré et tracé* — PAS « exécuté » : la plupart des exigences sont
  intégrées avec un statut honnête OPEN/NON FAIT/FAIL.

## Chiffres

| | |
|---|---|
| Éléments actionnables extraits du docx | **104** |
| Repris avec référence exacte | **102** |
| **NON repris (manquants)** | **2** |

Répartition des 104 : 16 P0 (§4) · 14 P1 (§8) · 10 (§5.1–5.4) · 8 (§6 + §6.1
+ §6.2) · 7 (§7) · 7 (§9) · 17 (§10) · 3 (§11) · 10 (§12) · 12 (§14). Les
10 lignes « CORRECT » de la table §6 (affirmations déjà justes) ne sont pas
actionnables et ne sont pas comptées.

## 1. Les 16 P0 (§4 du docx)

| Élément | Repris ? | Où |
|---|---|---|
| P0-01 paquet de preuve / DOCUMENT_MANIFEST signé | OUI | `P0_REGISTRY` P0-A2-01 ; `DOCUMENT_MANIFEST.yaml` (56 fichiers hashés, généré par `generate-document-manifest.mjs`, drift-check validateur §12) |
| P0-02 univers des surfaces (159) en exact-set | OUI | P0-A2-02 ; `SURFACE_REGISTRY.yaml` `surfaceUniverse:` P001–P159 + `serviceUniverse:` S01–S56 ; `EXPECTED_SURFACE_UNIVERSE_IDS`/`EXPECTED_SERVICE_UNIVERSE_IDS` (generator l.120-121) ; plan §6 |
| P0-03 modèle Project→Artifacts | OUI | P0-A2-03 ; plan §3.0 (8 entités : Project, Artifact, Component, ProjectRevision, ArtifactRevision, ArtifactType, SharedBackendBinding, ProjectRelease) |
| P0-04 contrat des 4 types de déploiement | OUI | P0-A2-04 ; plan §3.11 + `DEPLOYMENT_TYPES_CONTRACT.md` |
| P0-05 registryComplete sur univers incomplet | OUI | P0-A2-05 ; niveau `registryUniverseReady` (§11 : 35 P0 + 40 P1 + 29 + 50 + univers 159+56 + 336 constats sans orphelin) |
| P0-06 verticalReady faux positif UI | OUI | P0-A2-06 ; scission `verticalBackendReady` / `verticalUserJourneyReady` (§11) — le second FAIL sur uiGaps publish/rollback (§7 JSON) |
| P0-07 architectureContracted = présence seulement | OUI | P0-A2-07 ; scission `contractsPresent` / `contractsValidated` (§11) — contractsValidated FAIL honnête (« no real reviewer », ≥3 sections, zéro placeholder — generator l.579-597) |
| P0-08 erreur Auth | OUI | P0-A2-08 ; plan §3.9 réécrit conforme au §6.1 du docx (`[RPL-25]`/`[RPL-26]` : custom-auth→Clerk documenté, Replit Auth→Clerk « coming soon », MFA/SMS/orgs NON supportés, extensions E-Code) |
| P0-09 erreur WIF | OUI | P0-A2-09 ; plan §4.4 réécrit conforme au §6.2 (3 chemins, `[GCP-13]` avec citation exacte, zéro clé persistante) |
| P0-10 décision Gallery incohérente | OUI | P0-A2-10 ; plan §8 : `DEC-OWNER-GALLERY-OPTION-B` → **OPEN / CAPTURE_INCOMPLETE** ; decisions open=3 dans le JSON |
| P0-11 compteurs contradictoires | OUI | P0-A2-11 ; plan §13 : compteurs = JSON généré uniquement (« jamais recopié ici ») ; `sourceFindingCount` vs `canonicalWorkItemCount` (§7) |
| P0-12 336 constats ≠ 336 tâches | OUI | P0-A2-12 (OPEN) ; `LEGACY_FINDING_REGISTRY.yaml` (sourceFile/sourceLine/sourceHash/originRef/duplicateOf/canonicalWorkItemId) + `WORK_ITEM_REGISTRY.yaml` (99 WI) ; limite de provenance ORIGINE déclarée (plan §14 + §12.10) |
| P0-13 provenance du statut | OUI | P0-A2-13 ; plan §0 : planCommit, measuredCodeCommit, registryCommit, statusCommit, `mergedToMainAt: null` honnête, generatedAt réel — variante : `statusCommit` au lieu de `statusGeneratorCommit` ; attestation CI = pointeur, voir MANQUANTS |
| P0-14 Cloud Run multi-tenant | OUI | P0-A2-14 ; plan §4.2 `[GCP-14]`/`[GCP-15]` : ReputationTier, BillingAccountBinding, AbuseEventPolicy, CapacityPolicy += quotas/sharding/pool |
| P0-15 claims non ancrés utilisés | OUI | P0-A2-15 (OPEN) ; §2.3 : statut UNVERIFIED + `unanchoredClaims` calculé (18 listés dans le JSON) + `sourceBaselineReady` FAIL tant que >0 |
| P0-16 approved.level trompeur | OUI | P0-A2-16 ; JSON : `overallStatus: NOT_APPROVED` + `highestPassedLevel` ; clés `approvalReady` ET `approved` interdites par le validateur (l.671) ; `APPROVALS.yaml` (périmètre+approbateur) requis pour approuver |

## 2. Les 14 P1 (§8 du docx)

| Élément | Repris ? | Où |
|---|---|---|
| P1-01 « aucune publication self-service OBSERVÉE » | OUI | P1-A2-01 ; plan §3.1 (formulation exacte conservée) |
| P1-02 « première observation enregistrée » | OUI | P1-A2-02 ; plan §2.2 (Community Profiles reformulé, « aucune date de lancement officielle archivée ») |
| P1-03 rétention attachments couplée à l'image | OUI | P1-A2-03 ; plan §4.5 « Couplage de rétention » + test de suppression/rollback exigé |
| P1-04 multi-région : min instances + coût | OUI | P1-A2-04 ; plan §4.6 (« un failover vers une région froide n'est pas un failover », coût du chauffage mesuré) |
| P1-05 evidenceId par PREUVE LIVE | OUI | P1-A2-05 ; plan §5 invariants 1/2/6/8 portent des evidenceId explicites hashés |
| P1-06 claims non ancrés = UNVERIFIED hors gates | OUI | P1-A2-06 ; §2.3 + sourceBaselineReady (même mécanique que P0-15) |
| P1-07 dates décoratives → dépendances | OUI (tracé OPEN) | P1-A2-07 — statut OPEN assumé (§9 : « 4 P1-A2 restent OPEN ») |
| P1-08 owners = rôles + mapping versionné | OUI | P1-A2-08 ; `OWNER_ROLES.yaml` (owner/platform/security… → personnes) ; LEGACY/WORK_ITEM portent des rôles (`owner: platform`) |
| P1-09 hiérarchie documentaire | OUI | P1-A2-09 ; plan §1 (« Hiérarchie documentaire » : normatif / source d'état / vues générées / historique — aucun état dupliqué) |
| P1-10 backlog déplacé hors du plan | OUI | P1-A2-10 ; plan §14 = résumé ; les 336 vivent dans `LEGACY_FINDING_REGISTRY.yaml` ; certification count+SHA re-pointée sur le registre (`check-plan-completeness.mjs` l.58-126) |
| P1-11 lifecycle complet des items | OUI (tracé OPEN) | P1-A2-11 (OPEN, « passe dédiée ») ; `SUPERSEDED` déjà utilisé (P1-V3-07), `duplicateOf` posé |
| P1-12 contractsPresent + contractsValidated | OUI | P1-A2-12 ; §11 (deux niveaux séparés) |
| P1-13 tests de panne du collecteur | OUI (tracé OPEN) | P1-A2-13 (OPEN) |
| P1-14 contrats des domaines cœur | OUI (tracé OPEN) | P1-A2-14 (OPEN — collaboration, Git/FH/Checkpoints, Agent tasks/skills, Canvas, Security Center, Enterprise, clients natifs) |

## 3. §5 — analyse détaillée (10 éléments)

| Élément | Repris ? | Où |
|---|---|---|
| 5.1 modèle 8 entités ajouté avant Gallery | OUI | plan §3.0 (bloc d'entités identique au docx, Component/ArtifactRevision inclus) |
| 5.1 limites 7 artifacts / 1 mobile = entitlements configurables | OUI | plan §3.0 DÉCISION E-CODE (« jamais codées en dur ») |
| 5.1 publication groupée ; indépendante hors parité | OUI | plan §3.0 (`publicationMode: GROUPED`, indépendante = extension, décision séparée) |
| 5.2 univers 159 surfaces exact-set | OUI | cf. P0-02 (surfaceUniverse + EXPECTED, §6) |
| 5.2 56 services logiques S01–S56 | OUI | `SURFACE_REGISTRY.yaml` `serviceUniverse:` + EXPECTED_SERVICE_UNIVERSE_IDS |
| 5.2 gate sur le bon univers | OUI | §11 `parityBaselineReady` : « univers entièrement évalué (0 UNKNOWN) » ; état honnête 0/159 évalué (§6, §12.9) |
| 5.3 sourceFindingCount ≠ canonicalWorkItemCount | OUI | JSON `workItems: {336, 99}` ; §13/§14 |
| 5.3 6 paires de doublons traitées | OUI | `WORK_ITEM_REGISTRY.yaml` en-tête (les 6 paires listées) + `duplicateOf` posés (9 occurrences dans LEGACY) |
| 5.3 provenance fichier/ligne/hash | OUI (variante déclarée) | LEGACY : sourceFile/sourceLine/sourceHash du plan matérialisant + originRef ; la provenance des 29 documents d'ORIGINE = limite déclarée + P0-A2-12 OPEN (plan §14) |
| 5.4 statut recalculé honnête | OUI | JSON §7 : NOT_APPROVED / documentCanonicalized / sourceBaselineReady FAIL / contractsValidated FAIL / verticalUserJourneyReady FAIL — conforme au bloc cible du docx (variante : FAIL au lieu de UNVERIFIED, plus strict) |

## 4. §6 — vérification factuelle (8 éléments actionnables)

| Élément | Repris ? | Où |
|---|---|---|
| « Migration Replit Auth→Clerk documentée » = FAUX | OUI | plan §2.3 (correction 20/07) + §3.9 (« coming soon » `[RPL-26]`) |
| « Clerk MFA/orgs dispo » = FAUX | OUI | §3.9 `[RPL-25]` (« What's not supported ») |
| « WIF seulement si externe » = FAUX pour GKE | OUI | §4.4 `[GCP-13]` (citation officielle incluse) |
| Suppression attachments avec l'artefact = MANQUE | OUI | §4.5 « Couplage de rétention » `[GCP-12]` (citation exacte) |
| Cloud Run multi-tenant (projet/tenant + pool) = MANQUE | OUI | §4.2 `[GCP-14]` |
| 1000 services/région = MANQUE dans CapacityPolicy | OUI | §4.2 `[GCP-15]` + `CapacityPolicy.servicesPerProjectQuota: ≤1000` |
| §6.1 bloc de remplacement Auth (6 lignes) | OUI | §3.9 reprend chaque ligne (2 produits ; custom→Clerk confirmé ; Replit Auth→Clerk INCONNU/NON LIVRÉ ; capacités Clerk ; non-supportés ; extensions E-CODE) |
| §6.2 bloc de remplacement WIF (4 lignes) | OUI | §4.4 reprend les 3 chemins + zéro clé persistante |

## 5. §7 — obligations Google Cloud multi-tenant (7 éléments)

| Élément | Repris ? | Où |
|---|---|---|
| 1 projet par tenant recommandé, multi-tenant/projet déconseillé | OUI | §4.2 `[GCP-14]` |
| Pool de projets précréés | OUI | §4.2 + `CapacityPolicy.projectPoolTarget/projectPoolMin` + « fait partie de l'implémentation minimale » (UNK-CLOUDTENANT-IMPL) |
| 1000 services/jobs/worker pools + quotas SA | OUI | §4.2 `[GCP-15]` + `serviceAccountBudget [GCP-08]` |
| Folders séparant first-party et code tenant | OUI | §4.2 (« obligatoires ») |
| Routage GXLB + Service Extensions | OUI | §4.2 |
| Billing accounts séparés par réputation | OUI | §4.2 + `ReputationTier`/`BillingAccountBinding` |
| Nouvel objet ReputationTier + BillingAccountBinding + AbuseEventPolicy + CapacityPolicy enrichi | OUI | §4.2 (bloc d'entités complet, avec FREE_NEW/FREE_ESTABLISHED/PAID/ENTERPRISE, THROTTLE/SUSPEND/ISOLATE/REPORT, appealPath) |

## 6. §9 — contradictions de compteurs (7 éléments)

| Élément | Repris ? | Où |
|---|---|---|
| Backlog 336 exact | OUI | inchangé, certifié (`check-plan-completeness` sur le registre) |
| 332/1/3 exact | OUI | JSON `counts.backlog` |
| Dette bolt 26 vs 27 vs 29 | OUI | §13 : compteur = `counts.boltDebt` du JSON uniquement, « jamais recopié ici » (29) |
| Readiness 48 vs 50 vs 169 | OUI | §13 : `counts.prodReadiness` (50) ; 169 = constats sources (distinction faite) |
| Surfaces 10 vs univers 159 | OUI | JSON `surfaceUniverse {expected:159, present:159, evaluated:0}` distinct de `counts.surfaces` (10 mesurées) |
| P1 8 vs 18 non tracés | OUI | 40 P1 tous tracés (`P1-COV-01…08` + `P1-V3-01…18` + `P1-A2-01…14`), EXPECTED_P1_IDS |
| Unknowns bloquants sans lien P0 → gate explicite | OUI | `BETA_GATE_UNKNOWN_IDS` (generator) = la liste-gate explicite ; §11 betaReady |

## 7. §10 — manifeste de patch par section (17 éléments)

| Section | Repris ? | Où |
|---|---|---|
| §0 métadonnées (5 commits + mergedToMainAt + generatedAt réel) | OUI | plan §0 (generatedAt 04:20:00Z réel, mergedToMainAt null) — variante statusCommit |
| §1 hiérarchie documentaire | OUI | plan §1 |
| §2.3 gate claims + count unanchoredClaims | OUI | plan §2.3 + JSON (18) |
| §3 Project/Artifacts + 4 deployment types | OUI | §3.0 + §3.11 |
| §3.1 « non observé » conservé | OUI | §3.1 (« pas de publication self-service observée ») |
| §3.9 remplacement Auth | OUI | §3.9 |
| §4.2–4.3 pool/réputation/quotas/sharding/billing | OUI | §4.2 |
| §4.4 remplacement WIF | OUI | §4.4 |
| §4.5 retention coupling + test | OUI | §4.5 |
| §5 evidenceIds explicites | OUI | §5 (invariants 1/2/6/8) |
| §6 EXPECTED_SURFACE_IDS + matrice | OUI | §6 + `TRACEABILITY_MATRIX.yaml` (amorcée, déclaré) |
| §7 overallStatus/highestPassedLevel + verticalReady échoue sur uiGaps | OUI | §7 JSON |
| §8 réouvrir Gallery Option B | OUI | §8 (OPEN / CAPTURE_INCOMPLETE) |
| §9 les 18 P1 individuellement | OUI | P1-V3-01…18 |
| §11 valider contenu + revue des contrats | OUI | contractsValidated (FAIL honnête) |
| §13 séparer source findings / canonical / active | OUI | §13 (compteurs JSON) — « active work items » couvert par statuts NON_FAIT/OPEN, extension lifecycle = P1-A2-11 OPEN |
| §14 backlog → registre généré + provenance + dédup | OUI | §14 + LEGACY + WORK_ITEM |

## 8. §11 — modèle d'approbation (3 éléments)

| Élément | Repris ? | Où |
|---|---|---|
| Échelle 11 niveaux, noms exacts | OUI | JSON levels[] : les 11 noms du docx, dans l'ordre, contigus |
| overallStatus=NOT_APPROVED + highestPassedLevel | OUI | JSON + validateur (clés approved/approvalReady interdites) |
| « approved » réservé à une approbation périmètre+approbateur stockés | OUI | generator l.755-758 (`docs/parity/APPROVALS.yaml`) + §11 du plan |

## 9. §12 — architecture documentaire (10 fichiers)

| Fichier | Repris ? | Où |
|---|---|---|
| PLAN_PARITE_REPLIT.md normatif sans état dupliqué | OUI | §1 hiérarchie + §13 (« jamais recopié ici ») |
| PUBLIC_BASELINE (claims + universe datés) | OUI (variante) | claims dans PUBLIC_BASELINE (20 ancrés) ; l'univers vit dans `SURFACE_REGISTRY.surfaceUniverse` avec sha256 du doc source — même garantie, autre fichier |
| TRACEABILITY_MATRIX.yaml | OUI | présent (seed déclaré « AMORCÉE », chaînes complètes pour les domaines prouvés) |
| LEGACY_FINDING_REGISTRY.yaml | OUI | présent (336, provenance, duplicateOf) + contrôle validateur count≠réel |
| WORK_ITEM_REGISTRY.yaml | OUI | présent (99 WI, sourceFindingIds) + contrôle validateur |
| SURFACE_REGISTRY.yaml exact-set | OUI | cf. P0-02 |
| DOCUMENT_MANIFEST.yaml | OUI | présent, GÉNÉRÉ, drift-check (validateur §12) |
| APPROVAL_STATUS.json (overallStatus + highestPassedLevel) | OUI | cf. P0-16 |
| PARITY_STATUS.md « vue humaine GÉNÉRÉE » | **NON** | voir MANQUANTS |
| CHANGELOG_AUDIT.md historique/supersessions | OUI | append-only, entrées 17/07–20/07 |

## 10. §14 — conditions minimales (12 éléments)

| Condition | Repris ? | Où |
|---|---|---|
| 1. Corriger Auth + WIF | OUI | §3.9 + §4.4 |
| 2. Project→Artifacts + 4 contrats deploy | OUI | §3.0 + §3.11 + DEPLOYMENT_TYPES_CONTRACT |
| 3. Univers surfaces exact-set + évaluation justifiée par entrée | OUI (évaluation OPEN) | univers importé/verrouillé ; évaluation 0/159 = gate parityBaselineReady FAIL (honnête) |
| 4. 18 P1 individuellement | OUI | P1-V3-01…18 |
| 5. Ancrer tous les claims utilisés | OUI (exécution OPEN) | mécanisme sourceBaselineReady + unanchoredClaims=18 + UNK-CLAIMS-ANCHORING (2026-08-15) |
| 6. Fournir manifest/contrats/registres/scripts/artefacts | OUI | tout est dans le repo + DOCUMENT_MANIFEST (56 fichiers hashés) |
| 7. verticalUserJourneyReady échoue sur publish/rollback | OUI | JSON (FAIL avec les 2 raisons) |
| 8. Valider contenu des contrats | OUI (FAIL honnête) | contractsValidated |
| 9. Dédupliquer sans perdre la provenance | OUI (sémantique OPEN) | 99 WI + duplicateOf + P0-A2-12 |
| 10. Compteurs depuis une seule source | OUI | JSON unique (§13) |
| 11. Recos Google Cloud 17/07 | OUI | §4.2 |
| 12. Recalculer au commit mergé sur main | OUI (exécution au merge) | `mergedToMainAt: null` + P0-A2-13 + §12.11 (« le statut devra être recalculé au commit mergé ») |

## NON REPRIS — à faire ajouter avant la re-livraison

1. **PARITY_STATUS.md n'est pas réellement générée.** Le docx (§12) exige
   « vue humaine générée ; jamais source de vérité ». Le plan la DÉCLARE vue
   générée (§1, niveau 3 de la hiérarchie), mais **aucun script ne la
   génère** (scripts/parity/ : collect-baseline, generate-approval-status,
   generate-document-manifest, validate-registries, check-plan-completeness —
   pas de generate-parity-status) et son en-tête porte encore
   `repoCommit: b774bfa3` (pas régénérée dans la PR #15). Elle reste éditée à
   la main : contradiction déclaration/mécanisme. → Écrire un générateur (vue
   dérivée des registres) ou requalifier honnêtement le fichier en « vue
   maintenue à la main, jamais source de vérité » dans §1.
2. **L'« attestation CI » de la provenance du statut (sous-exigence P0-13)
   n'est qu'un pointeur.** Le docx demande « une attestation CI » ;
   `DOCUMENT_MANIFEST.yaml` porte `validation: see-ci-parity-registries` —
   un renvoi générique, pas une attestation (pas de run id, pas de commit du
   run, pas de résultat daté). → Enregistrer l'ID du run CI vert (et son
   commit) dans le manifest au moment de la génération, ou dans APPROVALS/
   CHANGELOG à chaque recalcul.

Nuances assumées (comptées OUI, à connaître) : `statusCommit` au lieu de
`statusGeneratorCommit` (§0) ; univers des surfaces dans SURFACE_REGISTRY
plutôt que PUBLIC_BASELINE (§12) ; niveaux en FAIL là où le docx suggérait
UNVERIFIED (plus strict) ; TRACEABILITY_MATRIX = seed déclaré « amorcée » ;
provenance = plan matérialisant, pas les 29 documents d'origine (limite
déclarée, P0-A2-12 OPEN, échéance 2026-08-15).

## Verdict (mots simples)

**Oui, le document a été repris presque intégralement : 102 éléments sur 104,
chacun vérifiable à un endroit précis du plan ou d'un registre.** Les 16 P0 et
les 14 P1 sont tous là, les deux erreurs factuelles (Auth, WIF) sont corrigées
avec les textes de remplacement exacts, le cœur Project→Artifacts et les
4 types de déploiement sont entrés au modèle, l'univers des 159 écrans + 56
services est verrouillé par la CI, les compteurs viennent d'une seule source,
et le statut dit désormais honnêtement « NON APPROUVÉ ».

**Il manque 2 choses, petites mais réelles** : (1) le fichier de vue
PARITY_STATUS est annoncé « généré » mais personne ne le génère ; (2) la
« preuve CI » de la provenance du statut est un renvoi, pas une vraie
attestation datée. À faire ajouter, puis re-livrer.

Rappel d'honnêteté : « repris » ≠ « fait ». Beaucoup d'exigences sont intégrées
avec un statut volontairement rouge (évaluation 0/159, claims non ancrés,
contrats non revus, 6 P0 ouverts) — c'est le comportement demandé par le
document lui-même.
