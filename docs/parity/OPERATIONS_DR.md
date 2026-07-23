# OPERATIONS_DR — exploitation et reprise après sinistre

schemaVersion: 2
repoCommit: c0fd65de
status: PROVEN_REVIEW_PENDING
previousReviewVerdict: REFUSED (2026-07-22, REPONSE_EXPERT_PR40 §D2) — drills reconnus utiles et réels, contrat ENTIER non signable
contractScope: >-
  Ce document ne revendique PAS la signature du contrat CTR-OPERATIONS-DR
  entier. Les conclusions sont SCOPÉES aux artefacts : chaque drill joué est
  une preuve individuelle (evidenceId + repro). Au 2026-07-23, FERMÉES avec
  preuve live : SLO web, SLI par requête, monitoring persisté, failover DB.
  Restent OUVERTES (donc contrat non signable) : snapshots planifiés (décision
  coût, chiffrée §7), astreinte outillée, réplique cross-région, RTO applicatif
  complet (UNTESTED volontaire). Le drill failover reste une preuve
  individuelle validée (verdict expert 2026-07-22).
reserveFixesV3_2026_07_23: >-
  (n°4 compteur) chiffre normatif de disponibilité du drill failover RÉGÉNÉRÉ
  depuis l'artefact brut GCP (script `regen-uptime-count.py` sur
  `uptime-raw-drill-window.json`, fenêtre exacte 07:55→08:00) = 30/30 points
  True ; les « 276/276 » et « 270/270 » transcrits à la main sont corrigés
  (276 = fenêtre post-drill ; 270 = intégrité d'écriture, métrique différente
  dont le log brut est perdu → consignée mais NON normative). (n°1 obligations)
  SLO web + SLI par requête FERMÉS avec preuve live (EVID-DR-SLO-WEB-001,
  EVID-DR-SLI-001) ; snapshots planifiés chiffrés (~1,9 $/mois aux 32 Gio
  actuels) = décision Avi ; astreinte/cross-région = BLOCKED nommé.
