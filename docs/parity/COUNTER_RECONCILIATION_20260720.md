# COUNTER_RECONCILIATION_20260720 — réconciliation des compteurs (GÉNÉRÉ)

<!-- GÉNÉRÉ par scripts/parity/generate-counter-reconciliation.mjs — ne jamais éditer à la main ; drift-check CI. -->
schemaVersion: 1

Chaque ligne : valeur DÉRIVÉE du registre indiqué, avec la formule et les IDs.

| metric | valeur | formule | IDs inclus | source |
|---|---|---|---|---|
| P0 total | **65** | len(p0s) | — | P0_REGISTRY.yaml |
| P0 refusés (état courant) | **20** | count(reviewVerdict=REFUSED) | P0-V3-04, P0-V3-08, P0-V3-09, P0-V3-10, P0-V3-11, P0-V3-12, P0-V3-13, P0-A2-01, P0-A2-03, P0-A2-05, P0-A2-07, P0-A2-13, P0-A2-14, P0-LS-06, P0-B-01, P0-EX-02, P0-EX-04, P0-EX-07, P0-EX-08, P0-EX-10 | P0_REGISTRY.yaml |
| P0 signés (tous reçus) | **35** | count(reviewVerdict=SIGNED) | P0-V4-1, P0-V4-2, P0-V4-3, P0-V3-02, P0-V3-03, P0-V3-14, P0-A2-02, P0-A2-04, P0-A2-06, P0-A2-08, P0-A2-09, P0-A2-10, P0-A2-11, P0-LS-01, P0-LS-02, P0-LS-03, P0-LS-04, P0-LS-05, P0-LS-07, P0-LS-08, P0-LS-09, P0-LS-10, P0-LS-11, P0-LS-12, P0-LS-13, P0-LS-14, P0-LS-15, P0-LS-16, P0-LS-17, P0-LS-18, P0-EX-01, P0-EX-03, P0-EX-05, P0-EX-06, P0-EX-09 | P0_REGISTRY.yaml |
| P0 OPEN | **25** | count(status=OPEN) | P0-V3-01, P0-V3-04, P0-V3-05, P0-V3-06, P0-V3-07, P0-V3-08, P0-V3-09, P0-V3-10, P0-V3-11, P0-V3-12, P0-V3-13, P0-A2-01, P0-A2-03, P0-A2-05, P0-A2-07, P0-A2-13, P0-A2-14, P0-LS-06, P0-B-01, P0-B-02, P0-EX-02, P0-EX-04, P0-EX-07, P0-EX-08, P0-EX-10 | P0_REGISTRY.yaml |
| P0 PROVEN_REVIEW_PENDING | **0** | count(status=PROVEN_REVIEW_PENDING) |  | P0_REGISTRY.yaml |
| P0 PROVEN (hors lot) | **5** | count(status=PROVEN) | P0-V4-4, P0-V3-15, P0-A2-12, P0-A2-15, P0-A2-16 | P0_REGISTRY.yaml |
| P0 CLOSED | **35** | count(status=CLOSED) — exige un ReviewReceipt COMPLET | P0-V4-1, P0-V4-2, P0-V4-3, P0-V3-02, P0-V3-03, P0-V3-14, P0-A2-02, P0-A2-04, P0-A2-06, P0-A2-08, P0-A2-09, P0-A2-10, P0-A2-11, P0-LS-01, P0-LS-02, P0-LS-03, P0-LS-04, P0-LS-05, P0-LS-07, P0-LS-08, P0-LS-09, P0-LS-10, P0-LS-11, P0-LS-12, P0-LS-13, P0-LS-14, P0-LS-15, P0-LS-16, P0-LS-17, P0-LS-18, P0-EX-01, P0-EX-03, P0-EX-05, P0-EX-06, P0-EX-09 | P0_REGISTRY + REVIEW_RECEIPT_REGISTRY |
| Lot A (corrections rapides) | **12** | count(remediationTrack=QUICK) | P0-V4-1, P0-V4-2, P0-V3-02, P0-A2-02, P0-A2-10, P0-A2-11, P0-LS-04, P0-LS-05, P0-LS-13, P0-LS-14, P0-LS-16, P0-LS-17 | P0_REGISTRY.yaml |
| Lot B (chantiers P0) | **5** | count(remediationTrack=CHANTIER) | P0-V3-12, P0-A2-09, P0-EX-02, P0-EX-04, P0-EX-10 | P0_REGISTRY.yaml |
| Refus à trier (raisons reçues 20/07 soir) | **19** | count(remediationTrack=A_TRIER) | P0-V4-3, P0-V3-03, P0-V3-04, P0-V3-08, P0-V3-09, P0-V3-10, P0-V3-11, P0-V3-13, P0-A2-01, P0-A2-03, P0-A2-05, P0-A2-07, P0-A2-13, P0-A2-14, P0-LS-03, P0-LS-06, P0-B-01, P0-EX-07, P0-EX-08 | P0_REGISTRY.yaml |
| Contrats refusés | **4** | count(fichiers docs/parity avec reviewVerdict: REFUSED) | IDENTITY_COLLABORATION_CONTRACT.md, OPERATIONS_DR.md, PROJECT_FACTORY_CONTRACT.md, PROJECT_MANIFEST_SCHEMA.json | annotations des fichiers de contrat |
| Work items canoniques | **122** | len(WORK_ITEM_REGISTRY.workItems) — vérifié = compte déclaré | — | WORK_ITEM_REGISTRY.yaml |
| Constats sources | **336** | len(LEGACY_FINDING_REGISTRY.findings) — sceau count+sha CI | — | LEGACY_FINDING_REGISTRY.yaml |
| Surfaces canoniques | **164** | 159 (univers P001–P159) + additionalCanonical − aliases fusionnés (voir bloc canonicalUniverse) | — | SURFACE_REGISTRY.yaml#canonicalUniverse |

## Réponses aux 4 questions (dérivées ci-dessus)

1. **Refus → ouverts** : **20** P0 portent actuellement `reviewVerdict: REFUSED`.
   **25** P0 sont déclarés OPEN, dont **20** refusés
   et **5** ouverts sans refus (P0-V3-01, P0-V3-05, P0-V3-06, P0-V3-07, P0-B-02).

2. **Le 8e point rapide** : le tableau transmis à Avi n'en montrait que 7 et INCLUAIT
   À TORT P0-EX-10 (qui est un chantier B). Le lot A machine-tracé = les 12 IDs
   `remediationTrack: QUICK` : P0-V4-1, P0-V4-2, P0-V3-02, P0-A2-02, P0-A2-10, P0-A2-11, P0-LS-04, P0-LS-05, P0-LS-13, P0-LS-14, P0-LS-16, P0-LS-17. **LS-04 et LS-16 en font partie** ;
   EX-10 n'en fait PAS partie (track CHANTIER, remédié dans la PR #24).

3. **Le 6e gros chantier** : la colonne B = 5 P0 (`remediationTrack: CHANTIER` :
   P0-V3-12, P0-A2-09, P0-EX-02, P0-EX-04, P0-EX-10) + **1 groupe : les 14 contrats §2.3** (0/14 signés) = 6 lignes.

4. **Comptage des 14 contrats** : DEUX vues cohérentes — (a) **14 points individuels**
   = les fichiers annotés `reviewVerdict: REFUSED` (comptés ci-dessus : 4),
   chacun avec sa raison verbatim ; (b) **1 groupe** dans la colonne chantiers (ligne C5).
   Les compteurs par point dérivent des fichiers ; le groupe n'est qu'une vue d'affichage.

