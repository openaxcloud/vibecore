---
id: BUG-E2E-PASTILLE-001
---

## Bug

**Course de précondition du test pastille reproduite avec chargement des messages retardé.** Le 12/10, sur la vraie application locale, une réponse des messages retardée de huit secondes laisse `attendreLeFilStable` accepter cinq lectures `aucune`, puis la remontée n'a pas de cible. Le fil arrive ensuite en bas et la pastille reste absente. Attendre les 12 messages préparés avant la stabilité corrige cette course dans le scénario contrôlé. Aucun changement produit, workflow ou dérogation.

## 📤 Dispatché

☑ 12/10 — reprise et correctif ciblé sur la PR #728.

## 💻 Codé

☐ — PR #728 publiée et relue ; correctif non fusionné sur main.

## ✅ Testé live

☐ — passage CI ponctuel vert ; stabilité durable et validation production non prouvées.

## Preuves du 12 octobre 2026

Contre-épreuves locales au commit `1863b2a7283786b51169c2addd92cfec137fdca9`, basé sur `d95ec431c34a4bae32737dc931549a95a32e9454` : code original sans retard 6/6 verts ; original avec retard de huit secondes 1/1 échec ; corrigé avec le même retard 3/3 verts ; corrigé sans retard après interruption 3/3 verts. Le chargement interrompu échoue explicitement sur la précondition, avec 0 message au lieu de 12. Les assertions de peinture sont conservées. [Mesures, captures et limites du harnais local](../reprise/2026-10-12-pastille-nouvelle-session.md), notamment Chromium système différent et runtime bloqué.

Le [run CI 38277708006](https://github.com/openaxcloud/vibecore/actions/runs/38277708006), sur cette tête de [#728](https://github.com/openaxcloud/vibecore/pull/728), est terminal vert : [tranche 1](https://github.com/openaxcloud/vibecore/actions/runs/38277708006/job/114907294965) et [agrégateur](https://github.com/openaxcloud/vibecore/actions/runs/38277708006/job/114914761935) revérifiés par API. Selon les logs vérifiés par la session parent, le test pastille passe réellement au premier passage à **16:47:02 UTC en 15,2 s, sans retry** ; agrégateur : **429 tests, 68 specs, quatre rapports, zéro échec**. Aucun nouveau téléchargement des logs Azure n'a été tenté par cette tâche.

Ce passage réel en CI complète la preuve locale, mais ne démontre ni une stabilité durable ni l'attribution de tous les anciens échecs à cette course. Aucun parcours production ou Safari/iPhone réel n'est déclaré validé. Le commit documentaire qui actualise cette fiche devra lui aussi être validé en CI à son SHA final avant fusion ; les résultats ci-dessus portent sur `1863b2a7283786b51169c2addd92cfec137fdca9`.

## Historique du 08 septembre 2026

Les constats, mesures et conclusions ci-dessous sont conservés comme témoignage daté. Ils ne définissent plus les statuts courants ci-dessus ; en particulier, « NON-DÉFAUT DE CODE, établi » et « contrôle décisif obtenu » ne prouvent ni l'absence de défaut produit actuel ni la stabilité durable du test.

### Bug — état historique du 08/09

**La barrière de livraison refuse des commits sur un test qui passe 6 fois sur 6 en local : `ide-mobile-chrome.spec.ts:2759` « elle se peint sur le fil, et sur rien d'autre » échoue en CI sur sa PRÉCONDITION** (« la pastille doit apparaître quand on remonte le fil », 20 s d'attente, 3 tentatives sur 3), alors que le test frère `ide-mobile-chrome.spec.ts:1135`, qui exerce la MÊME pastille, passe dans le même run. Le test ne touche pas `/api/chat` : il pose son fil par l'API (`preparerUnProjet` → `PUT …/transcript`), donc aucun chemin serveur de la référence web n'y participe. Historique du même test depuis son ajout (`60b227f`, 08/09 18:49) : `60b227f` vert, `db44917` vert, `67acc7b` vert, `c3e9ed6` **rouge 3/3**. Et avant lui, la même suite avait déjà refusé `a0611a5` — un commit DOCUMENTAIRE — sur un test encore différent (« Effacer l'historique »), ce qu'aucun changement de code ne peut expliquer.

### 📤 Dispatché — état historique du 08/09

☑ 08/09

### 💻 Codé — état historique du 08/09

☐ — **NON-DÉFAUT DE CODE, établi** : rien à corriger dans le produit ; le test est instable en CI

### ✅ Testé live — état historique du 08/09

✅ 08/09 — **contrôle décisif obtenu**

### Preuve — état historique du 08/09

**Mesuré le 08/09 sur `c3e9ed6`, build de production local (Postgres 16 + pgvector, Redis, API, `react-router build`) : 6 exécutions, 6 verts** — 3 projets (chromium, tablet, mobile) en 1,1 min, puis 3 relances chromium à 21,0 / 20,9 / 21,1 s. **Contrôle impossible ici** : cette session n'a pas le droit de relancer un workflow (`rerun_failed_jobs` et `run_workflow` rendent tous deux `403 Resource not accessible by integration`), donc la relance du MÊME commit — le seul contrôle qui trancherait (règle 2) — n'a pas pu être prise. **CONTRÔLE DÉCISIF, obtenu autrement** : `bf3951b` (autre session) CONTIENT mes trois commits — `afa3d9c` en est un ancêtre, vérifié par `git merge-base --is-ancestor` — et son E2E est **VERTE**, barrière de livraison franchie, ce test compris. Le même code, le même test, vert. Mon changement n'est donc PAS la cause, et la relance que cette session ne pouvait pas déclencher a eu lieu de fait. **Piste restante, non vérifiée** : la précondition dépend du fil qui déborde ET d'un événement de défilement qui se pose ; sous contention CI, `attendreLeFilStable` peut rendre la main avant la fin du rendu — à durcir par la session qui possède ce test, sur la base du compteur d'intermittence déjà présent dans la barrière (règle 17).
