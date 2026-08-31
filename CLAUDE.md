# Instructions projet

## Règles de méthode — à lire avant de corriger quoi que ce soit

Ces huit règles viennent d'erreurs réelles commises le 2026-08-31, chacune
chiffrée dans `docs/audit/FAUX_NEGATIFS_DE_MESURE.md`. Elles ont coûté un revert
inutile, un correctif branché au mauvais endroit et plusieurs heures de fausse
piste.

1. **Mesurer le chemin réel avant de corriger. Jamais le déduire d'une lecture de
   code.** J'ai branché la persistance sur `PUT /files/write` parce que
   `files.ts:881` l'appelle — sans vérifier que `Ctrl+S` y aboutit. Il n'y
   aboutit pas dans le cas normal. Tracer la requête, du navigateur jusqu'à la
   fonction serveur, avant d'écrire une ligne.

2. **Relancer le même commit avant d'accuser un changement.** Trois tests E2E ont
   échoué sur mon commit et pas sur les précédents ; j'ai reverté. La relance du
   MÊME commit, sans rien changer, est passée au vert. Le coût d'une relance est
   dérisoire devant celui d'un revert.

3. **Distinguer « rien trouvé » de « rien exécuté ».** `grep | wc -l` rend `0`
   quand le fichier n'existe pas, quand le motif est faux, et quand il n'y a
   vraiment rien. Toute commande de comptage doit afficher combien d'éléments
   elle a examinés, et refuser de conclure si ce nombre est nul ou inattendu.

4. **Vérifier qu'une mesure a porté sur quelque chose.** Une sonde doit échouer
   bruyamment quand elle n'a pas pu mesurer, jamais rendre « 0 défaut ». Un champ
   d'erreur qu'il faut penser à lire n'est pas une protection. Avant de lire un
   résultat : la page a-t-elle chargé ? la frappe est-elle arrivée ? le corps
   est-il tronqué ? le thème mesuré est-il celui qu'on croit ?

5. **Ancrer les tests sur du code, jamais sur des commentaires.** Six tests écrits
   dans la journée ont été cassés par leur propre prose, qui citait le motif
   interdit. Retirer les commentaires avant de scanner, et viser la déclaration.

6. **Contre-épreuve dans les deux sens.** Un test qui ne tombe pas quand on
   annule le correctif ne garde rien. Annuler chaque moitié séparément et
   vérifier que le bon cas tombe.

7. **Cibler la règle, pas la première occurrence d'un motif.** Un `sed` sur la
   première des neuf occurrences ne prouve rien. Délimiter par accolades, compter
   les occurrences avant de remplacer, et asserter que le compte vaut 1.

8. **Vérifier qu'une PR existante ne porte pas déjà le correctif.** Six PR finies
   dormaient parmi les ouvertes. Et avant de rejouer une vieille branche :
   remesurer, car le défaut peut avoir été corrigé autrement entre-temps — 51 des
   63 fichiers d'une PR de deux semaines l'étaient déjà.

**Corollaire sur les garde-fous.** Un garde-fou qui protège la mauvaise chose est
pire que pas de garde-fou, parce qu'il rassure. Vérifier qu'un test porte sur la
famille RÉELLEMENT utilisée à l'écran, et préférer une énumération dérivée du
produit à une liste écrite à la main.

## Règles


## Suivi (règle permanente)
Fichiers de suivi : `DESIGN_PROGRAM_MASTER.md` (points design — source de vérité unique ; specs détaillées dans `DESIGN_BATCH_*_SPEC.md`, état par point dans `DESIGN_AUDIT_LIVE.md`), `BUG_INVENTORY_LIVE.md` (bugs), `PLAN_REMAINING_UNIFIED.md` (plan), `REPLIT_PARITY.md` (parité Replit, fonctionnelle ET pixel).

