---
id: BUG-HELM-REGLAGES-SECURITE-HORS-DEPOT
section: "2026-10-11 — Dette d'infrastructure : la production sait des choses que le dépôt ignore"
---

## Bug

**Quatre réglages de sécurité de la production n'existent QUE dans la release Helm vivante, pas dans
`values-prod.yaml`. Un `-f values-prod.yaml` — geste parfaitement raisonnable — éteindrait la double
authentification de l'administration et l'authentification de la passerelle IA, sans que rien ne rougisse.**

Mesuré le 2026-10-11 à 05:10 UTC, en lecture seule, en comparant `helm get values vibecore` au fichier du
dépôt (`origin/main:infra/helm/platform/values-prod.yaml`), puis en confrontant chaque écart au **défaut du
chart** — parce qu'« absent du dépôt » ne veut pas dire « perdu » :

| clé | tourne en prod | défaut du chart si on l'efface | lue par |
|---|---|---|---|
| `platformEnv.adminMfaRequired` | `true` | **absente** | 1 gabarit |
| `platformEnv.aiGatewayRequireAuth` | `true` | **chaîne vide** | 2 gabarits |
| `database.sharedCluster.enabled` | `true` | **`false`** | 1 gabarit |
| `global.marketingWwwRedirect` | `true` | **`false`** | 1 gabarit |

Les deux premières sont des **verrous de sécurité**. Les deux autres cassent la base partagée et la
redirection `www`.

**Pourquoi personne ne le voit.** Le déploiement appelle `helm upgrade … --reuse-values`, qui conserve les
valeurs STOCKÉES dans la release et n'ouvre jamais `values-prod.yaml`. Ces quatre valeurs ont donc été posées
une fois, hors du dépôt, et vivent depuis dans la release — invisibles à toute lecture du code. Le dépôt
affirme implicitement le contraire de ce qui tourne.

**Ce que ça coûte.** Le jour où quelqu'un corrige l'inverse de ce défaut — « `values-prod.yaml` n'atteint
jamais la prod, ajoutons un `-f` » — il désarme la MFA de l'administration. Le geste est juste dans son
intention, le dépôt lui donne raison, et aucun test ne l'arrête. C'est la forme la plus dangereuse de dette :
celle qui punit la bonne intention.

**Le contexte où elle a été trouvée.** En vérifiant que la grâce longue de #647 avait bien atteint la
production — elle ne l'avait pas, c'est #696 — j'ai dû mesurer ce que `--reuse-values` protégeait avant de
proposer de le contourner. La question « que perd-on si on applique le fichier du dépôt ? » n'avait jamais été
posée. La réponse, c'est cette fiche.

**Pour mémoire, les 21 autres écarts sont inoffensifs** et ne font pas partie de cette dette : 17 que le
déploiement repose lui-même dans la même commande (`services.<8 svc>.imageDigest`/`imageTag`,
`platformEnv.runtime.deploymentAccessActivationEnabled`), 3 identiques au défaut du chart
(`storage.pv.nfs.path` / `.readOnly` / `.server`), et 1 clé morte (`workspaceManager.imageTag` au niveau
racine : aucun gabarit ne la lit). Témoin de la comparaison : **197 clés présentes et identiques des deux
côtés** — si ce nombre avait été zéro, la mesure n'aurait rien mesuré.

**S'ajoutent 9 divergences de valeurs**, hors périmètre de cette fiche mais à ne pas perdre : la mémoire du
`screenshotter` tourne à `2Gi`/`1Gi` quand le dépôt dit `1Gi`/`512Mi` (doublée à la main, sur un service qui
fait tourner Chromium), celle de `web` à `768Mi`/`256Mi` contre `1Gi`/`384Mi`, et trois registres runtime
non vides (`nixProjects`, `serverDeployRevisionProjects`, `nixGenerations`) que le dépôt remettrait à zéro.

## 📤 Dispatché

☑ 11/10 fiche écrite — **réparation NON entreprise, Avi arbitre l'ordre**

## 💻 Codé

☐

## ✅ Testé live

☐

## Preuve

**Rien n'est fermé ici.** Cette fiche est une dette ouverte : la mesure est faite, la réparation ne l'est pas.
Conformément à la règle 16, elle ne passera ✅ qu'avec la référence du test qui l'épingle — et ce test n'existe
pas encore.

**La mesure, refaisable**

```bash
CTX=connectgateway_vibecore-495216_europe-west9_vibecore-prod-app
helm --kube-context $CTX -n vibecore get values vibecore -o json   # ce qui tourne
git show origin/main:infra/helm/platform/values-prod.yaml           # ce que le dépôt croit
git show origin/main:infra/helm/platform/values.yaml                # où l'on retomberait
```

Environnement de la mesure (règle 11) : release Helm `vibecore` révision **1258**, namespace `vibecore`,
cluster `vibecore-prod-app` (europe-west9, projet `vibecore-495216`), `main` à `3eb0b4a1e0`, arbre propre.
Aucune écriture, aucune valeur de secret affichée (règle 12 : les chaînes sont réduites à leur longueur).

## Réparation proposée

**Deux moitiés, et la seconde est celle qui tient.**

1. **Porter les quatre valeurs dans `values-prod.yaml`**, pour que le dépôt cesse d'affirmer le contraire de
   ce qui tourne. ⚠️ Cela ne suffit pas et ne change rien tout seul : `--reuse-values` ignorera le fichier
   comme il ignorait la grâce. Le but est de rendre le dépôt honnête, pas d'appliquer quoi que ce soit.
2. **Un contrôle qui refuse un déploiement où l'une des quatre serait fausse.** Il doit interroger la
   **release vivante**, pas le fichier — c'est précisément la leçon de #696, où une garde de 7 cas tous justes
   n'a pas vu le défaut parce qu'elle lisait le fichier. Emplacement naturel : la porte de préflight du
   déploiement, qui tourne déjà avant toute modification de la production, en `fail-closed`.

**Contre-épreuve à exiger de cette réparation** (règle 6, dans les deux sens) : forcer l'une des quatre à
`false` dans la release doit faire échouer le contrôle ; et retirer le contrôle doit laisser passer un
déploiement dont une valeur est fausse. Sans les deux, les moitiés ne sont pas couplées.

**Pourquoi ne pas simplement ajouter `-f values-prod.yaml`** — la voie qui paraît évidente, et qu'il faut
écarter explicitement pour que personne n'y revienne : elle désarmerait les quatre valeurs ci-dessus,
diviserait par deux la mémoire du `screenshotter` et viderait trois registres runtime. `--reset-then-reuse-values`
est pire encore : tout retombe aux défauts du chart, sans même le fichier pour rattraper.

## Reprise du 11 octobre 2026

Correction préparée dans `fix/reprise-livraison-securite-20261011`. Tests de comportement et rendu Helm exécutés. Fusion et preuve de production encore attendues : aucun état ✅ ajouté.

La lecture de `main` à `c7a6fa502` montre en plus un littéral `ADMIN_MFA_REQUIRED: "false"`. Le correctif rend la clé depuis les valeurs, exige la MFA par défaut et vérifie le ConfigMap vivant après upgrade. Les quatre valeurs stockées sont contrôlées avant upgrade. Le déploiement conserve `--reuse-values` ; aucun `-f values-prod.yaml` ajouté.
