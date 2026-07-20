# PAQUET RELECTEUR — pour l'expert d'Avi (2026-07-20)

Commit de référence : `646e75ca` (main, plan canonique actif). Généré depuis
les registres réels (`P0_REGISTRY.yaml`, `E2E_PROOFS.yaml`) — zéro valeur
inventée ; chaque chemin d'artefact a été vérifié présent sur disque.

---

## 1. PROMPT À COPIER-COLLER (pour l'expert)

```
Tu agis comme RELECTEUR HUMAIN (reviewer) du plan de parité E-Code.

CE QU'ON TE DEMANDE — exactement ceci, rien d'autre :
1. Ouvre le dépôt openaxcloud/vibecore au commit 646e75ca (branche main).
2. Pour chacun des 55 points P0 listés dans le paquet
   (docs/parity/REVIEWER_PACKET_EXPERT_20260720.md, §2), vérifie que la
   preuve annoncée existe et soutient réellement le point :
   - le chemin d'artefact existe et son contenu correspond au titre ;
   - quand une commande de reproduction est donnée (§3), REJOUE-LA au
     lieu de croire le document ;
   - une preuve d'API ne vaut pas une preuve d'écran ; un contrat ne
     vaut pas une implémentation — le champ proof de chaque entrée dit
     honnêtement lequel des deux tu regardes.
3. CRITÈRE POUR SIGNER un point : preuve présente + reproductible + 
   cohérente avec le titre. En cas de doute : NE SIGNE PAS, note une réserve.
4. SIGNATURE : pour chaque point accepté, écris ton identifiant dans le
   champ reviewer de l'entrée correspondante de docs/parity/P0_REGISTRY.yaml
   (remplace reviewer: UNKNOWN par reviewer: <ton-nom>). Un point signé
   passera automatiquement CLOSED au prochain calcul. Fais pareil, si tu
   les valides, pour le champ reviewer des contrats listés au §2.3 du plan
   (c'est ce qui débloque le niveau contractsValidated).

CE QUE TU RENDS :
- la liste des IDs SIGNÉS ;
- la liste des IDs REFUSÉS avec, pour chacun, la réserve précise
  (artefact manquant, preuve insuffisante, non reproductible, désaccord) ;
- le tout en un seul message ou en une PR modifiant les champs reviewer.

INTERDITS : signer sans avoir ouvert l'artefact ; signer « en bloc » ;
reformuler un point au lieu de le signer ou le refuser.
```

---

## 2. LES 55 P0 PROUVÉS — à vérifier un par un

Chaque ligne : ID · titre en clair · preuve (chemin réel sur disque, vérifié présent au moment de la génération).

