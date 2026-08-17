# P0 — la cible validée doit être la cible utilisée

Défaut relevé par l'expert au SHA `5fb87b022b`. Les gardes vérifiaient le contexte
kubectl **courant**, puis les scripts appelaient `helm` et `kubectl` **sans**
contexte explicite. Helm ne résout pas sa cible via le contexte courant : il
consulte d'abord ses variables d'environnement. Une garde qui contrôle A pendant
que l'outil frappe B ne garde rien.

## Reproduction du défaut (lecture seule)

```
contexte courant = audit
  audit_env_require_audit_cluster                 -> PASSE
  HELM_KUBECONTEXT=<prod>  helm -n vibecore list  -> revision 971 = PRODUCTION
  (sans la variable)       helm -n vibecore list  -> revision 4   = audit
```

`addons.sh` contenait trois `helm upgrade --install` nus : il pouvait donc valider
l'audit puis muter la **production**.

Surface réelle au SHA fautif : 3 `helm upgrade --install` + ~14 `kubectl`, dont le
plus dangereux — `| kubectl apply -f -` en fin de pipe dans `mint-secrets.sh`,
celui qui **écrit le Secret de la plateforme** — sur une ligne de continuation,
donc invisible à un survol des débuts de ligne.

## Correctif — trois temps, dans cet ordre

`scripts/audit-env/lib.sh`, fonction `audit_env_pin_cluster_target` :

1. **Neutraliser l'ambiant.** Les 9 variables capables de rediriger Helm sont
   **effacées**, pas « lues puis validées » : `HELM_KUBECONTEXT`,
   `HELM_KUBEAPISERVER`, `HELM_KUBETOKEN`, `HELM_KUBECAFILE`, `HELM_KUBEASUSER`,
   `HELM_KUBEASGROUPS`, `HELM_KUBEINSECURE_SKIP_TLS_VERIFY`,
   `HELM_KUBETLS_SERVER_NAME`, `HELM_NAMESPACE`. `HELM_KUBEAPISERVER` +
   `HELM_KUBETOKEN` méritent une mention : ils redirigent Helm vers un apiserver
   **arbitraire** sans passer par le kubeconfig. `KUBECONFIG` est imposé au chemin
   par défaut au lieu d'honorer l'override — c'est le second vecteur, un autre
   fichier donnant un autre « contexte courant » vu par helm **et** kubectl. Les
   valeurs ignorées sont journalisées : le contournement est visible, jamais
   silencieux.
2. **Dériver la cible une fois**, depuis les constantes épinglées du fichier
   (jamais depuis l'environnement ni le contexte courant), et refuser si ce
   contexte est absent du kubeconfig.
3. **Forcer la cible sur chaque appel**, via `audit_helm` / `audit_kubectl` qui
   passent `--kube-context` / `--context`. La garde d'identité valide désormais la
   cible **épinglée**, plus le contexte courant.

`scripts/audit-env/check-pinned-context.mjs` échoue s'il reste un appel nu, et
tourne dans **Gate 1** (`infra/scripts/validate.mjs`) : l'invariante est tenue par
la CI, pas par la vigilance du relecteur. `helm repo` est exempté — il écrit
`~/.config/helm`, il n'a aucune cible cluster à épingler.

Le CD de **production** (`.github/workflows/deploy-main.yml`) est durci de la même
façon : le contexte obtenu par `get-credentials` est épinglé dans
`PROD_KUBE_CONTEXT` et passé explicitement à chaque `helm`/`kubectl`, variables de
redirection unset. L'environnement d'un runner est contrôlé, mais la cible d'un
`helm upgrade` de production ne doit dépendre d'aucune variable.

## Autres binaires — vérifié

- **gcloud** : tous les appels sensibles nomment leur projet, en positionnel
  (`gcloud projects delete "$PROJECT_ID"`) ou via `--project`. Aucun ne dépend du
  `gcloud config` ambiant.
- **helmfile / kustomize / argocd / flux / skaffold** : absents du dépôt.
- **`up.sh`** mentionné dans la demande : **n'existe pas**. Les scripts sont
  `addons.sh`, `mint-secrets.sh`, `render-values.sh`, `down.sh`,
  `schedule-teardown.sh`, `access-sheet.sh`.

## Preuves

Sorties brutes dans `docs/audit/preuves/p0-contexte-epingle/`.

### Régression rouge-sans-fix / vert-avec-fix

Test **hermétique** (`scripts/audit-env/test-pinned-context.sh`) : il remplace
`helm`/`kubectl`/`gcloud` par des faux qui **enregistrent la cible reçue**. Il ne
touche aucun cluster, tourne sans credentials, et ne peut rien muter — il mesure
la seule chose qui compte : quelle cible arrive à l'outil.

`regression-SANS-fix.txt` — scripts du SHA `5fb87b022b` :

```
helm|connectgateway_…vibecore-prod-app|upgrade --install ingress-nginx …
helm|connectgateway_…vibecore-prod-app|upgrade --install cert-manager …
helm|connectgateway_…vibecore-prod-app|upgrade --install nfs-provisioner …
appels vers l'audit : 0
appels AMBIANTS : 7
appels vers la PROD : 3          <-- les trois helm upgrade partent en PRODUCTION
exit=1
```

`regression-AVEC-fix.txt` — même test, scripts corrigés :

```
appels vers l'audit : 10
appels AMBIANTS : 0
appels vers la PROD : 0
exit=0
```

### Live positif — `live-POSITIF.txt`

Environnement propre, cluster d'audit :

```
==> cible epinglee: contexte 'gke_vibecore-audit-test-20260807_…-audit-cluster'
==> garde-fou projet OK  /  garde-fou cluster OK -> https://34.155.33.130
==> LB_IP=34.163.208.161   (l'IP du LB d'audit)
==> add-ons installes.
```

### Live négatif — `live-NEGATIF.txt` (le scénario de l'expert)

Trois vecteurs injectés d'un coup : `HELM_KUBECONTEXT=<prod>`,
`HELM_NAMESPACE=vibecore`, et un `KUBECONFIG` détourné **dont le contexte courant
EST la production** :

```
contexte courant du kubeconfig detourne : connectgateway_…_vibecore-prod-app

==> variables de redirection IGNOREES (l'environnement ne choisit pas la cible) :
      HELM_KUBECONTEXT=connectgateway_…_vibecore-prod-app
      HELM_NAMESPACE=vibecore
      KUBECONFIG=/var/folders/…/kc
==> cible epinglee: contexte 'gke_vibecore-audit-test-20260807_…-audit-cluster'
==> LB_IP=34.163.208.161
==> add-ons installes.
```

Le script s'exécute **entièrement sur l'audit** malgré l'environnement hostile.

### Témoin production — `prod-AVANT.txt` / `prod-APRES.txt`

```
revision AVANT : 972
revision APRES : 972
VERDICT: PROD INCHANGEE (revision identique)
```

> ⚠️ La révision de prod **n'est pas 970**. Elle a bougé deux fois pendant cette
> revue (970 → 971 → 972, dernier déploiement le 2026-08-10). Le témoin est donc
> **relevé** avant et après, jamais supposé — comparer à une valeur mémorisée
> aurait produit un faux « prod modifiée ».

Et les add-ons ont bien atterri sur l'audit (`helm list -A` sur le cluster
d'audit : `ingress-nginx`, `cert-manager`, `nfs-provisioner` en révision 7 après
les deux essais).
