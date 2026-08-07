# Durcissement entitlement Starter — réponse au contre-audit expert

Base : **main @ `4e1f4c362270793f9a899cae1ea5c41917fb6a95`** · Branche : `fix/starter-entitlement-hardening` (fix-forward)

Le modèle « 1 projet publié actif » est conservé (jugé conceptuellement juste).
Les **4 réserves bloquantes** sont corrigées ci-dessous.

## Réserve 1 + 5 — transaction sérialisée et rejeu concurrent

Lecture des publications, décision d'entitlement et création du déploiement
sont désormais dans **une seule section critique**, sérialisée par organisation
via l'advisory lock PostgreSQL existant (`pg_advisory_xact_lock`, clé
`publish:org:<orgId>`). Séparées, deux publishes simultanés lisaient tous les
deux « 0 actif » et passaient tous les deux.

**Rejeu concurrent réel** (deux curl en parallèle, vraie API + vrai PostgreSQL) :

| Projet | Résultat |
|---|---|
| A | **402** |
| B | **201** |
| Publications créées en base | **1** |

**Contrôle négatif** — en désactivant la sérialisation, le test concurrent
échoue avec exactement le bug décrit :
`expected [ 201, 201 ] to deeply equal [ 201, 402 ]`. Le test a donc des dents.

## Réserve 2 — fail-closed

Le `.catch(() => [])` est supprimé. Toute erreur de lecture du quota ou de
l'état de facturation renvoie **503 `ENTITLEMENT_CHECK_UNAVAILABLE`**
(`retryable: true`) et ne crée **aucune** publication. Une panne ne remet
jamais le quota à zéro. Prouvé par test : après la panne injectée, la base
contient toujours exactement 1 publication.

## Réserve 3 — extinction RÉELLE dans le chemin de service

L'expiration ne vivait que dans le compteur : l'URL continuait de répondre.
Elle est maintenant appliquée à la lecture, avec **410 Gone** (pas 404 : la
ressource a existé).

| Étape | Résultat |
|---|---|
| Avant expiration | **200**, corps `<h1>App A en ligne</h1>` |
| Publication vieillie de 31 j | age vérifié en base : `31 days` |
| Après expiration | **410** `PUBLISHED_DEPLOYMENT_EXPIRED`, **0 octet** de l'app servi |
| **Puis seulement** : publier l'autre projet | **201** |

L'ordre exigé est respecté : l'URL est prouvée indisponible **avant** que le
second projet ne devienne publiable.

## Réserve 4 — métrique de concurrence distincte

`maxActivePublishedProjects` (plans payants) = **+Infinity** — publications
illimitées, comme annoncé.
`maxConcurrentRunningWorkloads()` = **20** — workloads en **exécution**,
métrique séparée.

Confondre les deux transformait « illimité » en plafond **persistant** de 20
projets publiés à vie. Un plan payant publie désormais un 26e projet distinct
sans être bloqué (testé).

## Tests

| Suite | Résultat |
|---|---|
| Contrat Starter (unitaire) | **24/24** |
| Publish : (a)(b)(c)(d) + concurrent + fail-closed | **13/13** |
| Extinction (unitaire) | **6/6** |

## Reste ouvert

- Le TTL n'est appliqué qu'au chemin **statique** (`/static-deployments/*`).
  Les déploiements **server** (`d-<id>`, servis par preview-proxy) ne sont pas
  couverts par ce lot : leur extinction demande le même gate côté proxy. Dit tel
  quel plutôt que sous-entendu.
- Les montants de crédits restent `PENDING_LIVE_CAPTURE`.