| ID | Titre | Preuve (evidenceId) |
|---|---|---|
| `P0-V4-1` | Collecteur aveugle : ajouter routes produit (rendu JS) + canal de lancement | `docs/deploy-evidence/2026-07-16-collector-gallery/` |
| `P0-V4-2` | Gallery : requalifier la table (mesures réelles, archive rendue) | `docs/deploy-evidence/2026-07-16-collector-gallery/` |
| `P0-V4-3` | Hiérarchie GCP : folder-per-tenant mort (300 cap + 0,1 req/s) | `services/api/src/capacity-policy.spec.ts` |
| `P0-V3-02` | Table Gallery factuellement dépassée | `docs/deploy-evidence/2026-07-16-collector-gallery/` |
| `P0-V3-03` | Hiérarchie folder-per-tenant non scalable (300 enfants max, 0,1 folder/s) | `services/api/src/capacity-policy.spec.ts` |
| `P0-V3-04` | Cycle de vie CloudTenant incomplet (owner, transfert, merge/split, résidence) | `docs/parity/PROJECT_FACTORY_CONTRACT.md` |
| `P0-V3-08` | Rollback non reproductible avec de simples refs secrets | `docs/deploy-evidence/2026-07-17-rollback/` |
| `P0-V3-09` | Atomicité du checkpoint surpromise | `docs/parity/CHECKPOINT_CONTRACT.md` |
| `P0-V3-10` | Contrat Nix incomplet et pin mal classé | `docs/parity/RUNTIME_NIX_CONTRACT.md` |
| `P0-V3-11` | Database : « Agent mute DEV » erroné + protocole publish insuffisant | `docs/parity/DATABASE_CONTRACT.md` |
| `P0-V3-12` | Ledger de billing insuffisant | `docs/parity/BILLING_LEDGER_CONTRACT.md` |
| `P0-V3-13` | Matrice des surfaces inexploitable | `docs/parity/SURFACE_REGISTRY.yaml` |
| `P0-V3-14` | Paquet documentaire et calcul d'approbation absents | `docs/parity/APPROVAL_STATUS.json` |
| `P0-A2-01` | Paquet de preuve absent — DOCUMENT_MANIFEST signé | `docs/parity/DOCUMENT_MANIFEST.yaml` |
| `P0-A2-02` | Univers des surfaces incomplet (10 vs 159) | `docs/parity/SURFACE_REGISTRY.yaml` |
| `P0-A2-03` | Modèle Project → Artifacts absent | `docs/parity/PLAN_PARITE_REPLIT.md` |
| `P0-A2-04` | Types de déploiement non contractualisés | `docs/parity/DEPLOYMENT_TYPES_CONTRACT.md` |
| `P0-A2-05` | registryComplete vrai sur registre incomplet | `docs/parity/APPROVAL_STATUS.json` |
| `P0-A2-06` | verticalReady = faux positif UI | `docs/parity/APPROVAL_STATUS.json` |
| `P0-A2-07` | architectureContracted = présence seulement | `docs/parity/APPROVAL_STATUS.json` |
| `P0-A2-08` | Erreur Auth (migration + MFA/orgs) | `docs/parity/baseline/sources/2026-07-20-replit-clerk-auth.md` |
| `P0-A2-09` | Erreur Workload Identity | `docs/parity/baseline/sources/2026-07-20-gke-workload-identity.html` |
| `P0-A2-10` | Décision Gallery incohérente | `docs/parity/DECISION_REGISTRY.yaml` |
| `P0-A2-11` | Compteurs contradictoires | `docs/parity/APPROVAL_STATUS.json` |
| `P0-A2-13` | Provenance du statut insuffisante | `docs/parity/PLAN_PARITE_REPLIT.md` |
| `P0-A2-14` | Cloud Run multi-tenant incomplet | `docs/parity/baseline/sources/2026-07-20-cloudrun-multitenant.html` |
| `P0-LS-01` | Corriger « nouveau compte » en visiteur anonyme | `docs/parity/ROUTE_OBSERVATION_REGISTRY.yaml` |
| `P0-LS-02` | Corriger 21 tentatives / 20 routes / 19 HTTP 200 / 16 hashes distincts | `docs/parity/ROUTE_OBSERVATION_REGISTRY.yaml` |
| `P0-LS-03` | Joindre et valider le paquet complet d evidence du scan | `docs/parity/livescan-2026-07-20/` |
| `P0-LS-04` | Reclasser GitLab comme capacité supportée sans tuile courante | `docs/parity/IMPORT_PROVIDER_REGISTRY.yaml` |
| `P0-LS-05` | Corriger la taxonomie Artifact/Asset/Component/Deployment | `docs/parity/ARTIFACT_KIND_REGISTRY.yaml` |
| `P0-LS-06` | Classifier N1–N15 par registre spécialisé | `docs/parity/OBSERVATION_REGISTRY.yaml` |
| `P0-LS-07` | Supprimer l addition automatique 159+15=174 | `docs/parity/SURFACE_REGISTRY.yaml` |
| `P0-LS-08` | Reclasser Spotlight, Resources, Preview DevTools, Library, Android Emulator, Grouped Publish | `docs/parity/baseline/snapshots/2026-07-20/llms-full.txt` |
| `P0-LS-09` | Corriger MCP ≠ preuve de remplacement d API | `docs/parity/CAPABILITY_REGISTRY.yaml` |
| `P0-LS-10` | Limiter l inférence sur /@user | `docs/parity/PUBLIC_BASELINE_REPLIT_2026.yaml` |
| `P0-LS-11` | Reclasser /bounties comme redirect Expert Network (Contra) | `docs/parity/EXTERNAL_ECOSYSTEM_REGISTRY.yaml` |
| `P0-LS-12` | Distinguer plan Teams retiré et capacités d équipe | `docs/parity/OFFERING_ENTITLEMENT_REGISTRY.yaml` |
| `P0-LS-13` | Contextualiser les prix et mesurer les divergences | `docs/parity/OFFERING_ENTITLEMENT_REGISTRY.yaml` |
| `P0-LS-14` | Limiter « no model selector » au corpus observé | `docs/parity/PUBLIC_BASELINE_REPLIT_2026.yaml` |
| `P0-LS-15` | Retirer le lien non prouvé Parallel Agents = microVM par tâche | `docs/parity/CAPABILITY_REGISTRY.yaml` |
| `P0-LS-16` | Corriger generatedAt et recalculer après merge | `docs/parity/DOCUMENT_MANIFEST.yaml` |
| `P0-LS-17` | Réconcilier les compteurs (174/159, 114/99, surfaces 10) | `docs/parity/APPROVAL_STATUS.json` |
| `P0-LS-18` | Recalculer APPROVAL_STATUS sur le commit mergé | `docs/parity/CI_ATTESTATION.yaml` |
| `P0-B-01` | Overlay code réel + bolt sur les 159 candidats (exigence propriétaire) | `docs/parity/SURFACE_REGISTRY.yaml` |
| `P0-EX-01` | Retirer le statut d audit et l overlay incomplet du plan normatif | `docs/parity/PLAN_PARITE_REPLIT.md` |
| `P0-EX-02` | Générer IMPLEMENTATION_STATUS.yaml depuis le code, les registres et les preuves | `docs/parity/IMPLEMENTATION_STATUS.yaml` |
| `P0-EX-03` | Reclasser la persistance du layout en UNKNOWN Replit + exigence E-Code | `docs/parity/PLAN_PARITE_REPLIT.md` |
| `P0-EX-04` | Corriger le branchement clean/quarantaine de la machine Import | `docs/parity/IMPORT_REMIX_CONTRACT.md` |
| `P0-EX-05` | Corriger les entitlements Starter : apps supplémentaires vs types d Artifact | `docs/parity/OFFERING_ENTITLEMENT_REGISTRY.yaml` |
| `P0-EX-06` | Retirer les montants tarifaires du plan durable | `docs/parity/PRICE_OBSERVATION_REGISTRY.yaml` |
| `P0-EX-07` | Ajouter identité, Workspace, Membership, Group, Guest et AccessGrant au domaine | `docs/parity/IDENTITY_COLLABORATION_CONTRACT.md` |
| `P0-EX-08` | Ajouter un ProjectManifest versionné comme source des composants et scopes | `docs/parity/PROJECT_MANIFEST_SCHEMA.json` |
| `P0-EX-09` | Contractualiser séparément Autoscale, Static, Reserved et Scheduled | `docs/parity/DEPLOYMENT_TYPES_CONTRACT.md` |
| `P0-EX-10` | Rendre l activation canonique et la génération de statut entièrement CI | `docs/parity/CI_ATTESTATION.yaml` |