**Design** — Dès qu'Avi donne des points « Claude design » (batchs A/B/C/D/E/F/G ou nouveaux), les ajouter IMMÉDIATEMENT dans `DESIGN_PROGRAM_MASTER.md`. La vérification d'un point design doit se faire EN RÉEL sur TOUTES les pages marketing ET user area, dans TOUS les formats web / tablette / mobile, en confirmant que la page s'adapte automatiquement au screen (responsive niveau Fortune-500). Un point design ne passe ✅ que si le responsive est validé sur les 3 formats.

**Bugs** — Dès qu'Avi envoie un bug, l'enregistrer IMMÉDIATEMENT dans `BUG_INVENTORY_LIVE.md`.

**Plan** — un point n'est ✅ que s'il est 100% surfacé ET marche en réel à 100%.

**Parité Replit** — suivi dans `REPLIT_PARITY.md` (parité fonctionnelle ET pixel). Un point n'y passe ✅ qu'après test réel live (à l'écran + greps) sur web / tablette / mobile — jamais sur « dispatché » ni « codé ».

**États** — chaque point des 4 fichiers de suivi (`DESIGN_PROGRAM_MASTER`, `BUG_INVENTORY_LIVE`, `PLAN_REMAINING_UNIFIED`, `REPLIT_PARITY`) trace **3 états séparés**, affichés côte à côte par point pour voir précisément où il en est :
- 📤 **Dispatché** — envoyé à une session
- 💻 **Codé** — commité + poussé sur `main`
- ✅ **Testé live** — vérifié à l'écran + greps, responsive web / tablette / mobile

Un point n'est « fait » QUE quand ✅ Testé live est coché ; 📤 Dispatché et 💻 Codé ne suffisent jamais.

**Règle commune** — Ne passer un point en ✅ QU'APRÈS test réel (vérif live à l'écran + greps de contrôle) — jamais sur « dispatché » ni « codé ». Quand Avi dit « fais-moi le point », TOUJOURS lire d'abord les 4 fichiers de suivi et dire précisément où ça en est.

## Déploiement prod (mécanisme réel)

**Runbook complet + commandes exactes : [`docs/DEPLOY_RUNBOOK.md`](docs/DEPLOY_RUNBOOK.md).** Vérité terrain reconstituée le 2026-07-07.

- **Auto** : chaque push sur `main` déclenche GitHub Actions **`.github/workflows/deploy-main.yml`** (repo `openaxcloud/vibecore` — ⚠️ `gh` pointe par défaut sur l'upstream `stackblitz-labs/bolt.diy`, toujours passer `-R openaxcloud/vibecore`). Il **build** via `gcloud builds submit --config=cloudbuild.yaml --region=europe-west9` (7 images taggées `git rev-parse --short=10` du SHA) puis **déploie** via `helm upgrade vibecore infra/helm/platform -n vibecore --reuse-values --atomic --timeout 10m --set services.<tier>.imageTag=<SHA>`.
- **Pas de GitOps** (ni Argo CD ni Flux). Release Helm **`vibecore`** / ns `vibecore` sur GKE `vibecore-prod-app` (europe-west9, projet `vibecore-495216`). Contexte kube : `connectgateway_vibecore-495216_europe-west9_vibecore-prod-app`. Ingress = ingress-nginx (LB `34.1.6.93`, DNS direct, pas de CDN).
- **Manuel** (ce que font les sessions) : `gh workflow run deploy-main.yml -R openaxcloud/vibecore -f short_sha=<sha>` OU build+helm à la main (voir runbook). ⚠️ `--reuse-values` fige `values-prod.yaml` (re-`--set` requis) mais applique bien les changements de **template**.
- **Rollback** : `helm -n vibecore rollback vibecore <REV>` (l'upgrade est `--atomic` → rollback auto si le rollout échoue).
- **Zéro-downtime** actif depuis `5c2c3586` (strategy maxUnavailable:0 + preStop, tous les Deployments).
