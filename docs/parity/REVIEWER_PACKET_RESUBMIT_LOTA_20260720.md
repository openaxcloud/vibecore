# PAQUET RELECTEUR — RE-SOUMISSION LOT A (2026-07-20, après verdict 57febeab)

Commit de référence : `af24d4fe` (main — contient les 8 remédiations).
8 points REFUSÉS au lot 57febeab, REMÉDIÉS point par point — chaque entrée
ci-dessous rappelle TA raison de refus (verbatim), dit ce qui a été corrigé,
et donne la commande de reproduction. Zéro valeur inventée ; chaque chemin
d'artefact vérifié présent sur disque.

---

## 1. PROMPT À COPIER-COLLER (pour le relecteur)

```
Tu agis comme RELECTEUR (reviewer) du plan de parité E-Code — c'est la
RE-SOUMISSION des 8 points que tu as refusés au lot 57febeab, après
remédiation.

1. Ouvre openaxcloud/vibecore au commit af24d4fe (branche main).
2. Pour chacun des 8 points du §2 (V4-1, V4-2, V3-02, LS-14, A2-10, LS-04,
   LS-13, LS-16) : relis TA raison de refus (rappelée verbatim), vérifie que
   la remédiation y répond, et REJOUE la commande de reproduction donnée.
3. CRITÈRE POUR SIGNER : la raison du refus est levée + preuve rejouable.
   En cas de doute : NE SIGNE PAS, note une réserve précise.
4. SIGNATURE : écris ton identifiant dans le champ reviewer de l'entrée
   correspondante de docs/parity/P0_REGISTRY.yaml (le point repassera
   PROVEN puis CLOSED au prochain calcul).

CE QUE TU RENDS : IDs signés / IDs re-refusés avec la réserve précise.
INTERDITS : signer sans rejouer ; signer en bloc.
```

---

## 2. LES 8 POINTS RE-SOUMIS

### 2.1 P0-V4-1 — source Gallery incohérente
- **Ton refus** : « hash Gallery obsolète (fad9… vs 1f5f…), capture limitée au footer, artefact incohérent. »
- **Remédiation** : `SRC-GALLERY-RENDERED` (SOURCE_REGISTRY.yaml) re-pointé sur
  le hash RÉEL du fichier en repo : `1f5f27bcf877…` (rendu complet 1,5 Mo —
  plus le footer partiel) ; `accessedAt` corrigé (16:58:20Z, detectionDate du
  manifest).
- **Repro** :
  ```
  shasum -a 256 docs/parity/baseline/snapshots/2026-07-16/gallery.rendered.html
  grep -n '1f5f27bc' docs/parity/SOURCE_REGISTRY.yaml
  grep -rn 'fad9ec75' docs/parity --include='*.yaml' --include='*.md' | grep -v refusal   # → vide
  ```

### 2.2 P0-V4-2 — métriques Gallery fausses
- **Ton refus** : « même hash obsolète, métriques réelles 20 653/20 649 pas 20 650. »
- **Remédiation** : claim RPL-17 + GALLERY_COMMUNITY_CONTRACT réécrits aux
  valeurs RÉELLES de l'artefact : « 20,653 » (liste) / « 20,649 » + « Used 79
  times » (page détail) — compteurs vivants, divergence inter-pages documentée ;
  « 82 Results » retiré (absent du rendu actuel — dit explicitement).
- **Repro** :
  ```
  grep -o '20,65[0-9]' docs/parity/baseline/snapshots/2026-07-16/gallery.rendered.html | sort -u
  grep -o '20,649' docs/parity/baseline/snapshots/2026-07-16/gallery-detail-journey-mapper.rendered.html
  grep -n '20,650' docs/parity/PUBLIC_BASELINE_REPLIT_2026.yaml   # → vide
  ```

### 2.3 P0-V3-02 — hash/métriques annoncés ≠ artefact
- **Ton refus** : « hash et métriques Gallery ≠ valeurs annoncées. »
- **Remédiation** : identique 2.1+2.2 (même racine) — le proof du P0 cite
  désormais le hash rejoué et les métriques réelles.
- **Repro** : mêmes commandes que 2.1/2.2.

### 2.4 P0-LS-14 — claim absolu
- **Ton refus** : « claim absolu “no model selector anywhere” subsiste. »
- **Remédiation** : RPL-2026-004 reformulé en observation BORNÉE (corpus
  explicite : audit humain 16/07 landing/création/IDE/Enterprise + 83
  changelogs + scan rendu 20/07 pages publiques ; « pas une affirmation sur
  tout le produit ») ; formulation absolue purgée aussi de
  REPLIT_LIVE_SCAN_2026-07-20.md.
