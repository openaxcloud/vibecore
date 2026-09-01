# Instructions projet

## Règles

### Méthode — douze règles tirées d'erreurs réelles

Chacune vient d'une faute commise sur ce projet. Elles ne sont pas des principes
généraux : ce sont des pièges qui ont déjà coûté.

1. **Mesurer le chemin réel avant d'écrire une ligne de correctif.** Un correctif
   posé sur une route déduite de la lecture du code, sans avoir tracé le trajet
   de bout en bout, corrige un chemin que personne n'emprunte.
2. **Relancer le même commit avant d'accuser un changement.** Un test rouge sur
   votre commit et vert sur les précédents ne prouve rien. Une relance coûte
   quelques minutes ; un revert inutile coûte une journée.
3. **Distinguer « rien trouvé » de « rien exécuté ».** 50 runs `cancelled` ne
   disent rien sur le code. Un `grep` à zéro résultat peut être un motif mal
   échappé.
4. **Vérifier qu'une mesure a bien mesuré quelque chose.** Un corps tronqué à
   exactement 4000 octets, un cache d'outil, une fenêtre de lecture trop courte :
   tous rendent un « absent » qui n'en est pas un.
5. **Ancrer les tests sur du code, jamais sur de la prose.** Un test qui lit
   l'inventaire passe au vert quand on réécrit l'inventaire.
6. **Contre-épreuve dans les deux sens.** Retirer le correctif doit faire rougir.
   Retirer ce que le correctif protège doit faire rougir aussi. Sinon les deux
   moitiés ne sont pas couplées.
7. **Viser la règle, pas la première occurrence.** Trois symptômes du même
   mécanisme se corrigent une fois.
8. **Chercher s'il existe déjà une PR** avant d'en ouvrir une.
9. **Vérifier ce qu'un état de base déclenche avant de l'écrire.** Réconcilier
   196 lignes vers `STOPPED` arme une suppression de disques 24 h plus tard.
10. **Vérifier l'existence de ce qu'on croit protéger.** Un avertissement sur des
    disques qui n'existent pas est du bruit ; un correctif qui route vers un
    panneau vide ne corrige rien.
11. **Une mesure sans son environnement consigné n'est pas une mesure.** Noter le
    commit exact, l'état de l'arbre (propre ou non) et la commande complète.
    Sinon on ne peut ni la refaire ni la réfuter — et une conclusion bâtie
    dessus est à refaire.
12. **Ne jamais imprimer une VALEUR de secret, même filtrée.** La rédaction par
    sous-chaîne ne tient pas : sur les 49 clés du Secret de production, 25 sont
    sensibles et un filtre sur « SECRET » n'en masque que 14. Vérifier la
    PRÉSENCE et la LONGUEUR, ou comparer une empreinte `shasum`. Cela suffit à
    diagnostiquer une variable manquante ou tronquée.


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
