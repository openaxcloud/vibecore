# Contre-audit du SHA `82603d55` — 2 P0 restants + réserves de preuve

L'auditeur confirme comme VERTS : les 4 portes nominales, la provenance
images→source (6365 fichiers, 0 divergence), API 25/25, preview-proxy 101/101,
screenshotter 21/21, la rédaction des secrets, l'épinglage Terraform, la
vérification de teardown, le heredoc + ShellCheck.

Restaient deux fail-open, tous deux du même genre : **une comparaison qui ressemble
à une vérification sans en être une.** Sorties brutes dans
[`preuves/contre-audit-82603d55/`](preuves/contre-audit-82603d55/).

---

## P0 #1 — `port-access` rendait « public » sur du JSON valide mais inconnu

`services/api/src/app.ts`. Le tour précédent avait fermé les *pannes* (base
injoignable, JSON illisible). Restait le cas où la lecture réussit et où le
contenu, syntaxiquement valide, ne veut rien dire :

```
null                    -> private:false
[]                      -> private:false
"string"                -> private:false
{"visibility":null}     -> private:false
{"visibility":[]}       -> private:false
{"visibility":{"5173":"private"}} -> private:true   (le seul cas qui marchait)
```

**Pourquoi.** Le code faisait `JSON.parse(raw) as { visibility?: Record<string,
string> }` puis `if (visibility && typeof visibility !== 'object')`. Or :

- un `as` TypeScript ne vérifie **rien** à l'exécution — c'est une promesse faite au
  compilateur, pas un contrôle ;
- `typeof null === 'object'` et `typeof [] === 'object'` : le seul test présent ne
  pouvait attraper qu'une valeur *non*-objet et *truthy* — donc une chaîne, et rien
  d'autre ;
- `visibility?.[port] === 'private'` sur une valeur inattendue rend `undefined`,
  c'est-à-dire « pas privé », c'est-à-dire **public**.

Le raisonnement implicite était « je n'ai rien trouvé qui déclare ce port privé,
donc il est public ». L'absence de preuve n'est pas une preuve d'absence.

**Correctif : validation d'exécution à grammaire POSITIVE.** La racine doit être un
objet simple (ni `null`, ni tableau) ; si `visibility` est présent il doit être un
objet simple ; chaque clé doit être un port valide (`1..65535`) ; chaque valeur doit
être exactement `public` ou `private`. Tout ce qui n'entre pas dans cette grammaire
est une donnée **inconnue**, donc traitée comme privée, avec son motif journalisé.

`services/api/src/tests/preview-port-access-failclosed.spec.ts` — 21 cas : les
**5 entrées de l'auditeur à l'identique**, 6 violations de grammaire (port non
numérique, hors bornes, zéro, valeur inconnue, valeur non-chaîne, objet imbriqué),
le cas nominal `{"visibility":{"5173":"private"}}` → `private:true`, et **trois cas
d'autorisation** (port explicitement `public`, `visibility` absent, fonctionnalité
éteinte) sans lesquels « tout refuser » passerait la suite.

- Sans le correctif : **11 rouges** — [`1-json-valide-mais-inconnu-SANS-fix.txt`](preuves/contre-audit-82603d55/1-json-valide-mais-inconnu-SANS-fix.txt)
- Avec : **21/21** — [`1-json-valide-mais-inconnu-AVEC-fix.txt`](preuves/contre-audit-82603d55/1-json-valide-mais-inconnu-AVEC-fix.txt)

## P0 #2 — une SOUS-CHAÎNE n'est pas une identité

`scripts/ci/cluster.sh` vérifiait :

```bash
[[ "$server" == *"vibecore-prod-app"*   ]]   # prod-gateway
[[ "$ctx"    == *"vibecore-495216"*     ]]   # prod-direct
[[ "$ctx" != *prod* && "$server" != *gateway* ]]  # staging (deny-list)
```

Trois trous, reproduits en hermétique par l'auditeur (faux Helm **atteint**, exit 0) :

1. un **autre projet** Connect Gateway portant une membership du même nom passait —
   un nom de membership est un libellé, pas une identité ;
2. **n'importe quel apiserver** passait dès que le NOM du contexte contenait
   `vibecore-495216` — or ce nom est une chaîne libre, choisie par celui qui écrit le
   kubeconfig ;
3. la **deny-list** de staging se contourne par construction : il suffit d'un nom qui
   évite les motifs interdits.

**Correctif : allow-list exacte, vérifiée contre l'autorité.**

| ce qui est exigé | source de vérité |
|---|---|
| projet `vibecore-495216` **et** numéro `267592214411` | Resource Manager (`projects describe`) |
| membership `projects/vibecore-495216/locations/europe-west9/memberships/vibecore-prod-app` | Fleet (`memberships describe`) |
| endpoint du cluster `vibecore-prod-app` | GKE (`clusters describe`) |
| nom du contexte | égalité **stricte** avec la constante épinglée |
| apiserver du kubeconfig | égalité **stricte** avec l'URL reconstruite depuis les valeurs ci-dessus |

Aucune sous-chaîne, aucune deny-list, et l'identité ne vient jamais d'un nom écrit
dans un fichier : elle vient de l'API qui en est l'autorité. Une panne de résolution
est un **refus**. Le couple (id, numéro) est vérifié parce qu'un id de projet peut
être recréé, un numéro non.

