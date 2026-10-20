---
id: BUG-DB-RESTORE-LATE-PROVISIONING-001
section: "Reprise commerciale du 2026-10-20 — restauration DB"
---

## Bug

**P1 avant activation du nouvel exécuteur — un retour tardif du provisionneur
peut réécrire l'ancienne connexion ; une préparation incertaine peut perdre son
identifiant durable.**

Les deux GET `/projects/:projectId/databases` et `/database` attendent une URI
après lecture d'une instance en provisionnement. Une autre requête peut activer
l'instance, puis une restauration peut terminer. L'ancien GET reprend alors et
réécrit la connexion source. Le POST `/database/provision` périmé peut de même
remettre l'instance en `PROVISIONING` après une bascule.

Dans le premier candidat du coordinateur, un échec en `PREPARING` libérait le
verrou. Pourtant une cible pouvait déjà exister après un timeout : la suppression
du projet aurait pu effacer son seul identifiant enregistré. Aucun incident
client ou perte physique en production n'est établi.

## 📤 Dispatché

☑ 20/10 — revue indépendante et contre-épreuve locale des trois continuations.

## 💻 Codé

☐ Candidat local non committé, non fusionné et non déployé à ce relevé.
Réconciliation transactionnelle conditionnée par l'état, l'horodatage et la
version observés ; activation et secret atomiques. Une écriture explicite du
secret pendant l'attente est préservée. Un POST tardif rend 409.
`PREPARING` incertain conserve le verrou et la cible en `RECOVERY_REQUIRED`.

## ✅ Testé live

☐ Aucun essai de production. La capacité de restauration reste indisponible
dans le factory normal. Aucun pilote CNPG/GCS/runtime ni exclusion distribuée
d'une ancienne tentative n'est livré par cette correction.

## Preuves et limites

Les trois anciennes écritures réintroduites temporairement dans le vrai
`app.ts` font échouer les trois contre-tests : deux connexions remplacées et
un POST 202 attendu 409. Après restauration exacte du correctif : 56/56 tests
verts, dont les barrières HTTP loopback. La persistance de ces tests de routes
est un `TestApiStore` explicite ; ce n'est pas une restauration physique.

Les tests du repository couvrent séparément les transactions PostgreSQL sur
une base de contrôle locale dédiée, dont la conservation de la cible après
`PREPARING`. Les trois nouveaux cas restent à exécuter dans le prochain banc
au moment de cette rédaction ; les 11 cas antérieurs avaient passé.

[Contrats, périmètre et état des preuves](../reprise/2026-10-20-restauration-executeur-local.md).
