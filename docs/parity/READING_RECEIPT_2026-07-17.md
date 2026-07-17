# READING_RECEIPT — 2026-07-17

schemaVersion: 1
repoCommit: 5ac64e52f15dc9388483d8ba94fa676c592f3da2
measuredBy: recount indépendant (python `xml.etree`, pas de confiance aux chiffres déclarés)
sourceUploads:
  - .../uploads/54fe0198-Evaluation_trajectoire_PLAN_PARITE_REPLIT_v5_2026.docx
  - .../uploads/a41e9b00-Reponses_decisions_D1_D6_ECode_20260717.docx

Reçu de lecture des 2 DOCX de la mission. **Tous les chiffres ci-dessous sont
recomptés par moi** ; les écarts avec les valeurs déclarées par Avi sont notés
honnêtement (ils viennent tous d'une **méthode de comptage**, pas d'un contenu
manquant).

## A. Empreintes (vérifiées bit-à-bit)

| doc | sha256 | attendu | octets |
|---|---|---|---|
| Evaluation_trajectoire_…v5_2026.docx | `b481ad94ba746b30e1e33004545cd2e056eb7246d56576f3a91a701d60a73cc9` | ✅ identique | 45 478 |
| Reponses_decisions_D1_D6_…20260717.docx | `57735a7c3ff3dc1a141b13737a3c375798eb74e2d883e2c0cd49ec0e7532e500` | ✅ identique | 46 341 |

## B. Compteurs recomptés

| métrique | Evaluation | Reponses | note de méthode |
|---|---|---|---|
| paragraphes corps (`<w:p>` enfants directs de `<w:body>`) | **75** | **83** | = valeurs déclarées Avi. (Total `<w:p>` incluant cellules de tableau : 130 / 152 — ne pas confondre.) |
| titres (styles Title/Subtitle/Heading1/Heading2) | **17** | **18** | Avi déclare 16 / 17 — l'écart de 1 = le style **Subtitle** compté ou non comme « titre ». Détail en §D. |
| listes (paragraphes style `ListParagraph`) | **35** | **42** | = valeurs déclarées. (Aucun `<w:numPr>` — le doc formate les listes par style, pas par numérotation Word.) |
| tableaux / lignes / cellules | **9 / 24 / 55** | **12 / 29 / 69** | = valeurs déclarées, à l'unité. |
| hyperliens uniques | **8** | **6** | = valeurs déclarées. Liste en §E. |
| segments `<w:t>` | 170 | 180 | — |
| **caractères `<w:t>` (couverture)** | **11 285 / 11 285 = 100,00 %** | **12 127 / 12 127 = 100,00 %** | Reponses : Avi a mesuré 12 139 (« artefact de comptage » — cellules à paragraphes imbriqués comptées 2×). Le vrai total `<w:t>` du corps est **12 127** ; couverture 100 %. |

**Correction de ma part** : un premier passage regex donnait 25 459 chars (bug de
regex, `.*?` en mode `re.S`). Le passage par parseur XML donne 11 285/12 127 —
**identiques à Avi**. Comptez vous-mêmes : `python xml.etree`, somme des `.text`
de chaque `<w:t>`.

## C. Composants (vérifiés présents/absents)

| composant | Evaluation | Reponses |
|---|---|---|
| `word/footnotes.xml` | ABSENT | ABSENT |
| `word/endnotes.xml` | ABSENT | ABSENT |
| `word/comments.xml` | ABSENT | ABSENT |
| `word/header1.xml` | présent (35 chars) | présent (24 chars) |
| `word/footer1.xml` | présent (56 chars) | présent (56 chars) |
| `txbxContent` (zones de texte) | 0 | 0 |
| drawings / images (`<w:drawing>`, `<pic:pic>`) | 0 | 0 |

**Aucun élément illisible. Aucun contenu hors des `<w:t>` du corps + header/footer.**
Couverture corps = 100 % ; header/footer lus séparément (non inclus dans le %).

## D. Tous les titres

**Evaluation_trajectoire** (17) :
`[Title]` Évaluation de l'avancement du plan de parité Replit v5 · `[Subtitle]`
Verdict de trajectoire… · **1.** Synthèse exécutive · **2.** Ce qui est réellement
solide · **3.** Corrections bloquantes restantes · **3.1** Statut d'approbation à
durcir · **3.2** Split-brain Git · **3.3** Cloud Run multi-région périmé · **3.4**
Artifact Registry maturité · **3.5** Inventaire Import · **3.6** Incohérence
documentaire · **4.** Nix multi-zone · **5.** Modèle de readiness · **6.** Gates
avant bêta · **7.** Ordre d'exécution · **8.** Verdict final · Sources officielles
vérifiées.

**Reponses_decisions_D1_D6** (18) :
`[Title]` Réponses aux décisions D1–D6 · `[Subtitle]` Décisions proposées… · **1.**
Tableau de décision · **2.** D1 Split-brain Git · Procédure sûre · Critères de
clôture · **3.** D2 Rollback par digest permanent · **4.** D3 Store Nix multi-zone
· Architecture recommandée · **5.** D4 Connecteurs Import ou billing · Minimum
billing · Ordre des connecteurs · **6.** D5 Chrome connecté · **7.** D6
TPL-02.PROOF · **8.** Priorité générale · **9.** Message prêt à envoyer · **10.**
Questions à ne pas répondre par intuition · Sources officielles vérifiées.

## E. Hyperliens uniques

**Evaluation (8)** : Cloud Run service-health · Cloud Run release-notes · Cloud Run
revisions · Replit import-from-providers · GKE ReadOnlyMany · GKE storage-overview
· Regional PD HA · Artifact Registry attachments.
**Reponses (6)** : Artifact Registry attachments · Regional PD HA · sharing-disks-between-vms
· GKE storage-overview · GKE ReadOnlyMany · Replit import-from-providers.

## F. Tableaux (résumé)

Evaluation : 9 tableaux (verdict, synthèse 7-axes, 4 encadrés-problème 3.1/3.3/3.5,
readiness 4-niveaux, ordre d'exécution, verdict final). Reponses : 12 tableaux
(synthèse, tableau de décision D1–D6, 6 encadrés-réponse D1–D6, ordre connecteurs,
correction comptage, priorité générale, message-Avi). Contenu intégral migré vers
`DOC_INTEGRATION_MATRIX_2026-07-17.yaml`.

## G. Couverture

Corps : **11 285/11 285 (100 %)** Evaluation · **12 127/12 127 (100 %)** Reponses.
Zéro caractère `<w:t>` non lu. Header/footer lus. Composants absents confirmés
absents (pas « non lus »).
