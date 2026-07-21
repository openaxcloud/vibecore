# GCP-07 — Suppression réversible : prouvée bout en bout, avec preuve EXTERNE (2026-07-17)

Le mail Google « Project Permanent Deletion Warning » reçu par Avi le 17/07 au
sujet de `ecode-proof-b906ss` n'est pas un incident : c'est la **confirmation
externe, horodatée par Google**, du teardown volontaire exécuté par le harness
de preuve P4 (voir `README.md` §P4). Tout est mesuré, rien n'est deviné.

## Qui / quand / pourquoi — audit logs Google (pas les nôtres)

`gcloud logging read --folder=780512954993 --freshness=10d`
(`audit-logs-folder-scope.json`, ré-exporté le 21/07 — les logs Admin Activity
sont conservés 400 j par Google) :

| Événement | Horodatage (Google) | Principal |
|---|---|---|
| `CreateProject` (`projects/ecode-proof-b906ss`) | **2026-07-17T11:07:15/17Z** | `groupequaliwatt@gmail.com` |
| `DeleteProject` (`projects/ecode-proof-b906ss`) | **2026-07-17T11:32:05.096Z** | `groupequaliwatt@gmail.com` |
| `UndeleteProject` (`projects/ecode-proof-b906ss`) | **2026-07-17T12:13:17.066Z** | `groupequaliwatt@gmail.com` |
| `CreateProject` (tentatives ID-reuse sous le folder, refusées 409) | 12:11:29Z · 12:19:39Z | `groupequaliwatt@gmail.com` |

Corrélation triple, à la seconde près :
- Mail Google : « shut down on **July 17, 2026 11:32:05 AM UTC** » = l'audit
  log `DeleteProject` **11:32:05.096Z**.
- Mail Google : récupérable jusqu'au **August 16, 2026 11:32:05 AM UTC** =
  notre `recoveryWindowEndsAt` calculé indépendamment (+30 j) :
  **2026-08-16T11:32:06.332Z** — la fenêtre de 30 jours est confirmée par
  Google au jour ET à l'heure près.
- Notre journal du 17/07 (`proof-run.transcript-excerpts.md`) :
  `p4.orphans_detected` 11:30:17Z → `p4.executed` 11:32:23Z.

**Intentionnel : OUI** — étape `executeTeardown` de la preuve P4, exécutée par
le vrai service `cloud-project-factory.ts` sous les credentials gcloud d'Avi.
Provenance complète en DB : tenant, binding, inventaire, erasureProof
(`db-rows.jsonl`).

*(Artefact mail : faits transcrits depuis le mail reçu par Avi ; déposer le
`.eml` brut dans ce dossier pour l'original — on ne l'écrit pas nous-mêmes,
c'est justement sa valeur.)*

## État du parc au moment du contrôle (17/07 12:0x, re-vérifié 21/07)

- Un SEUL projet est passé par DELETE_REQUESTED : `ecode-proof-b906ss` (depuis
  restauré → ACTIVE, `project-describe-current.json`). Aucun `ecode-proof-*`
  orphelin.
- **PROD `vibecore-495216` : `lifecycleState=ACTIVE`** — vérifié par describe
  le 17/07 ET le 21/07, jamais touchée (le client factory n'opère que sur les
  projets de ses bindings ; la prod n'a aucun binding).

## Points du contrat jamais prouvés jusqu'ici — mesurés le 17/07

1. **Fenêtre ~30 jours** : confirmée par le mail Google + audit log (au jour
   et à l'heure près).
2. **IDs non réutilisables / réserve de nom** : `projects.create` avec le
   MÊME `projectId` pendant la fenêtre (17/07 12:11Z, état DELETE_REQUESTED)
   → **`409 ALREADY_EXISTS`** ; visible dans les logs Google (tentatives
   12:11/12:19) ; `id-reuse-409.json` = re-capture du même appel (409 aussi
   post-restauration — le slot est occupé dans les deux états).
3. **Quota consommé pendant la fenêtre** : le slot ID/nom reste occupé (409)
   et le projet reste listé sous le filtre DELETE_REQUESTED. La marge
   numérique de quota projets n'est pas exposée par l'API — le 409 est la
   mesure concrète disponible.
4. **`RECOVERY_WINDOW → RESTORING → ACTIVE` prouvé LIVE** : harness committé
   `src/tests/cloud-governance-restore-proof.ts`, via le vrai service
   (`restoreFromRecoveryWindow` → `projects.undelete`). Google logge
   `UndeleteProject` à 12:13:17Z ; restauration observée en **~52 s**
   (12:12:59 → 12:13:51) ; transitions journalisées en DB
   (`DELETE_REQUESTED→RECOVERY_WINDOW→RESTORING→ACTIVE`, `db-rows.jsonl`).
   Décision : **restauré et laissé ACTIVE** (consigne « ne supprime rien ») ;
   projet vide (buckets effacés au teardown — l'erasureProof P4 reste
   valable), coût nul.

## Limite découverte (versée à CT-11)

**Les audit logs d'un projet soft-deleted deviennent illisibles au scope
projet** : `gcloud logging read --project=ecode-proof-b906ss` → `NOT_FOUND /
QUERY_INVALID_RESOURCE_NAME` pendant la fenêtre. Sans les logs folder-scope
(qui ont tout sauvé ici) ou un sink org/folder, « qui a supprimé ce projet ? »
devient sans réponse après la suppression. **Un sink d'audit org-level est une
précondition beta**, pas un nice-to-have.

## Réponse à « ce que ça révèle peut-être »

Ce projet avait inventaire + owner + labels **uniquement parce qu'il est passé
par la factory**. Les 2 « My First Project » hors-factory de l'org n'ont ni
owner ni inventaire ni labels. Règle manquante : **interdire les projets
hors-factory dans l'org** (Org Policy + détection d'orphelins périodique
org-level) — enregistré dans CT-11.