- **Repro** :
  ```
  grep -rn 'anywhere in the product\|nulle part' docs/parity/PUBLIC_BASELINE_REPLIT_2026.yaml docs/parity/REPLIT_LIVE_SCAN_2026-07-20.md   # → vide
  grep -n 'BORNÉE' docs/parity/PUBLIC_BASELINE_REPLIT_2026.yaml
  ```

### 2.5 P0-A2-10 — décision Gallery
- **Ton refus** : « décision Gallery réellement DECIDED, pas OPEN/CAPTURE_INCOMPLETE. »
- **Remédiation** : `DEC-GALLERY-NO-SELF-PUBLISH` → `status: DECIDED` — le
  registre reflète le comportement CONSTRUIT et testé (curation admin seule,
  tests « non self-service » dans services/api/src/tests/gallery-routes.spec.ts).
- **Repro** :
  ```
  grep -n -A2 'DEC-GALLERY-NO-SELF-PUBLISH' docs/parity/DECISION_REGISTRY.yaml | grep status
  ```

### 2.6 P0-LS-04 — GitLab
- **Ton refus** : « simple note d'en-tête, aucune entrée GitLab structurée. »
- **Remédiation** : entrée STRUCTURÉE `nonTileCapabilities` dans
  IMPORT_PROVIDER_REGISTRY.yaml (kind, hubTileVisible, capabilityStatus,
  evidence, ecodeBuiltState, unknowns) + garde validateur CASSANTE (entrée ou
  champ manquant → build rouge). Les 12 tuiles restent intactes, GITLAB
  toujours interdit en tuile.
- **Repro** :
  ```
  grep -n -A9 'nonTileCapabilities' docs/parity/IMPORT_PROVIDER_REGISTRY.yaml
  node scripts/parity/validate-registries.mjs   # vert
  # preuve négative : retirer le champ kind → le validateur échoue
  ```

### 2.7 P0-LS-13 — prix sans contexte
- **Ton refus** : « prix $25/$20 et $95 sans geo/locale/cohorte ni hash. »
- **Remédiation** : 13 observations TOUTES contextualisées (geo/locale/
  cohorte/hash/artifactPath). Ta divergence $20-vs-$25 est RÉSOLUE par une
  RE-OBSERVATION live à 14:45Z (géo-IP IL, session anonyme) : la page affiche
  bien « $25 / $20 per month billed annually » (Core) et « $100 / $95 » (Pro)
  — le scan de 05:43 ($20/$18/$90) captait une version antérieure/cohorte
  différente LE MÊME JOUR. Les deux captures sont réelles et conservées ;
  artefact de re-observation hashé commité.
- **Repro** :
  ```
  shasum -a 256 docs/parity/livescan-2026-07-20/pricing-recheck-1445utc.txt   # 9352b15f…
  shasum -a 256 docs/parity/livescan-2026-07-20/pricing.png                   # 0dea38e8…
  grep -c 'countryOrGeo' docs/parity/PRICE_OBSERVATION_REGISTRY.yaml          # 13
  ```

### 2.8 P0-LS-16 — provenance du manifeste
- **Ton refus** : « manifeste sans generatedAt/generatedFromCommit/mergedCommit, annexe absente, timestamp constant. »
- **Remédiation** : DOCUMENT_MANIFEST.yaml porte `generatedAt` (le
  mergedToMainAt RÉEL de l'attestation — plus de constante),
  `generatedFromCommit` et `mergedCommit`, dérivés de CI_ATTESTATION.yaml
  roulée à CHAQUE merge → recalcul post-merge garanti, non auto-référentiel
  (le manifeste ne se hashe pas lui-même).
- **Repro** :
  ```
  head -10 docs/parity/DOCUMENT_MANIFEST.yaml | grep -E 'generatedAt|generatedFromCommit|mergedCommit'
  node scripts/parity/generate-document-manifest.mjs --check   # up to date
  ```

---

## 3. RAPPEL DES ÉTATS

Les 8 points sont restés `status: OPEN` avec proof « REMÉDIÉ — PRÊT À
RE-SOUMETTRE » : ils ne repassent PROVEN qu'avec ta re-vérification, et
CLOSED qu'avec ta signature (champ reviewer). Rien n'a été autoproclamé.
