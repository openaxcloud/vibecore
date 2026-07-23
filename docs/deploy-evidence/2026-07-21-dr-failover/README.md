# Failover Cloud SQL RÉEL — 2026-07-21 (EVID-DR-FAILOVER-001, GO Avi)

Instance `vibecore-prod-postgres` (POSTGRES_16, **REGIONAL** vérifié avant
lancement, primaire europe-west9-b, secondaire europe-west9-c). Fenêtre
creuse choisie : 1 requête active / 7 connexions au pré-vol. Sondes
continues à 1 Hz depuis un pod api (connexion NEUVE + INSERT commité par
écriture ; SELECT par lecture) + sonde externe `GET /health`.

## Chronologie (UTC)

| t | événement |
|---|---|
| 07:55:39 | `gcloud sql instances failover` lancé (sondes vertes) |
| 07:55:42.527 | dernier ACK d'écriture avant bascule (seq 37) |
| 07:56:06.605 | premier ACK après bascule (seq 61) — **fenêtre écritures : 24,1 s** |
| 07:56:16 | gcloud rend la main (37 s) ; primaire = **europe-west9-c** |
| 07:56:49, 07:57:36 | tentatives de failback → 409 (standby en reconstruction — attendu) |
| 07:58:23 | failback lancé (3ᵉ tentative) |
| 07:58:26.745 → 07:58:42.763 | **fenêtre écritures failback : 16,0 s** |
| 07:59:19 | failback terminé ; primaire = **europe-west9-b** (topologie initiale restaurée) |

## Mesures

### Chiffre normatif — RÉGÉNÉRÉ depuis l'artefact brut (réserve expert V3 n°4)

La disponibilité de l'API pendant le drill est **régénérée** depuis la source
autoritaire re-interrogeable (uptime check GCP `api.e-code.ai/health`, 6
régions), sur la **fenêtre exacte du drill** 07:55:00Z→08:00:00Z, par le
script `regen-uptime-count.py` sur le dump brut `uptime-raw-drill-window.json`
— aucune transcription manuelle :

```
$ python3 regen-uptime-count.py uptime-raw-drill-window.json
  points check_passed : True=30  False=0  total=30
  => disponibilité /health pendant le drill : 30/30   (6 régions × 5 min)
```

**Chiffre normatif = 30/30 points d'uptime True** (100 %). L'API HTTP n'est
jamais tombée pendant la bascule ni le failback ; seules les **écritures DB**
ont marqué la pause attendue (le check sonde `/health`, pas la DB). Re-tirable
à volonté tant que GCP retient la fenêtre (commande dans « Repro »).

> ⚠️ Correction du dossier consolidé : la version précédente citait « 276/276 »
> (fenêtre post-drill 08:10→08:20, autre alignement) et « 270/270 » (métrique
> d'intégrité d'écriture, voir plus bas) comme s'il s'agissait d'un même
> compteur de sondes. Les deux étaient des transcriptions manuelles de
> nombres différents. Le seul chiffre normatif de disponibilité est désormais
> le 30/30 régénéré ci-dessus.

### Fenêtres et intégrité (mesures dérivées ; voir statut de reproductibilité)

| Mesure | Valeur | Source / statut | Cible |
|---|---|---|---|
| Indispo écritures (bascule) | **24,1 s** | fenêtre analysée ; **corroborée** par l'op Cloud SQL `FAILOVER 07:55:41→07:56:13` (autoritaire, committée) | RTO zone-DB ≤ 5 min → tenu ×12 |
| Indispo écritures (failback) | **16,0 s** | idem ; op `FAILOVER 07:58:25→07:58:49` | idem |
| Disponibilité `/health` | **30/30** (100 %) | **RÉGÉNÉRÉE depuis raw** (ci-dessus) | l'API n'est jamais tombée |
| Intégrité écritures : 0 ACK perdu | 270 ACK, 270 en base | **mesure NON ré-générable** — le log de sonde brut est perdu (voir addendum n°2) et la table `_dr_failover_drill` a été supprimée après le drill. Consignée comme observation, PAS comme chiffre normatif | RPO commité = 0 (visé) |

