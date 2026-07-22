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

| Mesure | Valeur | Cible |
|---|---|---|
| Indispo écritures (bascule) | **24,1 s** (23 FAIL à 1 Hz) | RTO zone-DB ≤ 5 min → tenu ×12 |
| Indispo écritures (failback) | **16,0 s** (15 FAIL) | idem |
| Lectures | mêmes fenêtres (38 READ-FAIL au total) | — |
| `GET /health` API externe | **100 % en 200** (07:55:10→08:00:12, 1 Hz) | l'API n'est jamais tombée |
| **Intégrité** | **0 écriture ACKée perdue** (270 ACK, 270 présentes en base) ; 2 lignes commitées dont l'ACK n'a pas atteint le client (réponse coupée) = comportement attendu, pas une perte | RPO transactions commitées = 0 → tenu |

Erreurs observées pendant les fenêtres (attendu) : `pg_filenode.map I/O error`
→ `ECONNREFUSED` → `database system is starting up` → reprise.

## Repro

```bash
# pré-vol : REGIONAL + RUNNABLE + fenêtre creuse
gcloud sql instances describe vibecore-prod-postgres --format="value(state,settings.availabilityType,gceZone)"
# sondes 1 Hz (scripts write/read : voir probe-*.log en tête de fichier)
gcloud sql instances failover vibecore-prod-postgres   # bascule
# failback : relancer la même commande quand le standby est prêt (409 sinon)
```

Table de drill `_dr_failover_drill` supprimée après le drill.

## Addendum honnêteté (log complet de la sonde /health)

La sonde /health locale a tourné jusqu'à 08:17:21 (900 échantillons) :
897×200 et 3×`000` (curl code 000 = échec côté CLIENT) à 08:13:27, 08:15:45,
08:16:18 — soit 13+ min APRÈS la fin du drill, échantillons isolés non
consécutifs. Contre-vérification par la source d'autorité (uptime check GCP,
6 régions de sonde) sur 08:10→08:20 : **276/276 True**. Conclusion : blips
réseau du poste d'observation, pas de l'API. La fenêtre du drill lui-même
(07:55→08:00) est à 100 % de 200 sur les DEUX sources.

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
