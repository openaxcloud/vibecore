# Contre-audit du SHA `afaa6441` — 4 bloqueurs + 4 réserves

Ce document répond point par point au refus de `afaa6441`. Chaque correctif a un
**test qui échoue sans lui**, et la sortie brute des deux passes est jointe dans
[`preuves/contre-audit-afaa6441/`](preuves/contre-audit-afaa6441/).

Le fil commun des quatre bloqueurs : **une incertitude produisait une
autorisation**. Un garde qui, en cas de doute, laisse passer, ne garde rien.

---

## Bloqueur 1 — `/internal/preview/port-access` répondait « public » sur tous ses échecs

`services/api/src/app.ts`. Panne de base, lecture d'env impossible, JSON invalide :
les quatre chemins renvoyaient `{"private": false}`.

Le proxy avait bien été rendu fail-closed au tour précédent, mais **un
`200 {"private":false}` n'est pas une erreur pour lui** : c'est une réponse valide
qui AFFIRME que le port est public. Le fail-open n'avait donc pas été fermé, il
avait été déplacé d'un cran — une panne de base côté API se traduisait toujours par
un `200 TENANT-APP-SERVED` sans cookie.

Désormais **seule une lecture réussie prouve qu'un port est public**. Toute
incertitude renvoie `private: true` avec son motif (`workspace-lookup-failed`,
`env-lookup-failed`, `ports-state-unparseable`, `ports-state-malformed`,
`workspace-unknown`), journalisé côté API.

Test : `services/api/src/tests/preview-port-access-failclosed.spec.ts` — 8 cas, dont
les **3 cas d'autorisation légitimes** (`ports-state-read`, `no-ports-state`,
`feature-disabled`) sans lesquels un « tout refuser » passerait le test tout en
cassant la fonctionnalité.

- Sans le correctif : **7 tests rouges** — [`1-port-access-fail-closed-SANS-fix.txt`](preuves/contre-audit-afaa6441/1-port-access-fail-closed-SANS-fix.txt)
- Avec : **8/8** — [`1-port-access-fail-closed-AVEC-fix.txt`](preuves/contre-audit-afaa6441/1-port-access-fail-closed-AVEC-fix.txt)

## Bloqueur 2 — le garde-fou journalisait les secrets qu'il neutralise

`scripts/audit-env/lib.sh` imprimait `NOM=VALEUR` pour chaque variable de
redirection effacée. `HELM_KUBETOKEN` est un **jeton d'authentification au
cluster**, et ces sorties finissent dans des logs de CI et dans des artefacts de
preuve joints à une revue : le garde fabriquait la fuite qu'il prétendait éviter.

Seuls les **noms** sortent, valeur remplacée par `[REDACTED]` — y compris pour
`KUBECONFIG`, dont le chemin peut porter un nom de projet ou d'utilisateur.

[`2-redaction-secrets-logs.txt`](preuves/contre-audit-afaa6441/2-redaction-secrets-logs.txt) :
`HELM_KUBETOKEN=hostile-test-token` avant, `HELM_KUBETOKEN=[REDACTED]` après.

## Bloqueur 3 — l'état Terraform vérifié n'était pas l'état détruit

`scripts/audit-env/down.sh` prouvait la liaison projet ↔ état ↔ cluster en lisant
les outputs de l'état, **puis** lançait `terraform destroy`. Or Terraform, comme
Helm, lit sa cible dans son environnement AVANT ses arguments :

```
TF_CLI_ARGS_destroy=-state=/sentinel/prod.tfstate
  -> la vérification lit le VRAI état (audit)      : elle PASSE
  -> le destroy opère sur l'état SUBSTITUÉ         : n'importe quelle infra
```

Correctif en trois temps, comme pour Helm :

1. **neutralisation** de `TF_CLI_ARGS*`, `TF_DATA_DIR`, `TF_WORKSPACE`,
   `TF_CLI_CONFIG_FILE`, `TERRAFORM_CONFIG`, `TF_VAR_*` (balayage de
   l'environnement réel, l'espace de noms étant ouvert) et des overrides du
   provider google / de gcloud ;
