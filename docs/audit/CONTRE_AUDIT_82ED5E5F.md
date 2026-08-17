# Contre-audit — release ISOLÉE, digests vérifiés, 4 portes rejouées

> **Rejoué sur la tête à jour.** `main` a avancé de six commits pendant la manche
> (dont trois correctifs applicatifs : rédaction des jetons dans les logs, prompt
> hors README livré, préfixe HTML des déploiements). La branche a été rebasée sur
> `origin/main` = `1f0f39198c` — sans conflit — et **toute la chaîne a été refaite**
> sur ce nouveau SHA : rebuild des 10 images, redéploiement de la release isolée,
> vérification des digests, rejeu des 4 portes. Les deux P0 de l'auditeur ont été
> re-vérifiés sur l'arbre rebasé (21/21 et 8 assertions).
>
> | | SHA de code | tête de PR | images |
> |---|---|---|---|
> | **courant** | `f2805edd03` | `a2ebbc0049` | tag `f2805edd03`, 8/8 digests conformes |
> | précédent | `82ed5e5fa9` | `90c67aae5d` | tag `82ed5e5fa9`, 8/8 |
>
> Les tableaux ci-dessous portent le SHA précédent là où la mesure n'a pas été
> refaite à l'identique ; les artefacts du SHA courant sont dans
> [`preuves/release-isolee-f2805edd03/`](preuves/release-isolee-f2805edd03/).

L'auditeur ne signalait plus **aucun défaut de code** au tour précédent (API
fail-closed 21/21, preview-proxy 101/101, screenshotter 21/21, gardes vertes). Son
refus était opérationnel, en trois points :

1. le cluster tournait sur un autre SHA que la tête de la PR ;
2. les preuves tournaient sur la release **partagée** du cluster d'audit, que
   d'autres sessions modifient ;
3. rien ne vérifiait que les pods exécutaient bien les images publiées — un tag est
   un libellé mutable.

Les trois sont clos ici, et la manière de les clore a révélé **neuf défauts dans mon
propre outillage de preuve**, dont trois qui n'auraient rien signalé du tout.

Artefacts bruts : [`preuves/release-isolee-82ed5e5fa9/`](preuves/release-isolee-82ed5e5fa9/).

---

## Ce qui est prouvé, et sur quoi

| Élément | Valeur |
|---|---|
| SHA de code figé | `f2805edd03` (`82ed5e5fa9` au tour précédent) |
| Base | `origin/main` = `1f0f39198c` |
| Release de preuve | `vibecore-pr125`, ns `vibecore-pr125`, runtime `vibecore-pr125-workspaces` |
| Images | les 10, tag `f2805edd03`, registre du cluster d'audit |
| Digests | 8/8 : `imageID` du pod == digest publié |
| Portes | 4/4 vérifiées, `exit 0`, assertions et non description |

La release partagée `vibecore` n'a pas été touchée : elle est restée à sa révision
Helm pendant toute l'opération. Aucune ressource de production n'a été approchée, et
l'enforcement preview de la production n'a pas été activé.

### Isolation : ce qui l'est, ce qui ne l'est pas

Isolé — release, namespace, namespace de runtime, noms de service in-cluster, hôtes
d'ingress, **et les doubles Redis / puits e-mail** (voir défaut 4). Partagé à
dessein — le cluster, Cloud SQL, et les objets d'échelle cluster (`RuntimeClass`
gvisor, `StorageClass`). Dupliquer la base coûterait cher sans rendre la preuve plus
vraie ; dupliquer un objet d'échelle cluster n'a simplement pas de sens.

### Vérification des digests

Un tag peut désigner autre chose demain, et un pod peut tourner sur une image tirée
avant un re-push. Le script compare donc, pour chaque composant, l'`imageID` du
conteneur au digest publié pour le tag :

```
api  OK sha256:239b462e…   worker OK sha256:24e97a91…   admin OK sha256:14b075c0…
ai-gateway OK sha256:b02edd6b…   workspace-manager OK sha256:d4babc03…
preview-proxy OK sha256:5ff09ba3…   screenshotter OK sha256:a9d214f8…
web OK sha256:d1dba3c9…
```

Détail utile à l'auditeur, et qui se lit dans les deux sens :

* entre les trois SHAs de code du tour précédent, **7 des 8 digests étaient
  identiques** — attendu, le seul delta de source étant sous `scripts/audit-env/`,
  qui n'entre dans aucune image (seul `web` changeait, son build n'étant pas
  reproductible bit à bit) ;
* après le rebase sur la tête à jour, **les 8 digests sont nouveaux** — attendu
  aussi, puisque les six commits intégrés de `main` modifient du code applicatif
  réel.

Autrement dit, le digest bouge quand le code bouge et pas autrement : c'est
exactement ce qu'on attend d'une chaîne de provenance qui dit la vérité.

---

## Les neuf défauts de mon outillage, trouvés en l'exécutant

Aucun n'a été trouvé en relisant le script : tous en le menant jusqu'au bout sur un
vrai cluster. Les trois marqués **silencieux** n'auraient produit aucune erreur — la
preuve aurait été verte et fausse.