Détail complet de chaque entrée (champ proof, dépendances, condition de
clôture) : `docs/parity/P0_REGISTRY.yaml`.

---

## 3. COMMANDES DE REPRODUCTION

### 3.1 La chaîne de validation complète (à rejouer en premier)

```bash
# Depuis la racine du dépôt, au commit 646e75ca :
PARITY_DEPS=./node_modules node scripts/parity/generate-approval-status.mjs --check   # statut sans dérive
PARITY_DEPS=./node_modules node scripts/parity/generate-document-manifest.mjs --check # manifeste sans dérive
PARITY_DEPS=./node_modules node scripts/parity/generate-parity-status.mjs --check     # vue sans dérive
PARITY_DEPS=./node_modules node scripts/parity/validate-registries.mjs                # exit 0 = tous registres valides
PARITY_DEPS=./node_modules node scripts/parity/check-plan-completeness.mjs            # 336 constats certifiés (compte + SHA-256)
```

Preuve négative (le contrôle casse vraiment) : renomme un `p0Id` attendu
dans `P0_REGISTRY.yaml`, relance le validateur → exit 1 en nommant l'ID ;
restaure ensuite (`git checkout -- docs/parity/P0_REGISTRY.yaml`).

### 3.2 Les 12 preuves bout-en-bout (étapes réelles de chaque preuve)

**`E2E-PHASEB-NODE`** — artefacts : `docs/deploy-evidence/2026-07-15-phase-b/`
  - POST /projects/:id/deployments (provider=server, allowlist révision)
  - attendre READY
  - GET URL publique