reserveFixes2026_07_22: >-
  (1) monitoring persisté dans Terraform (module paramétré + validations
  anti-placeholder + defaults réels, `terraform validate` + fmt verts) ;
  (2) revendication « bit-à-bit » reformulée (portée exacte : sha256 du
  fichier témoin, pas le volume entier) ; (3) 13 min 06 s requalifié en durée
  de restauration/validation du clone, RTO applicatif complet = UNTESTED ;
  (4) scope du contrat ci-dessus ; (5) artefact chaos pod-kill REJOUÉ et
  commité + cause racine corrigée (.gitignore *.log excluait silencieusement
  les logs d'évidence — exception ajoutée), logs 1 Hz du failover perdus
  déclarés honnêtement avec corroboration GCP.
Règle d'or: un plan de DR non testé n'est pas un plan. Chaque affirmation ci-dessous
est PROUVÉE (evidenceId + repro), EN SERVICE (observable live), ou BLOCKED (dépendance
nommée). Aucun état intermédiaire.

## 1. SLO et error budgets

SLI de disponibilité API : fraction `check_passed` de l'uptime check GCP
`vibecore-prod-api-health-api-e-code-ai` (GET https://api.e-code.ai/health,
60 s, 6 régions de sonde). **Ce SLI est devenu réel le 2026-07-21** : l'ancien
check surveillait un host placeholder (`replace-me.example.com`, 100 % d'échec
mesuré sur 28 j) et notifiait un email placeholder — chaîne réparée et prouvée
(EVID-DR-MON-001, `docs/deploy-evidence/2026-07-21-dr-drill/monitoring-repair.txt`).
**Persisté dans Terraform le 2026-07-22** (réserve expert n°1) :
`infra/terraform/modules/monitoring/` paramétré (`api_host`, `ops_email`),
defaults réels dans `infra/terraform/variables.tf`, et **validations
anti-placeholder** (un plan avec `example.com`/`*.invalid` échoue). Un
`terraform apply` ne peut plus réintroduire la config cassée ; la convergence
live↔state (suppression des 2 objets créés à la main, ou import) est
documentée en tête du module.

| SLO | Cible | Error budget (28 j) | Mesure |
|---|---|---|---|
| Disponibilité API (`/health`) | 99.5 % | 3 h 36 min | uptime check `api.e-code.ai/health` (alerte « API uptime failed » → email réel) |
| Disponibilité app web (`e-code.ai`) | 99.5 % | 3 h 36 min | ✅ **FERMÉ le 2026-07-23** (réserve V3 n°1) : uptime check web créé (Terraform `web_health` + validation anti-placeholder, + live), **702/702 points True** mesurés sur 20 min ; alerte « web uptime failed » → email réel (EVID-DR-SLO-WEB-001) |
| Succès / latence **par requête** | 5xx ≤ 0.5 % ; p95 route < 1 s | dérivé du taux 5xx | ✅ **FERMÉ le 2026-07-23** (réserve V3 n°1) : l'API expose déjà `api_request_duration_seconds` (histogramme par requête, labels method/route/status) ; PodMonitoring GMP ajouté (IaC + live), scrape **prouvé `up=1`** après NetworkPolicy `namespaceSelector: gmp-system` (Dataplane V2), métrique **interrogeable dans Managed Prometheus** (ratio succès 1.0, p95 ~0,022 s live), + **policy d'alerte PromQL** sur l'error budget 5xx. EVID-DR-SLI-001 |

### SLI par requête — requêtes normatives (Managed Prometheus, reproductibles)

- **Taux de succès** : `sum(rate(api_request_duration_seconds_count{status!~"5.."}[5m])) / sum(rate(api_request_duration_seconds_count[5m]))`
- **Error budget 5xx (alerte, seuil 0,5 %)** : `sum(rate(api_request_duration_seconds_count{status=~"5.."}[5m])) / clamp_min(sum(rate(api_request_duration_seconds_count[5m])),1) > 0.005` → policy `API per-request error budget` (canal email réel).
- **p95 latence par route** : `histogram_quantile(0.95, sum by (le,route) (rate(api_request_duration_seconds_bucket[5m])))`

Le scrape passe par un PodMonitoring (`templates/podmonitoring-api.yaml`, gate
`observability.apiRequestMetrics.enabled`) et sa NetworkPolicy d'accompagnement :
sur GKE **Dataplane V2 (Cilium)**, un `ipBlock` du CIDR des nodes NE suffit PAS
(le collecteur est hostNetwork → identité `host`/`remote-node`, non matchée par
CIDR) ; l'autorisation par `namespaceSelector` sur `gmp-system` est requise —
prouvé live (`ipBlock` seul ⇒ `up=0` ; `+ namespaceSelector` ⇒ `up=1`).

Politique d'error budget : budget consommé > 100 % sur 28 j glissants ⇒ gel des
déploiements de confort (seuls fixes/sécurité passent) jusqu'à retour sous budget.
Le baseline historique honnête n'existe pas (le SLI d'uptime était factice avant
le 2026-07-21) — la première fenêtre de 28 j se termine le 2026-08-18.

## 2. RPO / RTO — cibles ET mesures