`staging` **refuse** tant qu'aucune identité n'est épinglée : le dépôt ne définit ni
`vars.STAGING_APP_CLUSTER` ni `vars.GCP_REGION` (vérifié — seules `GAR_LOCATION` et
`GCP_PROJECT_ID` existent), il n'y a donc aujourd'hui aucun cluster de staging à
autoriser. Le message dit quoi faire : ajouter le triplet dans le commit même qui
provisionne l'environnement.

`scripts/ci/test-cluster-wrapper.sh` — chaque cas négatif exige **exit ≠ 0 ET zéro
appel enregistré par le faux outil** : un refus qui laisse l'outil s'exécuter n'est
pas un refus.

| cas | avant | après |
|---|---|---|
| A. témoin `--kube-context` sans enveloppe | cible = `APISERVER:hostile` | (inchangé, c'est le témoin) |
| B1. autre projet Connect Gateway, membership homonyme | accepté | **REFUS** |
| B2. apiserver arbitraire + nom de contexte contenant l'id prod | **accepté, outil atteint** | **REFUS** |
| B2b. bon nom de contexte, apiserver ≠ endpoint autoritatif | **accepté, outil atteint** | **REFUS** |
| B3. staging, apiserver arbitraire hors deny-list | **accepté, outil atteint** | **REFUS** |
| C. membership homonyme dans un autre projet (vu par Fleet) | accepté | **REFUS** |
| D. numéro de projet ≠ id | accepté | **REFUS** |
| E. les deux appels légitimes | — | **passent** |

[avant](preuves/contre-audit-82603d55/2-identite-autoritative-SANS-fix.txt) ·
[après](preuves/contre-audit-82603d55/2-identite-autoritative-AVEC-fix.txt)

> **Effet de bord découvert en écrivant la moitié rouge, et qui vaut d'être dit :**
> l'ancienne enveloppe **refusait aussi la vraie production**. Elle exigeait un
> apiserver commençant par `https://connectgateway.googleapis.com/`, or le Connect
> Gateway est **régional** — le kubeconfig de prod porte
> `https://europe-west9-connectgateway.googleapis.com/v1/projects/267592214411/…`.
> Le durcissement corrige donc aussi ce faux négatif, et l'URL attendue est
> désormais reconstruite depuis des valeurs vérifiées plutôt que devinée.

---

## Réserves de preuve

### Le script live AFFIRME, il ne décrit plus

`scripts/proofs/replay-preview-doors.sh` tourne sous `set -euo pipefail` et chaque
porte est une **assertion** : statut attendu **et** fragment de corps attendu
(un `403 PREVIEW_TENANT_FORBIDDEN` et un `403` quelconque ne disent pas la même
chose), `101` **plus** les données applicatives pour le cas légitime, refus exigé
pour les trois autres. Il exige en outre `PREVIEW_ENFORCE_PRIVATE_PORTS=true` — pas
seulement `PREVIEW_PROXY_ENFORCE_TENANT` — dans **chaque** pod du proxy, et vérifie
que le workspace tourne bien sous `runtimeClass: gvisor`. Le script sort en échec au
premier écart, avec le compte des assertions ratées.

### Les gardes statiques n'exemptent plus `--context`

`--context` / `--kube-context` ont été **retirés** des listes d'exemption des deux
gardes. Le drapeau nomme une cible ; il ne prouve rien de son identité, et il ne
protège pas de `HELM_KUBEAPISERVER`, qui court-circuite le kubeconfig. Seules les
enveloppes — qui neutralisent l'environnement **puis** vérifient l'identité — sont
acceptées.

Conséquence traitée plutôt que contournée : le contrôle d'intégrité de la prod dans
`down.sh` passe par une enveloppe dédiée `audit_helm_prod_readonly`, dont la liste de
sous-commandes autorisées est **fermée** (`list history status get`). La lecture
seule est devenue structurelle au lieu de reposer sur la vigilance du relecteur.

### Gate 1 exécute tout, et l'absence de ShellCheck est bloquante

`node infra/scripts/validate.mjs` enchaîne maintenant : les deux gardes statiques,
**les trois** tests hermétiques (`test-cluster-wrapper.sh`,
`test-teardown-verification.sh`, et `test-pinned-context.sh` qui n'était lancé qu'à
la main), puis `shellcheck -x` sur `scripts/audit-env`, `scripts/ci` **et**
`scripts/proofs`. Si ShellCheck manque, Gate 1 **échoue** : la version précédente
imprimait « vérification NON EFFECTUÉE » et continuait — une porte qui s'ouvre quand
l'outil manque n'est pas une porte, et le défaut qu'elle a laissé passer était réel
(SC2006, des backticks exécutés dans un heredoc).

[`gate1-complet.txt`](preuves/contre-audit-82603d55/gate1-complet.txt)

### Porte `/p` en E2E réel

Le screenshotter est désormais **déployé sur l'environnement d'audit**
(`services.screenshotter.enabled: true` dans `values-audit-test.yaml`, avec
`SCREENSHOTTER_PREVIEW_PROXY_URL` et `SCREENSHOTTER_ALLOWED_HOSTS`), et son image
est construite au même SHA que le reste. Le rejeu appelle son `/capture` avec une URL
d'**hôte de preview** : c'est le service lui-même, avec son vrai Chromium, qui
réécrit vers `/p/<ws>/<port>`, traverse le proxy et rend le PNG du serveur de dev.
Le script vérifie le statut, la **signature PNG** (`89504e47…`) et la taille, puis
rejoue la même capture **sans jeton** et exige un refus tenant dans les logs du
proxy. Le PNG local du Chromium de test reste utile comme test unitaire du mapping
d'URL, mais il ne tient plus lieu de preuve de bout en bout.
