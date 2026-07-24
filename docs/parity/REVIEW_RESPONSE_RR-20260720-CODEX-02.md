# Réponse brute de revue — RR-20260720-CODEX-02

schemaVersion: 1
reviewReceiptId: RR-20260720-CODEX-02
reviewer: OpenAI-Codex
reviewerType: AUTOMATED_LLM
reviewerModelVersion: GPT-5 (Codex)
reviewedAt: 2026-07-20T20:38:18+03:00
auditedRemediationCommit: af24d4fe48015e6041c8e11b240b1f2d54f333d1
postMergeEvidenceCommit: a4a9f71c
signaturesPublishedInCommit: cf5c67a513322ba0c248b900ea88c50b5e128ac6

## Périmètre et règle appliquée

Revue individuelle des huit IDs de `REVIEWER_RESUBMISSION_A_20260720.md` au
commit exact `af24d4fe48015e6041c8e11b240b1f2d54f333d1`. Chaque artefact annoncé a
été ouvert. Les commandes de reproduction ont été rejouées ; les tests
négatifs annoncés ont été vérifiés lorsque leur caractère cassant était une
partie substantielle de la preuve. Un point n'est accepté que si la preuve
présente est reproductible et cohérente avec le titre.

## IDs acceptés et signés

### P0-A2-10 — ACCEPTÉ

`DEC-GALLERY-NO-SELF-PUBLISH` est réellement `DECIDED`. L'implémentation est
cohérente avec la décision : seul `POST /admin/gallery-listings` crée une
publication, avec rôle platform-admin et réauthentification ; un utilisateur
non administrateur reçoit 403. Le test ciblé
`services/api/src/tests/gallery-routes.spec.ts` passe 15/15, y compris le cas
« is NOT self-service ».

Réserve non bloquante : la commande courte fournie avec `grep -A8 ... | grep
status` ne produit rien, car le champ `status` est situé plus de huit lignes
après l'ID. L'état et l'implémentation restent directement reproductibles par
lecture structurée du registre et par la suite de tests ciblée.

### P0-LS-04 — ACCEPTÉ

`IMPORT_PROVIDER_REGISTRY.yaml` contient désormais une entrée GitLab
structurée sous `nonTileCapabilities`, avec `kind`, `hubTileVisible: false`,
`capabilityStatus`, `evidence`, `ecodeBuiltState` et `unknowns`. Les douze
tuiles restent inchangées et GitLab n'est pas déclaré comme tuile. Le
validateur passe dans l'état soumis ; après retrait local de `kind`, il échoue
explicitement avec `champ kind manquant (P0-LS-04)`, puis repasse après
restauration.

Réserve non bloquante : le texte de l'entrée gagnerait à citer directement la
source documentaire qui prouve la capacité GitLab, mais cette source existe
dans l'archive et la capacité est corroborée par les tests connecteur.

## IDs refusés

### P0-V4-1 — REFUSÉ (preuve insuffisante)

Le chemin canonique `evidenceId` reste
`docs/deploy-evidence/2026-07-16-collector-gallery/`. Son README annonce encore
le hash `fad9ec75…`, `Views 20,650` et `82 Results`, et sa seule capture
`gallery-rendered.png` ne montre que le footer. Le HTML de 1,5 Mo au hash
`1f5f27bc…` existe, mais l'entrée P0 n'a pas été repointée vers lui : la réserve
d'artefact incohérent n'est pas levée.

### P0-V4-2 — REFUSÉ (désaccord)

Les HTML reproduisent bien `20,653` sur la liste et `20,649` sur le détail.
Cependant, le README canonique conserve `20,650` et `82 Results`, tandis que
`GALLERY_COMMUNITY_CONTRACT.md` conserve aussi `82 Results`. Ce contrat cite
`SRC-GALLERY-DETAIL`, ID absent du registre ; l'ID réel est
`SRC-GALLERY-DETAIL-JOURNEY-MAPPER`. L'artefact et le contrat ne forment donc
pas une requalification cohérente.

### P0-V3-02 — REFUSÉ (preuve insuffisante)

La table reste assise sur le même paquet Gallery contradictoire. Submit,
auteurs, statistiques, View App et Use Template sont visibles, mais le report
propre à une app n'est pas prouvé : l'artefact montre seulement le lien
générique de footer `Report abuse`. La table complète annoncée n'est donc pas
soutenue.

### P0-LS-14 — REFUSÉ (désaccord et reproduction divergente)

La formulation a bien été bornée au corpus, mais le claim affirme encore que
Lite/Economy ne sont jamais nommés dans 83 changelogs. C'est contredit par
`RPL-2026-002` et par le snapshot `2026-04-17-changelog.md`, qui nomment le
sélecteur Lite/Economy/Power. En outre, la commande annoncée comme vide retourne
`REPLIT_LIVE_SCAN_2026-07-20.md:325` à cause d'une autre occurrence de « nulle
part ».

### P0-LS-13 — REFUSÉ (preuve insuffisante)

Le claim « 13 observations toutes contextualisées » ne correspond pas au
registre : trois observations expert gardent locale, pays/géo et cookie en
`UNKNOWN`, sans hash ni `artifactPath`, et seulement quatre observations sur
treize ont une géographie connue. `pricing-recheck-1445utc.txt` est une
transcription manuelle à heure approximative, sans capture ni preuve de géo-IP
IL. Le test négatif annoncé ne valide que la présence et `schemaVersion`, pas la
complétude de la provenance par observation.

### P0-LS-16 — REFUSÉ (désaccord)

`generatedAt`, `generatedFromCommit` et `mergedCommit` existent, et le run
GitHub Actions `29756163626` est bien vert sur `af24d4fe`. Mais
`.github/workflows/parity-registries.yml` ne roule pas `CI_ATTESTATION` et ne
génère/publie pas `DOCUMENT_MANIFEST` après chaque merge ; `a4a9f71c` est un
commit manuel postérieur. Le validateur accepte également un runId, un commit
et un timestamp fictifs après régénération. Un exemple manuel est prouvé, pas
l'automatisation ni la garantie de provenance revendiquées.

## Journal de reproduction synthétique

- `node scripts/parity/validate-registries.mjs` : succès, `all registries valid`.
- `node scripts/parity/check-plan-completeness.mjs` : succès, 336 constats,
  `CERTIFIÉ`.
- `node scripts/parity/generate-document-manifest.mjs --check` : à jour.
- `node scripts/parity/generate-approval-status.mjs --check` : à jour.
- `node scripts/parity/generate-parity-status.mjs --check` : à jour.
- `shasum -a 256 .../gallery.rendered.html` :
  `1f5f27bcf87743017d2e1aee8768f941041a2ebe17b21127b76db83c241bd4c7`.
- Extraction Gallery : `20,653` sur la liste ; `20,649` sur le détail.
- Tests API Gallery : 15/15 réussis.
- Test négatif LS-04 : retrait de `kind` → échec explicite du validateur ;
  restauration → succès.
- Run GitHub Actions `29756163626` : conclusion `success`, head `af24d4fe`.

## Verdict final

- Acceptés et signés : P0-A2-10, P0-LS-04.
- Refusés : P0-V4-1, P0-V4-2, P0-V3-02, P0-LS-14, P0-LS-13, P0-LS-16.
- Contrats réexaminés dans ce reçu : aucun.