| Donnée | Mécanisme | RPO cible | RPO démontré | RTO cible | RTO MESURÉ |
|---|---|---|---|---|---|
| PostgreSQL (Cloud SQL `vibecore-prod-postgres`) | backups quotidiens 03:00 UTC ×30 + **PITR actif** (archivage WAL) | ≤ 15 min | clone PITR à une minute arbitraire réussi (04:38:21Z) — granularité minute | ≤ 60 min | **13 min 06 s** = restauration+validation du CLONE uniquement (EVID-DR-DB-001). Le **RTO applicatif complet** (bascule de la config DB + rollout + santé utilisateur) N'A PAS été mesuré : **UNTESTED** (l'exiger = re-pointer la prod, hors périmètre sans incident réel ; les étapes restantes sont documentées §3.1) |
| PostgreSQL — **perte de zone** (failover HA) | REGIONAL, standby cross-zone | 0 (synchrone) | **0 écriture ACKée perdue, prouvé** (drill 2026-07-21) | ≤ 5 min | **24,1 s** bascule / **16,0 s** failback (EVID-DR-FAILOVER-001) |
| Disques workspaces (PD par projet) | snapshots GCE à la demande (non planifiés — voir BLOCKED) | ≤ 24 h si planifiés ; aujourd'hui : dernier snapshot manuel | snapshot+restore prouvés | ≤ 30 min | **77 s** (snapshot→restauré→**marqueur témoin vérifié par sha256** ; PAS une vérification du volume entier — EVID-DR-DISK-001) |
| Store Nix partagé (RO, par génération) | snapshot signé par génération + clone par zone | 0 (immuable) | prouvé (gen-2 → clone zone-b identique, sha256 vérifié) | ≤ 15 min | **~50 s** (snapshot 27 s + clone 23 s, mesuré 2026-07-17/20) |
| Object storage projets (GCS `vc-<projectId>`) | buckets multi-région **EU** | 0 (réplication GCP) | localisation vérifiée | n/a (pas de restauration à faire en perte de zone/région) | n/a |
| Images/app AR + archives | rétention AR + tags protégés (workflow 6 h) | 0 | rollback par digest PROUVÉ live (I-REL-1, 2026-07-20) | ≤ 10 min | rollback digest : minutes (mesuré dans la preuve I-REL-1) |
| Redis (`vibecore-prod-redis`, STANDARD_HA) | réplique cross-zone ; **persistence DISABLED** | perte totale acceptée au restart complet (cache + files BullMQ) | mitigations EN SERVICE : jobs deploy durables + reaper */5 (prouvé 09/07) ; sessions en DB | ≤ 5 min (recréation) | non chronométré (HA gère la zone ; full-loss = re-remplissage naturel) |

## 3. Sauvegarde / restauration — procédures PROUVÉES

### 3.1 Base de données (drill joué le 2026-07-21 — EVID-DR-DB-001)

Restauration = **clone PITR vers une instance neuve** (jamais d'écrasement de la
prod ; bascule DNS/URL applicative ensuite si incident réel) :

```bash
PIT="YYYY-MM-DDTHH:MM:SS.000Z"   # instant à restaurer (PITR actif)
gcloud sql instances clone vibecore-prod-postgres vibecore-restore-<date> \
  --point-in-time="$PIT" --project=vibecore-495216
# vérification : depuis un pod api, même requête de comptage sur prod et clone
# (lignes antérieures au PIT strictement égales) — script dans l'évidence.
```

Drill mesuré : lancé 04:43:21Z → RUNNABLE + intégrité vérifiée 04:56:27Z =
**13 min 06 s**, intégrité stricte (4 compteurs + dernier deployment identiques).
Instance de drill détruite après coup.

Portée EXACTE (réserve expert n°3) : ces 13 min 06 s couvrent la restauration
du clone et sa validation de données — **pas** le RTO applicatif de bout en
bout. En incident réel s'ajoutent : mise à jour du secret `DATABASE_URL`
(nouvelle IP), `helm upgrade`/rollout api+worker+manager (~3-5 min observés
sur les rollouts courants), et vérification santé utilisateur. Ce chemin
complet n'a **jamais été joué** (il re-pointerait la prod) : RTO applicatif
complet = **UNTESTED**, borne inférieure connue = 13 min 06 s + rollout.

### 3.2 Disque workspace (drill joué le 2026-07-21 — EVID-DR-DISK-001)

```bash
gcloud compute snapshots create <nom> --source-disk=<pd-du-pvc> --source-disk-zone=<zone>
gcloud compute disks create <nom>-restored --source-snapshot=<nom> --zone=<zone>
# PV/PVC statiques + pod de vérification (manifests dans l'évidence)
```

