# OPERATIONS_DR — exploitation et reprise après sinistre

schemaVersion: 2
repoCommit: c0fd65de
status: PROVEN_REVIEW_PENDING
previousReviewVerdict: REFUSED (2026-07-22, REPONSE_EXPERT_PR40 §D2) — drills reconnus utiles et réels, contrat ENTIER non signable
contractScope: >-
  Ce document ne revendique PAS la signature du contrat CTR-OPERATIONS-DR
  entier. Les conclusions sont SCOPÉES aux artefacts : chaque drill joué est
  une preuve individuelle (evidenceId + repro) ; les obligations UNTESTED /
  BLOCKED (SLO web, snapshots planifiés, astreinte outillée, SLI par requête,
  réplique cross-région, RTO applicatif complet) restent OUVERTES et le
  contrat ne sera signable que quand elles seront faites. Le drill failover
  Cloud SQL est enregistrable comme preuve individuelle validée (verdict
  expert 2026-07-22).
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
| Disponibilité API (`/health`) | 99.5 % | 3 h 36 min | uptime check ci-dessus (alerte « uptime failed » → email réel) |
| Disponibilité app web (`e-code.ai`) | 99.5 % | 3 h 36 min | ⚠ UNTESTED — check web à créer (même mécanique, 1 commande, voir §7) |
| Latence / taux d'erreur par requête | — | — | **BLOCKED** : aucun pipeline de métriques applicatives (Prometheus/Managed Service) n'est déployé. Dépendance : décision + budget Avi |

Politique d'error budget : budget consommé > 100 % sur 28 j glissants ⇒ gel des
déploiements de confort (seuls fixes/sécurité passent) jusqu'à retour sous budget.
Le baseline historique honnête n'existe pas (le SLI était factice avant le
2026-07-21) — la première fenêtre de 28 j se termine le 2026-08-18.

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
| Perte de zone **base de données** (failover Cloud SQL RÉEL, GO Avi) | 2026-07-21 | Bascule b→c puis failback c→b sous sonde 1 Hz : **24,1 s** d'indispo écritures (bascule) + **16,0 s** (failback), lectures idem, **`/health` API 100 % en 200** pendant tout le drill, **0 écriture ACKée perdue** (270/270), topologie initiale restaurée | `2026-07-21-dr-failover/` (EVID-DR-FAILOVER-001) |
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

## 7. BLOCKED / ACTIONS AVI (dépendances exactes, rien d'autre ne manque)

1. ~~Failover Cloud SQL réel~~ — **FAIT le 2026-07-21 sur GO Avi** (24,1 s / 16,0 s, zéro perte — EVID-DR-FAILOVER-001).
2. **Snapshots planifiés des PD workspaces** : créer une resource policy GCE et
   l'attacher aux disques (`gcloud compute resource-policies create snapshot-schedule …`)
   — coût à valider (0.058 $/Gio/mois sur octets stockés).
3. **Astreinte outillée** : choix PagerDuty/OpsGenie/téléphone + rotation.
4. **SLI par requête (latence/erreurs)** : déployer un pipeline de métriques.
5. **Réplique cross-région** (perte de région) : décision + budget.
6. **Confirmation du canal email** (boîte avi@snatchbot.me).
7. Uptime check du domaine web `e-code.ai` (1 commande, même mécanique que l'API).

## 8. Incidents notables documentés (inchangé, historique réel)

- OAuth prod cassé (state signé + NetworkPolicy) — corrigé, documenté.
- Deploy QUEUED orphelin (OOM) — corrigé (BullMQ durable + reaper 5 min), prouvé.
- Crons morts depuis le 9/07 — root-cause prouvée, fix `616f0bad` (16/07).
- Faux rollback URL-only — supprimé et prouvé fail-closed (D2, 2026-07-20).
- Monitoring factice (host + email placeholders) — découvert et réparé (2026-07-21).