2. **enveloppe `audit_terraform`** qui refuse de s'exécuter si l'une de ces
   variables est définie au moment de l'appel — un script pourrait la réexporter
   après l'épinglage ;
3. **garde statique** `check-pinned-context.mjs` étendue à `terraform`, branchée
   sur Gate 1 : plus aucun appel nu ne peut être réintroduit.

Test hermétique (faux `terraform` qui émule la résolution réelle, aucun état réel
touché) : `scripts/audit-env/test-pinned-context.sh`.

- Sans le correctif, la sentinelle apparaît **sur la ligne `destroy`** :
  [`3-etat-terraform-SANS-fix.txt`](preuves/contre-audit-afaa6441/3-etat-terraform-SANS-fix.txt)
- Avec : les 4 appels portent `ETAT-PAR-DEFAUT` —
  [`3-etat-terraform-AVEC-fix.txt`](preuves/contre-audit-afaa6441/3-etat-terraform-AVEC-fix.txt)

## Bloqueur 4 — le workflow de production restait redirigeable

`.github/workflows/deploy-main.yml` faisait `unset HELM_*` dans son étape de
credentials. **Un `unset` ne franchit pas la frontière d'une étape** : chaque
`run:` est un shell neuf, ré-alimenté par le bloc `env:` du workflow et par
l'environnement du runner. Et `--kube-context` ne couvre pas le problème :
`HELM_KUBEAPISERVER` (+ `HELM_KUBETOKEN`) contourne le kubeconfig **entièrement**,
donc le contexte nommé n'est même plus consulté.

Correctif : une **enveloppe hermétique unique**, `scripts/ci/cluster.sh`, qui à
chaque appel (1) neutralise l'environnement *dans le processus qui exécute
l'outil*, (2) nomme la cible, (3) **vérifie son identité** dans le kubeconfig —
sans quoi un kubeconfig substitué pourrait définir un contexte du bon NOM pointant
ailleurs.

Elle est appliquée aux **4 workflows** qui touchent un cluster, pas seulement à
celui cité : `deploy-prod.yml` portait le même défaut sur un
`helm upgrade --install vibecore` de **production**, `deploy-staging.yml` et
`ar-protect-images.yml` sur leurs propres appels. La cible `staging` refuse
symétriquement de viser la prod.

Garde statique associée : `scripts/ci/check-workflow-pinned-context.mjs` (Gate 1).

Test hermétique `scripts/ci/test-cluster-wrapper.sh`, avec un **cas témoin** qui
reproduit l'ancien appel et DOIT montrer la redirection — sans lui, rien ne
prouverait que le test mesure quelque chose :

