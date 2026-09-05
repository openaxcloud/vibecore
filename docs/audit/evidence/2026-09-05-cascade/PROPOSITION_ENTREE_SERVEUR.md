# `no-store` sur `/api/*` — proposition cadrée

## La mesure qui décide de l'urgence

**Question : une seule des 176 routes `api.*` pose-t-elle un `Set-Cookie` ?**

**Réponse : oui — deux. Mais aucune sur un `GET`.**

| route | mécanisme | méthode | `Cache-Control` |
|---|---|---|---|
| `api.feature-flags.$featureId.viewed` | `headers.append('Set-Cookie', viewedFeaturesCookie(…))` | **`action`** → POST | **aucun** |
| `api.projects.$projectId.ide-panel.$panel` (ligne 1801) | `Set-Cookie: clearSessionCookie()` | **`actionHandler`** → POST | **aucun** sur cette réponse |
| `api.git-proxy.$` | `set-cookie` figure seulement dans la liste des en-têtes **masqués dans les journaux** ; la réponse est construite avec un `new Headers()` neuf | — | n/a |

Vérifications complémentaires, toutes à zéro sur les 176 routes :
`commitSession`, `createCookie`, `cookie.serialize`, `sessionStorage`,
`destroySession`. Témoin posé avant chaque compte : le même motif trouve bien
des poseurs de cookie hors `api.*`, et un `loader` connu dans `api.health.ts`.

### Ce que ça change

Les caches HTTP ne stockent que les réponses à `GET`/`HEAD`. Une réponse à un
`POST` n'est cachable qu'avec des en-têtes de fraîcheur explicites — que ces
deux routes ne posent pas.

**Aucun `loader` de `/api/` n'émet de `Set-Cookie`.** L'exposition pratique est
donc quasi nulle, et les deux cookies concernés ne sont pas des jetons de
session : l'un mémorise des annonces déjà vues, l'autre **efface** la session.
Ni l'un ni l'autre ne donnerait la session de quelqu'un à un autre — c'est
précisément ce qui distingue ce cas de `/login`.

> **Verdict : souhaitable, pas urgent. Peut attendre un créneau dédié.**

---

## Ce que le changement remplace

`react-router-serve` n'est pas qu'un lanceur. Mesuré dans son `cli.js`, il met
en place **cinq** choses :

| responsabilité | conséquence si on la perd |
|---|---|
| `express.static` avec `maxAge` + **`immutable`** | **c'est de là que vient le `public, max-age=31536000, immutable` des assets** — le perdre annule le cache de seconde visite qu'on vient de vérifier |
| `compression` | les 1 235 Kio compressés redeviennent 5 069 Kio |
| `createRequestHandler` | l'application ne répond plus |
| `morgan` | plus de journal d'accès |
| `PORT` / `HOST` | le conteneur n'écoute pas là où le service l'attend |

**Volume : environ 40 à 60 lignes**, dont l'essentiel reproduit ces cinq points
à l'identique. Le correctif lui-même — poser `no-store` sur `/api/*` **si
l'en-tête est absent** — en fait quatre.

## Ce qui casse si ça rate

Par ordre de gravité, et le premier n'est pas celui qu'on croit :

1. **Silencieux et coûteux** — les assets servis sans `immutable`. Le service
   démarre, les pages s'affichent, et chaque visite redevient une première
   visite. C'est le mode de défaillance le plus probable et le moins visible.
2. **Bruyant** — le processus ne démarre pas. Tout l'étage web tombe. C'est le
   pire en amplitude, mais il se voit immédiatement et le déploiement est
   `--atomic` : le rollout échoue et Helm revient tout seul.
3. **Régression fonctionnelle** — les sept routes délibérément cachables
   (`api.blog.*`, `api.payments.plans`, `api.projects.$id.homepage-preview`,
   `api.git-proxy.$`) écrasées par un `no-store` inconditionnel. C'est ce que
   la condition « si absent » existe pour empêcher, et c'est ce qu'un test doit
   épingler.

## Comment on le vérifie AVANT de le servir

Dans cet ordre, et aucun ne demande la production :

1. **Test unitaire sur la fonction d'en-tête**, avec la contre-épreuve dans les
   deux sens : une réponse `/api/` sans `Cache-Control` en reçoit un ;
   **une réponse `/api/` qui en porte déjà un le garde intact** ; une réponse
   hors `/api/` n'est pas touchée.
2. **Test d'intégration sur un vrai socket** — pas `app.inject`, dont on sait
   qu'il ne reproduit pas le cycle de vie réel. On démarre le serveur sur un
   port libre et on lit les en-têtes réels de trois requêtes :
   un asset (doit porter `immutable`), `api/blog/posts` (doit garder
   `max-age=300`), `api/health` (doit recevoir `no-store`).
3. **Comparaison avant/après sur l'env d'audit** — les 36 assets préchargés de
   la page d'accueil, en comparant les en-têtes deux à deux. Un seul écart sur
   `immutable` ou `content-encoding` bloque la livraison.
4. **Contrôle de démarrage** — le conteneur doit passer sa sonde de
   disponibilité, et la règle 18 s'applique : distinguer une montée en charge
   d'une défaillance avant tout rollback réflexe.

## Ce que ça ne fait pas

Ça ne remplace pas la décision CDN et ça ne s'y substitue pas. Les deux ont la
même forme — un changement d'infrastructure qui ne touche pas le code
applicatif d'Avi, et qui demande son accord parce qu'il touche à la façon dont
ses utilisateurs reçoivent ses pages — mais ils sont indépendants.

**Rien n'a été mis en œuvre.**
