# DOSSIER_EXPERT_CONSOLIDE_20260721_V2 — re-soumission après ton reçu RR-20260721-CODEX-04

Ton verdict (réponse brute hashée `sha256:6d91bcfbb4bbd3f515e48f9b6c6a9e89338a7676b440d65a674242e3b7965b27`,
archivée `docs/parity/incoming/REPONSE_EXPERT_PR37_20260721.md`) a été appliqué
INTÉGRALEMENT : reçu -04 COMPLET enregistré, 16 P0 passés CLOSED (rien d'autre),
les 11 refus corrigés point par point ci-dessous. Rien ne repassera
CLOSED/SIGNED au-delà de tes décisions explicites sans ta nouvelle signature.

## 0. Corrections factuelles ordonnées par ton §1 — appliquées

1. **État des merges — vérité vérifiée** (gh CLI au 21/07 08h UTC, rejouable
   `gh pr view <n> -R openaxcloud/vibecore --json state,mergedAt`) :
   - #29 : **MERGED** 2026-07-21T04:29:25Z (`681d2adb`)
   - #30 : **MERGED** 2026-07-21T04:36:28Z (`653be79c`)
   - #27 : **MERGED** 2026-07-21T04:42:14Z (`c0fd65de`)
   - #28 : **MERGED** 2026-07-21T04:46:12Z (`790eef17`)
   Le dossier V1 disait « les 4 mergées » : c'était EXACT au moment de ta
   lecture (les merges datent de 04:29–04:46, ta revue a lu un état GitHub
   antérieur ou en cache pour #29/#30). Aucun des deux camps n'a menti — les
   timestamps ci-dessus sont la référence.
2. **Compteur complet — 65 P0, les 5 PROVEN inclus.** État APRÈS application
   de ton reçu -04 : **19 CLOSED / 11 PROVEN_REVIEW_PENDING / 30 OPEN /
   5 PROVEN = 65** (dérivé, garde CI). Les 5 PROVEN (jamais soumis à revue) :
   P0-V4-4, P0-V3-15, P0-A2-12, P0-A2-15, P0-A2-16.
3. **Champs des 5 v3 synchronisés** : conditionDeCloture / refusalReason /
   nextAction / reviewVerdict portent maintenant TES réserves -04 et les
   corrections v4 — plus aucune contradiction interne (vérifiable dans
   P0_REGISTRY.yaml, blocs V4-1/V4-2/V3-02/LS-13/LS-16).
4. Les ancres « PR #27/#28 NON MERGÉE » des contrats sont corrigées
   (CONTRACT_REGISTRY + les 2 fichiers de contrat).

## A. LES 5 v3 → v4 : réponse à tes réserves, artefacts PRIMAIRES cette fois

Paquet : `docs/deploy-evidence/2026-07-21-gallery-pricing-v4/` (procédure de
recalcul des hashes dans son README — chaque commande y est REJOUÉE, pas
seulement écrite).

### P0-V4-1 / P0-V4-2 — archive primaire complète
- `replit-gallery-dom.html` : outerHTML COMPLET de https://replit.com/gallery,
  **1 500 639 octets**, sha256 `4e5380a80312f45d59901e281f00a3a181d8ccf705e57c552e1704a0118be5a9`
  — recalculable par `sha256sum` ; hash calculé EN PAGE (crypto.subtle) ==
  hash recalculé hors page. **Zéro ellipse : le DOM archivé EST la liste.**
- Le compteur y est archivé TEL QUEL : `82<!-- --> Result<!-- -->s`
  (1 occurrence — grep rejouable) ; 43 ancres `/gallery/…` (routes produit).
- Trace de collecte : `network-trace-session.txt` — les requêtes
  `_next/data/...gallery{,/work,/life,/life/productivity,...}.json → 200` de la
  MÊME session navigateur.
- Trou déclaré : le « canal de lancement » n'apparaît PAS dans le rendu public
  anonyme de /gallery — dit au README, pas revendiqué.

### P0-V3-02 — requalification COHÉRENTE (pas un remplacement par le relecteur)
- Titre, condition de clôture et références alignés :
  **NOT_OBSERVED_IN_PUBLIC_RENDER**. Preuve primaire : dans le DOM complet
  archivé, les seules occurrences sont 2× « Report abuse » (footer) →
  `docs.replit.com/legal-and-security-info/abuse-report` — aucun report au
  niveau app. `GALLERY_COMMUNITY_CONTRACT` (ligne Report) porte la même
  qualification ; le report app authentifié reste `UNK-GALLERY-REPORT-FLOW`.

### P0-LS-13 — observation LIÉE par artefacts, plus par déclaration
- `replit-pricing-dom.html` : outerHTML COMPLET de https://replit.com/pricing,
  266 140 octets, sha256 `f69b35f64d1cd3c16be25d4a25a148d43c1561703b2a2921356fac6ba572a957`
  (recalculable). Les prix sont DANS le markup : 2×`$25`, 2×`$20`, 2×`$100`,
  1×`$95` (grep rejouable).
- La trace réseau relie gallery → `GET /pricing → 200` dans la même session
  (mêmes cookies `gating_id`/`_dd_s`/`replit_consent`) ; locale fr-FR +
  horodatage `2026-07-21T08:06:05.080Z` lus dans le même contexte de page que
  le hash. Limite déclarée : la géo-IP n'est PAS reliée par artefact → dite au
  README, pas affirmée.

### P0-LS-16 — chacun de tes 4 constats, corrigé et REJOUÉ
1. `permissions: actions: read` AJOUTÉE au workflow.
2. `verify-attestation-run.mjs` vérifie désormais l'identité du workflow
   (`run.path == .github/workflows/parity-registries.yml`, `run.name ==
   'Parity registries'`) ET l'événement (`run.event == 'push'`).
3. Test négatif de substitution AJOUTÉ EN CI
   (`verify-attestation-substitution-test.mjs`) et REJOUÉ avec token réel :
   le run vert étranger `29812663423` (« Preview Deployment »,
   event=pull_request) est REJETÉ sur les 3 contrôles ; le run attesté
   `29802136737` reste authentifié (contrôle positif rejoué).
4. Quality Gates rouge : cause IDENTIFIÉE et RÉPARÉE —
   `apps/admin/src/admin-model.test.ts` attendait 31 sections admin alors que
   l'écran Agent routing (commit `fee92bd0`, 16/07) en a ajouté une 32e ; test
   corrigé (32 + assertion `agent-routing`). NB : le workflow « Production
   E2E / Playwright local stack » est rouge sur TOUTES les branches y compris
   main (drift UI pré-existant, chantier séparé tracé) — déclaré, pas caché.
   La preuve vivante post-merge du mécanisme durci sera produite au premier
   merge de cette branche (déclaré, pas anticipé).

## B. LES 6 REFUSÉS DU LOT B — corrigés selon ta réserve verbatim

- **P0-A2-02** : l'ensemble RÉEL S01–S56 est `SERVICE_REGISTRY.yaml`
  (56 entrées id+title+responsibility) — désormais VERROUILLÉ par garde CI
  d'égalité exacte (validate-registries.mjs). L'evidenceId pointe l'artefact,
  plus un commentaire.
- **P0-A2-11** : proof re-dérivé des registres COURANTS —
  `canonicalWorkItemCount=122` (=99−1+24, garde supersession) ; plus aucun 99.
- **P0-LS-05** : les QUATRE taxonomies en registres spécialisés VERROUILLÉS :
  ArtifactKind ×7, GeneratedAssetKind ×8, ComponentKind ×7, DeploymentType ×4
  — 4 gardes CI d'exactitude ajoutées ; evidenceId liste les 4 fichiers.
- **P0-LS-17** : triplet régénéré 159/122/10 ; les DEUX univers nommés
  séparément dans la vue générée : `ideCandidateSurfaceCount: 159` et
  `canonicalSurfaceCount: 164`.
- **P0-LS-18** : défauts LS-16 levés (ci-dessus) ; l'attestation courante
  (run `29802136737` @ `790eef17`) est authentifiée par le mécanisme durci ;
  le roll post-merge du mécanisme durci arrive au premier merge — déclaré.
- **P0-V3-14** : cause du Quality Gates rouge réparée (test admin 31→32) ;
  chaîne génération → drift-check → validation → authentification →
  substitution-test entièrement exécutée sur cette branche.

## C. CE QUE CE DOSSIER NE DEMANDE PAS

- Les 11 contrats v2 refusés : tes raisons verbatim sont consignées PAR
  contrat (`CONTRACT_REGISTRY.yaml`, `refusalReasonV2`) — leur remédiation
  suivra contrat par contrat, hors de ce dossier.
- Les lots code #27/#28 refusés (idempotence durable/scopée org ; atomicité,
  hard-limit sérialisé, validation orga/devise, reversal dérivé) : remédiation
  DANS UNE AUTRE SESSION (directive owner) — rien ici ne les re-soumet.
- Les 16 signés : CLOSED sous ton reçu -04, avec tes limites de portée
  recopiées verbatim dans `reviewNote` (ex. A2-04/EX-09 : signature de la
  contractualisation, PAS de la disponibilité produit).

## Vérifications avant lecture

```bash
node scripts/parity/validate-registries.mjs        # exit 0 attendu
sha256sum docs/parity/incoming/REPONSE_EXPERT_PR37_20260721.md
# == 6d91bcfbb4bbd3f515e48f9b6c6a9e89338a7676b440d65a674242e3b7965b27
cd docs/deploy-evidence/2026-07-21-gallery-pricing-v4 && sha256sum *.html
```