Erreurs observées pendant les fenêtres (attendu) : `pg_filenode.map I/O error`
→ `ECONNREFUSED` → `database system is starting up` → reprise.

## Repro

```bash
# pré-vol : REGIONAL + RUNNABLE + fenêtre creuse
gcloud sql instances describe vibecore-prod-postgres --format="value(state,settings.availabilityType,gceZone)"
# sondes 1 Hz (scripts write/read : voir probe-*.log en tête de fichier)
gcloud sql instances failover vibecore-prod-postgres   # bascule
# failback : relancer la même commande quand le standby est prêt (409 sinon)

# RÉGÉNÉRER le chiffre normatif de disponibilité depuis la source autoritaire :
TOKEN=$(gcloud auth print-access-token)
curl -s -G "https://monitoring.googleapis.com/v3/projects/vibecore-495216/timeSeries" \
  -H "Authorization: Bearer $TOKEN" \
  --data-urlencode 'filter=metric.type="monitoring.googleapis.com/uptime_check/check_passed" AND resource.labels.host="api.e-code.ai"' \
  --data-urlencode "interval.startTime=2026-07-21T07:55:00Z" \
  --data-urlencode "interval.endTime=2026-07-21T08:00:00Z" \
  --data-urlencode "aggregation.alignmentPeriod=60s" \
  --data-urlencode "aggregation.perSeriesAligner=ALIGN_NEXT_OLDER" \
  -o uptime-raw-drill-window.json
python3 regen-uptime-count.py uptime-raw-drill-window.json
```

Table de drill `_dr_failover_drill` supprimée après le drill.

## Addendum honnêteté (log complet de la sonde /health)

La sonde /health locale (poste d'observation) a tourné jusqu'à 08:17:21
(900 échantillons) : elle a montré 3 codes `000` (échec côté CLIENT curl) à
08:13:27 / 08:15:45 / 08:16:18 — 13+ min APRÈS la fin du drill, isolés. Ces
`000` sont des blips réseau du poste, pas de l'API : la source autoritaire GCP
sur cette fenêtre post-drill était à 100 % True. Ce point ne concerne PAS le
chiffre normatif (30/30 sur la fenêtre du drill, régénéré ci-dessus) — il est
gardé seulement pour l'honnêteté du log local, désormais lui aussi perdu.

## Addendum 2026-07-22 — sort des logs bruts de sonde (réserve expert n°5)

Les 3 logs 1 Hz (`probe-write.log`, `probe-read.log`, `probe-health.log`)
n'ont JAMAIS atteint l'arbre git : le `.gitignore` racine (`*.log`) les a
silencieusement exclus du `git add`, et les copies locales ont été perdues à
la purge du poste de travail. Ils sont **PERDUS** — dit ici plutôt que
maquillé. Ce qui reste et fait foi :

- les fenêtres et compteurs de ce README, calculés au moment de l'analyse
  (extraits bruts des logs cités dans la timeline) ;
- la corroboration AUTORITAIRE côté GCP (`gcloud-sql-operations.txt`, ajouté
  ce jour — irrécusable et re-tirable à tout moment) :
  `FAILOVER 2026-07-21T07:55:41.633 → 07:56:13.306` et
  `FAILOVER 2026-07-21T07:58:25.160 → 07:58:49.794` — mes fenêtres d'écriture
  mesurées (07:55:42→07:56:06 ; 07:58:26→07:58:42) tombent STRICTEMENT dans
  ces bornes ;
- les scripts de sonde complets (repro) dans ce README.

Cause racine corrigée : exception `!docs/deploy-evidence/**/*.log` ajoutée au
`.gitignore`. Le prochain drill (calendrier annuel) commitera ses logs bruts.
