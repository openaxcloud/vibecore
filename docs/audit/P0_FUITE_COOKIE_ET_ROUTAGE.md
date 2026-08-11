# Deux P0 du contre-audit de `3c7c775f`

## P0 #2 — l'hôte public `d-<id>` livrait le cookie de tenant au workload utilisateur

**Le défaut.** La boucle d'en-têtes du chemin serveur-déployé
(`services/preview-proxy/src/app.ts`) transmettait `Cookie` et `Authorization`
à l'amont. Or cet amont est du **code déployé par un utilisateur**, servi
publiquement sur `d-<id>.<previewDomain>`, et le cookie de tenant `vc_preview` est
posé avec `Domain=.e-code.ai` pour 12 h — le navigateur l'envoie donc aussi à cet
hôte. Une application publiée malveillante recevait le jeton tenant de son
visiteur et n'avait plus qu'à le rejouer pour lire les previews de la victime.

Le chemin statique `s-<id>` les retirait **déjà**, quarante lignes plus haut dans
le même fichier. L'asymétrie entre deux chemins qui exposent tous deux du code
utilisateur était le défaut : un mécanisme d'exfiltration de credential, pas une
négligence d'en-tête.

**Correctif.** `cookie` et `authorization` ajoutés à la deny-list du chemin
`d-<id>`. Les trois chemins (`s-<id>`, `d-<id>`, `<ws>-<port>`) retirent désormais
les deux, vérifié par lecture croisée des trois boucles.

**Preuve** — `services/preview-proxy/src/server-deploy-header-leak.spec.ts` ne
relit pas la deny-list : il monte un **vrai serveur amont**, fait passer une
requête par le proxy et inspecte les en-têtes **réellement reçus**.

Sans le correctif (deny-list ramenée à son état d'avant sur ce seul chemin) —
`preuves/p0-2-fuite-cookie/leak-SANS-fix.txt` :

```
AssertionError: expected 'vc_preview=secret-cookie' to be undefined
Tests  3 failed | 2 passed (5)
```

Avec le correctif : `Tests  5 passed (5)`. Les cinq cas couvrent le cookie seul,
l'`Authorization` seule, les deux ensemble, l'en-tête interne de tenant, et — pour
que le filtre ne soit pas un blocage global — le fait que `accept-language` et
`user-agent` passent toujours.

---

## P0 #3 — le routage du screenshotter ne survivait pas au navigateur

**Le défaut, et pourquoi ma preuve précédente ne valait rien.** Le renderer ne
peut pas joindre l'URL publique d'un preview depuis le cluster (hairpin vers le LB
externe), il réécrit donc l'URL vers le Service in-cluster du proxy. La version
précédente croyait conserver l'hôte de preview :

```js
route.continue({ url: <proxy>, headers: { ...orig, host: previewHost } })
```

`Host` est un en-tête **interdit à la modification** : Chromium le recalcule à
partir de la nouvelle URL. Rejeu avec un vrai Chromium
(`preuves/p0-3-routage-screenshotter/repro-chromium-AVANT.txt`) :

```
Host: 127.0.0.1:55701
url : /
en-tete tenant present: oui
ROUTAGE CASSE : le Host de preview est perdu, le proxy ne peut pas router
```

Le jeton arrivait bien — cette partie du correctif précédent était juste — mais
l'autorité de routage était perdue, donc `parsePreviewHost` renvoyait null et la
requête tombait en 404. Ma preuve précédente posait `Host` via `http.request` :
elle validait **une forme de requête qu'un navigateur ne produit jamais**, pas le
trajet réel du renderer. L'expert a raison de l'écarter.

**Correctif.** L'autorité de routage voyage désormais dans le **chemin**, via la
route que le proxy expose déjà — `app.all('/p/:workspaceId/:port/*')`, qui aboutit
au **même `handlePreviewRequest`**, donc à la **même porte tenant** :

```
http(s)://<ws>-<port>.<previewDomain>/<chemin>?<q>
   ->  http://<proxy>/p/<ws>/<port>/<chemin>?<q>
```

Un chemin n'est pas un en-tête interdit : le navigateur le transmet intact. La
fonction est extraite dans `services/screenshotter/src/preview-proxy-path.ts` —
une fonction pure, sans dépendance à Playwright, donc testable seule (8 tests, dont
le refus des labels multi-niveaux et des ports hors bornes, pour rester alignée sur
`parsePreviewHost` du proxy, qui est le consommateur).

### Preuve 1 — vrai Chromium, rouge et vert dans un seul artefact

`scripts/proofs/screenshotter-routing-chromium.mjs` lance un **vrai Chromium**
contre un serveur qui enregistre ce qu'il reçoit et qui **404 quand il ne peut pas
router** — comme le vrai proxy. `--legacy` rejoue la réécriture d'avant.

Mode `--legacy` (`chromium-LEGACY.txt`), exit 1 :

```
  Host: 127.0.0.1:55739   url: /   tenant: present
  ECHEC autorite de routage presente dans le CHEMIN — url=/
  ECHEC le document est servi (200, donc le proxy a pu router) — status=404
```

Avec le correctif (`chromium-APRES.txt`), exit 0 :

```
  Host: 127.0.0.1:55728   url: /p/ws-test/5173/   tenant: present
  OK   Host recu = celui du proxy (le navigateur le recalcule, donc inutilisable pour router)
  OK   autorite de routage presente dans le CHEMIN — url=/p/ws-test/5173/
  OK   jeton tenant recu sur l en-tete interne
  OK   le document est servi (200, donc le proxy a pu router) — status=200
  OK   capture PNG reelle et non vide — 10106 octets
  ROUTAGE PROUVE
```

Capture réelle : `preuves/p0-3-routage-screenshotter/vignette-reelle.png`
(10 106 octets, en-tête PNG vérifié — pas une simulation d'en-têtes).

> Le `Host` reçu **est** celui du proxy, et c'est correct : c'est le comportement
> du navigateur, et précisément la raison pour laquelle le routage ne peut pas s'y
> appuyer. Le test l'affirme explicitement au lieu de le contourner.

### Preuve 2 — le VRAI proxy du cluster d'audit, enforcement actif

Workspace réel `ws-route` (org `org_route`), pod **gVisor**, serveur de dev réel
sur 5173 ; proxy au tag `3a537e9a7e` avec `PREVIEW_PROXY_ENFORCE_TENANT=true` et
`PREVIEW_ENFORCE_PRIVATE_PORTS=true`. Requêtes faites comme le renderer : vers le
Service in-cluster, **sans poser `Host`**, autorité dans le chemin
(`live-routage-chemin.txt`) :

```
chemin + jeton LEGITIME                 HTTP 200  <!doctype html>… (HMR shim injecte)
chemin + jeton INTRUS                   HTTP 404  (refus de propriete amont)
chemin SANS jeton                       HTTP 403  PREVIEW_TENANT_FORBIDDEN
ancienne forme: racine sans autorite    HTTP 404  Route GET:/ not found
```

Trois choses en une : la forme chemin **route** vers le bon workspace, la porte
tenant **s'applique toujours** sur cette route (403 sans jeton, 404 pour un autre
tenant), et l'ancienne forme échoue exactement comme le défaut le prévoyait.

Le changement est donc un changement de **mécanisme de routage**, pas
d'autorisation : `/p/<ws>/<port>/…` et l'hôte `<ws>-<port>` partagent le même
handler et la même porte.
