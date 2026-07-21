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