**`E2E-AUTOSCALE-Z`** — artefacts : `docs/deploy-evidence/2026-07-16-zone-autoscale/`
  - publish dedicated-1
  - vérifier requests==limits kubectl
  - cycles sleep/wake
  - événement billing

**`E2E-AGM-A`** — artefacts : `docs/deploy-evidence/2026-07-16-agent-modes/`
  - ouvrir /
  - /projects/new
  - IDE
  - scanner le DOM (innerText+attributs) pour tout nom de modèle

**`E2E-AGM-B`** — artefacts : `docs/deploy-evidence/2026-07-16-agent-modes/`
  - ouvrir l'IDE
  - vérifier agent-mode-segmented (Lite/Economy/Power)
  - ouvrir Advanced

**`E2E-AGM-C`** — artefacts : `docs/deploy-evidence/2026-07-16-agent-modes/`
  - send en economy
  - send en lite
  - lire agent-mode.routed (pod web) et AgentCallLog (admin)

**`E2E-AGM-E`** — artefacts : `docs/deploy-evidence/2026-07-16-agent-modes/`
  - GET /agent/routing/resolve?mode=economy&highEffort=true (org free)
  - idem turbo sans flag org

**`E2E-AGM-F`** — artefacts : `docs/deploy-evidence/2026-07-16-agent-modes/`
  - ouvrir agent-routing
  - mettre un revient > prix
  - vérifier alerte + 409 sans confirmation

**`E2E-VERTICAL-CREATE`** — artefacts : `docs/deploy-evidence/2026-07-17-vertical/`
  - /projects/new
  - saisir un prompt
  - cliquer Create
  - l'IDE s'ouvre sur le projet

**`E2E-VERTICAL-MODIFY`** — artefacts : `docs/deploy-evidence/2026-07-17-vertical/`
  - agent IDE: éditer server.js
  - changer la réponse GET / en 'E2E-MODIFY applied'
  - vérifier le fichier dans le pod

**`E2E-VERTICAL-PREVIEW`** — artefacts : `docs/deploy-evidence/2026-07-17-vertical/`
  - projet Python/Flask
  - serveur sur :5000
  - /ports détecte
  - ouvrir l'URL preview → rend

**`E2E-VERTICAL-OBSERVE`** — artefacts : `docs/deploy-evidence/2026-07-17-vertical/`
  - ouvrir Deployments → Logs de l'app publiée
  - lire les logs build & deploy réels

**`E2E-VERTICAL-ROLLBACK`** — artefacts : `docs/deploy-evidence/2026-07-17-rollback/`
  - deploy v1 (server) → READY, digest_v1 sha256:657271c5…, sert 'ROLLBACK-PROOF v1'
  - deploy v2 → READY, digest_v2 sha256:2eb96530… (différent), sert 'v2'
  - kubectl delete deploy app-<v1> (révision supprimée) → URL v1 = HTTP 410
  - POST /projects/:id/deployments/:v1/rollback (flag SERVER_DEPLOY_ROLLBACK_FROM_DIGEST=1)
  - GET l'URL du rollback

### 3.3 Vérifications ponctuelles utiles

```bash
# Le scan live et ses captures hashées
shasum -a 256 docs/parity/REPLIT_LIVE_SCAN_2026-07-20.md      # 396b07e2…
ls docs/parity/livescan-2026-07-20/ | wc -l                    # 69 fichiers + manifest.json (21 entrées)
# Les 4 faux « sans-trace » reclassés — citations dans le corpus hashé du jour
grep -n 'Devtools' docs/parity/baseline/snapshots/2026-07-20/llms-full.txt | head -2   # l.6116
grep -n 'The Library sidebar' docs/parity/baseline/snapshots/2026-07-20/llms-full.txt  # l.7580
grep -n 'Android Emulator' docs/parity/baseline/snapshots/2026-07-20/llms-full.txt | head -2  # l.2833
grep -n 'go live together' docs/parity/baseline/snapshots/2026-07-20/llms-full.txt     # l.7605
# L'état d'implémentation (159 items, règles §23)
grep -c 'itemId:' docs/parity/IMPLEMENTATION_STATUS.yaml       # 159
```

---

Rappel du cadre : le statut global reste `NOT_APPROVED` /
`highestPassedLevel: documentReconciled` — ta signature ferme des points
individuels et débloque `contractsValidated`, elle ne déclare pas le
produit fini. Toute réserve est bienvenue : une preuve refusée redevient
un travail tracé, pas un échec caché.