| cas | résultat |
| --- | --- |
| A. témoin : `--kube-context` sans enveloppe | cible reçue = `APISERVER:https://apiserver-hostile…` |
| B. avec l'enveloppe, même environnement | cible reçue = contexte de prod épinglé, aucun secret journalisé |
| C. kubeconfig substitué (bon nom, autre apiserver) | REFUS avant tout appel |
| D. chemin staging visant la prod | REFUS |
| E. appel légitime | passe (ce n'est pas un « tout refuser ») |

[`4-enveloppe-ci-helm.txt`](preuves/contre-audit-afaa6441/4-enveloppe-ci-helm.txt)

---

## Réserves

### `down.sh` — erreur d'API ≠ ressource absente

La phase de vérification écrivait `|| echo 'GONE'` et `2>/dev/null || true`. Un
jeton expiré, un quota, une coupure réseau produisaient donc « projet GONE,
0 cluster, 0 instance SQL, 0 VM, 0 bucket » — c'est-à-dire le rapport
**`TEARDOWN VERIFIE` et un exit 0**, alors que l'infrastructure pouvait tourner et
facturer intégralement.

Trois issues distinctes maintenant : lecture réussie (le compte compte), absence
**confirmée par le message de l'API** alors que la suppression du projet est par
ailleurs établie (attendu → 0), et tout le reste → `INDETERMINE`, qui fait échouer.

Test `scripts/audit-env/test-teardown-verification.sh`, deux scénarios (le second
est indispensable : sans lui, « tout refuser » passerait) :

- Sans le correctif : `TEARDOWN VERIFIE` + exit 0 sur un projet `ACTIVE` dont tous
  les listages ont renvoyé 403 — [`reserve-teardown-SANS-fix.txt`](preuves/contre-audit-afaa6441/reserve-teardown-SANS-fix.txt)
- Avec : `INDETERMINE` + exit 1 dans ce cas, et succès quand le projet est
  réellement supprimé — [`reserve-teardown-AVEC-fix.txt`](preuves/contre-audit-afaa6441/reserve-teardown-AVEC-fix.txt)

### `mint-secrets.sh` — le heredoc exécutait les backticks

Le délimiteur est **volontairement non quoté** : ce heredoc doit interpoler
`$DATABASE_URL` et les `$(rnd)`. Conséquence oubliée : **tout** y est évalué, y
compris dans les lignes de commentaire. Les backticks autour de `vc_preview`
exécutaient donc `vc_preview` (`bash: command not found`) et le nom **disparaissait
du fichier généré**. Guillemets simples à la place, commentaire qui explique le
piège, et `shellcheck` désormais **branché sur Gate 1** — il voyait ce défaut
(SC2006) et personne ne le lançait.

### Routage screenshotter — les vignettes `d-` / `s-` n'étaient pas couvertes

Le routage par chemin ne couvrait que `<ws>-<port>`, alors que l'API planifie aussi
les vignettes des publications, dont les URL sont `d-<id>.<domaine>` et
`s-<id>.<domaine>`. Ces captures partaient donc avec un `Host` que le proxy ne
route pas.

Ajouté : `/d/<id>/…` et `/s/<id>/…` côté proxy, et le mapping correspondant côté
screenshotter. **Réservé aux appelants internes** (secret partagé) : sans ce garde,
`https://<proxy>/d/a` et `/d/b` mettraient deux publications distinctes sur une
même origine, ce qui détruirait l'isolation d'origine (cookies, `localStorage`,
same-origin scripting) que les hôtes `d-`/`s-` existent précisément pour donner.
Le secret est préfixé `x-vibecore-` donc retiré par les trois boucles d'en-têtes
avant tout forward vers l'amont — vérifié par un test.

Preuve au **vrai Chromium** (`scripts/proofs/screenshotter-routing-chromium.mjs`,
deux trajets dans le même navigateur) :

- `--legacy` : `url: /`, **404** sur les deux trajets —
  [`reserve-vignettes-publications-SANS-fix.txt`](preuves/contre-audit-afaa6441/reserve-vignettes-publications-SANS-fix.txt)
- avec le correctif : `/p/ws-test/5173/` **200** et `/d/clx9k2m4p/` **200**, PNG
  réel de 10 106 octets —
  [`reserve-vignettes-publications-AVEC-fix.txt`](preuves/contre-audit-afaa6441/reserve-vignettes-publications-AVEC-fix.txt),
  [capture](preuves/contre-audit-afaa6441/reserve-vignettes-capture-chromium.png)

### Checks GitHub

Voir [`CI_WAIVER_PR125.md`](CI_WAIVER_PR125.md), mis à jour pour ce SHA : chaque
check rouge y est classé **hérité de `main`** (avec le rejeu de la même vérification
sur `origin/main` pur comme preuve) ou **imputable à la branche** — cette seconde
catégorie doit rester vide.

---

## Ce que Gate 1 exécute maintenant

`node infra/scripts/validate.mjs` — [`gate1-complet.txt`](preuves/contre-audit-afaa6441/gate1-complet.txt) :

1. les assertions de chart existantes ;
2. garde statique `scripts/audit-env` (helm / kubectl / **terraform**) ;
3. garde statique `.github/workflows` (helm / kubectl) ;
4. test hermétique de l'enveloppe CI (avec témoin) ;
5. test hermétique de la vérification de teardown (avec cas légitime) ;
6. `shellcheck -x` sur `scripts/audit-env` et `scripts/ci` — et s'il est absent de
   la machine, il le **dit** au lieu de laisser croire que la vérification a eu lieu.