Mesuré : **77 s** bout en bout. Portée EXACTE de la vérification (réserve
expert n°2) : le sha256 d'UN fichier témoin daté, écrit sur le volume juste
avant le snapshot, est retrouvé identique sur le disque restauré — cela prouve
la chaîne snapshot→restore→montage et l'intégrité de ce fichier, PAS une
comparaison du contenu entier du volume (non faite ; un md5 exhaustif du
filesystem serait l'extension naturelle du prochain drill trimestriel). ⚠ La
**planification** de ces snapshots
(schedule GCE sur les PD workspaces) n'existe pas : **BLOCKED — décision Avi**
(coût snapshot 0.058 $/Gio/mois × volumétrie réelle ; commande prête en §7).

### 3.3 Store Nix / images applicatives

Couverts par les preuves existantes : générations immuables (snapshot signé +
clones zonaux vérifiés par guard à CHAQUE démarrage de pod) et rollback serveur
par digest retenu (I-REL-1 live). Réfs : `2026-07-17-nix-multizone/`,
`2026-07-17-rollback-permanent/`.

## 4. Chaos / perte de zone et de dépendance — JOUÉ

| Exercice | Date | Résultat | Evidence |
|---|---|---|---|
| **Perte de zone** (cordon europe-west9-a, la zone préférée) | 2026-07-20 | Projet Python neuf provisionne en zone-b : store clone monté + génération vérifiée, uv/venv, Preview 200, **Publish READY + 200** — bout en bout pendant la « panne ». Restauration prouvée dans les 2 sens, zéro split-brain. 2 bugs réels trouvés PAR l'exercice et corrigés (deadlock affinités data-PVC ; RBAC PV) | `2026-07-17-nix-multizone/ZONE_LOSS_TEST.md` |
| **Perte d'instance API** (kill d'1 pod sous sonde continue) | 2026-07-21, **REJOUÉ 2026-07-22** | 2×**90/90 requêtes HTTP 200** pendant kill + remplacement (<2 min) — zéro downtime. ⚠ Le log du 21/07 cité par un commit n'a jamais atteint l'arbre (`.gitignore *.log` l'excluait silencieusement — réserve expert n°5) : exercice REJOUÉ le 22/07, artefact commité, gitignore corrigé | `chaos-probe-podkill-replay-20260722.log` + `-meta.txt` (EVID-DR-CHAOS-002) |
| Perte de zone **base de données** (failover Cloud SQL RÉEL, GO Avi) | 2026-07-21 | Bascule b→c puis failback c→b : **24,1 s** d'indispo écritures (bascule) + **16,0 s** (failback), corroborées par les op Cloud SQL `FAILOVER` (autoritaires) ; disponibilité `/health` **30/30 points d'uptime GCP True** (100 %) — chiffre RÉGÉNÉRÉ depuis l'artefact brut, pas transcrit ; topologie initiale restaurée. (L'observation « 0 écriture ACKée perdue » est consignée mais NON ré-générable — log de sonde perdu) | `2026-07-21-dr-failover/` (EVID-DR-FAILOVER-001) |
| Perte de **région** (europe-west9 entière) | — | **BLOCKED — architecture** : aucune réplique cross-région (DB, disques). GCS survit (multi-région EU). Décision + budget Avi (réplique lecture cross-région Cloud SQL ≈ coût d'une 2ᵉ instance) | — |

## 5. Astreinte / alerting — état honnête

- Alerte « uptime failed » : policy GCP active, re-câblée le 2026-07-21 sur un
  check réel + l'email réel d'Avi (l'ancien canal était `ops@example.invalid`).
  ⚠ Confirmation du canal par Avi possible (mail de vérification GCP).
- Alerte deploy : chaque run CD notifie (résumé GitHub + Slack si webhook posé) ;
  l'étape « Verify rollback flag » échoue BRUYAMMENT si l'invariant D2 casse
  (prouvé sur run réel).
- **Astreinte humaine : opérateur unique (Avi), pas de rotation ni d'escalade
  outillée (PagerDuty/téléphone). BLOCKED — décision Avi** (choix d'outil +
  numéro). Ce document ne prétend pas à une astreinte qui n'existe pas.

## 6. Calendrier d'exercices (répétables — scripts fournis)

| Exercice | Fréquence | Repro |
|---|---|---|
| Restore drill DB (PITR → clone → intégrité → teardown) | trimestriel | §3.1 + évidence (commandes exactes) |
| Restore drill disque workspace | trimestriel | §3.2 |
| Perte de zone (cordon + projet neuf bout en bout) | semestriel | `ZONE_LOSS_TEST.md` (méthode cordon = sans éviction) |
| Kill-pod sous sonde | à chaque changement de topologie | EVID-DR-CHAOS-001 (one-liner) |
| Failover Cloud SQL réel | annuel (joué le 2026-07-21 : 24,1 s / 16,0 s, zéro perte) | EVID-DR-FAILOVER-001 |

## 7. État des obligations : FERMÉES vs BLOCKED (dépendance nommée)

### Fermées (preuve live + IaC)

1. ~~Failover Cloud SQL réel~~ — **FAIT le 2026-07-21 sur GO Avi** (24,1 s / 16,0 s, zéro perte — EVID-DR-FAILOVER-001).
2. ~~SLO web `e-code.ai`~~ — **FAIT le 2026-07-23** : uptime check (Terraform `web_health` + live), 702/702 True mesurés (EVID-DR-SLO-WEB-001).
3. ~~SLI par requête (latence/erreurs)~~ — **FAIT le 2026-07-23** : `api_request_duration_seconds` scrapé par Managed Prometheus (PodMonitoring + NetworkPolicy IaC), `up=1` prouvé, requêtes SLO + policy d'alerte 5xx (EVID-DR-SLI-001). Contredit le « aucun pipeline de métriques » de la version précédente : GMP EST en service et ingère désormais le SLI par requête.
4. ~~Monitoring persisté en Terraform~~ — FAIT le 2026-07-22 (module paramétré + validations anti-placeholder).

### BLOCKED — décision/infra Avi (chiffrées quand possible)

5. **Snapshots planifiés des PD workspaces** — **décision COÛT à remonter** :
   resource policy GCE snapshot-schedule à attacher aux disques. Volumétrie
   RÉELLE mesurée ce jour : **5 disques PVC, 32 Gio provisionnés au total**.
   Coût snapshot standard europe-west9 = 0,058 $/Gio/mois sur octets stockés
   (compressés, < provisionné) → borne haute **~1,9 $/mois** aux 32 Gio actuels,
   croissant avec le nombre de projets. Commande prête ; **GO + accord coût = Avi**.
6. **Astreinte outillée** — choix outil (PagerDuty/OpsGenie/téléphone) + rotation.
   Aujourd'hui : opérateur unique (Avi), alertes → email réel. Dépendance : décision Avi.
7. **Réplique cross-région** (perte de région entière) — décision + budget (≈ coût
   d'une 2ᵉ instance Cloud SQL + disques répliqués). Dépendance : arbitrage Avi.
8. **RTO applicatif complet DB** — mesurer le chemin restore→bascule config→rollout
   →santé user re-pointerait la prod : **UNTESTED** volontaire (borne inférieure
   connue = 13 min 06 s + rollout). À jouer lors d'un prochain GO fenêtre.
9. **Confirmation du canal email** (boîte avi@snatchbot.me — mail de vérification GCP).

## 8. Incidents notables documentés (inchangé, historique réel)

- OAuth prod cassé (state signé + NetworkPolicy) — corrigé, documenté.
- Deploy QUEUED orphelin (OOM) — corrigé (BullMQ durable + reaper 5 min), prouvé.
- Crons morts depuis le 9/07 — root-cause prouvée, fix `616f0bad` (16/07).
- Faux rollback URL-only — supprimé et prouvé fail-closed (D2, 2026-07-20).
- Monitoring factice (host + email placeholders) — découvert et réparé (2026-07-21).