| # | Défaut | Ce qui se passait |
|---|---|---|
| 1 | `RuntimeClass` / `StorageClass` revendiqués | objets d'échelle cluster déjà possédés par la release partagée : Helm refuse |
| 2 | **silencieux** — `workspaceManager.serviceAccountName` par défaut | le RoleBinding de ma namespace de runtime autorisait le manager **partagé** ; le mien n'aurait pas pu créer de pod, et la porte n'aurait rien prouvé |
| 3 | **silencieux** — second bloc `global:` dans le même YAML | même clé de mapping, le dernier gagne : tout `global` disparaissait, dont les annotations Workload Identity (403 GCS ressemblant à un souci de droits bucket). Visible seulement par le `ClusterIssuer` qui se rendait à nouveau et entrait en collision |
| 4 | `REDIS_URL` inter-namespace | `allow-intra-namespace-platform` n'ouvre le pod-à-pod que dans la namespace : `deny-all-default` jetait les paquets, d'où `connect ETIMEDOUT` (pas un échec DNS) et une api 0/2 |
| 5 | **silencieux** — `s\|.vibecore.svc\|…\|g` trop large | déplaçait aussi `email-sink`, qui ne porte pas le nom de la release : e-mails envoyés dans le vide |
| 6 | **silencieux** — domaines répétés en dur dans `platformEnv` | `publicApiBaseUrl` et `runtime.apiBaseUrl` désignaient l'API de la release **partagée** |
| 7 | `mapfile` | absent du bash 3.2 de macOS : la vérification des digests s'arrêtait avant de vérifier quoi que ce soit |
| 8 | « je n'ai pas pu savoir » = « il n'y a rien » | un `TLS handshake timeout` était rapporté comme « aucun pod ». Refus, donc bon sens, mais motif faux — et le même raccourci ailleurs donnerait un vert à tort |
| 9 | attendre 4 rollouts, en vérifier 8 | un ancien pod `web` survivait et la vérification le voyait : un écart que le script fabriquait lui-même |

Deux observations de nature différente, également instructives :

**La garde SSRF du screenshotter a fonctionné, contre moi.** `screenshotterAllowedHosts`
gardait le domaine de preview de la release partagée alors que la release isolée sert
le sien : la capture a été refusée en 403, **en 7 ms, avant tout rendu**. La garde
ajoutée par cette PR a fait exactement son travail sur une configuration que j'avais
laissée incohérente. C'est le défaut 6.

**L'autoscaler vertical de GKE possédait `.spec.replicas`.** Lu dans `managedFields` :
`vpa-recommender:scale`. L'apply côté serveur refusait. Helm doit rester propriétaire
du champ ici, parce que le rejeu affirme la topologie qu'il traverse — une preuve dont
un autre contrôleur peut changer le nombre de répliques sous elle ne vaut rien.
`--force-conflicts` est limité à cette release de preuve et n'est **pas** ajouté au CD.

Enfin, une limite honnête : le cluster d'audit n'a que deux nœuds applicatifs et fait
tourner deux releases complètes. `api` et `web` tournent donc à une réplique dans la
release isolée. `preview-proxy` garde ses deux répliques, parce que le rejeu lit les
drapeaux dans **chaque** pod du proxy et que cette assertion perdrait sa valeur avec
un seul.

---

## Les 4 portes, au SHA figé `f2805edd03`

Chaque ligne est une assertion du script : statut **et** fragment de corps attendus,
`101+DONNEES` pour l'upgrade WebSocket, `set -euo pipefail`.

```
PORTE 1 (hôte + cookie)      LEGITIME 200 | INTRUS 404 | BIDON 403 | SANS 403
PORTE 2 (/d/<id> interne)    sans en-tête 403 | en-tête bidon 403 | valide 503
PORTE 3 (/p, forme shotter)  LEGITIME 200 | INTRUS 404 | BIDON 403 | SANS 403
PORTE 3bis (E2E réel)        capture 200, PNG 89504e47…, proxy vu du shotter: 200x1 403x1
PORTE 4 (WebSocket HMR)      SANS 403 | INTRUS 502 | BIDON 403 | LEGITIME 101+DONNEES
```

Le workspace tourne sous `runtimeClass: gvisor`, sur l'image agent
`workspace-agent:sha-f2805edd03`, et les jetons sont forgés **dans le pod api** pour
que le secret ne sorte jamais du cluster.

---

## CI au SHA exact

16 verts, 2 `skipped`, et pour seuls rouges les **cinq jobs Playwright** des deux
suites partagées. Ce que cette PR aurait pu casser — `Install, test, build, scan`,
`Quality Gates`, `Secret scan`, les deux `Terraform`, les deux `CodeQL` — est vert.

L'attribution de ces deux familles ne repose plus sur une comparaison avec d'autres
PR, mais sur une **mesure sur `main` lui-même** : voir
[`CI_WAIVER_PR125.md`](CI_WAIVER_PR125.md). Résumé — `Production E2E` échoue sur
`main` (57 échecs / 177 succès, deux échantillons **identiques test par test**), et
`French i18n live audit` y échoue sur les 4 viewports avec 9 tests dont les 6 de la
PR. Reste **un** test E2E qui échoue côté PR et pas sur `main` ; son instruction est
en cours et documentée dans le waiver, sans être classée « bruit » avant d'être
comprise.
